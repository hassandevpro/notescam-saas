# Corrections de données appliquées en production

Ce dossier garde la trace des **écritures de données** faites au Cloud hors
application : le script exécuté, son **retour arrière**, et l'état relevé
**avant**. Ce ne sont pas des migrations — elles ne changent aucun schéma et ne
doivent pas porter le préfixe `supabase_`, qui est réservé aux migrations et
balayé par `npm run validate:migrations`.

Règle : une correction de données n'est appliquée qu'après **autorisation
explicite** du responsable, et jamais sans un retour arrière déjà écrit, ciblé
par identifiant.

| Date | Objet | Lignes | État |
|---|---|---|---|
| 2026-10-19 | BRIGHT CONTINENT — 19 notes d'Espagnol classées en Mathématiques | 19 `grades` | **appliquée et vérifiée** |
| 2026-10-24 | `updated_at` NULL — les lignes qui ne descendaient jamais vers un serveur d'école | 6 065 lignes, 31 tables | **appliquée et vérifiée** |

## 2026-10-19 — BRIGHT CONTINENT, Espagnol classé en Mathématiques

**Constat.** Les 118 notes du classeur
`Toutes_les_notes_par_classe_et_matiere (2).xlsx` (séquence 1) étaient **déjà**
au Cloud depuis le 18/10. 99 à la bonne place ; les 19 notes d'Espagnol de
5ème (8), 4ème Esp (5) et 3EME ESP (6) avaient été écrites sous
**Mathématiques** — mêmes élèves, mêmes valeurs, mauvaise matière. Ces trois
classes n'ont aucune note de mathématiques au classeur.

Réimporter était de toute façon impossible : la contrainte
`grades_class_student_subject_seq_key (class_id, student_id, subject_id,
sequence)` ne contient pas l'année et aurait refusé chaque ligne.

**Ce qui a été écarté, après vérification.** L'année `2024-2025` des notes,
alors que l'école est en `2026-2027`, n'est **pas** un défaut : `fetchGrades`
(`src/lib/schoolService.js:222`) ne filtre pas par année, et toutes les écoles
de la plateforme sont dans ce cas. Ne pas « corriger » cette année-là sans
avoir d'abord établi qui la lit.

**Fait.** 3 `UPDATE` ciblés **par identifiant** (jamais par matière, pour ne pas
emporter de vraies notes de mathématiques saisies entre-temps), en une
transaction, avec auto-contrôle refusant le commit hors de 19 / 0 / 118.

**Vérifié après coup.** Réconciliation complète classeur ↔ Cloud :
**21 couples (classe, matière) identiques, 0 écart, 118 = 118**.

**Retour arrière.** `*.RETOUR-ARRIERE.sql`, ciblé sur les mêmes 19 identifiants,
donc valable à tout moment et pas seulement dans la minute qui suit.

## 2026-10-19 — BRIGHT CONTINENT, report des notes en APC

**Constat.** `schools.bulletin_engine = 'officiel'` : les classes 6e–3e sont pilotées par
le moteur **APC**, dont l'écran de saisie et le bulletin officiel lisent `apc_notes` —
jamais `grades`. Les 118 notes de séquence 1 vivaient donc dans `grades`, exactes mais
invisibles partout sauf au bulletin « Classique ».

**Fait, sur autorisation**, en trois temps :

1. `…-report-apc.sql` — 102 lignes `apc_notes` créées, chaque note sur la **première
   compétence** de sa matière (plus petit `ordre`, `id` pour départager). 4 notes de
   6ème Mathématiques déjà saisies par l'école le 15/10, avec les mêmes valeurs :
   `ON CONFLICT DO NOTHING`, on n'écrase jamais une saisie d'enseignant.
2. `…-espagnol-6e-5e.sql` — le référentiel national ne définit l'espagnol qu'à partir de
   la 4e. 6 compétences **propres à l'école** créées (6e et 5e × 3 trimestres), puis les
   12 notes d'espagnol posées sur celles du trimestre 1.
3. `…-espagnol-version.sql` — **indispensable, et oublié au départ** : voir ci-dessous.

**Le piège, à retenir.** `src/lib/apcService.js` ne charge que les compétences dont le
`referentiel_version_id` est une version active. Une compétence maison créée avec ce
champ à NULL existe en base et n'est **jamais** relue : la matière disparaît même du
sélecteur, qui écarte les matières sans compétence. Le produit avait le même oubli —
`contexteApc` (`ApcCompetenceWorkspace`) ne transmettait pas ce champ, donc **toute**
compétence ajoutée par une école en premier cycle subissait ce sort. Corrigé côté code
dans le même mouvement.

**Second piège.** Le référentiel est mis en cache dans IndexedDB (`NotesCamDB` →
`apc_ref`) et n'est retéléchargé que si l'**empreinte de version** change. Ajouter une
compétence maison ne change pas cette empreinte : le poste garde son cache, et
`Ctrl+Shift+R` n'y touche pas. Vérifié en vidant le magasin à la main — le cache est
alors repassé de 445 à 451 compétences, dont les 6 nouvelles.

**Ce qui n'a PAS été touché, délibérément.** `apc_classe_matieres` n'a pas de
`school_id` : y poser l'espagnol en 6e/5e l'imposerait aux 44 écoles. `coefFor`
(`apcEngine.js:188`) retombe sur `apc_matieres.espagnol.coefficient`, qui vaut déjà
**2** — le coefficient que la 4e et la 3e lui donnent. Rien n'est perdu.

**Vérifié.** `apc_notes` = 140, `grades` = 118 **intactes**, et les 118 notes du classeur
réparties sur les bonnes matières dans les quatre classes.

**Retour arrière.** Les deux `*-RETOUR-ARRIERE.sql`, à jouer dans l'ordre inverse
(espagnol d'abord, puis le report). Celui du report cible par **exclusion** des 26
lignes `apc_notes` relevées avant l'opération (`…-apc-notes-avant.json`).

---

## 2026-10-22 — Matières de classe en double (4 écoles), et le carnet de THE GENIUS

### Appliqué en production, après autorisation explicite

| Fichier | Effet |
|---|---|
| `2026-10-22-matieres-doublons.sql` | **34 lignes `subjects` en trop** retirées (33 couples, un cas à 3 copies), 16 rangs repris sur la ligne gardée, 10 notes strictement identiques retirées |
| `2026-10-22-genius-carnet-primaire.sql` | `prim_bulletin_mode = 'carnet'` pour THE GENIUS, **par identifiant** (deux écoles portent « Genius ») |

**Comment la ligne à garder est choisie** — et l'ordre compte : le plus de notes, puis un
`position` posé (l'école l'a rangée sur son bulletin), puis une `category`, puis un
enseignant, puis la version la plus haute, la création la plus ancienne, le plus petit
identifiant. Ce que la gardée n'a pas, elle le **reprend** de la copie : sans cela,
dédoublonner ferait perdre à l'école l'ordre qu'elle avait posé à la main.

**Ce qui n'a PAS été décidé à la place de l'école** : aucun coefficient, aucun barème,
aucune note dont la valeur diffère entre les deux copies. Vérifié avant écriture :
**0 note en conflit**. Les 10 notes de SVT portaient la même valeur, pour le même élève,
à la **même seconde**, sur les deux identifiants — une saisie écrivait sur les deux copies.

**Le point qu'on oublie dans ce genre de correction : les pierres tombales.** Un `DELETE`
sur `subjects` déclenche `trg_tomb_subjects`, qui écrit `sync_tombstones`. C'est CE
qui fait retirer la ligne par les serveurs LAN des écoles au cycle suivant. Sans
tombstone, l'école garde son doublon **et le repousse au Cloud** : la correction se
défait toute seule, et on croit l'avoir faite. 34 tombstones `subjects` + 10 `grades`
écrits et vérifiés.

**Le retour arrière** (`…-RETOUR-ARRIERE.sql`) réinsère les 34 lignes avec leurs 29
colonnes, remet les 10 notes, défait les 16 reprises de rang, **et supprime les
tombstones** — sans quoi la synchronisation effacerait à nouveau ce qu'on vient de
rétablir. `…​.etat-avant.json` garde l'état complet d'avant, notes comprises.

**Pour refaire la mesure à tout moment** : `node scripts/audit-matieres-doublons.mjs`
(lecture seule, garde-fou qui refuse toute requête non-lecture). Avec `--sql`, il
régénère la correction et son retour arrière. Il dit aujourd'hui : « Aucune matière de
classe en double sur les écoles du Cloud. »

### Préparé, NON appliqué — à trancher avec l'école

| Fichier | Question |
|---|---|
| `2026-10-22-coefficients-a-trancher.sql` | 7 coefficients divergeaient entre les copies. Toutes les lignes sont **commentées** : changer un coefficient change une moyenne |
| `2026-10-22-genius-baremes-classes-paralleles.sql` | Class 1 A annonce /20 et note ses matières sur /100 ; Class 1 B est en /100 ; NURSERY 1 A est FR /20 et NURSERY 1 B EN /100 (peut-être voulu). Les 4 classes portent **zéro note** — le moment est favorable |
| `2026-10-22-genius-5eme-rangs-partages.sql` | Renumérotation 0→15 de la 5eme : supprime 6 ex æquo et 7 trous **sans déplacer une seule matière** |

## 2026-10-24 — `updated_at` NULL : les lignes qui ne descendaient jamais

**Constat.** La descente Cloud → école est un keyset `(updated_at, id)` et `sync-pull`
écarte explicitement les lignes sans date
(`supabase/functions/sync-pull/index.ts:102`). Une ligne sans `updated_at` est donc
**invisible pour toujours** sur le serveur d'une école, et remettre le curseur à zéro n'y
change rien. La même colonne arbitre les conflits (LWW) : `Date.parse(null)` vaut 0, donc
une telle ligne perd tout arbitrage. Déclencheur : le journal d'installation de la 0.3.23
chez THE GENIUS, dont le seul échec annonçait une caisse qui resterait vide.

**Deux origines, les deux dans notre code** (corrigées le même jour, commit `7cfd127`) :
les trois constructeurs de notes (apc/prim/mat) ne posaient que `date_saisie`, la date
*pédagogique* ; et `scripts/import-caisse-genius.mjs` ne nommait `updated_at` que dans sa
branche `ON CONFLICT DO UPDATE`, donc la colonne restait NULL au **premier** import —
origine exacte des 70 lignes de THE GENIUS (lot `reprise-2026-06-08`).

**Fait, sur autorisation explicite**, en une transaction : (A) valeur par défaut `now()`
posée sur les colonnes `updated_at` qui n'en avaient pas — purement additif, aucune ligne
réécrite, et cela borde aussi les scripts SQL passés à la main ; (B) `updated_at = now()`
sur les lignes qui n'en avaient pas, identifiants **sauvegardés d'abord**. `now()` et non
`created_at` : le curseur des écoles est déjà passé devant les dates de création, dater à
la création aurait laissé ces lignes **derrière** le curseur, donc toujours invisibles.

**Vérifié après coup** (lectures seules) : THE GENIUS **60/60 dépenses** et **11/11
écritures de caisse** datées, 0 sans date ; le budget « Reprise de caisse 2025-2026 » daté
lui aussi — sans quoi les dépenses descendraient sans leur budget, et la FK locale
(`PRAGMA foreign_keys = ON`) les refuserait ; `apc_notes` / `prim_notes` /
`mat_observations` à **0** ligne sans date (4 215 rattrapées) ; **31** tables de
sauvegarde, **6 065** identifiants ; plus aucune colonne `updated_at` sans défaut dans le
périmètre contrôlé. L'ordre de descente place bien `budgets`, `budget_periods` puis
`budget_expenses` (`server/cloudSync.js:50`).

**Retour arrière.** Les tables `zz_sauv_updated_at_20261024_*` **sont** le retour arrière
(script en fin du fichier de correction : remise à NULL par identifiant + retrait des
défauts). **À garder jusqu'à ce que l'école confirme** ses 11 écritures de caisse et ses
60 dépenses.

**Ce que la correction ne fait pas.** Les 60 dépenses de reprise n'ont **aucune
imputation** (`budget_chapter_id` NULL) et pendent à un budget hors hiérarchie
(`tier` NULL, année 2025-2026) : l'écran **Dépenses**, qui filtre par ligne active de
l'annuel courant, ne peut pas les montrer — activer une ligne n'y change rien. Elles
s'affichent dans **Caisse**. Un bandeau les annonce désormais dans Dépenses
(`src/pages/Expenses.jsx`), à partir du paquet 0.3.24.
