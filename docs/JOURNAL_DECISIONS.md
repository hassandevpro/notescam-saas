# Journal des décisions techniques — NotesCam

> Une entrée par décision qui engage le produit : ce qui a été décidé, **pourquoi**, ce que
> ça interdit, et comment la défaire. On n'y consigne pas les détails d'implémentation,
> seulement ce qu'un futur intervenant risquerait de casser faute de connaître la raison.
>
> Les écarts du contrat de synchronisation LAN/Cloud ont leur propre registre, plus ancien
> et toujours en vigueur : **`docs/SUIVI_CONTRAT_SYNCHRO.md`**. Ne pas le dupliquer ici ;
> y renvoyer.

Format : `D<n>` · date · décision · raison · conséquence · comment revenir en arrière.

---

## D1 — La colonne `source_balance_raw` reste hors du schéma LAN

**Date** : 2026-10-18 · **Statut** : en attente de la migration Cloud
**Où** : `server/db.js:1282` (commentaire en place), `supabase_cash_book_raw_balance.sql`

**Décision.** Les deux `ensureColumn('…', 'source_balance_raw', …)` sont retirés du schéma
SQLite local, alors que le code de la caisse sait exploiter la colonne.

**Raison.** `supabase_cash_book_raw_balance.sql` n'est pas appliquée au Cloud (vérifié le
2026-10-18 : ni `cash_movements` ni `budget_expenses` n'ont la colonne en prod). Or la
poussée envoie la ligne entière (`SELECT *`) et `sync-push` l'applique telle quelle : une
colonne absente du schéma Cloud fait **refuser la ligne**. Toute dépense ou tout mouvement
de caisse modifié à l'école cesserait donc de remonter — le mécanisme exact qui a déjà
bloqué `students` et `subjects` quand leurs migrations ne suivaient pas.

**Conséquence.** Ne jamais rétablir ces deux lignes avant la migration Cloud. L'import
depuis le poste d'édition écrit directement au Cloud : la colonne lui sert là-bas, pas en
local, donc rien n'est perdu en attendant.

**Retour arrière.** Appliquer la migration Cloud, **puis** remettre les deux `ensureColumn`
dans le même lot. Jamais l'inverse.

---

## D2 — `AGENTS.md` reste la source unique des consignes, `CLAUDE.md` n'est qu'un renvoi

**Date** : 2026-10-18 · **Statut** : actif

**Décision.** `CLAUDE.md` ne contient aucune consigne propre : il renvoie à `AGENTS.md`,
`PROJECT_STATUS.md` et aux deux registres.

**Raison.** `AGENTS.md` existait déjà, était à jour et est chargé automatiquement en début
de session. Écrire un second fichier de consignes complet aurait créé deux vérités qui
divergent à la première modification.

**Retour arrière.** Si l'outillage impose un jour un `CLAUDE.md` autonome, déplacer le
contenu d'`AGENTS.md` et faire l'inverse du renvoi — jamais dupliquer les deux.

---

## D3 — `packaging/` est exclu du lanceur de tests

**Date** : 2026-10-18 · **Statut** : actif · **Où** : `scripts/run-tests.mjs` (`EXCLUS`)

**Décision.** `npm test` ne parcourt que `src/`, `server/` et `supabase/`.

**Raison.** `packaging/Output-maj/` et `packaging/_stage/` contiennent 899 copies figées
des tests livrés avec les paquets d'installation. Les inclure testerait des versions
anciennes du code et porterait le total de 176 à plus de 1000, sans rien prouver sur le
code courant.

**Retour arrière.** Retirer `'packaging'` de `EXCLUS`, en sachant que les échecs
remonteront alors depuis des sources archivées.

---

## D4 — Le lanceur de tests lit le loader documenté dans l'en-tête du test

**Date** : 2026-10-18 · **Statut** : actif · **Où** : `scripts/run-tests.mjs`
(`loaderDocumente`)

**Décision.** Avant de lancer un test, on cherche `--experimental-loader <X>` dans ses
2000 premiers caractères et on utilise ce loader.

**Raison.** La convention du dépôt veut que chaque test documente sa commande en en-tête,
et le loader n'est pas toujours le fichier frère : `_syncRestart` et `_syncDurability`
empruntent `_syncBatch.hooks.mjs`. Sans cette lecture, ces deux tests échouaient à tort
sur `import.meta.env` indéfini.

**Retour arrière.** Supprimer `loaderDocumente` ; il faudra alors une table de
correspondance test → loader, maintenue à la main.

---

## D5 — Les tests E2E ciblent l'édition LAN, jamais le Cloud

**Date** : 2026-10-18 · **Statut** : actif · **Où** : `playwright.config.mjs`

**Décision.** `playwright.config.mjs` lance le serveur LAN sur `127.0.0.1` avec un
`NOTESCAM_DATA_DIR` neuf à chaque exécution, et **refuse de démarrer** si l'URL cible
n'est pas locale.

**Raison.** Il n'existe aucun environnement de recette séparé : la recette se fait dans le
projet Supabase de **production** (risque R2). Un test E2E pointé sur le Cloud écrirait
donc dans les données d'écoles réelles. Le refus est explicite plutôt que documenté, parce
qu'une faute de frappe dans `E2E_BASE_URL` ne doit pas pouvoir atteindre la production.

**Conséquence.** Les parcours qui n'existent que côté Cloud (Auth Supabase, RLS) ne sont
pas couverts par l'E2E ; ils restent couverts par les tests colocalisés et par les
politiques RLS. Ne pas « débloquer » le garde-fou pour gagner en couverture : créer
d'abord un vrai environnement de recette.

**Retour arrière.** Lever la liste `LOCAL` seulement le jour où un projet Supabase de
recette, distinct de la production, existe.

---

## D6 — Les parcours critiques sont déclarés en `test.fixme`, pas en tests vides

**Date** : 2026-10-18 · **Statut** : actif
**Où** : `e2e/01-parcours-critiques.spec.mjs`

**Décision.** Les 21 parcours critiques sont écrits comme `test.fixme`, donc comptés et
affichés comme « à faire », mais non exécutés.

**Raison.** Un test vide qui passe donnerait une CI verte mensongère ; ne rien écrire
perdrait la liste des parcours et leurs prérequis. Le `fixme` garde la liste visible à
chaque exécution sans jamais mentir sur la couverture réelle.

**Conséquence.** `npm run test:e2e` affiche « 3 passés, 21 ignorés ». Ce 21 est une dette
assumée, inscrite en R7 : il ne doit pas diminuer autrement qu'en écrivant les tests.

**Retour arrière.** Aucun : activer un parcours signifie l'écrire.

---

## D7 — Une compétence maison porte une pastille dérivée de son libellé, pas `NULL`

**Date** : 2026-10-18 · **Statut** : actif
**Où** : `src/lib/referentielEcole.js` (`codeMaison`), `src/store/schoolStore.js`
(`addRefLigne`)

**Décision.** Quand une école ajoute une compétence à elle dans « Compétences du
primaire », son `code` est **calculé à partir du libellé** (initiales en majuscules,
suffixe numérique en cas de doublon) au lieu d'être envoyé à `NULL`.

**Raison.** `prim_competences.code` est `NOT NULL` dans les **deux** schémas —
`server/schema.sql:1427` en LAN, `supabase_apc_primaire.sql:72` au Cloud, vérifié sur la
base de production (`information_schema`). `addRefLigne` envoyait `code: null` : l'ajout
échouait donc **toujours**, en LAN (`NOT NULL constraint failed`) comme au Cloud
(`23502`), et l'écran ne rendait qu'un « ajout refusé » sans cause lisible. Les deux
autres gestes de l'écran (masquer, renommer) n'étaient pas touchés, ce qui a longtemps
fait croire à un problème de permissions.

Rendre la colonne nullable aurait demandé une migration Cloud sur une table **nationale**
partagée par toutes les écoles, pour un champ qui n'est qu'un libellé d'affichage : la
pastille de `ReferentielEditor` et le `« <code> — <intitulé> »` de `primEngine`. Rien ne
lit ni ne décode ce code, et aucune contrainte d'unicité ne pèse dessus. Le calculer côté
client corrige les deux éditions sans toucher au schéma.

**Conséquence.** Une pastille maison ne commence **jamais** par un chiffre : les codes du
ministère (`1A`…`6B`) en commencent tous par un, donc aucune ligne d'école ne peut se
faire passer pour une ligne officielle. Un libellé dont les initiales donneraient un
chiffre est préfixé d'un `E`. `mat_domaines.code` étant nullable, la maternelle n'était
pas concernée ; elle reçoit la même pastille par cohérence d'affichage.

**Retour arrière.** Remettre `code: null` **exige** d'abord de rendre la colonne nullable
dans les deux schémas — sinon le défaut revient tel quel.

---

## D8 — Tous les échanges de fichiers passent par Excel ; le CSV est refusé

**Date** : 2026-10-19 · **Statut** : actif
**Où** : `src/lib/exportCsv.js` (`EXCEL_ACCEPT`, `isExcelFile`, `readWorkbookAoa`),
et tous les écrans d'import / export : élèves, enseignants, personnel, notes,
compétences, frais, caisse, rapports, bulletins du second cycle.

**Décision.** Les exports produisent **un classeur `.xlsx`**, et les imports
n'acceptent plus que `.xlsx` / `.xls` (`.xlsm` toléré à la lecture). Les branches de
lecture CSV sont retirées des trois lecteurs d'`exportCsv.js`, et un fichier qui n'est
pas un classeur est refusé avec un message qui dit quoi faire (« Enregistrer sous →
Classeur Excel »), au lieu d'être lu de travers.

**Raison.** Demande du responsable du produit (« rendre tous les import et export en
Excel »), et le CSV posait un vrai problème de terrain : il n'a pas de forme unique.
Son séparateur dépend des réglages régionaux du Windows qui l'écrit (virgule ou
point-virgule), son encodage se devine, et surtout une note décimale française
(« 12,5 ») se coupe en deux colonnes sur un poste et pas sur l'autre. Le classeur porte
ses types, ses colonnes et ses feuilles : **ce qui est exporté se réimporte à
l'identique**, d'un poste à l'autre et d'une école à l'autre. `xlsx` était déjà une
dépendance du projet et déjà le format de la moitié des écrans — la décision supprime
un format, elle n'en ajoute aucun.

**Conséquence.**
- Un `.csv` qui circulait déjà dans une école est **refusé** à l'import. C'est le choix
  explicite du responsable, pris en connaissance de cette conséquence : la parade est de
  l'ouvrir dans Excel ou LibreOffice et de l'enregistrer en `.xlsx`, ce que le message de
  refus indique.
- `downloadCSV` et `triggerDownload` n'existent plus : tout passe par `downloadExcel` /
  `downloadExcelSheets`.
- `EXCEL_ACCEPT` est la **source unique** des extensions proposées. Un écran qui
  élargirait son `accept` de son côté ferait croire qu'un format passe, pour que le
  lecteur le refuse juste après.
- `teacherImport.parseCsvText` est conservé, inutilisé : il documente le piège de la
  colonne « matières » (pleine de `;` et de `,`) et reste éprouvé par
  `_teacherImport.test.mjs`. Il resservira tel quel si un vecteur texte revient.

**Retour arrière.** Rouvrir le CSV = remettre une branche texte dans `readWorkbookAoa`
(ou en amont de `isExcelFile`) et élargir `EXCEL_ACCEPT`. Les deux se font au même
endroit, par construction.

---

## D9 — Le récapitulatif du classeur des bulletins ne se réimporte jamais

**Date** : 2026-10-19 · **Statut** : actif
**Où** : `src/lib/scBulletinSheet.js` (`sequenceFromSheetName`, `planScSheetImport`),
`src/components/bulletins/ScBulletinExcelIO.jsx`, `src/lib/_scBulletinSheet.test.mjs`

**Décision.** L'écran Bulletins du second cycle exporte un classeur à plusieurs
feuilles : un **récapitulatif** de la classe (matières rangées par groupe comme sur le
bulletin officiel, moyennes de groupe, moyenne générale, rang, décision) puis **une
feuille par séquence** de la période. À l'import, seules les feuilles **dont le nom
porte un numéro de séquence** sont relues ; le récapitulatif est ignoré et annoncé
comme tel.

**Raison.** Les colonnes du récapitulatif contiennent des **moyennes de période**, pas
des notes. Les reverser en base fabriquerait des notes que personne n'a saisies — et
qui écraseraient les vraies. Le numéro de séquence dans le nom de la feuille est ce qui
distingue une grille de saisie d'un tableau de synthèse, sans que l'utilisateur ait
quoi que ce soit à déclarer.

**Conséquence.**
- Les feuilles de séquence portent **exactement** l'en-tête que l'écran Notes exporte
  (« Élève, Matière /max, … ») et sont relues par le **même** découpage
  (`rawRowsToGrades` d'`exportCsv.js`). Il n'existe donc pas deux formats de grille dans
  l'application, et le classeur d'un écran se réimporte dans l'autre.
  `_scBulletinSheet.test.mjs` tient cet aller-retour : il extrait le vrai découpage
  d'`exportCsv.js` et vérifie qu'un export relu ne produit **aucune** écriture.
- Une cellule vide n'efface rien (un classeur rempli matière par matière en est plein),
  une note hors barème est rejetée et non tronquée, un élève ou une matière inconnu est
  listé et jamais rattaché au plus proche, et les notes qui **remplaceraient** une
  valeur différente déjà en base sont comptées à part dans l'aperçu. Rien n'est écrit
  avant validation ; une séquence verrouillée refuse l'écriture et c'est annoncé.
- Le bouton « Importer Excel » n'est pas offert à un compte enseignant
  (`role !== 'teacher'`), comme les autres écritures de cette page.

**Retour arrière.** Supprimer `<ScBulletinExcelIO />` de `Bulletins.jsx` retire les deux
boutons sans rien toucher d'autre : la logique est dans un module à part, et l'écran
d'impression est inchangé.

---

## D10 — Une fiche de frais s'identifie par `(élève, année)`, jamais par son `id`

**Date** : 2026-10-19 · **Contexte** : incident **I9** (THE GENIUS)

`student_fees` porte `UNIQUE(student_id, academic_year)` au Cloud comme en LAN. Le `id`
d'une fiche n'est donc qu'une étiquette locale : deux postes qui saisissent les frais du
même élève pour la même année fabriquent deux `uuid()` différents pour **une seule ligne
possible**. Upserter sur `id` fait de cette situation banale un refus définitif (`23505`)
qui bloque la file de synchronisation du poste.

**Décision.** Sur un refus de doublon, l'écriture résout l'id réel de la ligne
`(élève, année)` et écrit **dedans**. L'appelant adopte ensuite l'id du Cloud
(`adopterIdFraisDistant`) : sans cela, le poste refabrique son id à la saisie suivante et
la file se rebloque.

**Ce que ce chemin ne touche pas, et pourquoi.** Le cache de paiement (`frais_payes`,
`date_dernier_paiement`) n'est **jamais** écrit par ce rattrapage. Par construction, la
fiche qui arrive là n'a jamais vu la ligne du Cloud : son `frais_payes` vaut souvent 0 et
écraserait des encaissements réels. La source de vérité reste `fee_payments`, et
`reconcileFeesPaid` — **monotone**, elle ne fait que relever une sous-évaluation — remet
le cache à niveau une fois les versements remontés.

**Ce qui n'a pas été retenu** : upserter directement sur `onConflict:
'student_id,academic_year'`. PostgREST écrit alors `id = excluded.id`, donc **réécrit la
clé primaire** à chaque enregistrement. Les ids des fiches de frais se mettraient à
changer sous les autres postes, sous les tombstones de synchro (`sync_tombstones.row_id`)
et sous le LWW, pour ne rien gagner — le rattrapage ci-dessus suffit et laisse les ids
stables.

**Portée.** Chemin navigateur → Cloud uniquement (`schoolService.upsertFee`,
`schoolStore`, `src/lib/sync.js`). Le chemin LAN↔Cloud garde le même défaut
(`sync-push`, `rawUpsert`), inerte tant que la synchro hybride n'est pas activée : voir
I9, dernier paragraphe.

**Garde-fou** : `src/lib/_feeUpsertConflit.test.mjs` (21 contrôles).

---

## D11 — Les matières d'une classe ont UNE seule source et UN seul ordre

**Date** : 2026-10-19 · **Statut** : actif
**Où** : `src/core/subjectOrder.js` (nouveau), `src/core/refClassScope.js`
(`apcMatieresForClass`, `unmatchedClassSubjects`), `src/core/apcMatiereMatch.js`,
les trois postes de saisie officiels (`ApcCompetenceWorkspace`,
`PrimCompetenceWorkspace`, `MatObservationWorkspace`), et les huit écrans qui
listaient `subjects` (`Bulletins`, `Grades`, `Classes`, `Reports`,
`StudentProfile`, `ClassSubjectsEditor`, `SubjectTeacherWorkspace`,
`transcriptReadiness`).
**Tests** : `src/core/_subjectOrder.test.mjs` (19 contrôles),
`src/core/_refClassScope.test.mjs` (complété : 14 contrôles de plus).

**Demande du responsable.** « Le choix de matière dans la modification de la classe, les
matières qui s'affichent sur le bulletin et à l'entrée des notes : ça doit être
identique » — *pour tous les systèmes* (classique, APC ministériel, primaire,
maternelle, second cycle, bilingue spécial).

**Décision.** « Les matières de cette classe » est une question à **une seule réponse**.
Elle se calcule à **un seul endroit** et personne ne la recalcule :

1. **L'ENSEMBLE** — `refClassScope` décide, pour les trois cycles à référentiel
   national. Le bulletin l'appelait déjà ; les trois postes de saisie, non. Ils
   l'appellent maintenant, avec le **même garde-fou** : si aucune matière de la classe
   ne se rapproche du référentiel, on ne filtre **rien** (liste complète, jamais un
   écran vide). Classique / second cycle / bilingue partent déjà des lignes `subjects`
   et avaient donc déjà le bon ensemble.
2. **L'ORDRE** — `subjectOrder.bySubjectOrder` : `position` quand elle est posée, sinon
   coef décroissant puis nom. C'est la règle du **bulletin**, parce que c'est le
   document qui sort de l'école.

**Raison.** Deux écarts réels, aucun visible :

- **L'ensemble.** La saisie APC / primaire / maternelle est organisée par ligne du
  *référentiel*, pas par ligne `subjects` : elle proposait **tout** le référentiel de la
  classe, alors que le bulletin n'imprimait que ce que couvraient les matières cochées.
  Une enseignante pouvait saisir un trimestre entier d'Informatique que le bulletin ne
  portait pas. Le bandeau qui annonçait les lignes écartées avait été retiré du bulletin
  (`45af74b`) : le filtre était donc devenu **entièrement muet**.
- **L'ordre.** Cinq tris différents pour la même table. Seul le bulletin honorait
  `position`, la colonne qu'écrit « Réorganiser les matières ». L'administration rangeait
  les colonnes du bulletin, et la grille de saisie gardait l'ordre des coefficients :
  **la colonne que l'on croyait remplir n'était pas celle que l'on remplissait.**

**Conséquence.**
- Les trois postes de saisie **annoncent** ce que le périmètre a écarté, et nomment les
  matières cochées qui ne correspondent à **rien** au référentiel (matière maison, faute
  de frappe). Sans cet affichage le filtre serait invisible — c'est ce qui a fait perdre
  la première version du périmètre.
- L'appariement APC lit désormais le **libellé anglais officiel**
  (`APC_MATIERE_EN`) : seul l'écran de saisie passait un libellé localisé, si bien que
  « Computer Science » se résolvait à la saisie et **pas** au bulletin (qui appelle
  `apcForClass` sans libellé). Le procès-verbal et le rapport de classe en profitent.
- « Modifier les domaines » (maternelle) garde les **8** domaines, y compris ceux que la
  classe n'a pas cochés : c'est un outil d'école, pas de classe — sinon un domaine
  écarté deviendrait impossible à renommer.
- Les matières **composites** gardent leur règle : on saisit les feuilles (la note du
  parent est calculée), le bulletin affiche le parent ou le détail selon
  `school.bulletin_subject_mode`. Ce n'est pas un écart, c'est une hiérarchie.
- Un **enseignant de matière** continue de ne voir que ses propres matières à la saisie.
  Ce filtre-là dépend de qui regarde ; le périmètre de la classe, non. Les deux se
  cumulent, dans cet ordre.

**Retour arrière.** `bySubjectOrder` rendant `0` restaure l'ordre naturel, et retirer les
trois appels à `refClassScope` dans les postes de saisie remet l'ancien comportement :
aucun schéma, aucune donnée, aucune migration n'est touché.

---

## D15 — Une classe bilingue est une classe qui porte les deux programmes, rien de plus

**Date** : 2026-10-19 · **Contexte** : demande de THE GENIUS (4 salles bilingues)
**Où** : `src/core/bilingualSubjects.js` (nouveau), `schoolStore.completerClasseBilingue`,
`src/pages/Classes.jsx` (création + écran de la classe)
**Tests** : `src/core/_bilingualSubjects.test.mjs` — 45 contrôles

**Demande.** « Nous avons 4 salles de classes bilingues, il faudrait que les unités
d'apprentissage des matières ANGLOPHONES se retrouvent sur les classes bilingues […]
fusionne les classes anglophones avec les classes francophones de tous les systèmes,
classique comme APC, et laisse le choix d'ajouter ou de retirer une matière. » Puis, sur
le bulletin : « c'est le même bulletin, juste bilingue, certaines matières en FR et
d'autres en EN. »

**Décision.** Le bilinguisme d'une classe n'est **pas** un drapeau en base : c'est sa
liste de matières. Aucune colonne, aucune migration, aucune valeur de plus dans
`classes.system` — donc aucun moteur ni aucun écran ne change de comportement sans
qu'on l'ait décidé. `isBilingualClass` relit l'état depuis les matières portées, ce qui
suffit à rouvrir l'écran comme l'école l'a laissé.

**Pourquoi cela fait apparaître les unités d'apprentissage.** Le périmètre du référentiel
national d'une classe se déduit de ses lignes `subjects` (`core/refClassScope.js`,
décision **D11**). Poser les matières anglophones sur la classe fait donc entrer leurs
compétences, et avec elles leurs UA, par un chemin qui existe déjà.

**Pourquoi le bulletin n'a pas eu à changer — vérifié, pas supposé.** `calcFR` /
`calcEN` normalisent **déjà** chaque note par le barème de SA matière avant de la
remettre à l'échelle de sortie de la classe (`bulletinEngine.js:81`). Une classe qui
porte Français /20 et English /100 a donc une moyenne juste : deux notes à 75 % donnent
15/20, et un 100/100 vaut 20/20, pas davantage. Les quatre contrôles du bloc 9 du test
verrouillent ce comportement — s'il tombe, les bulletins bilingues deviendraient faux en
silence. L'écran de saisie, lui, lit déjà `subject.max` partout (`Grades.jsx:125`).

**Barèmes** (consigne du responsable) : « pour le système classique /100, pour l'APC
ministériel les barèmes du ministère ». Chaque matière garde donc le barème de son
monde — /20 francophone, /100 anglophone — et en APC le calcul continue de lire les
`points_max` du référentiel.

**LA SOURCE EST LA CLASSE JUMELLE DE L'ÉCOLE, PAS UN TRONC TYPE.** Précisé par
l'école le même jour, bulletins en main : « CE1 BIL = fusion des matières de Class 3 +
CE1 ». On copie donc les matières **telles que l'école les a posées** sur sa classe
jumelle — ses coefficients, ses barèmes, et jusqu'aux matières qui ne figurent à aucun
référentiel (`Travaux Pratiques`, `Chinois`, relevées en production). Le tronc type ne
sert plus que de repli, quand l'école n'a pas de classe jumelle.

**Les correspondances de niveau ne sont pas inventées : le dépôt les porte déjà.**
`primaireNiveauSlug` rend le MÊME slug pour « Class 3 » et « CE1 » (1→SIL, 2→CP, 3→CE1,
4→CE2, 5→CM1, 6→CM2), `maternelleNiveauSlug` aligne Nursery 1/2/3 sur PS/MS/GS, et
`secondCycleClasseSlug` aligne Lower/Upper Sixth sur 1ère/Terminale — parce que les
référentiels nationaux en dépendent. `niveauPartage` les lit, et n'ajoute que la seule
équivalence qui manquait : le **premier cycle**, où FR et EN gardent volontairement des
slugs distincts (6e↔Form 1, 5e↔Form 2, 4e↔Form 3, 3e↔Form 4, et Form 5↔Seconde, fin du
O-Level). Les 14 paires sont vérifiées une à une par le test.

**Proposé, jamais imposé.** La classe du niveau équivalent est présélectionnée
(`defaultSiblingClass`) et signalée comme telle, mais toutes les classes de l'autre
sous-système du même cycle et de la même année restent proposées : une école peut
apparier autrement (effectifs, classe unique, section spéciale), et lui cacher les
autres la bloquerait. Sans jumelle au bon niveau, **rien** n'est présélectionné — mieux
vaut faire choisir que poser les matières d'un autre niveau sur une classe d'enfants.

**Rien n'est retiré d'office.** La fusion propose l'union des deux troncs ; les
recouvrements sont **nommés** (`Mathematics` ↔ `Mathématiques`, `Physical Education` ↔
`EPS`…) et l'école décoche ce qu'elle n'enseigne pas. Une matière **hors référentiel**
(Chinois, Musique, matière maison) s'ajoute librement, avec le choix de son côté donc de
son barème.

**Sur une classe qui existe déjà** — le cas des quatre classes de THE GENIUS, qui ont
leurs élèves — `completerClasseBilingue` n'ajoute **que ce qui manque** : tout libellé
déjà porté est écarté, donc aucune note existante n'est menacée et rejouer le geste ne
double rien.

**Ce qui n'a pas été fait, et pourquoi.** Aucune maquette de bulletin bilingue : l'école
imprime le même document, avec ses matières dans les deux langues. Le format officiel
`bil_officiel` (arrêté 239-23, premier cycle) reste réservé au programme bilingue
spécial, qui est un autre sujet.

**Retour arrière.** Décocher les matières ajoutées, ou les supprimer dans l'écran de la
classe. Le module est additif : rien ne dépend de lui si personne ne coche la case.

---

## D12 — Le classement choisi par l'école décide du groupe au bulletin

**Date** : 2026-10-19 · **Statut** : actif · **Suite de** D11
**Où** : `src/core/subjectGroup.js` (nouveau), `src/pages/Bulletins.jsx`
**Tests** : `src/core/_subjectGroup.test.mjs` (76 contrôles),
`src/core/_refNameMatch.test.mjs` (46 contrôles)

**Signalement.** « Je crée une matière Espagnol, je choisis Langue, et dans le bulletin
c'est dans la catégorie Autres matières. »

**Cause.** Deux taxonomies vivaient côte à côte. L'école pose un classement à la création
(`subjects.category` : sciences, informatique, langues, litteraire, eps, autre) ;
l'emploi du temps l'honorait depuis toujours (`categoryForSubject`). Le bulletin, lui, ne
l'a **jamais lu** : il rangeait les matières dans ses cinq groupes par une heuristique sur
le **nom** (`getSubjectGroup`). Le menu « Classement » n'avait donc aucun effet sur le
document qui sort de l'établissement.

**Décision.** Le classement **choisi** décide ; le nom n'est plus qu'un **repli**, pour les
matières dont l'école n'a rien dit (`category` vide = l'option « auto » du menu). Ainsi
« LMC », « EFPS », une langue nationale ou « Español » se rangent où l'école l'a dit, quel
que soit leur nom — le seul moyen fiable, puisqu'aucune liste de mots-clés ne couvrira les
noms réels de 44 établissements.

`litteraire` est le seul cas **ambigu** : il réunit, côté emploi du temps,
l'histoire-géo-philo **et** les arts (ses mots-clés portent « art », « musique »,
« dessin »), que le bulletin sépare en deux groupes. Pour celui-là seulement, le nom
tranche entre les deux, avec les sciences humaines par défaut.

**Ce que l'audit a trouvé en passant.** En faisant traverser l'heuristique par **tous** les
noms du référentiel MINESEC : **20 des 56 tombaient en AUTRES**. Les sigles officiels
(`PCT`, `ECM`, `EAC`, `ESF`) — reconnus écrits en entier, pas abrégés, alors que toute
école les abrège. Toutes les langues au-delà des cinq listées (grec, italien, chinois,
portugais). Et **deux fautes d'écriture** : `manuelle?` voulait dire « manuel ou
manuelle » mais exige deux `l`, donc « Travail manuel » n'a **jamais** été reconnu ;
`morale` ne pouvait pas reconnaître l'anglais « Moral Education ». Corrigés. Les 56 noms
officiels sont désormais classés, et une vraie matière maison (« Zumba », « Club échecs »)
tombe toujours en AUTRES — où l'école peut maintenant la reclasser elle-même.

**Pourquoi le repli n'a PAS été fusionné avec `inferCategory`.** Tentant : une seule table
de mots-clés. Mais les deux n'ont pas la même couverture — le bulletin reconnaît
« droit », « juridique », « social », « humain », « plastique », « fine arts », absents de
la table de l'emploi du temps. Les unifier aurait fait tomber ces matières en AUTRES sur
des bulletins qui les classaient bien. Le repli est donc conservé mot pour mot, et
seulement **complété**.

**Portée — étendue au second cycle et au bilingue sur demande du responsable
(« tout toucher »), mais PAS de la même façon.** Les cinq groupes ci-dessus sont une
commodité d'affichage : le classement de l'école peut donc en décider. Les GROUPE 1 /
GROUPE 2 du second cycle et les domaines d'apprentissage du bilingue, eux, sont fixés par
l'**arrêté**, série par série : laisser `category` les réécrire fabriquerait un bulletin
officiel non conforme. Le classement de l'école n'y touche donc pas, et c'est **décidé**.

Le vrai défaut de ces deux bulletins était ailleurs, et il est corrigé : ils allaient
chercher au référentiel le groupe, le coefficient et la charge horaire par **égalité
exacte du nom**. « Maths », « S.V.T », « Philo », « Hist-Géo » ne tombaient sur aucune
ligne : la matière perdait son groupe réglementaire, son coefficient officiel et sa
charge, atterrissait sous AUTRES MATIÈRES, et rien ne le signalait.
`src/core/refNameMatch.js` (nouveau) rapproche désormais par nom exact, puis sans
ponctuation, puis par préfixe, puis mot à mot — **toujours sous contrainte de
non-ambiguïté**, et sans aucun « au plus proche » : sur un document officiel, une matière
visiblement rangée à part est un défaut qui se voit et se corrige, une matière glissée
dans le mauvais groupe réglementaire est une faute qui ne se voit pas. L'écran **nomme**
celles qui restent dehors.

Deux libellés de repli étaient en outre **figés en français** (`scEngine`, `bilEngine`) :
une classe Form 1–5 lisait « AUTRES MATIÈRES » au milieu d'un bulletin anglais. Ils
suivent maintenant la langue du sous-système.

**Conséquence assumée.** Une école qui avait posé un classement voit son bulletin changer
— c'est le but : il obéit enfin. Une école qui n'en a jamais posé ne voit changer que les
matières que l'heuristique classait mal (les 20 ci-dessus).

**Retour arrière.** `subjectGroupKey` réduit à `subjectGroupFromName(subject?.name)` rend
le comportement d'avant. Aucun schéma, aucune donnée, aucune migration.

---

## D13 — L'école peut forcer le GROUPE 1 / GROUPE 2 d'une matière de second cycle

**Date** : 2026-10-20 · **Statut** : actif · **Suite de** D12
**Où** : `src/pages/Classes.jsx` (`GroupeSc`, colonne « Groupe » réservée au second cycle)
**Colonne** : `subjects.sc_groupe_ordre` — déjà présente **des deux côtés**
(`supabase_sc_minesec.sql:109`, `server/db.js:195`). **Aucune migration.**

**Décision.** Sur une classe de **second cycle uniquement**, chaque ligne de matière porte
un menu `auto / Groupe 1 / Groupe 2`. « auto » (la valeur vide, écrite `null`) rend la
décision au référentiel de la série ; un ordre posé à la main n'est **jamais** réécrit par
lui, parce que l'enrichissement du bulletin ne touche que les matières dont
`sc_groupe_ordre` est vide.

**Raison.** D12 a rendu le rapprochement par nom tolérant (`refNameMatch`), mais ce
rapprochement **refuse de deviner** : en cas d'ambiguïté, ou pour un nom qu'aucune règle
n'atteint (« Ed Civique », un intitulé propre à l'établissement), la matière reste hors
groupe et s'imprime sous AUTRES MATIÈRES. Jusqu'ici l'école n'avait **aucun levier** :
la colonne existait dans les deux schémas, et aucun écran ne la réglait. C'était le
dernier maillon manquant — l'écran **nomme** ces matières, il faut aussi pouvoir les
**placer**.

**Pourquoi ce levier-là, et pas `category`.** Les GROUPE 1 / GROUPE 2 sont fixés par
l'arrêté, série par série : le classement pédagogique de l'école (sciences, langues…) n'a
pas à les réécrire, et D12 a explicitement refusé de le faire. Ce que l'école connaît, en
revanche, c'est l'arrêté de SA série : on lui donne donc le choix **du groupe officiel
lui-même**, nommé comme sur le bulletin, et pas une correspondance devinée.

**Réservé au second cycle.** Ailleurs, « Groupe 1 / Groupe 2 » ne veut rien dire : la
colonne du tableau n'apparaît pas, et le gabarit de grille (`COLS`) suit. Ce gabarit était
recopié **quatre fois** dans le fichier ; il est désormais défini une seule fois.

**`GroupeSc` est un composant de MODULE**, pas une fonction définie dans
`ClassDetailView` : une fonction créée à chaque rendu est un type de composant neuf à
chaque rendu, donc React démonte et remonte le `<select>` — qui se refermerait sous le
doigt de l'utilisateur.

**Preuve par exécution**, sur une base SQLite **neuve** et par le vrai schéma du serveur :
`sc_groupe_ordre` et `category` présentes sans aucune migration manuelle, écriture relue
(`{"name":"Maths","sc_groupe_ordre":1}`), et retour à « auto » rendant bien `null`.
`server/_sync_contract.test.mjs` et `server/_upsert_keys.test.mjs` au vert : l'écriture
traverse la synchronisation et ne peut pas boucler en file hors-ligne.

**Retour arrière.** Retirer la colonne « Groupe » de `Classes.jsx` (et `isSecondCycle` de
`COLS`) suffit : la donnée déjà posée reste lue par le bulletin, et le référentiel reprend
la main sur toute matière dont `sc_groupe_ordre` est remis à vide.

---

## D14 — Une langue posée par l'école remplit le créneau « Langue vivante » du référentiel

**Date** : 2026-10-20 · **Statut** : actif · **Suite de** D12 et D13
**Où** : `src/core/refNameMatch.js` (`estLangueVivante`, `matchLangueVivanteSlot`,
`resolveRefRow`), appelé par les deux enrichissements de `src/pages/Bulletins.jsx`
**Test** : `src/core/_refNameMatch.test.mjs` (111 contrôles)

**Signalement.** « J'ai choisi Langue comme classement pour allemand et espagnol mais je
les vois toujours à Autres » — sur une classe de **6e–3e**.

**Ce que j'avais cru, et qui était faux.** J'ai d'abord conclu au second cycle. Le
responsable a corrigé : c'est le **premier cycle**. La bonne lecture est que le
**programme bilingue spécial** couvre lui aussi 6e–3e, et que son bulletin
(`bilEngine`) possède un bac « AUTRES MATIÈRES ». C'est le seul chemin qui produit ce
symptôme sur une 6e–3e : le bulletin APC officiel n'a pas de bac « AUTRES », et sur le
bulletin classique « Allemand » et « Espagnol » tombaient **déjà** dans LANGUES par le
nom, même avant D12.

**La cause.** Ni l'arrêté du second cycle ni l'arrêté 239-23 (bilingue) ne nomment la
langue : ils ouvrent un **créneau**, écrit « Langue vivante II » dans le référentiel du
second cycle et « Langue Vivante II (LVII) » dans celui du bilingue, que l'établissement
remplit avec l'allemand, l'espagnol, l'italien… La matière de l'école s'appelle donc
« Espagnol » et la ligne du référentiel « Langue Vivante II (LVII) » : **aucune règle de
nom ne pourra jamais les rapprocher** — ni l'égalité exacte, ni le préfixe, ni le mot à
mot de D12. Ce n'est pas un nom à reconnaître, c'est un créneau à **remplir**.

Et le classement pédagogique n'y change rien, par la décision D12 elle-même : les groupes
et les domaines de ces deux bulletins viennent de l'arrêté.

**Décision.** Une matière dont le nom est une langue vivante que l'établissement peut
poser (liste **explicite et courte** : allemand, espagnol, italien, portugais, chinois,
arabe, russe, japonais, et leurs formes anglaises) prend le créneau « Langue vivante » de
sa série, et hérite donc de son groupe/domaine, de son coefficient et de sa charge.

Latin, Grec, Anglais, Français, Littérature et les langues nationales **ne sont pas** dans
cette liste : ils portent leur propre ligne au référentiel et se rapprochent déjà par le
nom. Le nom passe toujours **avant** le créneau.

**Pourquoi c'est sûr, même quand il y a deux créneaux.** Relevé dans
`supabase_sc_referentiel_data.sql` : les **15** lignes « Langue vivante » du second cycle
se résument à **un seul** triplet — groupe `g1`, coefficient 3, charge 3. Savoir si
l'espagnol occupe le créneau II ou le III ne change donc ni le groupe, ni le coefficient,
ni la charge : les trois seules choses que l'enrichissement recopie. Rien à deviner.

**Le garde-fou le revérifie à l'exécution** : si les créneaux d'une série divergeaient
(référentiel modifié plus tard), la règle se **désactive** et la décision revient à
l'école, par le menu « Groupe » de D13. L'empreinte compare `groupe_ordre` **et**
`domaine_ordre` : le second cycle range par groupe, le bilingue par domaine — n'en
regarder qu'un laisserait le garde-fou aveugle sur l'autre bulletin.

**Retour arrière.** `resolveRefRow` réduit à `matchRefRow` rend le comportement d'avant.
Aucun schéma, aucune donnée, aucune migration.

---

## D16 — Une matière maison garde son classement sur le bulletin bilingue

**Date** : 2026-10-20 · **Statut** : actif · **Revient sur** une partie de D12
**Où** : `src/core/subjectGroup.js` (`domaineForSubject`), `src/pages/Bulletins.jsx`
(`bilEnrichedSubjects`, `bilHorsReferentiel`)
**Test** : `src/core/_subjectGroup.test.mjs` (97 contrôles)

**Demande du responsable.** « On doit pouvoir être libre de créer une matière même si ça
ne fait pas partie du référentiel, et ça doit s'afficher sur le bulletin dans sa vraie
catégorie de classement, pas aller automatiquement sur Autres matières. »

**Ce que D12 avait décidé, et pourquoi on y revient.** D12 refusait que `category` touche
aux bulletins officiels : leurs groupes viennent de l'arrêté. L'argument **tient pour le
second cycle**, dont les GROUPE 1 / GROUPE 2 sont une répartition réglementaire **sans
contenu thématique** — y ranger « Zumba » parce qu'elle est classée « EPS » n'aurait aucun
sens, et le levier y reste le menu « Groupe » (D13).

Il **ne tient pas** pour le programme bilingue : ses domaines sont **thématiques** —
« Langues et littératures », « Sciences humaines », « Sciences et technologies », « Arts
et cultures nationales », « Développement personnel ». Ils recouvrent exactement les cinq
familles du classement, et y ranger une matière maison a un sens précis. Le responsable a
maintenu sa demande après que j'aie exposé la réserve : c'est sa décision, et elle est
juste pour ce bulletin-là.

**Décision.** Sur le bulletin bilingue, une matière que le référentiel ne réclame pas est
rangée dans le domaine correspondant à son **classement**. On ne reprend du domaine que le
**nom** et l'**ordre** : le coefficient et la charge restent ceux que l'école a saisis,
puisqu'il n'existe aucun chiffre officiel pour une matière absente de l'arrêté.

Le classement `autre`, choisi explicitement, laisse la matière sous AUTRES MATIÈRES —
c'est un choix, pas un défaut. Une matière sans classement que le nom ne renseigne pas y
reste aussi, et l'avis à l'écran invite alors à lui donner un classement.

**Deux pièges, tous deux trouvés par le test et non à la relecture.**
- `/science/` tout court matche **« Sciences humaines »**, qui précède « Sciences et
  technologies » dans le référentiel : les mathématiques finissaient chez les historiens.
  Les motifs vont donc du plus spécifique au plus général.
- Le groupe `ARTS_SPORTS` **confond les arts et le sport**. Dans le sous-système
  anglophone, qui n'a **pas** de domaine « Arts », une matière artistique se rabattait sur
  « Développement personnel », le domaine du sport et du travail manuel. Chaque famille
  porte donc un ordre de **repli** explicite, et le sport est départagé des arts par le
  classement choisi quand il existe, par le nom sinon.

**Portée.** Bulletin bilingue uniquement. Le classique / APC obéissait déjà au classement
(D12). Le second cycle garde ses GROUPE 1 / 2 et son menu dédié (D13).

**Retour arrière.** Retirer l'appel à `domaineForSubject` dans `bilEnrichedSubjects` rend
le comportement d'avant. Aucun schéma, aucune donnée, aucune migration.

---

## D17 — Toute matière cochée apparaît, et l'école possède ses matières de premier cycle

**Date** : 2026-10-20 · **Statut** : actif · **Suite de** D16
**Migration** : `supabase_apc_matieres_maison.sql` — **appliquée en production le 2026-10-20**
**Où** : `src/lib/referentielEcole.js` (`addMatiereMaisonApc`), `src/store/schoolStore.js`
(`materialiserMatiereOfficielle`, `materialiserMatieresManquantes`), `src/pages/Classes.jsx`,
`src/components/grades/ApcCompetenceWorkspace.jsx`, `server/db.js`, `server/query.js`
**Test** : `src/lib/_referentielEcole.test.mjs` (52 contrôles, dont 23 neufs)

**Signalement.** « Quand je crée une matière ça ne s'affiche pas pour mettre la note et
sur le bulletin. » Puis la règle, donnée telle quelle : **« laisse toutes les matières
apparaître tant qu'elles sont créées et cochées »**.

**Cause.** Une école en moteur **officiel** lit son RÉFÉRENTIEL, pas ses lignes
`subjects`. Créer une matière dans « Modifier la classe » n'avait donc aucun effet. Le
primaire et la maternelle avaient une échappatoire — `prim_competences.school_id` et
`mat_domaines.school_id` existent, donc une école y ajoute ses lignes. Le **premier
cycle** était le seul sans issue : `apc_competences.matiere_id` est une clé étrangère vers
`apc_matieres`, qui n'avait pas de `school_id`. Une école pouvait ajouter une compétence
DANS une matière nationale, jamais une MATIÈRE.

**Décision.** `apc_matieres` et `apc_classe_matieres` reçoivent un `school_id` nullable —
le motif déjà en service sur `apc_competences`. `NULL` = national inchangé, renseigné =
maison. Créer une matière pose alors **trois** lignes : la matière, son rattachement à la
classe, et **une compétence par trimestre**. Cette troisième est celle qu'on oublie :
l'écran ne propose que les matières ayant au moins une compétence pour le trimestre
affiché — sans elles, la matière serait créée et resterait **invisible**, soit le défaut
d'origine en pire.

**Le rattrapage.** Matérialiser la seule matière qu'on vient d'ajouter ne suffisait pas :
une école a déjà les siennes (BRIGHT CONTINENT porte « Étude de texte », « Expression
Orale », « TM », « Langue Turc » de longue date). Il aurait fallu les supprimer et les
recréer, en perdant les notes saisies dessus. `materialiserMatieresManquantes` pose donc
tout ce qui manque à l'ouverture de l'écran, en une fois. Idempotente, tentée une seule
fois par classe, jamais sans le droit d'écrire — une écriture refusée repartirait en
boucle dans la file hors-ligne. Même motif que l'auto-configuration de la maternelle.

**L'avis à l'écran change de sens.** Il reprochait un nom (« corrigez-le pour qu'il
corresponde au référentiel »). Il annonce maintenant que les matières s'ajouteront seules,
et ne liste que ce que le rattrapage n'a PAS pu poser — hors ligne, ou compte sans droit.
Il disparaît de lui-même dès que ça marche.

**DEUX GARDE-FOUS, dont un que cette fonctionnalité a ouvert.**
- *Cloud* : la policy `apc ref read` était `USING (true)`. Les policies permissives se
  cumulant en OU, la laisser aurait rendu les matières maison de chaque école **visibles
  par les 43 autres**. Elle est REMPLACÉE, pas doublée. Vérifié aussi, avant d'appliquer,
  que RLS était **déjà active** : un `ENABLE ROW LEVEL SECURITY` sur une table qui n'en
  avait pas aurait enfermé le référentiel national et cassé la lecture pour tout le monde.
- *LAN* : `guardReferentielNational` ne couvrait que compétences et domaines. En ouvrant
  l'écriture sur `apc_matieres`, l'édition LAN n'aurait eu **aucun** garde : une école
  pouvait réécrire une matière nationale, que le seed aurait restaurée au redémarrage
  suivant — le travail perdu deux fois. Les deux tables y sont ajoutées.

**Portée.** Premier cycle APC. Le primaire et la maternelle savent déjà porter leurs
lignes, mais par « Modifier les compétences / les domaines » : la même porte depuis
« Matières » reste à brancher pour eux.

**Retour arrière.** Retirer les deux appels dans `Classes.jsx` et
`ApcCompetenceWorkspace`, puis les colonnes (le SQL de retour est en pied de la migration).
Les matières maison disparaîtraient avec elles — à ne faire que si l'on renonce.

---

## D18 — L'identifiant d'une matière de classe vient de (classe, nom), jamais du hasard

**Date** : 2026-10-21 (parade) · 2026-10-22 (données) · **Statut** : actif
**Migration** : aucune — le schéma n'est pas touché
**Où** : `src/store/schoolStore.js` (`idMatiereClasse`, `_normMatiere`), les sept
constructeurs de matières (`apcEngine`, `bilEngine`, `bilingualSubjects`,
`classicSubjects`, `matEngine`, `primEngine`, `scEngine`)
**Tests** : `src/core/_idMatiereDeterministe.test.mjs`, `scripts/audit-matieres-doublons.mjs`
**Incident** : voir **I10**

**Le problème.** Un `uuid()` tiré à chaque auto-configuration, et une protection contre
le doublon qui reposait sur le **cache du poste**. Un poste qui n'avait pas encore
descendu les matières reconfigurait la classe et créait une seconde série complète. 34
lignes en trop relevées en production, sur 4 écoles.

**La décision.** L'identifiant est **dérivé** de `(classe, nom normalisé)`. Deux postes
qui configurent la même classe écrivent les mêmes lignes : l'upsert les met à jour, il
n'en ajoute pas. Cela vaut **hors ligne comme en ligne**, et sans rien demander au cache —
c'est le point : aucune protection ne peut dépendre d'un cache qu'un poste neuf n'a pas.

**Ce que cela implique, et qui est voulu.** Renommer une matière change son identifiant.
L'écran ne passe donc jamais par la création : il appelle `updateSubject`, qui modifie la
ligne existante. Un renommage ne doit pas laisser une orpheline derrière lui.

**Le garde-fou est STATIQUE, et c'est délibéré.** Pour que la dérivation soit possible,
chaque constructeur doit demander son identifiant **avec le nom** : `makeId(nom)`, jamais
`makeId()`. Un seul appel nu, dans un fichier que personne ne relit, rouvrirait la porte
en silence. Le test refuse donc tout `id: makeId()` nu dans les sept fichiers, et vérifie
que le magasin ne passe plus de générateur aveugle.

**Normalisation du nom** : casse, accents, espaces. « SVT », « svt  » et « S.V.T » sont
une seule matière — c'est la même clé que l'audit emploie côté base, sinon les deux
mesures ne parleraient pas de la même chose.

**Retour arrière.** Reposer `makeId: uuid` dans `schoolStore`. À ne faire que si l'on
renonce : les doublons reviendraient au premier poste à cache vide.

---

## D19 — Le carnet du primaire vaut pour les DEUX dispositions, pas seulement la compacte

**Date** : 2026-10-22 · **Statut** : actif · **Suite de** le réglage
`schools.prim_bulletin_mode` (migration `supabase_prim_bulletin_mode.sql`, appliquée)
**Où** : `src/components/bulletins/BulletinPrimAnnualUA.jsx`, `src/pages/Bulletins.jsx`
(`primMentionsFor`)
**Test** : `src/core/_carnetPrimaire.test.mjs` (34 contrôles)

**Le problème.** `prim_bulletin_mode = 'carnet'` ajoute cinq blocs au bulletin du
primaire. Ils n'étaient câblés que sur la disposition **compacte**. Or le choix de
disposition est **automatique** par défaut : une période d'UNE unité d'apprentissage →
compacte, un trimestre (UA1-3) → détaillée. L'école qui cochait « carnet » obtenait donc
son carnet sur une UA et le **perdait** en imprimant son trimestre. Même réglage, même
classe, deux bulletins différents, et rien à l'écran pour l'expliquer.

**La décision.** Un réglage d'école vaut pour tout ce qu'elle imprime. La disposition
détaillée reçoit les **mêmes props**, depuis la même source : les six regroupements
officiels, la ligne « Travail académique » et la répartition par tranche de moyenne. La
signature du parent y était déjà, par `OfficialSignatures`.

**Un seul calcul pour un même carnet.** Les deux gabarits appellent `groupesDe` du
moteur, sur les mêmes `totalAchieved` / `totalPossible` calculés une fois dans
`primAnnualRowsFor`. Recalculer côté gabarit aurait créé deux vérités pour un même
trimestre — et c'est le genre d'écart qu'une école découvre devant un parent. Le test
compare les deux formes de ligne et exige des groupes **strictement identiques**.

**Les mentions sont lues en un seul endroit.** `primMentionsFor(student)` remplace
l'expression qui était recopiée dans le JSX : deux copies auraient divergé au premier
changement. Le test compte les occurrences — une définition, deux appels.

**Le défaut par défaut reste l'absence.** `groupes: avecGroupes = false` : une école qui
n'a rien coché reçoit exactement le bulletin d'avant, sans case vide ni ligne fantôme.
Les 42 écoles restées à `NULL` ne voient rien bouger.

**Retour arrière.** Retirer les trois props de l'appel à `BulletinPrimAnnualUA` dans
`Bulletins.jsx` : la disposition détaillée retombe sur son rendu d'avant, sans rien
perdre — le réglage ne décide que de ce qui s'imprime.
