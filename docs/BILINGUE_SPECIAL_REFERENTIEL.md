# Programme d'Éducation Bilingue Spécial — premier cycle

Référentiel et bulletin du **Programme d'Éducation Bilingue Spécial**, défini par
l'**arrêté n°239-23/MINESEC du 14 juin 2023** (visa Services du Premier Ministre
n°002688 du 06 juin 2023), sections **I-2** (francophone) et **II-2** (anglophone).

> ⚠️ À ne pas confondre avec le sous-système francophone ou anglophone **ordinaire**
> (sections I-1 et II-1 du même arrêté), ni avec `src/templates/cameroon/bilingual.js`,
> qui est un gabarit de provisionnement d'école bilingue aux coefficients génériques,
> sans valeur réglementaire.

## Ce que couvre l'arrêté

| Sous-système | Classes | Section |
|---|---|---|
| Francophone | 6ᵉ, 5ᵉ, 4ᵉ, 3ᵉ | I-2 (p. 2-3) |
| Anglophone | Form 1 … Form 5 | II-2 (p. 5-6) |

L'arrêté ne traite **aucune classe du second cycle** (2ⁿᵈᵉ/1ʳᵉ/Tˡᵉ, Lower/Upper Sixth).
Rien n'est inventé pour ces niveaux : une classe de second cycle n'est jamais routée
vers ce moteur.

**Périmètre activé aujourd'hui** : 6ᵉ–3ᵉ et Form 1–3. Les Form 4/5 sont présentes dans
le référentiel (fidélité à l'arrêté) mais ne sont pas mises en service — voir
« Matières au choix » plus bas.

## Fidélité de l'extraction

L'arrêté est un **scan sans couche texte**. Les tableaux ont été relevés
visuellement, puis vérifiés par recalcul contre les totaux **imprimés** :

| Classe | Σ coefficients | Σ charge horaire |
|---|---|---|
| 6ᵉ / 5ᵉ | 31 ✅ | 32 h ✅ |
| 4ᵉ / 3ᵉ | 32 ✅ | 33 h ✅ |

Les 5 sous-totaux de domaine de chaque classe concordent également. Ce contrôle est
rejoué par `src/core/_bilEngine.test.mjs` et `server/_bilSeed.test.mjs`.

**Côté anglophone, l'arrêté n'imprime aucune ligne TOTAL** : les sommes (Form 1 : 32,
Form 2 : 32, Form 3 : 35) sont *recalculées*, pas officiellement validées. Seul le
plafond de 40 périodes hebdomadaires est contrôlable, et il est respecté.

## Coefficient ≠ charge horaire

Dans ce programme, la colonne « Coefficient » fait foi. Les deux colonnes coïncident
partout **sauf une** : **Travail Manuel — 2 h pour un coefficient de 1**. La charge
horaire est stockée et affichée, mais n'est jamais utilisée comme coefficient.

## Règle de calcul

```
Moyenne d'une matière  = moyenne de ses notes sur les séquences de la période
Moyenne générale       = Σ (moyenne de matière × coefficient) / Σ coefficients
```

- Une note réellement égale à **0 compte** (y compris stockée comme nombre `0`).
- Une matière **non évaluée** est exclue du numérateur **et** du dénominateur ; ses
  points pondérés valent `null`, jamais `0`.
- Une matière **non applicable** à la classe (cellule grisée de l'arrêté) n'existe pas.
- Le bulletin affiche **séparément** le total des points pondérés, le total des
  coefficients retenus et la moyenne générale — qui est exactement leur quotient.
- Un bulletin dont toutes les matières ne sont pas notées porte la mention **PROVISOIRE**.

> Cette règle **diffère volontairement** du second cycle (`scEngine.js`), dont la
> moyenne générale est la moyenne arithmétique des moyennes de chaque séquence
> (`multiAvg`). Les deux moteurs coexistent sans se toucher : chaque bulletin applique
> la règle de son propre arrêté. Le moteur SC n'a pas été modifié.
>
> **Mais les deux règles donnent le MÊME résultat sur des données complètes.** Si
> chaque matière est notée à chaque séquence :
> ```
> multiAvg = (1/S)·Σ_s [Σ_j note_sj·coef_j / Σcoef]
>          = Σ_j coef_j·(1/S)·Σ_s note_sj / Σcoef
>          = Σ_j coef_j·moyenne_j / Σcoef          ← la règle retenue
> ```
> L'égalité est algébrique, et vérifiée par test (`_bilEngine.test.mjs`, §14).
> Adopter cette règle ne change donc **rien** aux bulletins complètement renseignés ;
> elle ne se distingue qu'en cas de couverture partielle des séquences, où elle a
> l'avantage d'être refaisable à la main depuis le papier.

Arrondi centralisé dans `r2()` (`bilEngine.js`) : l'aperçu écran et le PDF consomment
le même objet `assembleBilBulletin`, donc ne peuvent pas diverger.

## Spécification vérifiable des formules

Pour chaque règle : **(1)** la formule réellement implémentée, **(2)** un exemple
chiffré issu des bulletins de démonstration, **(3)** la source officielle *si elle
existe*, **(4)** ce qui reste à faire valider.

> Aucune formule de ce tableau n'est présentée comme officiellement validée.
> L'arrêté 239-23 **fixe des matières et des coefficients ; il ne définit aucune
> méthode de calcul de moyenne**. Toutes les règles ci-dessous relèvent donc de
> l'usage ou d'une décision d'établissement, et sont conservées en l'état tant
> qu'une source vérifiable ne les confirme pas.

### R1 — Moyenne d'une matière sur une période

1. **Implémenté** — `moyenneⱼ = (1/n) · Σ (noteᵢ / barèmeⱼ) × barème_sortie`, sur les
   *n* séquences **réellement notées** de la période (`subjectMean`, `bilEngine.js`).
   Chaque note est normalisée par le barème de sa matière : un devoir sur 10 ne pèse
   pas double face à un devoir sur 20.
2. **Exemple** — 6ᵉ, Français : séquences 17,5 et 17,5 → **17,5**.
   Travail Manuel : 0 et 0 → **0**.
3. **Source** — aucune. Moyenne arithmétique des séquences, usage courant.
4. **À valider** — faut-il pondérer les séquences entre elles (ex. séquence 2 plus
   lourde) ? Actuellement non : elles pèsent également.

### R2 — Pondération par coefficient et moyenne générale

1. **Implémenté** — `Moyenne générale = Σ(moyenneⱼ × coefⱼ) / Σ coefⱼ`, limitée aux
   matières **applicables et évaluées**.
2. **Exemple** — 6ᵉ trimestre 1 : Σ(M×coef) = **425,75**, Σcoef = **31**,
   moyenne = 425,75 / 31 = **13,73/20**. Les trois valeurs sont imprimées
   séparément : le calcul est refaisable à la main depuis le papier.
3. **Source** — les **coefficients** viennent de l'arrêté 239-23 (vérifiés : 6ᵉ Σ31,
   5ᵉ Σ31, 4ᵉ Σ32, 3ᵉ Σ32). La **formule de pondération**, elle, n'y figure pas.
4. **À valider** — confirmation que l'établissement applique bien la moyenne
   pondérée par coefficients, et non une autre combinaison.

### R3 — Notes à zéro et matières non évaluées

1. **Implémenté** — un `0` réel est une note : il entre au numérateur (0 point) **et**
   au dénominateur (son coefficient compte). Une matière **jamais notée** sur la
   période est exclue des deux. Son champ « points pondérés » vaut `null`, jamais 0.
2. **Exemple** — 6ᵉ : Travail Manuel (coef 1) à 0 → 0 point, mais son coefficient 1
   reste dans les 31. 4ᵉ : SVTEEHB non évaluée → Σcoef retenus **27** alors que
   Σcoef applicables vaut **32**.
3. **Source** — aucune. Principe comptable : ne jamais transformer une absence
   d'information en une note de 0, qui sanctionnerait l'élève pour une défaillance
   de saisie.
4. **À valider** — l'établissement veut-il qu'une matière non évaluée soit
   réellement neutralisée, ou reportée au trimestre suivant ?

### R4 — Statut PROVISOIRE

1. **Implémenté** — `provisoire = (nbEvaluées < nbApplicables) OU (nbPartielles > 0)`.
   Deux motifs **distincts**, énoncés séparément sur le bandeau :
   - *non évaluée* — la matière n'a **aucune** note sur la période ;
   - *couverture partielle* — elle est notée sur une **partie** des séquences.

   Un **zéro réel** n'est ni l'un ni l'autre : c'est une note, comptée normalement.
   La ligne concernée porte en outre la mention « sur n/N séq. ».
2. **Exemple** — 4ᵉ : 14 évaluées sur 17 → « PROVISOIRE — 3 matière(s) non
   évaluée(s). Les totaux ne portent que sur les matières notées. »
3. **Source** — aucune. Garde-fou interne.
4. **À valider** — le seuil de signalement convient-il à l'établissement ?

> ✅ **Corrigé.** La couverture partielle n'était **pas** signalée : un bulletin
> reposant sur une séquence sur deux passait pour définitif, alors que c'est
> précisément le cas où les méthodes de moyenne divergent. Le calcul, lui, n'a
> pas changé — seule la signalisation.

### R5 — Décisions de passage et de redoublement

1. **Implémenté** — **aucun calcul automatique.** La décision affichée provient
   exclusivement de la saisie du conseil de classe (clé `__decision__`, partagée
   avec les autres bulletins). Sans saisie, le champ reste vide.
2. **Exemple** — bulletin annuel de démonstration : « Admise en classe de 5ᵉ »,
   valeur saisie, non déduite de la moyenne.
3. **Source** — aucune, et c'est précisément pourquoi rien n'est calculé : aucun
   seuil de passage n'est défini par l'arrêté 239-23.
4. **À valider** — si l'établissement souhaite une proposition automatique, il doit
   fournir la règle (seuil, matières éliminatoires, rattrapage).

> 📌 **Écart avec le bulletin du second cycle.** Celui-ci propose, lui, une décision
> automatique sur le bulletin annuel : `moyenne ≥ barème/2 → « Admis(e) »`
> (`Bulletins.jsx`, variable `fallback`). Ce seuil de 10/20 n'a pas de source
> documentée dans le dépôt. Le bulletin bilingue ne le reprend pas délibérément.
> Point à arbitrer pour le second cycle — hors périmètre de ce travail.

### R6 — Bulletin annuel

1. **Implémenté** — `mode: 'subject_mean'` : moyenne annuelle de chaque matière =
   moyenne de ses moyennes trimestrielles **réellement obtenues**, puis R2.
2. **Exemple** — 6ᵉ annuel : Σ(M×coef) = **367,43**, Σcoef = **31**,
   moyenne = **11,85/20**. Moyennes trimestrielles imprimées : 12,01 · 11,48 · 12,06.
3. **Source** — aucune.
4. **À valider** — choix entre les formules A/B/C/D du tableau ci-dessous. La
   méthode retenue est écrite en toutes lettres sur le bulletin annuel.

## Moyenne annuelle — formules possibles et ampleur réelle de l'écart

Aucun texte officiel ne fixe la méthode. Trois formules sont défendables :

| | Formule | Principe |
|---|---|---|
| **A** | `subject_mean` *(défaut)* | moyenne annuelle de chaque matière = moyenne de ses moyennes trimestrielles, puis `Σ(annuelle × coef) / Σcoef` |
| **B** | `term_mean` | moyenne arithmétique des trois moyennes générales trimestrielles |
| **C** | pondération par trimestre | idem B, mais avec des poids (ex. T3 plus lourd) — **non implémentée**, faute de règle validée |
| **D** | recalcul sur 6 séquences | moyenne de chaque matière sur les 6 séquences, puis pondération |

Mesure sur une 6ᵉ complète (15 matières, Σcoef 31) :

| Situation | A | B | D | Écart max |
|---|---|---|---|---|
| Toutes les matières évaluées à chaque séquence | 12,20 | 12,20 | 12,20 | **0,00** |
| Évaluation irrégulière (matière absente de T2/T3, séquence manquante) | 12,09 | 12,27 | 12,14 | **0,18** |

**Quand l'évaluation est complète, les trois formules coïncident exactement.** Elles ne
divergent que si une matière n'est pas évaluée partout, et l'écart croît avec le
coefficient de cette matière et avec sa distance à la moyenne de l'élève.

> ⚠️ **La divergence n'est pas toujours signalée.** Une matière notée en séquence 1
> mais pas en séquence 2 compte comme « évaluée » : le bulletin n'est donc **pas**
> marqué PROVISOIRE, alors que les formules divergent déjà. Seule une matière
> **sans aucune note** sur la période déclenche la mention. Autrement dit, un
> bulletin d'apparence complète peut reposer sur une couverture partielle des
> séquences. C'est le point n°1 de la liste de recette ci-dessous.

> Un écart de 2,4 points avait été cité pendant la Phase 2 : il provenait d'une fixture
> de test volontairement extrême (2 matières, dont une de coefficient 3 évaluée au seul
> T1). Ce n'est pas un ordre de grandeur représentatif.

La méthode retenue est **imprimée en toutes lettres sur le bulletin annuel**. Le défaut
reste **A**, et aucun changement de règle ne sera fait sans décision de l'établissement.

## Matières au choix

Les sections « MATIÈRES AU CHOIX SELON LES ORIENTATIONS » n'existent **qu'en Form 4/5**.
Dans tout le périmètre activé (6ᵉ–3ᵉ, Form 1–3), **toutes les matières sont obligatoires**.

Les lignes `obligatoire: false` sont conservées en base mais ne sont **jamais créées
automatiquement** sur une classe (`subjectsFromBilReferentiel`, `includeOptional: false`) :
cumulées, elles portent Form 4/5 à 46 périodes contre un plafond de 40 — preuve qu'un
élève n'en suit qu'un sous-ensemble.

> ### ⛔ Form 4 et Form 5 ne sont PAS prêtes pour la production
>
> Leurs coefficients sont présents dans le référentiel **par fidélité à l'arrêté**, et
> le moteur sait les lire. Mais la classe ne peut pas être exploitée en l'état, pour
> deux raisons qui ne relèvent pas du logiciel :
>
> 1. **Les orientations proposées par l'établissement ne sont pas connues.** L'arrêté
>    liste un catalogue d'options, pas des combinaisons imposées.
> 2. **Il n'existe aucune sélection des matières suivies par élève.** Les matières sont
>    aujourd'hui portées par la CLASSE ; distinguer deux élèves d'une même Form 4 qui
>    ne suivent pas les mêmes options demanderait un modèle de données supplémentaire
>    (affectation matière↔élève), non développé.
>
> Conséquence concrète : une classe Form 4 configurée aujourd'hui recevrait ses **4
> matières obligatoires** et rien d'autre, et son total de coefficients serait donc
> faux. **Ne pas mettre Form 4/5 en service avant d'avoir traité ces deux points.**
> Les classes 6ᵉ–3ᵉ et Form 1–3 ne sont pas concernées : l'arrêté n'y prévoit aucune
> option, toutes leurs matières sont obligatoires.

## Format du référentiel

Fichier pivot : `examples/bilingue/referentiel-bilingue-special-premier-cycle.json`
(141 entrées · 35 matières · 10 domaines · 2 séries).

```json
{
  "version":  { "label": "Arrêté n°239-23…", "source": "…" },
  "series":   [ { "id": "bil_fr", "nom": "…", "categorie": "bilingue_special" } ],
  "groupes":  [ { "id": "fr_d1", "nom": "Langues et littératures", "ordre": 1 } ],
  "matieres": [ { "id": "mathematiques", "nom": "Mathématiques", "domaine": "…" } ],
  "entries":  [ { "serie": "bil_fr", "classe": "6e", "matiere": "francais",
                  "groupe": "fr_d1", "coef": 4, "charge": 4, "obligatoire": true } ]
}
```

| Entité | Valeurs |
|---|---|
| `serie` | `bil_fr` (6ᵉ–3ᵉ) · `bil_en` (Form 1–5) |
| `classe` | `6e` `5e` `4e` `3e` · `form1` … `form5` |
| `groupe` | domaine d'apprentissage, déclaré dans `groupes[]` |

Un slug inconnu **arrête** la génération, de même qu'une classe rattachée au mauvais
sous-système (une 6ᵉ ne peut pas porter le référentiel anglophone).

## Import

```bash
# 1. Structure (idempotent, à coller dans Supabase → SQL Editor)
#    supabase_bilingue_special.sql

# 2. Données — régénérer après toute correction du pivot
node scripts/bil-referentiel-to-sql.mjs \
  examples/bilingue/referentiel-bilingue-special-premier-cycle.json \
  supabase_bilingue_special_data.sql

# 3. LAN (hors ligne) — embarque les données dans le seed chargé au boot
node scripts/build-officiel-seed.mjs
```

Puis, pour une école entièrement bilingue spéciale :

```sql
UPDATE schools SET bulletin_engine = 'bilingue_special' WHERE id = '…';
```

ou, pour une seule section dans une école ordinaire :

```sql
UPDATE classes SET bulletin_engine = 'bilingue_special' WHERE id = '…';
```

**Tables dédiées `bil_*`, pas de réutilisation des tables `sc_*`** : chaque import de
référentiel désactive la version précédente (`…_referentiel_versions.actif`). Partager
les tables ferait disparaître l'arrêté du second cycle au premier import du bilingue,
et réciproquement.

Le drapeau `'bilingue_special'` est **dédié** : ni `'minesec'` ni `'officiel'` n'y
mènent, pour qu'aucune école déjà configurée ne change de moteur sans décision explicite.

## Fichiers

| Rôle | Fichier |
|---|---|
| Moteur (logique pure) | `src/core/bilEngine.js` |
| Tests du moteur | `src/core/_bilEngine.test.mjs` |
| Routage par classe | `src/core/engineResolver.js` (`'bilingue_special'` → `'bilingue'`) |
| Auto-configuration | `src/lib/bilAutoConfig.js` |
| Chargement cloud | `src/lib/bilService.js` |
| Document HTML / PDF (trimestriel + annuel) | `src/lib/bilBulletinDoc.js` |
| Aperçu écran (trimestriel + annuel) | `src/components/bulletins/BulletinBilOfficial.jsx` |
| Tests auto-configuration | `src/lib/_bilAutoConfig.test.mjs` |
| Tests d'autorisation | `server/_bulletinAccess.test.mjs` |
| Suite isolée | `npm run test:bilingue` · démos : `npm run demo:bilingue` |
| Migration cloud | `supabase_bilingue_special.sql` + `…_data.sql` |
| Schéma LAN | `server/schema.sql`, `server/db.js` |
| Test LAN | `server/_bilSeed.test.mjs` |
| Démonstration | `scripts/demo-bilingue-bulletins.mjs` |

## Autorisations et isolation des données

Le bulletin lit quatre tables : `classes`, `students`, `subjects`, `grades`. Les
deux éditions les protègent par des mécanismes différents, tous deux **côté
serveur** — l'interface ne fait que présenter ce qu'on lui sert.

| | LAN | Cloud |
|---|---|---|
| Point d'application | `rowAllowed` (`server/scopeGuard.js`), appliqué dans `runQuery` **après** la requête | RLS PostgreSQL |
| Étanchéité inter-écoles | ✅ vaut aussi pour un compte global | ✅ policy permissive sur `school_id` |
| Cloisonnement par secteur | ✅ `scope_sections` / `scope_cycles` / `scope_class_ids` | ✅ policy **RESTRICTIVE** `"secteur: cloisonnement"` (combinée par ET : incontournable) |
| Identité de l'appelant | `userId` extrait du **jeton signé**, jamais du corps de requête (`server/index.js`) | `auth.uid()` |
| Génération en lot | même chemin `runQuery` → mêmes restrictions | mêmes policies |

Vérifié à deux niveaux :

- `server/_bulletinAccess.test.mjs` (36 assertions) — couche `runQuery` ;
- `server/_bulletinSecurityE2E.test.mjs` (39 assertions) — **serveur réel, jetons
  réels**, deux établissements fictifs et quatre rôles : lecture, création,
  modification, suppression, génération individuelle et en lot.

Dans les deux cas, les accès autorisés **et** interdits sont contrôlés, y compris le
client qui vise directement l'`id` d'une ressource hors périmètre : il obtient 0 ligne,
jamais la donnée. L'identité revendiquée dans le corps de la requête est ignorée —
seul le jeton signé fait foi.

> ### ✅ Corrigé — `/api/db/batch` ne vérifiait pas le périmètre
>
> `runOpsGuarded` appliquait sept gardes mais **omettait `guardScopeWrite`** (et,
> depuis son ajout, `guardSchoolIsolation`). Une opération refusée à l'unité sur
> `/api/db` passait donc en l'enveloppant dans un lot : un lot pouvait écrire dans
> le secteur d'un autre responsable, voire dans un **autre établissement**.
>
> Les deux gardes sont désormais appliquées sur ce chemin. Un lot mixte
> (une op légitime + une op hors périmètre) est refusé **et intégralement annulé**.
>
> Trouvé par `_bulletinSecurityE2E.test.mjs`, qui a constaté `applied: 2` là où un
> refus était attendu.
>
> **Restent absentes de ce chemin** : `guardFeePaymentImmutable` et
> `guardTraceReadOnly`, présentes sur `/api/db`. Elles concernent l'immuabilité des
> versements et la trace en lecture seule, pas le cloisonnement des bulletins :
> constat issu de la comparaison des deux listes de gardes, **non corrigé** ici car
> hors mandat et touchant les flux de caisse. À arbitrer.

> ### ✅ Corrigé — écriture d'un compte GLOBAL, édition LAN
>
> `guardScopeWrite` court-circuitait les contrôles de périmètre pour un compte
> global (`if (isGlobal(scope)) return;`) : l'étanchéité inter-écoles n'était donc
> pas appliquée **en écriture** à ces comptes, alors qu'elle l'était en lecture.
>
> Une garde dédiée, **`guardSchoolIsolation`** (`server/scopeGuard.js`), est
> désormais appliquée en tête de la chaîne, pour **toute table portant un
> `school_id`** et quel que soit le périmètre du compte :
>
> - valeurs écrites : un `school_id` explicite doit être celui du compte ;
> - `update`/`delete` ciblés par `id` : la ligne visée doit appartenir à l'école ;
> - écriture de masse sans ciblage : refusée **uniquement** si la base contient
>   réellement une autre école (aucun effet sur une base mono-école).
>
> Exemptions volontaires : appels internes sans session (amorçage, migrations,
> seeds) et comptes non encore rattachés (installateur LAN), comme le fait déjà
> `loadScope`.
>
> ⚠️ **Piège rencontré** : la garde ne doit **pas** appeler `loadScope`, qui a un
> effet de bord (`ensureStrictRoleMatrix` + mémoïsation). L'école est donc lue
> directement depuis `school_users`. La première version violait cette règle et
> faisait tomber `server/_strict_matrix_seed.test.mjs`.
>
> Le cloud n'était pas concerné : `user_scope_is_global(p_school)` y est évalué
> école par école, donc un compte global de A obtient `false` sur B.

## Liste de recette — à valider AVANT mise en production

À faire parcourir par la direction de l'établissement. Tant qu'un point n'est pas
coché, la mise en service est prématurée.

### A. Conformité réglementaire (direction / inspection)

- [ ] **A1** — Les coefficients affichés pour chaque classe correspondent à l'arrêté
      239-23, vérifiés sur un exemplaire papier de l'arrêté (6ᵉ : Σ31 · 5ᵉ : Σ31 ·
      4ᵉ : Σ32 · 3ᵉ : Σ32).
- [ ] **A2** — Les totaux anglophones (Form 1 : 32 · Form 2 : 32 · Form 3 : 35), que
      l'arrêté **n'imprime pas**, sont acceptés tels que recalculés.
- [ ] **A3** — Les matières absentes d'une classe (cellules grisées) sont bien absentes
      du bulletin : LVII en 6ᵉ/5ᵉ, SVTEEHB en 6ᵉ/5ᵉ, Sciences en 4ᵉ/3ᵉ, Home Economics
      en Form 3, Economics en Form 1/2.
- [ ] **A4** — Travail Manuel apparaît avec le **coefficient 1** (et non 2, sa charge horaire).
- [ ] **A5** — Les intitulés de domaines et de matières laissés **en français** dans le
      bulletin anglophone (conformes à l'arrêté) sont acceptés, ou une traduction est demandée.
- [ ] **A6** — La méthode de **moyenne annuelle** est choisie explicitement (A par défaut).

### B. Exactitude des calculs (vérification manuelle sur un élève réel)

- [ ] **B1** — Recalculer à la main `Σ(Moyenne × Coefficient) / Σ Coefficients` sur un
      bulletin imprimé : le résultat doit être **exactement** la moyenne générale affichée.
- [ ] **B2** — Un élève ayant réellement **0** dans une matière voit ce 0 compté
      (ligne à 0 point, moyenne tirée vers le bas).
- [ ] **B3** — Une matière non notée affiche « non évaluée », **pas 0**, et son
      coefficient est absent du « Total des coefficients retenus ».
- [ ] **B4** — Une matière notée sur une partie seulement des séquences est désormais
      **signalée** (bandeau + mention « sur n/N séq. » sur la ligne concernée). Vérifier
      que ce signalement apparaît, et décider du traitement de ces matières.
- [ ] **B5** — Un bulletin incomplet porte bien le bandeau **PROVISOIRE** avec le
      compte « n matières évaluées sur N ».

### C. Rendu et diffusion

- [ ] **C1** — L'aperçu écran et le PDF imprimé affichent les **mêmes chiffres**,
      trimestriel **et annuel** (vérifié automatiquement : 137 contrôles, 0 écart —
      à reconfirmer sur données réelles).
- [ ] **C2** — L'en-tête institutionnel, le logo, le cachet et la signature de
      l'établissement sont corrects.
- [ ] **C3** — Le bulletin tient sur une page A4 pour la classe la plus chargée.
- [ ] **C4** — La génération **en lot** produit bien un bulletin par élève de la classe.

### D. Exploitation

- [ ] **D1** — Test en conditions **hors ligne** (LAN) : le référentiel est disponible
      sans Internet et les bulletins sortent.
- [ ] **D2** — Les référentiels existants (second cycle, APC, maternelle, primaire)
      restent intacts après migration (vérifié automatiquement, à reconfirmer en recette).
- [ ] **D3** — Droits d'accès : audités et testés côté serveur (LAN et cloud, voir
      section précédente). Reste à confirmer en recette avec de **vrais comptes** de
      l'établissement que chaque rôle voit exactement ses classes.
- [ ] **D4** — **Form 4 / Form 5 restent hors service.** La restriction est désormais
      appliquée par le code (`BIL_CLASSES_EN_SERVICE`) : ces classes retombent sur le
      bulletin classique. Ne lever la restriction qu'après avoir arrêté les orientations.
- [ ] **D5** — Vérifier en recette que la nouvelle garde `guardSchoolIsolation` ne
      gêne aucun flux légitime de l'établissement (elle est sans effet sur une base
      mono-école, le cas nominal).

## Points à faire valider par l'établissement ou l'inspection

1. **Totaux anglophones** — non imprimés dans l'arrêté, donc recalculés.
2. **Moyenne annuelle** — aucun texte officiel ne fixe la méthode. Par défaut :
   moyenne annuelle de chaque matière, puis pondération (`mode: 'subject_mean'`).
   L'alternative `'term_mean'` existe. La méthode retenue est **imprimée sur le
   bulletin annuel**.
3. **Form 4/5** — orientations proposées et sélection des matières par élève.
4. **Second cycle** — aucun référentiel ; en attente des textes officiels.
5. **Libellés de domaines** — l'arrêté écrit « Langues et littératures »,
   « Sciences humaines et sociales », « Développement personnel » **en français**
   jusque dans le tableau anglophone, de même que « Éducation à la Citoyenneté et à
   la Morale » ou « Éducation Physique et Sportive ». Ils sont reproduits tels quels,
   par fidélité : à confirmer si l'établissement souhaite des intitulés anglais.
6. **Nombre de séquences par trimestre** — le bulletin suit la configuration de
   l'établissement (2 par trimestre par défaut).
