# Espace Parent

Règle métier, en une ligne : **un parent est un utilisateur externe qui ne voit
que ses propres enfants, et qui ne peut rien écrire.**

```
                    school_users
                  (LE PIVOT DE TOUT)
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
    PERSONNEL                            PARENT
    y figure                        n'y figure JAMAIS
        │                                   │
  accès par rôle,                   refus par défaut,
  secteur, capacité,                puis 9 RPC gardées
  gouvernance                       par parent_owns_student
```

Un parent ne voit ni un autre élève, ni ses notes, ni ses frais, ni ses absences —
y compris en appelant l'API directement, en connaissant l'UUID d'un élève, ou en
modifiant l'identifiant dans une URL.

---

## 1. Le constat qui commande toute l'architecture

Les 96 policies de la base accordent l'accès sur **une seule et même clé** :
l'existence d'une ligne dans `school_users`. Que ce soit écrit en clair
(`school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid())`)
ou derrière un helper (`is_school_member`, `user_school_id()`, `can_see_school`,
`user_scope_allows_class`) — c'est toujours la même question.

Deux conséquences, et la seconde est le fondement de tout ce document.

**Donner à un parent une ligne `school_users` lui ouvre l'établissement entier.**
Même avec un `role = 'parent'` flambant neuf : la policy
`« students: lecture par membres »` ne regarde pas le rôle,
`« Members read students »` non plus, `« fee_payments: lecture membres »` non
plus. Ce serait la faille exacte que le cahier des charges interdit, ouverte par
la porte d'entrée.

**Un compte absent de `school_users` est refusé PAR DÉFAUT.** Sur `students`,
`classes`, `subjects`, `grades`, `attendance`, `late_arrivals`, `student_fees`,
`fee_payments`, `student_fee_items`, `apc_notes`, `prim_notes`,
`mat_observations`, tous les `*_bulletins`, `disciplinary_*`, `parent_meetings`,
`exit_permissions`, `schools`, `school_units`, `school_messages`,
`teacher_notifications`. Il n'y a **aucune liste d'autorisations à maintenir** :
la porte est fermée d'origine, on n'en ouvre que des fenêtres nommées.

C'est cette seconde propriété qui fait passer sept des vingt-deux tests
**par construction**, avant même qu'une policy soit écrite.

---

## 2. L'identité parent

Deux tables, et pas une colonne dans `school_users`.

| Table | Rôle |
|---|---|
| `parent_accounts` | Le compte. `user_id` → `auth.users`. **Aucune colonne `role`** : l'existence d'une ligne active EST le rôle. |
| `parent_student_links` | Le rattachement. `UNIQUE (parent_user_id, student_id)`, `school_id` dénormalisé, révocation par `active = false`. |

Pourquoi pas de colonne `role` : ne rien nommer, c'est ne rien offrir à un test
de rôle écrit ailleurs dans la base. Un parent ne peut pas apparaître dans un
`role IN (…)` puisqu'il n'a pas de rôle au sens de `school_users`.

Pourquoi `school_id` sur le lien : un parent peut avoir des enfants dans
plusieurs écoles, et chaque ligne doit se suffire à elle-même pour l'audit.

Pourquoi jamais de `DELETE` : « qui a vu quoi, et jusqu'à quand » doit rester
établissable — même doctrine que les contre-passations de caisse.

### Multi-enfants, multi-secteurs

Rien de spécial. Un parent avec un enfant en CM2 (Primaire) et un en 5ᵉ
(Collège) a **deux lignes**. `parent_owns_student` répond vrai pour ces deux
élèves et faux pour tous les autres, quel que soit leur secteur. La séparation
Primaire / Collège borne le *personnel*, pas la famille : elle n'entre pas dans
la décision.

---

## 3. Le garde unique

Toute la sécurité de l'espace parent tient dans un prédicat, appelé en
**première ligne de chaque RPC**.

```sql
CREATE FUNCTION public.parent_owns_student(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_student_links l
      JOIN parent_accounts a ON a.user_id = l.parent_user_id
     WHERE l.parent_user_id = auth.uid()
       AND l.student_id     = p_student
       AND l.active AND a.active
  );
$$;
```

S'il est juste, tout l'espace parent est juste. S'il est faux, tout tombe — et
un seul test le démontre. C'est le seul endroit à relire pour auditer l'ensemble.

Une RPC appelée avec un `p_student` étranger rend **`NULL`**, jamais une erreur :
une erreur confirmerait l'existence de l'élève.

---

## 4. Pourquoi pas une policy RLS directe sur `students`

Tentant, et c'est le piège. Il faudrait :

1. une policy PERMISSIVE « parent » sur chacune des quinze tables lues ;
2. **et** modifier les cinq policies `AS RESTRICTIVE "secteur: cloisonnement"`
   pour qu'elles laissent passer le parent — donc toucher
   `user_scope_allows_class`, le cœur du cloisonnement THE GENIUS.

Le point 2 seul disqualifie l'approche. Mais il y a pire : la policy restrictive
raisonne par **classe** (`user_scope_allows_class(school_id, class_id)`).
L'assouplir pour un parent ouvrirait **toute la classe de son enfant** — ses
quarante camarades, leurs notes, leurs frais. La granularité demandée est
l'**élève**, et seule une fonction qui reçoit un `student_id` peut la tenir.

D'où le choix retenu : refus par défaut hérité de l'existant + RPC gardées.
**Zéro policy existante modifiée**, granularité juste.

---

## 5. Ce qui est ajouté, ce qui n'est pas touché

| Ajouté | Intact |
|---|---|
| 2 tables (`parent_accounts`, `parent_student_links`) | Les 5 policies `AS RESTRICTIVE "secteur: cloisonnement"` |
| 1 garde (`parent_owns_student`) + `is_parent_account` | `user_scope_allows_class` / `_student` / `user_scope_is_global` |
| 9 RPC de lecture `parent_*` | `fee_scope_*`, `is_finance_officer`, `is_finance_reader`, `is_school_cashier` |
| 4 RPC d'administration | `school_strict_roles` et le drapeau `strict_role_enforcement` |
| 3 policies sur les tables neuves | La séparation Primaire / Collège de THE GENIUS |
| 1 policy additive sur `notifications`, bornée à `recipient_id = auth.uid()` | Les règles financières GLOBAL (RAF, caissier, contrôleur) |
| 1 colonne `schools.parent_show_rank` (false par défaut) | Le portail public `/parent/:token` et sa RPC |

La colonne `parent_show_rank` suit le patron de `strict_role_enforcement` et
`advanced_delegation` : **false par défaut**, donc comportement inchangé partout.
Le rang est une donnée comparative — l'afficher situe l'enfant par rapport aux
autres, et c'est à l'établissement de le décider.

---

## 6. Aucune écriture n'est possible, sans avoir à l'interdire

Toutes les RPC de lecture rendent du `jsonb`. Aucun `GRANT` n'est posé sur une
table de données. Et surtout :

- écrire une note exige `school_users` **et** le mode de saisie de l'école ;
- encaisser exige `is_school_cashier` ;
- `UPDATE` et `DELETE` sur `fee_payments` sont **déjà révoqués pour tout le
  monde** — le registre est immuable, la contre-passation est la seule voie.

Les tests 11 à 14 sont donc acquis par construction, pas par une règle ajoutée
pour l'occasion.

La **seule** écriture de tout l'espace est `parent_update_profile` : nom et
téléphone du compte appelant.

---

## 7. Le serveur LAN — le vrai point dur

`server/scopeGuard.js` : `loadScope()` renvoyait `{ global: true, unscoped: true }`
quand aucune ligne `school_users` n'était trouvée. C'est délibéré et légitime
(l'administrateur qui installe l'école n'est pas encore rattaché), mais un compte
parent — qui n'a par définition aucune ligne `school_users` — serait **tombé dans
cette trappe et aurait obtenu l'accès total**. L'exact inverse du cloud.

Trois gestes, tous nécessaires :

| Fichier | Correctif |
|---|---|
| `server/scopeGuard.js` | `isParentAccount()` interrogé **avant** le repli « installateur » ; le parent reçoit un périmètre de refus explicite. |
| `server/query.js` | `/api/db` et `/api/db/batch` refusés d'emblée à une identité parent. Le parent ne parle que RPC. |
| `server/rpc.js` | Les 13 RPC en SQLite, chacune ouverte par `parentOwnsStudent()`. |

> **Piège rencontré et évité.** La première version fermait `/api/db` en appelant
> `loadScope()`. Or `loadScope` a un **effet de bord** : il pose la matrice de
> rôles stricte et mémorise l'école dans `_matrixSeen`. L'appeler sur *toutes*
> les tables marquait une école « traitée » lors d'une simple lecture de
> `governance_roles` faite **avant** que son drapeau ne soit levé — après quoi la
> matrice ne se posait plus jamais, et l'école se retrouvait durcie **sans
> caisse**. `_strict_matrix_seed.test.mjs` l'a attrapé. Le contrôle doit rester
> un `SELECT` pur : `isParentAccount()`, jamais `loadScope()`.

Les deux tables sont volontairement **absentes de `ALLOWED_TABLES`** : c'est
l'équivalent LAN du `REVOKE INSERT, UPDATE, DELETE` du cloud.

**Limite connue :** `parent_accounts` et `parent_student_links` ne sont pas dans
`SYNCED_TABLES`. Un compte parent créé en Cloud ne descend donc pas encore vers
le serveur LAN de l'école. C'est sans conséquence pour l'usage visé — le parent
consulte depuis chez lui — mais c'est un chantier à ouvrir si l'espace parent
doit fonctionner sur le réseau de l'école.

---

## 8. Le frontend

**Une coquille séparée, pas une branche de celle du personnel.**
`src/components/parent/ParentLayout.jsx` ne monte ni la `Sidebar`, ni
`NAV_GROUPS`, ni `schoolStore`. Ce dernier charge l'établissement entier en
IndexedDB pour le travail de l'école : y faire entrer un parent reviendrait à lui
télécharger l'école sur son téléphone, et à faire dépendre son cloisonnement d'un
filtre d'affichage. `App.jsx` neutralise donc `schoolStore` **et** le moteur de
synchronisation pour `role === 'parent'`.

| Route | Écran | Source |
|---|---|---|
| `/parent` | Connexion (lien général) | — |
| `/parent/:token` | **Portail public par jeton, inchangé** | `get_parent_portal_data` |
| `/app/parent` | Accueil | `parent_dashboard()` |
| `/app/parent/enfants` | Mes enfants | `parent_context()` |
| `/app/parent/notes/:id` | Résultats | `parent_child_grades()` |
| `/app/parent/bulletins/:id` | Bulletins | `parent_child_bulletins()` |
| `/app/parent/absences/:id` | Absences et retards | `parent_child_attendance()` |
| `/app/parent/frais/:id` | Frais scolaires | `parent_child_fees()` |
| `/app/parent/documents/:id` | Documents | `parent_child_documents()` |
| `/app/parent/notifications` | Notifications | `parent_notifications()` |
| `/app/parent/profil` | Profil | `parent_update_profile()` |

`PARENT_NAV` vit dans `src/config/navigation.js` mais **hors de `NAV_GROUPS`** :
aucune entrée du personnel ne peut fuir dans le shell parent, ni l'inverse.
`_parent_navigation.test.mjs` le vérifie, et vérifie aussi qu'aucun mécanisme
d'élargissement (capacité déléguée, gouvernance, matrice stricte) ne fait
apparaître une page parent.

**L'id d'élève dans l'URL n'est pas filtré côté navigateur.** Il est passé au
serveur, qui tranche ; un id étranger revient `null` et l'écran affiche « dossier
introuvable ». C'est volontairement l'inverse de « je vérifie puis j'affiche » :
la vérification n'appartient pas au frontend.

---

## 9. Les bulletins : aucun second moteur

`parent_child_bulletins` ne recalcule **rien**. Moyennes, cotes, rangs et
décisions sont **lus** dans `apc_bulletins`, `prim_bulletins`, `mat_bulletins` et
`prim_resultats_annuels`, où le personnel les a publiés.

Créer ici un second calcul, c'était prendre le risque qu'un parent lise 12,47 là
où le bulletin officiel affiche 12,46, sans aucun moyen de savoir lequel fait foi.

Pour les classes en moteur classique, où rien n'est persisté,
`parent_child_grades` calcule en SQL les seuls **agrégats de classe** (moyenne,
min, max, effectif) et le **rang** de l'enfant — un entier. Les notes des autres
élèves ne traversent jamais le réseau : c'est la différence entre « le frontend
n'affiche pas » et « le serveur n'envoie pas ». Le test 4b le vérifie en
cherchant l'identifiant d'un camarade dans la réponse JSON.

La pondération appliquée côté client est celle de `src/core/bulletinEngine.js` —
le moteur de l'école, pas un second.

---

## 10. Approvisionnement des comptes

Motif identique à `admin_create_staff_account` : un client `anonClient` sans
persistance crée le compte auth sans déconnecter le secrétariat, puis une RPC
`SECURITY DEFINER` pose l'identité et le rattachement
(`src/lib/parentAccounts.js`).

Deux garde-fous, tous deux en base :

- **`admin_create_parent_account` refuse un compte déjà présent dans
  `school_users`.** Personnel et parent ne se croisent jamais, dans les deux sens.
- **`admin_link_parent_student` passe par `user_scope_allows_student`.** Le
  cloisonnement par secteur s'applique donc **à la création du lien** : un
  responsable du Collège ne rattache pas un parent à un élève du Primaire,
  exactement comme il ne peut pas le lire. Aucune règle de secteur n'est
  réécrite pour cela.

---

## 11. Les tests

`server/_parent_isolation.test.mjs` — 45 assertions contre le **vrai serveur
Fastify**, par requêtes HTTP réelles. Fixture : un parent, deux enfants dans deux
secteurs, un second parent, un élève sans parent, une autre école.

```
THE GENIUS (durcie, strict_role_enforcement = 1)
  ├── Collège  · 5e   → Jean Dupont     ─┐ PARENT A
  ├── Primaire · CM2  → Marie Dupont    ─┘
  ├── Collège  · 5e   → Paul Martin      → PARENT B
  └── Primaire · CM2  → Alice Nkoa       → aucun parent
AUTRE ÉCOLE
  └── 6e              → Eleve Autre
```

Paul est dans la **même classe** que Jean, Alice dans la **même classe** que
Marie : le test ne prouve pas seulement le cloisonnement entre secteurs, il
prouve le cloisonnement **au sein d'une même classe**, qui est le cas réellement
difficile.

Couverture : les 22 tests du cahier des charges, le §17 multi-enfants, la
réciprocité entre parents, l'isolation des notifications, la tentative
d'auto-rattachement, le contrôle de secteur au rattachement, et la
non-régression du portail public par jeton.

`src/config/_parent_navigation.test.mjs` — 12 assertions sur la séparation des
deux navigations et l'absence de lien mort.

`supabase_parent_portal_verify.sql` — §A instantané de référence (empreintes
`md5` des 96 policies et des 12 fonctions de cloisonnement), §B pose correcte,
§C comparaison des empreintes. **Une seule différence sur une policy ou une
fonction existante fait échouer la recette** : c'est ainsi que « ne casse rien »
se vérifie au lieu de s'affirmer.

Le §D du même fichier rejoue les tests **sous l'identité réelle d'un parent**
(`set_config('request.jwt.claims', …)` dans un bloc `DO`, résultats déposés en
table `TEMP`). C'est la seule preuve qui ne ment pas : une transcription de la
règle en SQL peut mentir dès que la règle bouge.

---

## 12. Fichiers

**Base**
`supabase_parent_portal.sql` · `supabase_parent_portal_verify.sql` ·
`supabase_parent_portal_rollback.sql`

**Serveur LAN**
`server/schema.sql` (2 tables) · `server/db.js` (`parent_show_rank`) ·
`server/scopeGuard.js` (refus explicite) · `server/query.js` (API générique
fermée) · `server/rpc.js` (13 RPC)

**Frontend**
`src/lib/parentService.js` · `src/lib/parentAccounts.js` ·
`src/store/parentStore.js` · `src/components/parent/ParentLayout.jsx` ·
`src/pages/parent/` (10 écrans) · `src/lib/auth.js` · `src/store/authStore.js` ·
`src/App.jsx` · `src/components/ProtectedRoute.jsx` · `src/config/navigation.js` ·
`src/lib/roleLabel.js`

**Tests**
`server/_parent_isolation.test.mjs` · `src/config/_parent_navigation.test.mjs`
