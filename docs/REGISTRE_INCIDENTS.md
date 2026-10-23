# Registre des incidents — NotesCam

> Les pannes réellement rencontrées en école, et ce qui empêche désormais leur retour.
> Une entrée n'est **close** que si un test ou un garde-fou interdit la récidive : sinon
> elle reste **ouverte**, même si le symptôme a disparu.
>
> Entrées reconstituées le 2026-10-18 depuis l'historique Git et les en-têtes de tests de
> non-régression, qui documentent chacun l'incident qui les a fait naître.

Format : `I<n>` · date · symptôme vu par l'école · cause réelle · parade · garde-fou.

---

## I1 — Des notes présentes en base n'apparaissent pas dans l'application

**Date** : 2026-10-18 · **Statut** : **ouvert** (cause probable, non confirmée par l'école)
**École** : BRIGHT CONTINENT BILINGUAL SCHOOL

**Symptôme.** 118 notes écrites en base ne sont pas visibles sur `/app/grades`.

**Ce qui a été écarté par la mesure.** La base contient bien les 118 notes en séquence 1 ;
l'administrateur de l'école les lit toutes avec les politiques RLS appliquées (requête
exécutée sous son identité) ; le site de production pointe bien vers
`ltxopwoxvgslsgzixbpx`. Ce n'est donc ni une perte de données, ni un droit manquant, ni
une erreur de base.

**Causes probables, par ordre de vraisemblance.**
1. L'application peint d'abord le cache IndexedDB puis rafraîchit depuis Supabase : un
   onglet déjà ouvert ignore une écriture faite **hors application**. Un rechargement
   forcé est nécessaire.
2. L'école est en `grade_entry_mode = 'subject'` : l'écran n'affiche qu'une matière à la
   fois, et l'onglet par défaut est le premier par ordre alphabétique — « Anglais » en
   6ème, qui n'a aucune note.
3. Le sélecteur de classe reste vide tant qu'aucune section n'est choisie, l'école ayant
   plusieurs sections. Les quatre classes concernées sont en « Premier cycle ».

**Leçon de fond.** Écrire en base sans passer par l'application contourne la file de
synchronisation et les caches : à éviter hors import outillé.

**Garde-fou** : aucun. Entrée à clore quand l'école confirme, ou quand la cause est isolée.

---

## I2 — Une seule entrée refusée bloquait toute la file de poussée

**Date** : vers 2026-10-17 · **Statut** : clos · **Source** : commits `f1de1e0`, `60e8e60`

**Symptôme.** Plus rien ne remontait au Cloud depuis l'école.

**Cause.** Une entrée refusée restait en tête de file et la réparation ne tournait jamais.

**Parade.** Un verdict par ligne, plus un refus global (`36ebb1c`, branche
`fix/sync-contract`, non fusionnée).

**Garde-fou** : `server/_push_refus.test.mjs`, `server/_sync_repair.test.mjs`.

---

## I3 — Les lignes à `updated_at` NULL ne montaient jamais au Cloud

**Date** : vers 2026-10-16 · **Statut** : clos · **Source** : commit `9b22e57`

**Symptôme.** Des données saisies à l'école restaient indéfiniment absentes du Cloud, sans
erreur visible.

**Cause.** Le curseur de poussée comparait des `updated_at` ; une ligne à NULL n'était
jamais sélectionnée.

**Garde-fou** : `server/_sync_contract.test.mjs`, qui fait échouer le test pour tout écart
non inscrit dans `docs/SUIVI_CONTRAT_SYNCHRO.md`.

---

## I4 — Un retour arrière de version bloquait l'application

**Date** : vers 2026-10-17 · **Statut** : clos · **Source** : commit `a3733ad`

**Symptôme.** Après installation d'une version plus ancienne, l'application ne démarrait
plus à l'école.

**Garde-fou** : test de non-régression côté serveur ; à confirmer lequel.

---

## I5 — Des notes du vendredi disparaissaient avant d'avoir été transmises

**Date** : antérieure à 2026-07 · **Statut** : clos
**Source** : en-tête de `src/lib/_syncDurability.test.mjs`

**Symptôme.** Des enseignants saisissaient des notes le vendredi sur le poste local ;
elles avaient disparu le lundi.

**Cause.** `pruneExpiredItems()` supprimait tout élément de file de plus de 48 heures, et
il était appelé au démarrage **avant** la première tentative de transmission.

**Garde-fou** : `src/lib/_syncDurability.test.mjs` et `src/lib/_syncRestart.test.mjs`
(à lancer avec le loader `_syncBatch.hooks.mjs`, que `npm test` applique désormais seul).

---

## I6 — « Le lieu de naissance ne se récupère pas » (THE GENIUS)

**Date** : 2026-09-10 · **Statut** : clos
**Source** : en-tête de `src/lib/_importStudents.test.mjs`

**Symptôme.** Plainte de l'école : le lieu de naissance ne serait pas importé.

**Cause réelle.** Le lieu était bien importé. C'était la **date** qui se trompait de
colonne : la recherche d'en-tête tentait une correspondance exacte puis approximative, et
« naissance » figurait parmi les candidats de la date.

**Leçon.** Une plainte d'école désigne rarement le bon champ : mesurer avant de corriger.

**Garde-fou** : `src/lib/_importStudents.test.mjs` — **actuellement en échec**, voir
`PROJECT_STATUS.md` B2. Ce garde-fou est donc **inopérant** tant que B2 n'est pas traité.

---

## I7 — Un même frais compté deux fois, et des boutons invisibles au guichet

**Date** : vers 2026-10-13 · **Statut** : clos · **Source** : commit `8920fdd`

**Symptôme.** Au guichet, un frais apparaissait deux fois dans le dû de l'élève, et des
actions n'étaient pas cliquables.

**Garde-fou** : tests de frais dans `src/lib/`; à préciser.

---

## I8 — « Six fois qu'on me dit que c'est réglé » : l'installeur passé, le serveur jamais relancé

**Date** : 2026-10-18 · **Statut** : clos · **Source** : constat sur le poste d'édition

**Symptôme.** Après installation de la 0.3.16, « Modifier les compétences » et
« Mon profil » refusaient toujours d'enregistrer. Le barème, lui, passait. Sur une
seconde machine, le barème ne passait pas non plus.

**Cause réelle.** Les fichiers de `C:\Program Files\NotesCam` étaient bien en 0.3.16,
mais le processus `node.exe` qui servait le port 8080 avait démarré **la veille** et
annonçait encore `0.3.4`. Or `server/db.js` pose les tables et colonnes neuves **au
démarrage** : tant que le service n'a pas redémarré, la base reste à l'ancien schéma et
les écrans refusent exactement comme avant. Le journal du serveur le disait en clair :
`[schema] colonne inconnue ignorée: prim_competences.school_id`.

Le **barème passait** parce que sa clé d'unicité (`prim_notes`) avait été posée par une
version antérieure, déjà redémarrée. C'est ce décalage entre les trois écrans qui a
rendu le diagnostic évident — et c'est pourquoi il faut croire ce que l'école décrit :
« l'un marche, les deux autres non » était l'indice.

**Ce qui a fait perdre le plus de temps.** Toutes les vérifications portaient sur une
base **neuve**, jamais sur la base **installée**. Une base neuve ne peut pas reproduire
un défaut de migration, et elle ne dit rien du processus réellement en mémoire.

**Leçon.** « Installé » ne veut pas dire « appliqué ». Avant de déclarer un correctif en
place, comparer **trois** choses, jamais une seule : la version des fichiers, la version
que le serveur **annonce**, et ce que la **base** porte réellement.

**Garde-fou** :
- `packaging/REDEMARRER-APRES-MAJ.cmd` + `packaging/sauvegarder-et-redemarrer.mjs` —
  arrêt, sauvegarde vérifiée, redémarrage, contrôle. Livrés par l'installeur et présents
  dans le menu Démarrer (« Appliquer la mise à jour »).
- `packaging/verifier-correctifs.mjs` — lit la base, en lecture seule, et dit correctif
  par correctif ce qui est posé. Affiche la version du serveur **en marche**, pas celle
  des fichiers.
- Côté Linux, `packaging/linux/deploy-0.3.16.sh` fait déjà la séquence complète : le
  défaut était propre au vecteur Windows, où l'installeur ne redémarre pas le service.

---

## I9 — « student_fees · upsert : duplicate key » — le dû saisi au guichet n'arrivait jamais (THE GENIUS)

**Date** : 2026-10-19 · **Statut** : corrigé dans le code, **non déployé** · **Source** :
message de l'école, bandeau de synchronisation du navigateur

**Symptôme**, tel que l'école le lit à l'écran (`src/components/Layout.jsx:171`) :

```
student_fees · upsert
duplicate key value violates unique constraint "student_fees_student_id_academic_year_key"
```

**Cause établie, pas supposée.** `student_fees` porte `UNIQUE(student_id, academic_year)`
des deux côtés — vérifié dans `pg_constraint` de la base de production
(`student_fees_student_id_academic_year_key UNIQUE (student_id, academic_year)`), et dans
`server/schema.sql` pour le LAN. Or **tout le chemin d'écriture upsertait sur `id`**
(`schoolService.upsertFee`, `sync.js`, `dataImport.js`, `sync-push`). Et `saveFee`
(`src/store/schoolStore.js`) fabrique un `uuid()` neuf dès que la fiche n'est pas dans le
cache local : autre poste, autre navigateur, cache vidé, lecture restreinte par secteur
(`fee_scope_allows_student`, policy `FOR ALL` sur la table), ou année active changée sans
rechargement. L'INSERT heurtait alors la ligne que le Cloud détient déjà **sous un autre
id** : refus `23505`, élément **bloqué dans la file du navigateur**, rejoué à chaque
cycle, puis mis en quarantaine après 25 refus. Le montant dû saisi par la caisse
n'arrivait jamais, et personne ne pouvait le débloquer depuis l'application.

**Ce qui n'a PAS été constaté** (lectures seules sur la base de production, école
`6b68407b-3d2e-426b-81ff-c4e68e66120a`) : aucun versement orphelin. Les 891 versements
de THE GENIUS ont tous leur fiche de frais, et les 693 fiches de l'année `2026-2027`
sont cohérentes (133 980 000 F dus, 84 274 000 F encaissés). **Le blocage était dans la
file du poste, pas dans les données du Cloud** — aucune donnée financière à réparer.

**Correctif** : l'identité d'une fiche de frais est `(élève, année)`, jamais son `id`.
`upsertFee` écrit désormais **dans** la ligne existante quand le Cloud la détient sous un
autre id, et l'appelant réaligne son cache local (`adopterIdFraisDistant`). `sync.js`
fait le même rattrapage pour les éléments **déjà bloqués** : la file se résorbe d'elle-même
au prochain cycle, sans intervention sur le poste. Voir décision **D10**.

**Deuxième défaut, trouvé en préparant le paquet Windows et corrigé** : la détection du
doublon ne reconnaissait que le libellé **Postgres** (`23505`,
`student_fees_student_id_academic_year_key`). En LAN la base est SQLite et parle par
`localClient` : pas de code, et une autre phrase — `UNIQUE constraint failed:
student_fees.student_id, student_fees.academic_year`. Le rattrapage était donc **inerte
sur les postes d'école**, là où le guichet travaille hors ligne et où il sert le plus.
`estDoublonFrais` (exporté, partagé par `upsertFee` et `src/lib/sync.js`) reconnaît
désormais les deux formulations, et refuse toujours les doublons d'une AUTRE table
(`students.parent_token`).

**Garde-fou** : `src/lib/_feeUpsertConflit.test.mjs` — 21 contrôles, dont celui qui
compte vraiment : le cache de paiement du Cloud (50 000 F encaissés) n'est **pas** écrasé
par le 0 d'une fiche qui n'a jamais vu cette ligne.

**Reste ouvert, même famille, non corrigé** : le chemin LAN↔Cloud a le défaut symétrique.
`sync-push` (`supabase/functions/sync-push/index.ts:125`) et le pull LAN
(`rawUpsert`, `server/cloudSync.js:120`) travaillent aussi `ON CONFLICT(id)` : une fiche
de frais dont l'id diverge entre les deux bases ne peut ni monter ni descendre, et reste
en file de rejeu. Inerte aujourd'hui pour THE GENIUS (la synchro Cloud du LAN exige un
jeton scellé **et** le mode hybride), à traiter **avant** d'activer la synchro hybride
dans une école.

---

## I10 — Une matière apparaissait deux fois dans la classe, et comptait deux fois

**Date** : relevé le 2026-10-21, corrigé le 2026-10-22 · **Statut** : **données corrigées
en production**, parade dans le code (non commitée) · **Source** : audit des 44 écoles,
puis constat à l'écran de l'école

**Symptôme.** Deux lignes « SVT », deux lignes « Home Economics », deux lignes
« Language and communication » dans la même classe. L'enseignante saisissait sur l'une
ou l'autre selon ce que son écran lui montrait ce jour-là. Sur le bulletin, la matière
sortait **deux fois**, donc son coefficient comptait deux fois dans la moyenne générale.

**Ampleur, mesurée et non estimée.** 33 couples (classe, matière) en double,
**34 lignes en trop**, dans 4 écoles : goudja 15, THE GENIUS 10, BRIGHT CONTINENT 8
(toute la Nursery 2), Collège La retraite 1. Un cas à **trois** copies (5eme de
THE GENIUS, « Histoire »).

**Cause.** L'auto-configuration d'une classe se gardait du doublon en regardant
`get().subjects` — le **cache du poste**. Un poste qui n'avait pas encore descendu les
matières (serveur LAN après remise à zéro du curseur, navigateur vidé, second appareil)
voyait une classe vide, la reconfigurait, et tirait de **nouveaux identifiants au
hasard**. La base accueillait une seconde série complète.

**Ce qui aggravait.** Une seule saisie écrivait sur les DEUX copies : les 10 notes de SVT
en 5eme portaient la même valeur, pour le même élève, à la **même seconde**, sur les deux
identifiants. Le doublon ne se voyait donc pas à la saisie — seulement sur le bulletin.

**Parade dans le produit.** L'identifiant d'une matière de classe est dérivé de
`(classe, nom normalisé)` : deux postes qui configurent la même classe écrivent les
**mêmes** lignes, l'upsert les met à jour au lieu d'en ajouter une série. Verrouillé par
`src/core/_idMatiereDeterministe.test.mjs`, qui refuse tout `makeId()` nu dans les sept
constructeurs de matières. **Cette parade n'empêche pas les doublons déjà posés** — d'où
la correction de données.

**Correction des données, appliquée le 2026-10-22 après autorisation explicite.**
`scripts/audit-matieres-doublons.mjs` (lecture seule) a choisi la ligne à garder, généré
le SQL et son retour arrière. Vérifié **avant** : aucune note en conflit de valeur, 10
notes strictement identiques à retirer, 0 à déplacer. Vérifié **après** : 0 couple en
double, 0 note orpheline, SVT a gardé ses 10 notes, Home Economics ses 41, et
« Expression Écrite » a retrouvé le rang 3 que portait sa copie. 34 `sync_tombstones`
écrits (plus 10 pour les notes) : **les écoles en LAN retireront la ligne d'elles-mêmes**
au prochain cycle. Sans ces pierres tombales, l'école aurait gardé son doublon et l'aurait
repoussé au Cloud.

**Reste à l'école** : sept coefficients divergeaient entre les deux copies
(`docs/corrections/2026-10-22-coefficients-a-trancher.sql`). Changer un coefficient change
une moyenne : la décision ne nous appartient pas.

**Défaut voisin, trouvé au passage et corrigé.** Six rangs de la 5eme de THE GENIUS
étaient portés par deux matières à la fois. À rangs égaux, le comparateur du produit
rendait `0` ; `Array.sort` étant stable, l'ordre retombait sur celui de la **liste reçue**,
qui n'est pas la même d'un écran à l'autre — deux matières pouvaient donc s'échanger entre
le bulletin et la grille de saisie. C'est exactement ce que la décision **D11** avait
fermé, revenu par la porte des ex æquo. Le départage continue désormais sur le
coefficient, le nom, puis l'identifiant (`src/core/subjectOrder.js`).

---

## I11 — « Quand il entre les notes d'une matière, les autres héritent automatiquement »

**Date** : 2026-10-22 · **Statut** : **cause corrigée dans le code (NON LIVRÉ)**, données
corrigées en production · **Source** : signalement du responsable, confirmé en base

**Symptôme**, en deux formulations du même défaut : « un enseignant avec plusieurs
matières, quand il entre les notes d'une matière les autres matières héritent
automatiquement », et « des matières qui se dupliquent en mettant les notes et le
bulletin ».

**Ce n'était PAS un doublon de lignes.** L'audit du matin avait ramené les matières en
double à **0**, et elles ne sont pas revenues (revérifié). Le défaut est d'une autre
nature : **deux matières de noms DIFFÉRENTS que le produit prenait pour la même**.

**Cause, établie et mesurée.** `apcMatiereMatch.matiereIdsForSubject` rapproche une
matière locale des matières du référentiel par le texte du nom, via une table d'alias
dont les cibles sont ordonnées — la langue de la matière d'abord, sa traduction ensuite.
La boucle ajoutait **toutes** les cibles disponibles. Or une classe **bilingue** porte
les deux identifiants au catalogue : `francais` ET `french`.

FORM1 de THE GENIUS porte « Français intensif » (coef 5) et « French Language » (coef 4),
tenues par le **même** enseignant. Les deux rendaient donc `{ francais, french }` — les
mêmes deux matières. L'écran de saisie, organisé par matière du référentiel, ouvrait une
colonne pour chacune, toutes deux rattachées aux deux matières locales : une note saisie
d'un côté se retrouvait de l'autre, et le bulletin imprimait la matière deux fois.

**La preuve, en base, avant toute écriture** : les 41 notes de « French Language » étaient
élève par élève **identiques** à celles de « Français intensif » (41 avec jumelle exacte,
**0** sans), écrites à **80 ms** d'écart, pour les 41 élèves. Et ce n'était pas un hasard
de notation : sur les 44 écoles, parmi tous les couples de matières d'un même enseignant
dans une même classe, **ce couple est le SEUL** à 100 % de recouvrement — les autres
plafonnent à 7-9 notes identiques sur 100+, par coïncidence.

**Correctif.** Les identifiants qui désignent la même matière dans les deux langues sont
déclarés en **groupes de traduction** (`francais`/`french`, `anglais`/`english`,
`mathematiques`/`mathematics`, `ecm`/`citizenship`, `svteehb`/`biology`,
`eps`/`physical_education`, `informatique`/`computer_science`, …). Un alias ne rend plus
qu'**un** identifiant par groupe : le premier disponible dans son ordre.

**Ce que le correctif ne casse pas**, et c'était le risque : « Histoire-Géo » est UNE
ligne locale qui couvre VRAIMENT DEUX matières. Ses cibles relèvent de deux groupes
distincts, donc elle en garde deux — vérifié en francophone, en anglophone et en
bilingue. Le repli par traduction tient aussi : une école francophone qui écrit « French
Language » continue de saisir sur `francais`.

**Limite assumée et écrite dans le code** : `pct` (une matière francophone) correspond à
`physics` + `chemistry` (deux anglophones). Ce n'est pas une traduction terme à terme,
donc pas un groupe : un catalogue portant les trois les listerait toutes. Aucune classe de
production n'est dans ce cas, et les grouper ferait perdre Chemistry aux classes
anglophones — plus grave que la limite.

**Données corrigées** (autorisation explicite) : les 41 notes copiées de « French
Language » supprimées, « Français intensif » intacte avec ses 41, la **ligne matière**
conservée (si l'école l'enseigne vraiment, elle a sa place — elle repart sans note). 41
`sync_tombstones` écrits à 11:32 : le serveur LAN de l'école suivra. Retour arrière
vérifié **avant** suppression — les 41 paires (identifiant, élève) confirmées en base et
41 lignes reconstituables. Ce que cela corrige : la moyenne de FORM1, où la note comptait
deux fois, sur 9 points de coefficient au lieu de 5.

**⚠️ CE QUI RESTE OUVERT, et c'est l'essentiel.** Le correctif de code **n'est ni en
ligne ni livré en école**. Le `git push` a été refusé par le garde-fou de la session, et
aucun canal de mise à jour automatique n'existe pour les écoles (voir
`vecteurs-de-livraison-par-ecole`). Tant que le code n'est pas déployé, **le nettoyage se
refera à la prochaine saisie** : l'école reverra la matière en double. Nettoyer sans
livrer ne tient pas.

**Défaut voisin, trouvé et corrigé au passage.** `GradeImportPanel` écrivait les cellules
VIDES : `validateGrade('')` rend `''` et non `null`, et le test ne filtrait que `null`.
Une valeur comme « - » dans un classeur passait donc en écriture et **effaçait** la note
existante. `scBulletinSheet` s'en gardait déjà explicitement (« Cellule vide : on ne
touche à rien ») ; ce panneau-ci ne le faisait pas, pour le même classeur et le même
geste. Les deux importeurs appliquent maintenant la même règle.

### I11 bis — Le cas VOISIN que les groupes de traduction ne couvrent pas

Une matière **fusionnée** qui coexiste avec ses **parties** produit le même symptôme, par
un autre chemin : « Histoire-Géographie » rend `{ histoire, geographie }` — c'est VOULU,
une ligne locale peut couvrir deux matières — mais si la classe porte AUSSI « Histoire »
et « Géographie » séparément, les trois se recouvrent.

**Relevé en production le 2026-10-22** :

| École | Classe | Matières qui se recouvrent |
|---|---|---|
| BRIGHT CONTINENT | 6ème | `Histoire-Géographie` (0 note) + `Histoire` (4) + `Géographie` (4) |
| THE GENIUS | CE1, CE1 BIL, CE2, CE2 BIL | `Histoire-Géographie` + `Histoire` + `Géographie` |
| goudja | Form 1 A | `History/Geography` (36) + `History` (0) + `Geography` (0) ; `Chemistry/Physics` (36) + `Chemistry` (0) + `Physics` (0) |

**Pourquoi ce n'est pas corrigé dans le code.** Ce n'est pas une ambiguïté de langue mais
un **choix pédagogique** : l'école enseigne-t-elle une Histoire-Géo unique, ou deux
matières distinctes ? Les deux sont légitimes, et le produit ne peut pas trancher. Dans
chaque cas relevé, l'une des deux formes porte **zéro note** — le ménage est donc sans
risque, mais il appartient à l'école.

**À lui demander** : garder la forme fusionnée, ou les deux séparées — et retirer l'autre
dans « Modifier la classe → Matières ».

---

## I12 — La note d'une matière s'écrivait dans la matière suivante

**Date** : 2026-10-22 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : signalement du responsable, **capture d'écran**, après DEUX corrections livrées
qui visaient autre chose

### Ce que la capture prouve, et que deux jours d'hypothèses n'avaient pas trouvé

Même classe, même élève (ABENA Boris, ELV-2025-0029), deux écrans :

| Matière affichée | Champ de l'élève | Statistique du panneau |
|---|---|---|
| Mathématiques | **20** | Moy. : **20**/20 |
| Informatique fondamentale et TIC | **20** | Moy. : **12**/20 |

La deuxième ligne est le défaut tout entier. La note **enregistrée** valait 12 ; le champ
affichait **20**, la valeur saisie juste avant dans Mathématiques. Ce n'était donc **pas**
un doublon de matières, **pas** un défaut d'appariement avec le référentiel, et **pas** un
problème de synchronisation — les trois pistes suivies jusque-là.

### La cause, en deux temps

**1. Le champ ne se réinitialisait pas.** Le champ de note est **non contrôlé** —
`defaultValue={displayGrade(val)}` — et `defaultValue` ne s'applique qu'au **montage** du
composant. Les lignes étaient keyées sur le seul identifiant d'**élève** :

~~~jsx
<tr key={s.id}>            // ← le défaut
~~~

En changeant de matière, React retrouve les mêmes clés pour les mêmes élèves, **réutilise
les mêmes `<input>` du DOM**, et ne réapplique jamais `defaultValue`. La valeur de la
matière précédente restait affichée.

**2. Et elle s'enregistrait.** C'est ce qui fait la gravité. `commit()` écrit dès que la
valeur du champ diffère de la note stockée — comportement voulu, c'est lui qui permet la
sauvegarde automatique :

~~~js
if (v !== (scoresFor(student.id) ?? '')) { onCommit(student.id, v); … }
~~~

20 ≠ 12 : au premier `blur`, c'est-à-dire **au premier clic n'importe où sur l'écran**, la
note de Mathématiques était écrite dans Informatique. « Un enseignant avec plusieurs
matières : quand il entre les notes d'une matière, les autres héritent automatiquement »
— mot pour mot le signalement du matin.

### Les DEUX panneaux étaient touchés

Ils ont été écrits séparément et portaient le même défaut, donc ils reçoivent la même
parade :

| Panneau | Fichier |
|---|---|
| « Tableau » | `src/components/grades/GradeGrid.jsx` |
| « Saisie rapide » | `src/pages/Grades.jsx` (`FastGradeEntry`) |

Les autres écrans de saisie sont **indemnes**, et vérifié : l'écran APC keye ses cellules
par **compétence**, donc changer de matière change les clés et remonte les champs ; aucun
autre champ de note du produit n'utilise `defaultValue`.

### La correction

Deux gestes par panneau. L'identifiant de la **matière** entre dans la clé de ligne —
React démonte alors les anciens champs et en monte des neufs, qui reçoivent la bonne
valeur. Et l'état par élève (erreurs, point « non enregistré », ✓ « enregistré ») est remis
à zéro, puisqu'il parlait de l'autre matière.

~~~jsx
const cleMatiere = subject?.id ?? subject?.name ?? '';
…
<tr key={`${cleMatiere}:${s.id}`}>
~~~

**Preuve** : `src/components/grades/_saisieChangeDeMatiere.test.mjs`, **21 contrôles**.
Le test a été passé sur le code d'AVANT la correction : **8 échecs**. Sur le code
corrigé : **0**. Il verrouille l'invariant qui rend le défaut impossible — *tant que le
champ est non contrôlé, la clé de ligne doit porter la matière* — et il le dit au lieu
d'échouer bêtement si quelqu'un passe un jour le champ en contrôlé.

### Ce que cet incident apprend sur la méthode

Trois corrections ont été livrées en deux jours sur « les matières se dupliquent / les
notes se recopient » : les doublons de `subjects` (I10), les paires de traduction (I11),
puis celle-ci. Les deux premières corrigeaient des défauts **réels et mesurés**, mais
aucune ne touchait ce que le responsable voyait. Ce qui a débloqué le diagnostic en une
minute, c'est **une capture d'écran avec un chiffre contradictoire** : « champ 20,
moyenne 12 ». Aucun audit de base ne pouvait montrer cela — la base était correcte, c'est
l'écran qui mentait.

**À faire plus tôt la prochaine fois** : demander ce que l'écran AFFICHE, avant d'auditer
ce que la base CONTIENT.

### Trouvé en chemin, et NON corrigé — les doublons du RÉFÉRENTIEL

L'enquête a mis au jour un défaut distinct, mesuré le 2026-10-22 chez **BRIGHT CONTINENT**
(classe de référentiel `3e`) : `apc_matieres` porte **14 lignes maison pour 5 matières
réelles**.

| Nom | Copies | Notes |
|---|---|---|
| `Langue Turc` | 3 | 6 + 6 + 0 |
| `Expression Orale` | 3 | 0 |
| `Etude de texte` | 3 | 3 + 0 + 0 |
| `Expresion ecrite` | 3 | 1 + 0 + 0 |
| `Chimie` | 2 | 0 |

Ce sont exactement les deux noms que le responsable avait cités (« Langue Turc »,
« Expression Orale ») : trois exemplaires de chacun à la saisie et sur le bulletin. La
cause est l'identifiant tiré au hasard par `addMatiereMaisonApc`, **déjà corrigé** depuis
`4e5011e` (identifiant déterministe — les seules lignes récentes s'appellent
`ec_a8b8fb007184_…`). Seul l'héritage reste.

Le ménage a été **APPLIQUÉ le 2026-10-22**, sur autorisation explicite du responsable, par
`docs/corrections/2026-10-22-apc-matieres-referentiel-doublons.sql` — garde-fou d'état,
preuve que chaque note supprimée avait sa jumelle exacte, sauvegarde en base et contrôle
après coup dans la même transaction.

**Constaté après coup, en lecture seule** :

| Contrôle | Avant | Après |
|---|---|---|
| Groupes de matières maison en double | 5 | **0** |
| Matières maison de BRIGHT CONTINENT | 20 | **11** |
| Notes de `Langue Turc` (gardée) | 6 | **6** |
| Notes de `Etude de texte` (gardée) | 3 | **3** |
| Notes de `Expresion ecrite` (gardée) | 1 | **1** |

Aucune note des matières gardées n'a bougé ; les 6 jumelles supprimées sont dans
`zz_sauv_apc_doublons_20261022_notes` avec les 9 matières et 27 compétences. **Ces quatre
tables de sauvegarde ne doivent être supprimées qu'après validation par l'école** — le
retour arrière les relit telles quelles.

⚠ **Limite relevée** : il n'existe **aucun déclencheur de pierre tombale** sur
`apc_matieres`, `apc_competences` ni `apc_notes`. Une suppression dans le Cloud ne se
propagerait donc **pas** à un serveur d'école en réseau local. BRIGHT CONTINENT travaille
dans le navigateur, la correction la concerne entièrement ; pour une école LAN, il
faudrait d'abord poser ces déclencheurs.

---

## I13 — Une table synchronisée qui naît vide et ne se remplit jamais

**Date** : 2026-10-22 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : trouvé en préparant le paquet Linux de THE GENIUS, **avant** l'envoi

### Ce qui allait être livré

La 0.3.21 crée **cinq tables** que la 0.3.19 — la version installée chez THE GENIUS —
n'avait pas : `cash_movements`, `referentiel_libelles` et les trois `*_masques`. L'une
d'elles, `cash_movements` (le journal de caisse), est **synchronisée avec le Cloud**.

`sync-pull` est un keyset strictement supérieur au curseur `pull_at` : **une ligne déjà
dépassée n'est plus jamais renvoyée.** Le serveur savait remettre ce curseur à zéro quand
une **colonne** apparaissait sur une table synchronisée — c'est la parade posée après
l'incident `sector` du 27/08/2026. Il ne le faisait **pas** quand c'était une **table
entière**.

**Mesuré avant d'envoyer quoi que ce soit** : le Cloud de THE GENIUS porte **11 écritures
de caisse, toutes datées du 2026-10-18** — quatre jours avant le paquet. Leur curseur est
donc largement passé devant.

Conséquence si le paquet partait tel quel : l'école installe, ouvre son journal de caisse,
et le trouve **vide — définitivement**, puisque plus rien ne redescend. Les écritures sont
au Cloud, intactes, et invisibles. Et le réflexe naturel de l'école serait de **tout
ressaisir**, ce qui aurait créé onze doublons à la remontée.

**Une colonne neuve perd un champ ; une table neuve perd tout son contenu.** C'est la
même cause, un cran plus haut, et elle avait été manquée.

### La correction

`server/db.js` relève désormais les tables **réellement créées** pendant le démarrage
(photo de `sqlite_master` avant et après `schema.sql`) et applique la même règle qu'aux
colonnes : si l'une d'elles est synchronisée, le curseur de descente est remis à zéro.

Le cas de la base **neuve** est écarté en amont — tout y est créé d'un coup, il n'y a
aucun curseur à invalider. Mesuré au passage, et ce n'était pas ce que je croyais : une
installation neuve annonçait **déjà** une remise à zéro, parce que `schema.sql` ne porte
pas toutes les colonnes (79 sont posées par les migrations légères). C'est inoffensif — il
n'y a rien à invalider — mais le test le dit explicitement plutôt que de figer une
croyance fausse.

**Preuve** : `server/_pull_cursor_table_neuve.test.mjs`, **9 contrôles**. Il fabrique la
situation exacte d'une école — base complète, curseur posé à une date avancée, table
retirée — démarre le serveur dessus et vérifie que le curseur tombe. Il vérifie aussi que
le journal **nomme** la table responsable (`cash_movements (table entière)`) : sans cela,
un dépanneur ne peut pas expliquer à l'école pourquoi la synchronisation a travaillé des
heures. Et il verrouille la non-régression qui compte : un démarrage **sans** table ni
colonne neuve laisse le curseur **intact**, sinon chaque redémarrage du serveur relirait
toute la base.

### Ce que cet incident apprend

Le défaut n'a pas été trouvé par un test ni par un audit, mais en se demandant **ce que la
mise à jour allait trouver sur le serveur de l'école** — et non ce qu'elle contient. La
question « cette table existe-t-elle déjà là-bas ? » n'a pas de réponse dans le dépôt.

**À refaire à chaque paquet** : comparer le schéma livré à celui de la version réellement
installée dans l'école (`git show <commit du paquet précédent>:server/schema.sql`), et pour
chaque table ou colonne neuve **sur une table synchronisée**, vérifier ce que le Cloud
porte déjà. Ici, une requête de comptage a suffi à transformer une hypothèse en fait.

---

## I14 — Sans `dist/`, le serveur ne servait plus aucun fichier (CI rouge 3 jours)

**Date** : 2026-10-22 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : la CI de `main`, en échec à **chaque** exécution depuis le 2026-10-20

### Ce que j'ai cru, et ce que c'était

La CI échouait à l'étape `npm test` en ~28 secondes. J'en ai déduit une **défaillance de
masse** propre à l'environnement — une dépendance absente, un fichier gitignoré, une
version de Node — et j'ai cherché de ce côté sans rien trouver : le verrou de dépendances
est cohérent, `npm ci` passe, aucun test ne lit un fichier ignoré par git.

**J'avais tort sur toute la ligne.** Le journal du job, fourni par le responsable, montre
**un seul test en échec** : `server/_file_access.test.mjs`, **25 réussis / 6 échoués**,
les six en **404**.

### La cause

`server/index.js` enregistre `fastifyStatic` sur `/files/` dans **deux** des **trois**
branches de démarrage :

| Branche | `/files/` servi ? |
|---|---|
| `DIST_BLOCKED` (mauvaise édition livrée) | oui |
| `existsSync(DIST_DIR)` (cas normal) | oui |
| **`else` — `dist/` absent** | **NON** |

Le commentaire juste au-dessus explique qu'un crochet `onRequest` global a été préféré à
trois `preHandler`, précisément pour qu'on ne puisse pas oublier la protection « dans
l'une des trois ». La **protection** était bien globale ; c'est l'**enregistrement** qui
manquait. Résultat : le contrôle d'accès s'appliquait, autorisait la requête… et plus rien
ne servait le fichier. 404.

Et la CI exécute `npm test` **avant** `npm run build` — volontairement, « du moins cher au
plus cher ». Donc `dist/` n'existe pas encore quand ce test démarre un vrai serveur. En
local il existe toujours, parce qu'on vient de construire. **Le test passait partout sauf
là où personne ne regardait.**

### La preuve, dans les deux sens

Reproduit en local en renommant `dist/` : **25 réussis, 6 échoués** — les chiffres exacts
de la CI. Correction appliquée, même conditions : **31 réussis, 0 échoué**. Puis la suite
**complète** relancée sans `dist/`, c'est-à-dire dans l'état exact de la CI.

### Ce n'était pas qu'un défaut de test

Un serveur d'école dont la SPA n'est pas compilée — mauvaise édition livrée, build
interrompu, `npm run build:lan` oublié — refusait aussi **les photos d'élèves** à tout
appel, alors que l'API répondait normalement. Le défaut était réel ; seule la CI le
rencontrait assez souvent pour le dire.

### Ce que cet incident apprend

Pour la **troisième** fois dans la même journée, le diagnostic est venu d'un **chiffre
affiché**, pas d'un raisonnement : « champ 20 / moyenne 12 » pour I12, « 11 écritures de
caisse au 18/10 » pour I13, « 25 réussis / 6 échoués » ici. Et deux fois sur trois, mon
hypothèse de départ était fausse et coûtait du temps.

**À faire d'abord** : réclamer la SORTIE BRUTE — journal, capture, requête de comptage —
avant de théoriser. Un échec « en 28 secondes » ne prouve rien sur sa nature ; j'en ai
déduit une défaillance de masse là où il y avait un test unique.

⚠ **Non traité, et à surveiller** : `.github/workflows/ci.yml` annonce « Tests colocalisés
(176) » alors qu'il y en a **193**. Le nombre n'a aucun effet sur l'exécution, mais une
étiquette fausse finit par être crue. *(Corrigé dans le même commit.)*

---

## I15 — Une suppression en base que l'écran n'apprend jamais

**Date** : 2026-10-22 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : signalement du responsable, **deux captures d'écran du même moment**

### Les deux écrans qui se contredisent

| Écran | Ce qu'il montrait |
|---|---|
| « Modifier la classe → Matières » | chaque matière **une fois**, avec son enseignant |
| Menu des matières, à la saisie | `Langue Turc` ×3, `Etude de texte` ×3, `Expresion ecrite` ×2, `Expression Orale` ×2 |

Et la base, elle, n'en portait **plus aucune en double** : les neuf lignes fautives avaient
été supprimées en production le matin même (**I11 ter**). Les deux écrans ne lisent pas la
même chose — le premier lit les **matières de la classe**, le second lit le
**référentiel**. Le défaut était donc entièrement du côté du référentiel, et pas en base.

### Deux défauts cumulés, et le code documentait l'hypothèse devenue fausse

**1. L'empreinte ne voyait pas les lignes de l'école.** Le référentiel APC n'est
retéléchargé que si son empreinte change, et cette empreinte était **l'id de la version
nationale active**. `referentielFingerprint.js` justifiait ce choix en toutes lettres : les
référentiels nationaux sont « globaux, en lecture seule, et identiques pour toutes les
écoles ». **Cette phrase a cessé d'être vraie en 0.3.19**, quand l'école a pu créer ses
propres matières de premier cycle (`apc_matieres.school_id`).

Conséquence : supprimer neuf lignes maison ne déplaçait pas l'empreinte. **Aucun
navigateur ne pouvait apprendre la suppression, jamais** — ni par rechargement, ni par
Ctrl+Shift+R, qui ne vide pas IndexedDB. La correction en base était réelle et invisible.

Pire, le code le disait sans le voir : `rechargerApcReferentiel` commentait « l'empreinte
est conservée : seules NOS lignes ont bougé, la version nationale est la même ». C'était
exactement le défaut, écrit comme une justification.

**2. Le cache mélangeait les écoles.** La RLS de `apc_matieres` est juste —
`school_id IS NULL OR member_of_school(school_id)` — mais un responsable membre de
**plusieurs** écoles les reçoit **toutes**, et le cache n'avait qu'une seule clé,
`'referentiel'`. En passant d'une école à l'autre, on voyait les matières maison de la
précédente. C'est pourquoi « Langue Turc » s'affichait chez THE GENIUS, qui n'en a aucune.

### La correction

| | Avant | Après |
|---|---|---|
| Empreinte APC | id de la version nationale | version **+ comptes des lignes maison de l'école** |
| Téléchargement | toutes les écoles dont on est membre | **filtré sur l'école active** (`apc_matieres`, `apc_classe_matieres`, `apc_competences`) |
| Clé de cache | `'referentiel'` | `'referentiel:<school_id>'` |
| `rechargerApcReferentiel` | gardait l'ancienne empreinte | **recalcule** celle qui décrit ce qu'il écrit |

**Elle se répare toute seule.** L'empreinte stockée dans les navigateurs n'a plus le même
format : au premier chargement après déploiement, le référentiel est retéléchargé sans que
personne ait rien à vider.

**Preuve** : `src/lib/_apcRefCache.test.mjs`, **20 contrôles** sur une doublure Supabase qui
enregistre les filtres émis. Dont celui qui compte : *supprimer des lignes maison change
l'empreinte* — et sa réciproque, *l'empreinte de l'école A ne bouge pas quand B change*.

**Limite assumée, la même que pour le primaire** : une modification **sur place** qui ne
change aucun compte (renommer une matière maison, corriger son coefficient) reste
invisible aux autres postes. Elle est bornée par `rechargerApcReferentiel`, qui
court-circuite l'empreinte sur le poste qui vient d'écrire.

### Ce que cet incident apprend

C'est la **quatrième fois** de la journée que le diagnostic vient d'une sortie brute, et la
**deuxième** fois que la cause est une hypothèse écrite en commentaire qui a cessé d'être
vraie sans que personne relise le commentaire. Un commentaire qui justifie un raccourci
(« c'est en lecture seule », « c'est identique partout ») devient faux le jour où la
fonctionnalité qu'il décrit change — et rien ne le signale.

**À faire** : quand une fonctionnalité rend une table **inscriptible par l'école**,
chercher les commentaires qui la décrivent comme nationale ou figée. Ici, un `grep` sur
« lecture seule » aurait trouvé le défaut avant l'école.

---

## I16 — « Les matières créées sont différentes de celles où l'on peut noter »

**Date** : 2026-10-22 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : signalement du responsable, après deux captures qui m'avaient d'abord
induit en erreur

### Ce que j'avais écarté à tort

Sur la capture de la 5ème de BRIGHT CONTINENT, `SVTEEHB`, `Etude de texte`,
`Expression Écrite/Orale` et `Informatique Pratique` étaient **cochées dans la classe** et
**absentes du menu de saisie**. J'ai vérifié le catalogue national, constaté que la 5e
porte « Sciences » et non SVTEEHB, et conclu : *« rien d'anormal »*.

C'était le défaut. Du point de vue de l'école, « Cochez pour activer » est une promesse :
une matière cochée doit être notable. La réponse « le catalogue national ne la prévoit pas
à ce niveau » n'en est pas une.

### Les deux manques, et le second n'était pas traité

Une matière n'est proposée à la saisie que si elle est **rattachée au niveau** de la
classe (`apc_classe_matieres.classe_id`). Le rattrapage existant ne savait traiter qu'un
seul manque :

| Manque | Traité avant ? |
|---|---|
| Le nom ne correspond à **aucune** matière → la créer | oui |
| La matière **existe** mais pas à **ce niveau** → la rattacher | **non** |

Et le second est le plus fréquent, pour deux raisons distinctes :

- une matière **maison** naît attachée au **seul** niveau où on l'a créée. `Etude de
  texte`, créée en 3ème, n'existe qu'en `3e` ; la cocher en 5ème ne l'attachait pas, et
  rien ne le disait ;
- une matière **nationale** n'est au catalogue que des niveaux prévus par l'arrêté.
  Espagnol, Allemand, Arabe et Chinois n'existent qu'en 4e/3e ; PCT et SVTEEHB qu'à partir
  de la 4e. Une 5ème qui enseigne l'espagnol cochait une matière qu'elle ne pouvait pas
  noter.

### Mesuré en production le 2026-10-22 — 12 classes, 6 écoles

| École | Classe | Cochées et non saisissables |
|---|---|---|
| COLLÈGE LA RETRAITE | 3e | 10 (noms anglophones : Biology, Chemistry, English Language…) |
| BRIGHT CONTINENT | 5ème | 6 — Espagnol, Etude de texte, Expression Écrite, Expression Orale, Informatique Pratique, SVTEEHB |
| BRIGHT CONTINENT | 6ème | 4 |
| BRIGHT CONTINENT | 4ème Esp, 3EME ESP | 3 et 2 |
| MAARIF | 5ème, 6ème | 3 chacune — Allemand, Arabe, Espagnol |
| MAARIF | 5e, 6e, 6eme G | PCT, Chinois |
| **THE GENIUS** | 5eme, 6eme | **Chinois**, une chacune |

### La correction

Le rattrapage distingue désormais les deux manques. **On ne recrée jamais un nom qui
existe** : recréer « Espagnol » à côté de l'Espagnol national fabriquerait le doublon
retiré le matin même (**I11 ter**), et recréer une matière maison détacherait les notes
déjà saisies dessus. Le rattachement porte sur l'**identifiant existant** ; seules les
compétences du niveau sont créées, au nom de l'école — sans elles la matière
s'afficherait sans rien à saisir.

La décision est sortie du magasin : `src/core/apcRattrapage.js`, sans réseau ni cache.
Le service `rattacherMatiereAuNiveau` (`src/lib/referentielEcole.js`) pose le rattachement
et les compétences ; il est distinct de `addMatiereMaisonApc`, qui ne cherche que parmi
les matières de l'école et créerait donc une copie d'une matière nationale.

**Preuve** : `src/core/_apcRattrapage.test.mjs`, **22 contrôles** écrits sur les cas de
production ci-dessus — les 14 matières de la 5ème de BRIGHT CONTINENT, le Chinois de THE
GENIUS, et le piège « SVT » qui ne doit pas devenir une matière maison à côté de SVTEEHB.

Le fixture du test a dû être corrigé en cours de route : j'y avais oublié que
`Expression Écrite` et `Informatique Pratique` **existent** comme matières maison
rattachées à la 4e. Le test disait vrai, mon modèle mental était faux.

### Ce qu'il faut savoir avant de livrer

Ce rattrapage s'exécute **automatiquement** à l'ouverture de l'écran de saisie, pour un
compte habilité à modifier les matières (`canManageClassSubjects`). Ouvrir la 5ème de
BRIGHT CONTINENT après déploiement attachera donc ses 6 matières et créera leurs
compétences, **sans rien demander**. C'est conforme à la règle posée par le responsable
(« laisse toutes les matières apparaître tant qu'elles sont créées et cochées »), mais
c'est une écriture en base déclenchée par une simple visite : **à confirmer avec lui si un
bouton explicite est préférable.**

### Ce que cet incident apprend

C'est la **deuxième fois** aujourd'hui que j'explique un symptôme au lieu de le corriger.
J'avais sous les yeux « coché mais absent du menu » et j'ai produit une justification
technique correcte — le catalogue national — au lieu de voir une promesse non tenue. Une
explication qui laisse l'utilisateur sans solution n'est pas un diagnostic.

---

## I17 — Le bulletin officiel du primaire perdait deux compétences, partout

**Date** : 2026-10-22 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : capture de l'écran de saisie primaire de THE GENIUS (CE1 BIL), et sa
bannière

### Le symptôme, et ce qu'il cachait

L'écran annonçait, correctement :

> *« 2 compétence(s) du niveau ne sont pas couvertes par les matières cochées pour cette
> classe : elles ne se saisissent pas ici et ne s'impriment pas sur le bulletin. »*

Sur les **onze** compétences nationales MINEDUB du niveau, **neuf** étaient saisissables.
Les deux écartées :

| Code | Intitulé | Domaine |
|---|---|---|
| **3A** | Pratiquer les valeurs sociales | `vie_citoyennete` |
| **4A** | Démontrer l'autonomie, l'esprit d'initiative, la créativité et l'entrepreneuriat | `autonomie` |

Ce ne sont pas des oublis de l'école. Ce sont des compétences **transversales** : aucune
matière ne porte leur nom, et **aucune école n'aura jamais une matière « Entrepreneuriat »
en CE1**. Le rapprochement par nom ne pouvait donc pas réussir — jamais, nulle part.

### Ce que le filtre produisait, et pourquoi c'est une faute

`primForClass` enchaînait deux filtres : les masques de l'école, puis le **périmètre des
matières cochées**. Le second retirait 3A et 4A de la saisie **et du bulletin officiel**,
dans **toutes** les écoles du primaire, définitivement.

Le module s'interdit précisément cela, dans son propre en-tête :

> *« Un bulletin qui porte une matière en trop est un défaut ; un bulletin qui en oublie
> une est une faute, et elle se découvre devant un parent. »*

Le garde-fou prévu — *« on ne filtre que si au moins une matière se rapproche du
référentiel »* — ne protégeait pas de ce cas : les neuf autres compétences étant
reconnues, le filtre s'appliquait et emportait les deux transversales avec lui.

### La correction

Le primaire ne filtre plus par les matières cochées. **Le masquage le remplace** : il
existait déjà, l'écran le nomme (« Modifier les compétences »), et il dit la même chose —
*« cette école ne traite pas cela »* — mais **explicitement**, au lieu de la déduire d'un
rapprochement de noms impossible.

Le **premier cycle** (`apcForClass`) et la **maternelle** (`matForClass`) **gardent leur
filtre** : leurs référentiels sont faits de matières et de domaines qui portent des noms de
matières, donc le rapprochement y a un sens, et la décision d'origine reste valable. C'est
le primaire, et lui seul, dont le référentiel mêle compétences scolaires et compétences
transversales.

La bannière « N compétences non couvertes » disparaît d'elle-même : elle comptait les
exclues, et il n'y en a plus.

**Preuve** : `src/core/_refClassScope.test.mjs`. Le bloc existant **exigeait** le
comportement retiré — il a été **récrit, pas supprimé**, avec le relevé qui motive le
changement. Le contrôle qui ferme le défaut : une compétence transversale que rien ne peut
couvrir reste saisissable ; et le masque, lui, porte toujours.

### Relevé au passage, non corrigé — les classes bilingues du primaire

| Classe | Matières cochées |
|---|---|
| CE1 BIL | **43** |
| CE2 BIL | **37** |
| SIL BIL, CP BIL | 22 chacune |
| Classes monolingues | 11 à 21 |

Le cumul des deux programmes est le fonctionnement voulu de la case « Classe bilingue ».
Mais le CE1 BIL porte aussi `Economics`, `Management`, `Accounting`, `Philosophy`,
`Technology` — des matières de lycée dans un CE1. Au primaire elles ne gênent pas la saisie
(on note des compétences, pas des matières), mais elles encombrent et déclenchent la
seconde bannière.

**C'est un geste d'école, pas de logiciel** : *Classes → Modifier la classe → Matières*,
décocher. Rien n'a été décoché d'office.

**Autre fait mesuré** : sur les **17 classes du primaire** de THE GENIUS, **aucune matière
ne porte `prim_competence_id`**. Le rapprochement se fait donc entièrement par le nom, ce
qui rend le rattachement explicite inutilisé — et fragile le jour où un nom change.

---

## I18 — Au primaire, une matière ajoutée par l'école n'était notable nulle part

**Date** : 2026-10-22 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : bandeau de l'écran de saisie primaire, et consigne du responsable

### Le symptôme

> « Matière(s) de cette classe sans compétence correspondante au référentiel :
> **Chinois, Economics, Management, Practical Work, Travaux Pratiques**. Elles ne se
> saisissent pas ici et ne figurent pas sur le bulletin officiel. **Corrigez le nom** dans
> Classes → Modifier la classe → Matières. »

Au primaire on note des **compétences**, pas des matières. Une matière cochée dont le nom
ne correspond à aucune compétence du référentiel n'était donc notable **nulle part**.

**Et le conseil du bandeau était mauvais.** « Corrigez le nom » n'a aucun sens pour
`Economics` : **aucun nom** ne le ferait entrer au programme national du primaire. Le
message demandait à l'école de renommer sa matière pour qu'elle ressemble à autre chose.

### La consigne

> « C'est l'école qui a ajouté ces matières, donc laisse-les apparaître pour mettre les
> notes, pour toutes les écoles. »

C'est la même règle que pour le premier cycle (**I16**), appliquée au primaire.

### La correction

À l'ouverture de la classe, chaque matière sans compétence fait naître sa **compétence
maison** — par le chemin qui existait déjà pour le geste manuel (« Modifier les
compétences ») : identifiant déterministe dérivé de (école, nom), code dérivé du libellé.
Deux postes qui créent « Travaux Pratiques » écrivent donc la **même** ligne.

**Deux règles de portée, parce qu'il y a deux sortes de compétences :**

| | Portée |
|---|---|
| **Nationale** | tout le niveau, **toujours** — seul le masquage l'enlève (**I17**) |
| **Maison** | seulement les classes qui **cochent sa matière** |

La seconde règle était indispensable : `prim_niveau_competences` est **vide** en base, donc
une compétence maison apparaîtrait dans **toutes** les classes du primaire de l'école —
`Economics` en SIL. Et aucune école ne peut y écrire son niveau : **la table est globale,
sans `school_id`**. En faisant suivre la compétence maison à sa matière, le problème ne se
pose plus, et rien n'est repris à I17 : 3A et 4A restent partout.

### Un piège vérifié avant d'écrire

Au primaire, les notes vont sur des **critères** (Oral, Écrit, Pratique, Savoir-être). Si
ces critères avaient été propres à chaque compétence, une compétence maison serait née
**sans aucun critère** — créée et invisible, exactement le piège rencontré deux fois dans
la journée (matière APC sans compétence en I11, table synchronisée née vide en I13).
Vérifié : `prim_criteres` est **globale** (`id, country_code, nom, poids, ordre`), la
compétence maison hérite des critères sans rien de plus.

### Preuve

`src/core/_refClassScope.test.mjs` : la règle de portée (4 contrôles) **et le câblage**
(8 contrôles). Ce second bloc existe parce que le même jour, pour le premier cycle, la
correction était en place dans le magasin et l'écran ne l'appelait **jamais** — vu du
dehors, « rien ne change ». On fige donc que c'est bien la liste des matières sans
compétence qui déclenche, que le rattrapage ne part jamais sans le droit d'écrire, et
qu'il n'écrit **rien** dans la table globale.

### Ce qu'il faut savoir avant de livrer

1. **L'écriture part à l'ouverture de la classe**, sans rien demander, pour un compte
   habilité. Ouvrir le CE1 BIL de THE GENIUS créera cinq compétences maison. C'est la
   règle du responsable, mais c'est une écriture déclenchée par une visite : **un bouton
   explicite reste à trancher avec lui** (même question qu'en I16).
2. **Le bulletin du primaire s'allongera** de ces compétences, dans les classes qui
   cochent leur matière — `Economics` et `Management` comprises. Le logiciel fait ce qui
   est demandé ; si ces matières n'ont rien à faire en CE1, c'est en les **décochant** que
   cela se règle.
3. **Le carnet les regroupe par leur code**, pas par domaine : aucun domaine officiel ne
   leur a été inventé, et `groupesDe` prévoyait déjà ce cas.

---

## I19 — Sur les postes installés, le référentiel « se charge sans cesse » (0.3.22)

**Date** : 2026-10-23 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : signalement du responsable, en trois messages

> « quand on essaie d'entrer les notes du primaire, le référentiel se charge sans cesse
> *Chargement du référentiel APC…* »
> « la version 0.3.22 qui a ce problème »
> « **la version en ligne n'a pas le problème de chargement** »

La troisième phrase est celle qui a tranché, et elle a été donnée **avant** que la moindre
hypothèse ne soit testée. Elle dit : ce n'est pas la base, ce n'est pas l'écran, c'est le
**client LAN**.

### La cause : un appel que le serveur d'école ne connaît pas

La **0.3.22** (I15) avait ajouté, pour ne plus mélanger les écoles :

```js
const sienne = (q) => (schoolId ? q.or(`school_id.is.null,school_id.eq.${schoolId}`) : q);
```

`.or()` existe chez `supabase-js`. Il **n'existe pas** sur `localClient.QueryBuilder`, le
client qui parle au serveur Fastify de l'école. Sur un poste installé, l'appel levait
`q.or is not a function` ; le `catch` de `fetchReferentiel` rendait `null` ; et comme la
**même version** changeait la clé du cache (`referentiel:<school_id>`), il n'y avait **aucun
cache à peindre**. L'écran de saisie restait donc sur « Chargement du référentiel APC… »
**pour toujours** — et la saisie du premier cycle était impossible.

**Le dépôt connaissait le piège.** `feeCatalogService.js` porte, depuis des mois :
« pas de `.or()` (non supporté par le client LAN/localClient) — on tire tout … puis on
filtre côté client ». Rien ne l'empêchait pour autant.

### Deux écritures de la même famille, trouvées en remontant la divergence

| Écriture | Table | Clé réelle | Ce qui se passait en LAN |
|---|---|---|---|
| `apc_classe_matieres.upsert(ligne)` | pas de colonne `id` | `(classe_id, matiere_id)` | `ON CONFLICT(id)` → erreur SQLite, **rattachement I16 mort** |
| `mat_domaines_masques.upsert(ligne)` | pas de colonne `id` | `(school_id, domaine_id)` | **même faute, mais inerte** : `setMatDomaineMasque` n'est appelée **par aucun écran** (vérifié) — le masquage d'un domaine passe par `referentielEcole.setMasque`, qui nomme déjà la clé composite. Corrigée pour qu'un futur câblage ne réveille pas le défaut ; **elle n'a rien cassé en école**, et le paquet ne la contient même pas (l'arbre mort est élagué au build). |

En Cloud, un upsert sans cible visait la clé primaire : les deux marchaient. Le client LAN
retombe sur son défaut `'id'`. Le correctif I16, livré dans le paquet 0.3.22, **ne pouvait
donc pas fonctionner sur un poste installé** — ce qui était précisément le reproche
d'origine (« une matière cochée n'apparaît pas à la saisie »).

Et `auth.js` portait la même divergence avec `.ilike()`, sur le repli qui rattache un
compte enseignant à sa fiche : un **TypeError** au milieu de la résolution du contexte,
pas une requête vide.

### La correction

| Ce qui change | Où |
|---|---|
| le filtre par école est fait **en JavaScript**, sur les lignes reçues | `src/lib/apcService.js` |
| `onConflict` **explicite** sur les deux tables à clé composite | `referentielEcole.js`, `matService.js` |
| le repli par nom compare les noms **en JavaScript** (et exige **une seule** correspondance) | `src/lib/auth.js` |
| l'empreinte par comptes ne demande plus `id` — **mesuré 400** sur `prim_niveau_competences` | `referentielFingerprint.js` |
| une demande de référentiel **attend** que l'école soit connue au lieu d'être jetée | `schoolStore.js`, `core/attenteValeur.js` |

### Deux défauts de plus, trouvés en mesurant

**`prim_niveau_competences?select=id` répond 400** (sa clé est `(niveau_id, competence_id)`,
il n'y a pas de colonne `id`). Un seul compte manquant annule l'empreinte entière : le
référentiel du **primaire** était donc retéléchargé **en entier**, sept tables, à chaque
montage d'écran, dans toutes les écoles — c'est-à-dire exactement ce que le fichier
d'empreintes existe pour éviter. Avec `select=*`, les neuf tables répondent 200.

**Une demande de référentiel arrivée trop tôt était perdue.** L'écran la fait à son
montage ; `schoolId` n'est posé que par l'effet de `App`. React exécute les effets des
**enfants avant ceux des parents** : sur une arrivée **directe** sur `/app/grades` (lien,
favori, F5, Ctrl+Shift+R), `loadApc`/`loadPrim`/`loadMat`/`loadRefMasques` repartaient sans
rien faire, et **rien ne les rejouait**. Depuis le tableau de bord, le défaut est invisible
(le référentiel est déjà en mémoire) : il ne frappe que celui qui **vérifie** une
correction. Corrigé **à la source** plutôt que dans les neuf écrans appelants.

### Preuve

| Test | Ce qu'il fige |
|---|---|
| `src/lib/_localClientParite.test.mjs` | toute méthode chaînée sur `supabase.from(…)` existe sur le client LAN — **et** les méthodes interdites (`.or`, `.ilike`, `.like`…) n'apparaissent nulle part dans `src/`, même appelées **indirectement** (c'est par une fonction intermédiaire que la 0.3.22 est passée) |
| `server/_upsert_cle_composite.test.mjs` | sur une **vraie base SQLite** : `ON CONFLICT(id)` est refusé sur les deux tables, la clé composite passe, et le rejeu est idempotent |
| `src/core/_attenteValeur.test.mjs` | la demande attend l'école, ne la perd pas dans une course, et n'attend pas pour toujours |
| `src/store/_chargeursAttendentEcole.test.mjs` | le **câblage** : les quatre chargeurs attendent, les deux chargeurs nationaux sont inchangés |
| `src/lib/_apcRefCache.test.mjs` | réécrit : l'invariant est le **résultat** (aucune ligne d'une autre école), et **aucun `.or()` émis** |

### Ce qu'il faut savoir avant de livrer

1. **Le paquet 0.3.22 ne doit pas être distribué.** Il porte le défaut : sur un poste
   installé, la saisie du premier cycle est bloquée. Il n'a été envoyé à aucune école.
2. **La version en ligne n'était pas touchée** : Supabase connaît `.or()`. Les écoles du
   Cloud n'ont rien à faire.
3. **Leçon de méthode, la quatrième du même mois** : le responsable avait dit « la version
   en ligne n'a pas le problème ». C'est cette phrase, et non l'audit du code, qui a
   désigné la cause en une minute. Cf. `demander-l-ecran-avant-d-auditer-la-base`.

---

## I20 — L'import de notes écrivait toutes les matières du classeur

**Date** : 2026-10-23 · **Statut** : **corrigé dans le code (NON LIVRÉ)** ·
**Source** : consigne du responsable — « il faut aussi que l'import de note se fasse une
matière à la fois »

Le classeur exporté depuis l'écran de saisie porte **une colonne par matière de la
classe**. L'import lisait **toutes** les colonnes reconnues. Un enseignant qui réimportait
son fichier après avoir rempli **sa** colonne réécrivait donc celles de ses collègues —
avec l'état qu'elles avaient **au moment de l'export**, c'est-à-dire périmé dès qu'un
collègue avait saisi entre-temps.

C'est la même famille de dégâts que **I12** : une note juste, au mauvais endroit, écrite
sans que rien ne le signale.

La 0.3.19 avait fermé **la moitié** du piège : une cellule **vide** n'efface plus la note
en place. Une cellule **pleine et périmée**, elle, écrasait toujours.

### La correction

La matière est **choisie** dans le panneau d'import, et c'est la **seule colonne lue** :

* une seule matière dans le classeur → elle est choisie d'office ;
* plusieurs → le bouton reste inerte (« Choisissez la matière ») ;
* le bouton annonce **ce qui sera écrit** : « Importer 23 notes — Mathématiques », et non
  un nombre d'élèves ;
* l'écran de fin le redit : « Seule cette matière a été écrite. »

Règle **pure** et vérifiée seule : `src/core/importUneMatiere.js`,
`src/core/_importUneMatiere.test.mjs` (18 contrôles, dont la cellule vide, la colonne
absente, le hors barème, `ABS`, la virgule décimale et l'élève inconnu).
