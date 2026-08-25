# Matrice de rôles et de permissions — THE GENIUS

Règle métier, en une ligne : **la pédagogie est sectorielle, la finance est globale.**

```
                 THE GENIUS
                     │
          ┌──────────┴──────────┐
     PÉDAGOGIE                FINANCE
     SECTORIELLE              GLOBALE
          │                     │
    ┌─────┴─────┐        ┌──────┴──────┐
 Primaire    Collège     Primaire   Collège
 (maternelle              RAF · Caisse · Contrôle
  + primaire)             traversent les deux
```

Un compte du Collège ne voit aucune donnée pédagogique du Primaire, et
réciproquement — y compris en appelant l'API directement, en connaissant l'ID
d'une donnée, ou en tentant une écriture. Mais un caissier rattaché au Collège
encaisse un élève du Primaire, parce que son autorité financière vient de son
**rôle**, pas de son secteur.

---

## 1. L'interrupteur : une seule école concernée

Tout le durcissement est gardé par `schools.strict_role_enforcement`,
**FALSE par défaut** — même patron que `schools.advanced_delegation`.

| Drapeau | Comportement |
|---|---|
| `false` (toute autre école) | strictement celui d'avant, jusque dans le corps des fonctions partagées |
| `true` (THE GENIUS) | la matrice ci-dessous s'applique |

Aucun identifiant d'école n'est codé en dur dans une fonction, une policy ou un
composant : seule la §9 de `supabase_genius_role_permissions.sql`, isolée et
commentée, pose le drapeau, et elle avorte si une autre école le porte déjà.

La règle de conception qui rend cette garantie vérifiable est la même partout :
**la matrice est RESTRICTIVE, jamais permissive.** Elle ne sait que retirer.

```
accès final = (toutes les règles d'avant) ET (la matrice)
```

Drapeau baissé, le second terme vaut « vrai » sans rien examiner — d'où
l'identité stricte du comportement pour les autres établissements, et d'où le
fait qu'on puisse la tester en comparant deux exécutions.

---

## 2. Les quatre couches (la §15 du cahier des charges)

Le frontend n'est **jamais** une barrière de sécurité. Quatre implémentations
disent la même chose ; les trois dernières sont celles qui protègent.

| Couche | Fichier | Rôle |
|---|---|---|
| Interface | `src/core/strictMatrix.js` (+ `src/lib/useStrictMatrix.js`) | ne pas proposer ce que la base refusera |
| Routes | `src/components/ProtectedRoute.jsx` | l'URL tapée à la main ne rouvre pas un menu caché |
| Serveur LAN | `server/scopeGuard.js` | filtre les lignes lues, refuse les écritures hors périmètre |
| Cloud | `supabase_genius_role_permissions.sql` | policies `AS RESTRICTIVE` sur 24 tables |

`service_role` conserve son `BYPASSRLS` : **l'appairage LAN/Cloud, `sync-pull`,
`sync-push`, `events-*` et `credentials-pull` sont intacts.**

---

## 3. Ce que chaque rôle obtient

### Autorités (clés de gouvernance)

Posées sur le catalogue de l'école par `apply_strict_role_matrix()` (cloud),
`ensureStrictRoleMatrix()` (LAN) et `STRICT_ROLE_MATRIX` (`src/governance/permissions.js`).
Les trois listes sont identiques et se relisent l'une l'autre.

| Clé | Détenue par | Effet |
|---|---|---|
| `fees.manage` | caissier, RAF, coordonnateur général, fondatrice | encaisser, modifier un dû, une grille — **les deux secteurs** |
| `fees.view` | contrôleur | consulter l'argent des deux secteurs, **sans jamais écrire** |
| `staff.manage.sector` | principal, vice-principal, directrice du primaire, directrice adjointe, responsable maternelle | le personnel de **son** secteur |
| `staff.manage.all` | fondatrice, coordonnateur général, RAF | le personnel des deux secteurs |

Ces clés sont **éditables depuis l'application** (Personnel → Gouvernance →
Catalogue) : l'école désigne elle-même qui encaisse, sans migration SQL. Les
cases correspondantes ne s'affichent que dans une école durcie — ailleurs elles
seraient sans effet.

### Pages

| Groupe | Condition sous matrice stricte |
|---|---|
| `/app/fees`, `/app/frais-catalogue` | `fees.manage` **ou** `fees.view` (ou administrateur) |
| `/app/teachers`, `/app/personnel`, `/app/rh` | une autorité `staff.manage.*` |
| `/app/settings`, `/app/year`, `/app/synchronisation`, `/app/groupe` | administrateur, ou page **explicitement** confiée au compte |
| tout le reste, pour un compte `teacher` | uniquement son périmètre pédagogique |

Un enseignant garde notes, bulletins, documents, emploi du temps et absences ;
il perd les paramètres administratifs, l'historique, le personnel et la finance.

### Données

| Table(s) | Cloisonnement |
|---|---|
| classes, élèves, matières, notes, emploi du temps, APC/prim/maternelle | par **secteur du compte** |
| 8 tables de vie scolaire (retards, incidents, sanctions, convocations, sorties…) | par **secteur de l'élève** |
| `teachers` | secteur **DÉRIVÉ** des classes et matières assurées |
| `staff` | secteur **DÉCLARÉ** (`staff.sector`) ; `NULL` = agent transverse, visible de tous |
| `student_fees`, `fee_payments`, `student_fee_items`, `class_fee_grids` | secteur, **sauf** pour une autorité financière qui traverse |

Le secteur d'un enseignant est dérivé et non saisi : c'est une décision de
l'établissement, qui évite une double saisie et une divergence possible entre la
fiche et les affectations réelles. Un enseignant sans aucune classe ni matière
reste visible — sinon on ne pourrait plus lui en affecter, donc jamais lui
donner de secteur.

---

## 4. Séparation des deux axes

C'est le point le plus facile à manquer, et il est testé explicitement :

- un **caissier** traverse l'argent des deux secteurs **sans** obtenir la
  pédagogie des deux secteurs ni le personnel de l'autre secteur ;
- un **principal** gère son personnel et sa pédagogie **sans** obtenir la caisse ;
- un **contrôleur** lit les deux secteurs et n'écrit rien, nulle part.

Avant la Phase 3, le seul moyen de rendre un compte financier transverse était
`scope_global = true` — ce qui lui ouvrait aussi toutes les notes et tous les
bulletins des deux secteurs.

---

## 5. Le trou que ce travail ferme

`school_users.role` n'accepte que quatre valeurs : `admin`, `teacher`,
`censeur`, `surveillant`. L'application n'a donc **aucun** rôle de base
« caissier », « secrétaire » ou « RAF » : `src/config/capabilities.js` crée ces
métiers comme `censeur` + une liste de pages.

L'ancienne `is_school_cashier` testait `role IN ('admin','censeur')`. Elle
répondait donc **vrai** pour les deux secrétariats, le responsable informatique
et le censeur — 11 comptes sur 12. Son second terme,
`permissions LIKE '%/app/fees%'`, était tout aussi large : le préréglage
« censeur » accorde explicitement `/app/fees`.

D'où la règle retenue : **l'autorité financière est un rôle de gouvernance.**
Elle ne s'obtient plus par le simple fait d'exister en tant que compte délégué.

---

## 6. Ordre d'application (cloud)

1. `supabase_genius_role_permissions_verify.sql` — **requête 3 d'abord** : elle
   confirme l'ID de l'école. Deux écoles du projet contiennent « genius ».
2. `supabase_genius_role_permissions.sql` — migration + activation.
3. `supabase_genius_teacher_scope_backfill.sql` — **le geste qui touche des
   comptes existants.** Le backfill de la Phase 2 avait posé `scope_global = true`
   pour tout compte sans périmètre, donc pour tous les enseignants ; or un compte
   global traverse le cloisonnement par conception. Sans ce fichier, la règle
   « aucun enseignant du Collège n'accède au Primaire » n'est pas tenue, quelles
   que soient les policies posées. Il crée sa propre table de sauvegarde.
4. Relire `..._verify.sql` en entier.

Côté LAN, rien à jouer : `server/db.js` pose les colonnes et la matrice
d'autorité tout seul, y compris si le drapeau arrive **après** le démarrage
(descente cloud, restauration de sauvegarde) — c'est `loadScope()` qui rattrape.

### Retour arrière

| Portée | Geste |
|---|---|
| Tout le durcissement | `UPDATE schools SET strict_role_enforcement = false WHERE id = …` — instantané, et suffisant : tout le code retombe sur son comportement d'avant |
| Fonctions et policies | `supabase_genius_role_permissions_rollback.sql` |
| Périmètre des enseignants | §4 de `supabase_genius_teacher_scope_backfill.sql` (rejoue l'état exact d'avant depuis `genius_teacher_scope_backup`) |

Aucune donnée n'est supprimée, aucun compte n'est recréé, aucun mot de passe
n'est modifié — `surveillant.primaire@thegenius.cm` compris.

---

## 7. Tests

```bash
node server/_genius_permissions.test.mjs    # 37 — autorisations par HTTP réel sur /api/db
node server/_strict_matrix_seed.test.mjs    # 19 — amorçage de la matrice à l’installation
node server/_scope_isolation.test.mjs       # 20 — cloisonnement secteur (Phase 2)
node src/core/_strictMatrix.test.mjs        # 79 — la matrice, règle par règle
node --experimental-loader ./scripts/lib/esm-resolve.mjs \
     src/config/_navigation_strict.test.mjs # 20 — menus, dont la non-régression
```

Deux d'entre eux existent d'abord pour la §16 (« aucun changement pour les
autres écoles ») :

- `_strictMatrix.test.mjs` §0 rejoue la matrice complète drapeau baissé — tous
  les rôles × tous les profils × toutes les pages — et exige **zéro** refus ;
- `_navigation_strict.test.mjs` §1 calcule la navigation **avec** et **sans** la
  matrice dans une école non durcie et compare les listes entrée par entrée.

Ce que ces tests empruntent est le chemin d'un contournement de l'interface :
requêtes HTTP réelles sur `/api/db`, aucune protection frontend en jeu.
