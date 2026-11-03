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

---

## D20 — La mesure d'usage s'arrête au Cloud, et ne voit aucune donnée d'élève

**Date** : 2026-10-24 · **Statut** : en place, inactif tant qu'aucune clé n'est fournie
**Où** : `src/lib/analytics.js`, `src/lib/analyticsScrub.js`,
`src/components/AnalyticsRouteTracker.jsx`, tests `src/lib/_analytics*.test.mjs`

**Décision.** PostHog (`posthog-js`) est branché sur l'édition **Cloud uniquement**, avec
`autocapture` et le rejeu de session **coupés**, et tout ce qui part — y compris les
propriétés que PostHog fabrique lui-même — passe par un filtre maison.

**Raison, dans l'ordre d'importance.**

1. **L'édition LAN ne doit parler à personne.** Un poste d'école travaille hors ligne par
   conception ; lui faire émettre des requêtes vers un service tiers contredit l'argument
   du produit et ferait sortir de l'école des données scolaires. `IS_LAN` est une
   constante de build et l'import de `posthog-js` est **dynamique** : vérifié après
   `npm run build:lan`, **aucun fichier de `dist/` ne contient la chaîne « posthog »**.
   En Cloud, la bibliothèque part dans un *chunk* séparé (334 Ko) qui n'est téléchargé
   que si une clé existe.
2. **L'écran porte des noms d'élèves, des notes, des montants et des téléphones de
   parents.** `autocapture` envoie le texte des éléments cliqués ; le rejeu de session
   envoie l'écran. Les deux sont donc coupés, et ne doivent pas être rallumés « pour
   voir ». L'URL courante porte l'identifiant de l'élève consulté : `capture_pageview`
   est coupé aussi, et les chemins sont gabarisés (`/app/students/:id`).
3. **Une clé d'ingestion n'a rien à faire dans le dépôt.** Rien n'est écrit en dur :
   sans `VITE_POSTHOG_KEY`, le module est inerte — aucun chargement, aucun appel. Le
   repli en dur de `supabase.js` est un autre cas : c'est une clé anonyme déjà publique.

**Ce que ça interdit.** Rallumer `autocapture` ou le rejeu de session ; importer
`posthog-js` ailleurs que dans `src/lib/analytics.js` ; envoyer un nom, une adresse
e-mail, une note ou un texte libre dans les propriétés d'un événement. Les deux tests
colocalisés échouent dans chacun de ces cas — dont un qui relit **toutes** les sources de
`src/` pour vérifier qu'aucun autre fichier n'importe la bibliothèque.

**Le filtre, et pourquoi il écarte au lieu de tronquer.** `analyticsScrub.js` compare les
noms de propriété **par jeton** (jamais par sous-chaîne : « cycle » contient « cle »,
« hôtel » contient « tel » — un `includes` jetterait des propriétés anodines et on
finirait par le désactiver), écarte les valeurs qui ressemblent à un e-mail ou à un
téléphone même sous une clé anodine, et **écarte** toute chaîne de plus de 64 caractères
plutôt que de la tronquer : le début d'un texte libre, c'est souvent le nom.

**Réglages.** `VITE_POSTHOG_KEY` (absente = tout est inerte) et `VITE_POSTHOG_HOST`
(défaut `https://eu.i.posthog.com` — les écoles sont en Afrique centrale, leurs données
scolaires n'ont aucune raison de transiter par les États-Unis ; pointer ailleurs, ou une
instance auto-hébergée, se fait par cette variable). Persistance en `localStorage`, pas
de cookie : rien à demander à l'utilisateur.

**Retour arrière.** Retirer `VITE_POSTHOG_KEY` de l'environnement de build : tout
redevient inerte sans toucher au code. Pour désinstaller : `npm rm posthog-js`, supprimer
les quatre fichiers ci-dessus et les trois branchements (`main.jsx`, `App.jsx`,
`store/authStore.js`).

---

## D21 — Le barème d'un bulletin vient de la classe, sa langue n'y touche pas

**Date** : 2026-10-26 · **Statut** : appliqué dans le dépôt, non déployé
**Où** : `src/core/bulletinScale.js`, `src/pages/Bulletins.jsx` (les cinq bulletins
classiques), test `src/core/_bulletinScale.test.mjs`

**Décision.** `maxScale` et le seuil de réussite d'un bulletin se lisent dans
`classes.grade_max`. La langue de la classe (`system`) ne sert plus que de **valeur par
défaut** quand la classe ne dit rien : /20 en FR, /100 en EN, comme avant.

**Raison.** Relevé chez THE GENIUS le 2026-10-26 : FORM1 et FORM2 sont des classes
anglophones — matières saisies en anglais, programme bilingue spécial, notes sur /20 —
mais portaient `system = 'FR'`. Leur bulletin sortait donc entièrement en français, alors
que **tout le cadre est déjà bilingue dans le code** (`APC_GROUPS` porte « SCIENCES
EXACTES / EXACT SCIENCES » et n'affiche que la moitié du système de la classe). Les
basculer en `'EN'` aurait corrigé la langue **et multiplié les notes par cinq** : les cinq
bulletins classiques écrivaient `maxScale = sys === 'FR' ? 20 : 100`. Un 10/20 serait
sorti 50. La langue et le barème sont deux choses distinctes — une classe anglophone du
Cameroun note sur /20 comme sa jumelle francophone, c'est le programme bilingue qui le
veut — et `classes.grade_max` existe précisément pour porter le barème de sortie. Le
moteur bilingue le lisait déjà (`core/bilEngine`) ; les bulletins, non.

**Ce que ça change ailleurs**, mesuré sur les 282 classes de la plateforme (lecture
seule) : 112 FR sans barème, 84 FR/20, 32 EN sans barème, 23 ES, 15 EN/100 — **rien ne
bouge** (la classe ne dit rien, ou dit exactement le défaut de son système). Changent :
**8 classes EN réglées /20** (2 écoles) et **6 classes FR réglées /10** (4 écoles), qui
obtiennent enfin le barème qu'elles avaient demandé ; et **2 classes FR réglées /100**
(FORM1, FORM2) qui passeraient à /100 — **celles-là sont mal réglées**, leurs notes sont
/20, et leur `grade_max` est à corriger en même temps que leur système.

**La conversion des notes suit la même règle.** `BulletinAPC` ne convertissait que selon
la LANGUE (« si FR, ne rien convertir ») : une matière saisie /100 sur une classe FR
s'imprimait brute sur un bulletin /20. Elle se fait maintenant du barème de **saisie**
(`subjects.max`) vers celui de l'**impression**, et ne touche à rien quand les deux
coïncident — le cas courant. Vérifié avant de changer : les 132 matières dont le barème
diffère de celui de leur classe portent **0 note** aujourd'hui, donc aucun bulletin déjà
imprimé ne change de chiffre.

**Ce que ça interdit.** Redéduire un barème ou un seuil de `sys` dans un bulletin. Le
test colocalisé fige les deux défauts (FR → /20 seuil 10, EN → /100 seuil 50) et les
valeurs aberrantes (`0`, négatif, illisible → défaut, jamais une division par zéro).

### D21 bis — corrigé le même jour, avant livraison

Deux fautes dans D21 tel qu'écrit plus haut, trouvées en cherchant des marqueurs pour
le script de déploiement de la 0.3.24 — et non par un test, ce qui est le point à
retenir.

**1. La règle existait déjà.** `classScale(cls, school)`, dans `src/lib/useCountry.js`,
disait exactement la même chose — `grade_max` sinon le défaut du système — et existait
AVANT `core/bulletinScale`. Elle a été écrite deux fois faute d'avoir cherché. Elle
n'est pas supprimée (`honorRollEngine` l'appelle) : elle DÉLÈGUE désormais au module
pur, et le test rejoue sa table de vérité d'origine pour prouver que la délégation ne
change le barème d'aucune école.

**2. Le correctif ne couvrait qu'un endroit sur huit.** Le même
`sys === 'FR' ? 20 : 100` était recopié dans **sept autres** fichiers : fiche élève,
portail parent (deux fois), rapports de classe (deux fois), modèle PDF de bulletin,
les deux blocs du tableau de bord, et `server/rpc.js` (portail parent côté LAN). Livrer
D21 seul aurait donné, pour FORM1 et FORM2 réglées /20, un bulletin juste et un tableau
de bord, une fiche élève et un portail parent qui annoncent encore /100 : la même note
affichée de deux façons selon la page. Les huit lisent maintenant la même règle.
`server/rpc.js` la redit en trois lignes, avec sa référence : le paquet LAN ne copie pas
`src/core` (seuls `src/lib`, `src/governance`, `src/domains`), et `classScale` vit dans
un module qui importe React.

**3. Conséquence mesurable, à confirmer avec l'école concernée.** La Guinée Équatoriale
était incohérente et ne l'est plus : les cinq bulletins classiques imprimaient une
classe ES sur **/100** alors que la même page déclarait admis à **5**
(`geGradeMax(school) / 2`), et que les notes y sont saisies sur /10 ou /20
(`SubjectTeacherWorkspace` lit déjà `geGradeMax`). Le barème ES suit désormais le pays :
/10 par défaut, /20 si l'école l'a réglé. **23 classes** changent d'affichage — aucune
au Cameroun, donc aucun paquet LAN concerné, mais à annoncer avant le déploiement Cloud.

---

## D22 — Une matière déjà portée sous un autre nom n'est pas reproposée

**Date** : 2026-10-26 · **Statut** : appliqué dans le dépôt, non déployé
**Où** : `src/core/bilingualSubjects.js` (`SYNONYMES`, `memeMatiere`,
`missingBilingualSubjects`, `mergeFromSiblingClass`), test colocalisé

**Décision.** Le rapprochement « cette matière manque-t-elle à la classe ? » se fait par
**enseignement**, pas par libellé exact. Des groupes de synonymes curatés disent que
« ICT », « Computer Studies » et « Computer Science » nomment la même chose.

**Raison.** Relevé chez THE GENIUS le 2026-10-26 : FORM1 et FORM2 portaient quatre
matières en double. L'école avait saisi les siennes — **ICT** (41 et 15 notes),
**Literature in English** (21 et 17), **ML** — et « Ajouter le programme manquant » avait
posé **à côté** les libellés officiels — Computer Science, English Literature, Manual
Labour — **vides**. Le bulletin imprimait donc les deux lignes, la copie en « ABS ».
L'école décochait la copie ; la bannière la reproposait au geste suivant, parce que
`missingBilingualSubjects` comparait les **libellés exacts** : « ICT » n'est pas
« Computer Science », donc elle la croyait absente, indéfiniment. C'est le « on décoche
et ça revient toujours » signalé par l'école.

**Volontairement d'un seul côté à la fois.** Chaque groupe ne contient que des libellés
d'un **même sous-système**. « Français intensif » et « French Language » n'y sont **pas**
ensemble : une classe bilingue peut légitimement enseigner les deux, et c'est le rôle de
la table `EQUIVALENCES` (déjà là) de le **signaler** à l'école sans trancher à sa place.
Regrouper les deux langues ici déferait la fusion bilingue de D17.

**Ce que ça ne fait pas.** Rien n'est renommé, fusionné ni supprimé : les matières en
place et les notes qui y pendent sont hors d'atteinte. Le seul effet est de **ne plus
proposer** ce que la classe porte déjà. Les matières réellement absentes restent
proposées — le test le vérifie dans les deux sens, y compris pour la fusion depuis la
classe jumelle.

---

## D23 — Zéro est une valeur : une colonne ouverte à la main se referme à la main

**Date** : 2026-10-26 · **Statut** : appliqué dans le dépôt, non déployé
**Où** : `src/core/primColumnBareme.js` (`notesSaisies`),
`src/components/grades/PrimCompetenceWorkspace.jsx` (`BaremeCell`, `setBareme`),
test colocalisé

**Décision.** Dans la saisie du primaire, poser **0** sur le barème d'une colonne
(Oral, Écrit, Pratique, Savoir-être) signifie « cette école ne pose aucun barème ici »
— donc **retour au barème officiel du référentiel**. Pour un critère que le national
ignore, cet officiel vaut zéro : la colonne se **referme** et retrouve son repère « à
définir ». Pour un critère officiel, le même geste rend sa colonne au barème MINEDUB.
Une seule règle, deux effets justes.

**Raison.** Signalé par l'école le 2026-10-26, essayé sur « Pratique » : « quand je
change le barème et que j'essaie de revenir à zéro, ça refuse ». C'était exact et le
refus était **muet**. Depuis que les quatre critères officiels sont tous proposés, un
critère sans barème national naît à **zéro** (`points_max: 0`, `aNoter`) — « Pratique »
sur 1A, 1B et 2A. L'école pouvait donc l'**ouvrir** en posant son chiffre, mais jamais
le refermer : `BaremeCell` rejetait `n <= 0` et **remettait l'ancienne valeur sans un
mot**. Un écran qui annule le geste sans rien dire se lit comme une panne.

**Pourquoi ça ne s'écrit pas `0` en base.** `prim_notes.points_max` porte
`CHECK (points_max IS NULL OR (points_max > 0 AND points_max <= 200))` : zéro y est
refusé par le schéma lui-même, en LAN comme en Cloud. « Revenir à zéro » s'écrit donc
**NULL**, que le même schéma définit déjà comme « le barème officiel du référentiel ».
Aucune migration, aucune contrainte à desserrer : la valeur de retour existait déjà,
c'est le chemin pour y revenir qui manquait.

**Ce qui reste refusé, et dit.** Refermer une colonne qui porte une saisie. Baisser un
barème rend une note **fausse** (18/20 → 18/10) ; refermer la colonne la rend
**invisible** — elle resterait en base sans colonne pour la montrer. Le filtre de la
remise à zéro (`notesSaisies`) est pour cela plus large que celui de la baisse
(`notesHorsBareme`) : il compte aussi le **zéro saisi** et l'**ABS**, qui sont des
saisies et non des cases vides. Le message nomme les élèves concernés, comme pour la
baisse de barème.

**Hors périmètre.** L'écran du premier cycle (`ApcCompetenceWorkspace`) garde son refus
de zéro : son barème par défaut est /20, jamais zéro, et son moteur ne connaît pas la
notion de compétence non notée. Rien à y refermer, donc rien à y changer.

## D24 — Une panne se lit à l'écran, ou elle n'existe pour personne

**Date** : 2026-10-27 · **Statut** : appliqué dans le dépôt, non déployé
**Où** : `src/components/AppErrorBoundary.jsx` (nouveau), `src/main.jsx`

**Décision.** L'application porte désormais un **garde-fou de rendu** (`ErrorBoundary`)
autour de la racine. Quand une exception traverse le rendu, l'écran affiche en français
qu'il y a une panne, **le message d'erreur**, **la version que le serveur annonce**, un
bouton **Copier** qui met le tout dans le presse-papier, et deux sorties : recharger, ou
revenir à la connexion.

**Raison.** Une recherche de `ErrorBoundary` dans `src/` ne rendait **rien** : il n'y en
avait aucun, nulle part. Or React démonte l'arbre **entier** quand le rendu jette — il ne
reste pas un mot, pas un bouton, pas un code. C'est exactement ce que l'école a décrit le
2026-10-27 (I25) : « la page reste blanche, sur n'importe quel poste ». Personne sur place
n'a de raison de savoir ouvrir la console du navigateur, et sans elle il n'y avait
**strictement rien** à transmettre. Le défaut était peut-être petit ; l'absence de filet,
elle, a coûté le diagnostic.

**La version du serveur est sur l'écran, et ce n'est pas un détail.** C'est la question
qu'on pose à chaque incident, et celle qui a déjà tranché I8 : sous Windows, l'installeur
ne redémarre pas le service, donc les **fichiers** sont neufs pendant que le serveur **en
mémoire** est l'ancien. « Installé » ne veut pas dire « appliqué ». L'écran de panne
interroge `/api/version` et affiche ce que le serveur **annonce** — pas ce que le disque
porte. En édition cloud la route n'existe pas : l'échec est silencieux, l'écran s'affiche
sans.

**Ce qu'il ne fait pas, volontairement.** Il **ne vide aucun stockage** et **ne déconnecte
personne**. La file de synchronisation hors ligne vit dans le navigateur du poste : un
écran d'erreur qui « nettoie » ferait perdre des saisies que l'école n'a pas encore vues
partir — ce que la règle cardinale du module de synchronisation interdit. « Revenir à la
connexion » ne fait que changer d'adresse.

**Deux phrases, pas une.** Un morceau d'application non téléchargé (serveur redémarré
pendant que l'onglet était ouvert, `dist` remplacé sous les pieds) se répare par un
rechargement : il a sa propre phrase, et on ne demande pas à une école de nous signaler ce
qu'elle résout elle-même en dix secondes. Un défaut de programmation, lui, demande le bloc
copié. Le filet complète le rattrapage `vite:preloadError` de `src/main.jsx`, qui
recharge **une fois** ; quand ce rattrapage ne suffit pas, c'est le filet qui parle.

**Ce que ça ne corrige pas.** Rien. Ce composant ne répare aucun défaut : il rend la panne
**lisible**, donc transmissible, donc réparable. C'est le seul objectif.

## D25 — Une valeur calculée voyage avec sa ligne, elle ne se recalcule pas à l'affichage

**Date** : 2026-10-27 · **Statut** : appliqué dans le dépôt, non déployé
**Où** : `src/components/dashboard/AcademicBlocks.jsx` (`useAcademicStats`,
`ClassTable`), test colocalisé `_variablesLibres.test.mjs`

**Décision.** Le barème d'une classe est calculé **dans le hook qui produit la ligne de
statistiques**, où le réglage d'école est en portée, et transporté sur cette ligne
(`maxScale`, `passThreshold`). Le composant qui affiche ne recalcule rien : il lit.

**Raison.** `ClassTable` appelait `geGradeMax(school)` sans recevoir `school` — une
variable libre, « school is not defined », page blanche pour tout administrateur (I26).
La règle ci-dessus rend la faute **impossible à réécrire** : il n'y a plus de calcul dans
le composant d'affichage, donc plus de contexte à oublier. Ce n'est pas qu'une parade,
c'est aussi le bon découpage — le barème est une propriété de la statistique, pas de la
table HTML qui la montre.

**La portée d'un fichier à PLUSIEURS composants n'est pas celle qu'on lit.** C'est le
piège exact : `school` était à trois lignes au-dessus, dans le même fichier, et dans une
AUTRE fonction. Huit des neuf sites de D21 bis étaient dans des fichiers à un seul
composant, où « porter la même ligne » marchait.

**Garde-fou, et ce qu'il ne remplace pas.** `_variablesLibres.test.mjs` vérifie, sans
aucune dépendance nouvelle, que les onze écrans qui lisent `school` le reçoivent, et il
s'auto-vérifie sur le source fautif. **Ce n'est pas un linter** : il ne couvre qu'un
identifiant et qu'une liste de fichiers. Le vrai remède reste `no-undef`, c'est-à-dire
ESLint — à poser, mais pas dans un correctif d'urgence, et pas sans décision (une
dépendance d'outillage et une passe sur tout le dépôt ne s'improvisent pas un jour de
panne). Voir le point ouvert de PROJECT_STATUS.

## D26 — Le référentiel national propose quatre critères ; l'école dit lesquels elle évalue

**Date** : 2026-10-27 · **Statut** : appliqué dans le dépôt, **migration Cloud non appliquée**
**Où** : `supabase_prim_criteres_masques.sql`, `server/schema.sql`, `server/db.js`
(`TABLES_AUTORISEES`), `src/core/primEngine.js` (`criteresForCompetence`,
`niveauPointsTotal`), `src/lib/referentielEcole.js` (`REF_ECOLE.prim_crit`),
`src/store/schoolStore.js`, les quatre écrans qui lisent les critères, test colocalisé
`src/core/_primCriteresMasques.test.mjs`

**Décision.** Une école peut **masquer** un critère d'évaluation du primaire (Oral, Écrit,
Pratique, Savoir-être) pour elle seule. Le masque retire la colonne de la saisie, du
bulletin, du rapport de classe et du PV — **et ses points du barème**. Il est réversible et
ne touche aucune note.

**Raison.** `prim_criteres` est NATIONALE : les quatre colonnes s'imposaient aux 44 écoles.
THE GENIUS a signalé le 2026-10-27, sur ses cinq niveaux : « c'est uniquement l'écrit, il
n'y a pas de pratique et de l'oral ». Ses bulletins CM1 et CE2 BIL sortaient avec trois
colonnes qui ne seraient jamais remplies, et **rien ne permettait de les retirer** : **D23**
ne sait refermer qu'un critère que le national **ignore**, jamais un critère officiel. Le
geste manquait, pas le réglage.

**Pourquoi les points partent avec la colonne.** Une colonne qui ne sera jamais interrogée
ne peut pas rester au dénominateur : chaque élève plafonnerait sous la note qu'il mérite.
La compétence 1A du SIL passe donc de 40 points (Oral 20 + Écrit 15 + Savoir-être 5) à 15
si l'école ne garde que l'écrit. L'école repose ensuite **ses** barèmes colonne par
colonne, par le chemin que D23 a ouvert.

**Ce que ça n'est PAS.** `supabase_prim_competences_par_ecole.sql` avait écarté l'ouverture
de `prim_criteres` — « les rendre modifiables demanderait de revoir primEngine, pas
seulement une policy ». Cette décision reste **en deçà** : la table nationale ne reçoit ni
`school_id`, ni droit d'écriture, ni critère maison. Seul un **masque par école** s'ajoute,
même mécanique que `prim_competences_masques`, en production depuis la 0.3.20.

**Conséquence sur la synchronisation : aucune.** `prim_criteres_masques` est **hors de
`SYNCED_TABLES`**, comme ses trois tables sœurs : un masque est un réglage d'affichage
local, il ne monte ni ne descend. Aucune colonne n'est ajoutée à une table synchronisée,
donc le piège de **D1/B1** — une colonne inconnue du Cloud qui fait refuser la ligne
entière — ne s'applique pas. En revanche la migration Cloud doit être appliquée **avant**
que l'écran ne serve en ligne, sinon le masque échouera silencieusement côté Cloud.

**Effet de bord corrigé au passage.** `loadPrim` charge désormais les masques, comme
`loadMat` le faisait déjà. L'écran « Rapports » les **lisait sans les charger** : ses
moyennes dépendaient donc de l'écran visité auparavant.

**Comment revenir en arrière.** Démasquer depuis « Critères évalués » rend toutes les
colonnes et tous les points ; les notes n'ayant jamais été touchées, l'état d'avant revient
entier. Pour défaire la fonctionnalité elle-même : `DROP TABLE public.prim_criteres_masques`
et retirer `prim_crit` de `REF_ECOLE` — les cinq appels à `criteresForCompetence`
retombent sur leur paramètre par défaut `masques = []`, qui ne masque rien.

## D27 — Une épreuve de l'école appartient à une famille du carnet, et l'école le dit

**Date** : 2026-10-27 · **Statut** : appliqué dans le dépôt · **Aucune migration**
**Où** : `src/core/primCompactRows.js` (`groupesDe`, `FAMILLES_PRIMAIRE`, `familleLabel`),
`src/store/schoolStore.js` (`setRefFamille`), `src/components/grades/ReferentielEditor.jsx`
(props `familles` / `familleDe` / `onSetFamille`),
`src/components/grades/PrimCompetenceWorkspace.jsx`, test colocalisé
`src/core/_primFamillesMaison.test.mjs`

**Décision.** Une compétence MAISON du primaire porte désormais une **famille**, choisie par
l'école à l'écran — à l'ajout, et après coup sur une ligne déjà créée. Elle est rangée dans
la colonne `domaine`, qui existait déjà des deux côtés. `groupesDe` relie le `domaine` au
NUMÉRO de la famille, et le total de la famille additionne enfin tout ce qui s'imprime
sous elle.

**Le défaut, relevé sur un bulletin réel.** Le CM1 de THE GENIUS (2025/2026, capture du
2026-10-27) porte six épreuves ajoutées par l'école : Dictée-Question, Étude de texte,
Production d'écrits, Calcul Rapide, Problèmes, Connaissances générales — plus « CHINOIS ».
Elles s'imprimaient, et elles comptaient dans le total général et la moyenne générale.
Mais elles **manquaient au total de leur famille** : sur le cas reproduit, la famille 1
écrivait `107/120` là où les six lignes imprimées au-dessus font `194/220`. **87 points
obtenus et 100 points de barème** disparaissaient d'un sous-total remis aux parents. Un
carnet qui ne s'additionne pas n'est vérifiable par personne.

**Pourquoi une ligne maison n'avait pas de famille.** `groupesDe` regroupe par le chiffre du
code (« 1A » → famille 1). `codeMaison` **refuse** de produire un code commençant par un
chiffre — à dessein, pour qu'on ne confonde jamais une ligne de l'école avec un code du
ministère : « Dictée - Question » devient « DQ ». Il ne restait donc aucun rattachement, et
`addRefLigne` n'a jamais renseigné `domaine`.

**Pourquoi poser `domaine` ne suffisait pas.** La clé de regroupement d'une nationale est
`num:1`, celle d'un domaine était `langues` : deux clés pour une seule famille. Le carnet
imprimait alors **deux fois** le bandeau « 1) COMMUNIQUER EN FRANÇAIS… », chacun avec un
bout du total — le même genre d'écart que `reperesDeGroupe` venait de fermer, par un autre
chemin. `groupesDe` **apprend donc des lignes** quel domaine porte quel numéro : 1A porte
`langues`, donc `langues` est la famille 1. Si le ministère renumérote ses familles, le
rattachement suit sans qu'on y touche — rien n'est codé en dur.

**Ce qu'on refuse.** Déplacer une ligne **nationale** : son domaine vient du ministère, et
la changer fausserait le carnet des 44 écoles. `setRefFamille` renvoie `'nationale'`, et la
RLS refuserait de toute façon. Et un domaine qu'aucune nationale ne porte garde **son
propre groupe** : une école qui range ses épreuves ailleurs n'est pas absorbée de force
dans une famille qui n'est pas la sienne.

**Aucune migration.** `prim_competences.domaine` existe déjà au Cloud comme en LAN, et la
policy d'écriture de `supabase_prim_competences_par_ecole.sql` couvre déjà la mise à jour
d'une ligne dont `school_id` est le sien. **Rien à appliquer en base.**

**L'école n'a pas besoin de SQL.** Les lignes déjà créées — les sept de THE GENIUS — se
rangent depuis l'écran, en sept clics. Tant qu'elles ne le sont pas, un bandeau ambre les
nomme et dit exactement ce qui se passe : « elles s'impriment et comptent dans le total
général, mais elles manquent au total de leur famille ».

**Comment revenir en arrière.** Remettre la famille à « — sans famille — » rend l'état
d'avant, ligne par ligne. Pour défaire la fonctionnalité : retirer `familles` du montage de
`ReferentielEditor` (l'éditeur reprend son comportement d'avant, celui que la maternelle et
l'APC gardent déjà), et rendre à `groupesDe` sa clé `r.domaine` au lieu du numéro appris.
Aucune donnée n'est perdue : `domaine` reste écrit.

---

## D28 — Un gabarit d'impression porte le contrat de densité, ou il n'est pas imprimable

**Date** : 2026-10-29 · **Contexte** : I27, le bulletin primaire sur deux pages depuis
trois mois.

**La décision.** Tout gabarit que l'application peut envoyer à l'imprimante porte le
contrat de densité : classe `nc-densite` sur sa feuille (`OfficialSheet … vars`) et
**aucune taille écrite en dur** — tout dérive de `--nc-d`. Un gabarit qui ne le porte pas
est un gabarit qu'on n'imprime pas.

**Pourquoi.** Le contrat n'avait été posé que sur `BulletinPrimCompact`. Or le choix du
gabarit dépend de la **période** : « Auto » ne retient le compact que pour une seule unité
d'apprentissage. Dès qu'une école imprimait un trimestre, `BulletinPrimAnnualUA` rendait —
sans une variable. `ajusterDensite` ne trouvait aucune feuille, ne réduisait rien, et
**rendait un bilan vert**. Le défaut était donc invisible depuis le code *et* depuis les
bancs : il ne se voyait qu'à l'imprimante de l'école.

**Ce qui le verrouille.** `src/components/bulletins/_primDetailDensite.test.mjs` rend le
composant réel et refuse toute `font-size` numérique dans la feuille. Il a échoué à sa
première exécution et a trouvé trois tailles oubliées dans `bulletinOfficialParts` — le
genre de preuve qu'on ne peut pas obtenir en relisant.

**Ce qu'on refuse.** Rendre `vars` obligatoire pour tout le monde d'un coup : les six
autres modèles (secondaire, maternelle, bilingue) n'ont pas de variables dans leur mise en
page et gardent leur réduction `zoom` (`fitLiveSheets`). Chaque changement reste
**conditionné à `vars`** : un gabarit qui ne le demande pas ne bouge pas d'un pixel. Le
jour où l'un d'eux prend le contrat, il lui suffira de demander `vars`.

**Ce qu'on refuse aussi : faire tenir l'intenable.** La vue « Détaillée par UA » imprime un
tableau par compétence — onze tableaux, **1 827 px mesurés pour 1 043 px utiles** au
plancher lisible de 7 pt. Aucune densité ne la fera tenir sur une page. On ne l'écrase
donc pas jusqu'à l'illisible : elle descend au plancher et **l'écran le dit**, en nommant
le remède (« Compacte »). C'est la règle déjà posée pour le plancher — avertir plutôt
qu'écraser — appliquée là où elle mord.

**Ce qui reste à l'école.** Le choix de la disposition. « Auto » continue de préférer la
vue détaillée sur une période multi-UA, parce que les deux vues ne portent pas la même
information : la détaillée montre **chaque UA séparément**, la compacte les totaux de
période. Changer ce défaut n'est pas une correction technique, c'est une décision de
produit — elle appartient au responsable, pas au correctif. En attendant, le libellé
annonce le coût : « vue détaillée **(2 pages par élève)** ».

**Comment revenir en arrière.** Retirer `vars` des quatre appels de
`BulletinPrimAnnualUA` : le gabarit reprend ses tailles figées et son comportement d'avant.
Les modifications de `bulletinOfficialParts` sont inertes sans `vars`.

## D29 — Le programme d'une ligne se lit sur sa matière, jamais sur son intitulé

**Le constat.** Sur les sept bulletins papier de THE GENIUS photographiés le 2026-10-29,
six rangent les compétences sous les six familles du MINEDUB. Le septième — « Class 2/CP »,
une classe **bilingue** — ne les range pas comme ça : il coupe la liste en **deux blocs de
programme**, chacun avec son total, sa moyenne et sa cote, puis donne le total général.

```
…lignes anglophones…      English   Total: 242   Average: 17.29/20
…lignes francophones…     French    Total: 260   Average: 18.57/20
Total                     502 / 560                        Grade: A
```

242 + 260 = 502 : le document se vérifie lui-même. Les six familles ne donnent pas cette
lecture, parce qu'une famille mélange les deux programmes.

**La décision.** `src/core/primProgramme.js` découpe les lignes en deux blocs de programme
— plus un bloc résiduel. Le gabarit dessine le **même bandeau** que pour une famille :
c'est une variante de regroupement, pas un second bulletin.

**Ce que le banc a corrigé.** La première version classait chaque ligne d'après la **langue
de son intitulé**. Montée sur l'édition LAN et ouverte dans Chrome (CP BIL, 19 matières,
les deux troncs), elle n'a produit **aucun bloc**. La cause se lisait à l'écran :

```
[1A] [Communicate in French]      [1B] [Communicate in English]
```

Les compétences nationales sont stockées en français et **traduites à l'affichage**
(`referentielI18n.primCompetenceLabel`) : sur un bulletin anglophone, les onze s'écrivent
en anglais, et tout tombait du même côté. **Un intitulé de ligne ne dit pas le programme,
il dit la langue du document.**

**Ce qui le dit vraiment.** La **matière** qui a réclamé la compétence. `refClassScope`
applique déjà une règle écrite et testée : « la première matière, dans l'ordre de la
classe, qui réclame une compétence la garde ; les suivantes reçoivent leur propre
compétence maison ». On la **rejoue**, avec la même fonction de rapprochement
(`competenceIdForSubject`), et une matière appartient à l'un des deux troncs officiels du
niveau, que `classicSubjects` porte déjà dans les deux langues. Rien n'est deviné : on
relit une attribution que le produit a faite.

**Aucun réglage, aucune migration.** `bilingualSubjects` pose déjà le principe — « la
liste des matières EST la marque du bilinguisme ». Une classe dont les lignes relèvent
d'un seul tronc rend `[]`, et le carnet garde ses six familles. Mesuré sur l'écran réel :
classe monolingue → six bandeaux, 1 page, inchangé.

**Le troisième bloc, qui n'est pas sur le papier.** Deux sortes de lignes n'appartiennent à
aucun programme : les matières d'aucun tronc (« Chinois ») et les compétences nationales
qu'aucune matière de la classe ne réclame. Les ranger de force serait un faux. Elles vont
donc dans « Autres matières » — et **c'est ce qui fait tenir l'addition** : sans ce bloc,
elles comptaient dans le total général sans figurer nulle part, et un parent qui additionne
les deux blocs ne retombait pas sur le total. Mesuré : 143,2 + 173,1 + 66 = **382,3**, le
total imprimé.

**Ce qu'on refuse.** Une colonne `programme` en base, et un quatrième mode de carnet. Le
carnet papier de l'école est le **même document** pour CE1 (monolingue, six familles) et
pour Class 2/CP (bilingue, deux blocs) : c'est la classe qui diffère, pas le réglage.

**Le coût, mesuré.** Une classe bilingue porte les deux troncs. En « une ligne par
épreuve », 19 matières font **1 084 px pour 1 043 px utiles**, densité déjà au plancher →
2 pages (contre 1 116 px avec les six familles : le découpage par programme en fait gagner
32, pas 41). En « critères en colonnes », la même classe tient sur **une page**
(densité 0,53). Le paysage ne sauve rien (1 073 px pour ~700 px utiles).

**Comment revenir en arrière.** Ne plus passer `programmes` à `BulletinPrimCompact` : le
gabarit reprend `groupesDe` et les six familles. `primProgramme.js` devient inerte.

## D30 — Le bas du carnet se dérive du travail de l'élève, mais ne s'écrit jamais tout seul

**Le reproche, mot pour mot.** Les cinq champs du bas du carnet — « Appréciation »,
« Avertissement conditionnel », « Tableau d'honneur », « Encouragement »,
« Félicitations » — devaient **« varier »**, et « **en fonction du travail de l'élève** ».

**Trois défauts réels, mesurés avant d'écrire.**

1. **« Félicitations » ne s'imprimait nulle part.** `getAbsCond` relit `__felicitation__`
   depuis toujours, l'écran Conseil de classe la saisit, `student_absences.felicitation`
   la stocke des deux côtés — mais aucune des deux dispositions du carnet ne la portait.
   Un élève félicité par son conseil recevait un carnet muet là-dessus, alors que quatre
   des sept photos du carnet de l'école la portent.
2. **L'« Appréciation » ne pouvait pas varier.** Elle valait `primCoteLabel(cote)`, donc
   le libellé de la **cote** : tous les élèves d'une même cote recevaient mot pour mot la
   même appréciation (« Enfant Expert »), quand le papier porte « Excellent », « Very
   good ». Et aucun champ ne permettait d'y toucher : `AppreciationEditor` existait, avec
   sa colonne en base, mais n'était affiché que pour les bulletins APC — jamais pour le
   carnet du primaire.
3. **Rien ne liait le bas du carnet au travail de l'élève.** Le conseil cochait à la main,
   sans aucune indication.

**La règle retenue.** Le travail de l'élève **PROPOSE**, le conseil **ÉCRIT**. Un moteur
pur (`src/core/conseilPropositions.js`) ramène la moyenne en pourcentage de son barème —
la normalisation du moteur des tableaux d'honneur, `score = moyenne / barème`, donc une
seule règle pour le /20 francophone, le /100 anglophone et le /10 de GE — puis en déduit
les cinq champs. L'écran affiche la proposition **à côté** du champ, avec un bouton
« Appliquer » ; sans ce clic, rien ne change et le bulletin n'imprime que la saisie. C'est
mot pour mot la convention d'`AutoHint` pour les sanctions de Vie scolaire : « jamais
d'écrasement silencieux ». La règle du dépôt tient donc — « ne jamais inventer de notes,
moyennes, cotes, rangs ou mentions » : rien d'inventé n'atteint le papier sans décision
humaine.

**Les quatre seuils ne sont pas des nombres choisis là.** Chacun reprend une borne que le
produit utilise déjà, pour qu'un élève ne soit pas « Très Bien » sur son bulletin et hors
des félicitations au conseil : **50 %** = le seuil de réussite (`clsStat` : barème / 2) ;
**60 %** = la borne « Assez Bien » de `frApp` (12/20) ; **70 %** = « Bien » (14/20), et le
`minAvgPct` du tableau « Élèves méritants » ; **80 %** = « Très Bien » (16/20), le
`minAvgPct` du tableau d'excellence, et le `scale * 0.8` de l'analyse du conseil. Une
école qui veut d'autres bornes les passe en `seuils` — rien n'est figé, rien n'est en
double.

**L'appréciation vient de l'échelle de l'école**, `school.grade_scale` via
`getAppreciation`, jamais d'une table parallèle. Avec un piège mesuré : `enGrade` lit un
**pourcentage**, et le carnet du primaire est sur 20. Sans la mise à l'échelle, 17,29/20 —
le meilleur élève de la classe — ressortait **« Fail »**. Un test de non-régression garde
la conversion.

**Mesuré sur l'édition LAN montée, Chrome piloté.** Carnet bilingue CP BIL BANC, mode
`carnet_epreuves`. Avant : `Appreciation | Achieved`, et les quatre distinctions à `no`.
Bandeau : « Based on their work (79,9 %) ». Après « Appliquer » : `Appreciation | Very
Good`, `Honour roll yes`, `Commendation yes`, `Congratulations no` — 79,9 % passe sous les
80 %, et le seuil fait son travail. Après rechargement, les valeurs sont relues **en
base**. La feuille fait toujours **1 046 px, 1 page** (`--nc-d 0`, fit 0,962) : le
correctif de pagination de D29/I29 n'est pas entamé.

**Et ça varie.** Les onze élèves du banc : 70 % → « Good » + honneur + encouragement ;
79 % → « Very Good » ; 80,3 % → « Excellent » + félicitations. Les cinq élèves de 6eme A
au Conseil de classe : 83 % → Acquis + les trois distinctions ; 71 % → Acquis + deux ;
60 % → En cours d'acquisition + une ; 52 % → aucune ; 39 % → Insuffisant + avertissement.
Cinq élèves, cinq bas de bulletin différents.

**Un seul enregistrement par clic.** `lotConseil` rend le lot complet, et l'écran appelle
`saveGrade` **une fois** : cinq appels successifs auraient mis cinq éléments dans la file
de synchro hors ligne, où le dernier lu peut écraser les précédents.

**Ce qu'on refuse.** Écrire les cinq champs d'office à l'ouverture du bulletin. Une
appréciation écrite par l'enseignant ne disparaît jamais sous une mention calculée : le
bandeau la **signale**, il ne la remplace pas, et appliquer une autre distinction ne
touche pas le texte. Une proposition d'appréciation vide n'est jamais un écart — elle
n'effacerait qu'un texte que l'école a écrit.

**Le coût de place.** La ligne de synthèse du carnet compact compte **huit colonnes**, et
les trois paires d'alors les occupaient déjà toutes avec l'en-tête « Travail académique ».
L'en-tête part : c'est un nom de rubrique, pas une donnée, le carnet papier ne le porte
pas, et les quatre paires tiennent alors exactement. La disposition détaillée par UA a son
propre tableau, sans grille à respecter : la quatrième paire s'y ajoute sans rien déplacer.

**Comment revenir en arrière.** Ne plus passer `proposition` à `AppreciationEditor` et
`prop` à `DecisionAssistant` : les deux écrans reprennent la saisie nue.
`conseilPropositions.js` devient inerte. Pour l'appréciation, remettre
`appreciationGenerale={d.appreciationGenerale}` : le carnet retrouve le libellé de la
cote. Pour « Félicitations », retirer `mentions.felicitation` des deux gabarits.

## D31 — Le droit d'écrire se lit sur la table qu'on écrit, et il rend un périmètre

**La règle.** Un écran qui garde une écriture doit interroger la policy de **la table qu'il
écrit**, pas celle d'une table voisine. Et il doit en tirer un **périmètre** — quoi — plutôt
qu'un oui/non.

**Pourquoi la poser maintenant.** Les trois écrans officiels gardaient leur rattrapage de
référentiel avec `canManageClassSubjects`, miroir de la policy de `subjects` (titulariat
exigé). Ils écrivent `prim_competences`, `mat_domaines` et `apc_matieres`, dont les trois
policies disent la même chose, et autre chose : tout membre de l'école écrit les lignes de
son école. L'écran était donc plus strict que la base, et son commentaire invoquait un
refus RLS qui n'aurait jamais eu lieu. Coût réel : une enseignante de matière devant
« Demandez à l'administration », sans une case à remplir (cf. **I30**).

**Ce que `refLineScope` rend.**
`{}` — tout le périmètre de la classe (admin, délégué `/app/classes`, titulaire) :
le comportement d'avant, inchangé. `{ onlyTeacherId }` — ses propres matières, pour un
enseignant de matière. `null` — rien, pour un censeur non délégué, un surveillant, ou un
compte enseignant **sans fiche rattachée** (sinon `teacher_id === null` lui ouvrirait les
matières que personne ne s'est vu affecter — le piège déjà corrigé dans `mySubjects`).

**Ce qu'on ne déplace pas.** L'arbitrage « la PREMIÈRE matière qui réclame une compétence
la garde » continue de se calculer sur **toute la classe**, et seule la création est
restreinte. Sinon l'ordre des lignes du bulletin dépendrait de qui a ouvert l'écran le
premier, et la même classe changerait de bulletin sans raison visible.

**Ce qu'on refuse.** Un réglage. C'est la ligne déjà écrite dans `teacherScope.js` :
« une enseignante ne doit pas attendre qu'on l'autorise à nommer les matières de sa propre
classe ». La sécurité tient au périmètre, pas à un interrupteur.

**La cellule qui refuse en silence.** Corrigée du même coup : `validateGrade` refuse ce qui
dépasse le barème de la colonne, et la cellule revenait à sa valeur d'avant sans un mot —
ce qui se lit comme une note perdue. Elle nomme maintenant la raison et où la changer. Le
cas est fréquent précisément sur les compétences AJOUTÉES PAR L'ÉCOLE, qui n'ont aucun
barème national (`prim_bareme_criteres` n'a pas de `school_id`) : c'est l'enseignant qui le
pose, juste au-dessus de la case.

**Comment revenir en arrière.** Remettre `if (!canManageClassSubjects({…})) return;` dans
les trois effets de rattrapage et retirer `refLineScope` : le droit redevient le titulariat,
et l'impasse revient avec lui. Pour les filtres de classe, remettre
`competenceIdsForTeacher(...).size > 0` (primaire) et `domaineIdsForTeacher(...).size > 0`
(maternelle). Pour le message de refus, retirer `onRefus` de `NoteCell`.

## D32 — Une colonne de saisie existe quand elle a un barème, et le barème se reprend de l'école

**La règle, en deux temps.**

1. **Une compétence ajoutée par l'école s'ouvre avec un barème**, pas à zéro. Il n'est pas
   inventé : on reprend ce que l'école emploie déjà sur ce critère dans la classe, sinon le
   gabarit officiel le plus fréquent du niveau, sinon 20. Et il s'écrit par le **même chemin**
   que si l'enseignant l'avait tapé (`setBareme`) — donc même refus si une note le dépasse,
   même persistance pour toute la colonne, et modifiable à tout instant.
2. **Une colonne sans barème ne s'affiche pas.** Elle reste à un clic, sous le tableau.

**Pourquoi la poser.** `prim_bareme_criteres` est une table NATIONALE : clé
(`niveau_id`, `competence_id`), aucun `school_id`, aucune école n'y écrit. Une compétence
qu'une école ajoute — « CHINESE », « Espagnol », « Dictée », « Maths paper 1 » — n'y a donc
aucune ligne, ses quatre colonnes naissaient à zéro, et une colonne à zéro a ses cases
**désactivées**. Relevé à l'écran, compte enseignant :

```
barèmes  : [0, 0, 0, 0]
ELEVE PROF 01  [—, —, —, —]    les quatre cases inactives
```

Il fallait deviner qu'on tape d'abord un chiffre dans la petite case du barème, en en-tête.
Symétriquement, les compétences nationales affichaient leurs critères inutilisés en
« à définir » — « Pratique » sur 1A, 1B, 2A — soit trois ou quatre colonnes grisées à
enjamber, à chaque compétence et à chaque UA.

**Le barème n'est pas une constante nationale.** Sept bulletins réels de THE GENIUS
(2025/2026, SIL à CM1) le montrent, et montrent que l'école s'écarte du MINEDUB quand elle
le juge bon :

```
SIL      1A 40 · 2A 30 · 3A/3B/4/5/5A/5B 20 · CHINOIS 20      (= le national)
CE1      A/B/C 40 · 2A/2B 30 · 5A 20        (le national dit 30/30/20/40/40/40)
CM1      1B 50 · Dictée 40 · Problèmes 50 · Calcul rapide 20
CLASS V  Maths paper 1 70 · English 1/2 50 · ICT 20 · EPS 20
```

D'où l'ordre « l'école d'abord, le référentiel ensuite », et jamais une valeur sortie de
nulle part. À égalité de fréquence, le **plus grand** l'emporte : un barème plus large ne
refuse aucune note déjà saisie, l'inverse si.

**Une seule colonne s'ouvre d'office : « Écrit ».** Dans les sept bulletins, CHAQUE matière
ajoutée par l'école est évaluée « Written / Écrite ». Ouvrir les quatre imposerait quatre
notes par élève pour une matière évaluée sur une seule épreuve.

**Ce qu'on refuse.** Réutiliser `refMasques.prim_crit` pour « désactiver » : ce masquage est
**global à l'école**, et GENIUS évalue « Pratique » en TIC mais pas en Dictée. La donnée
porte déjà la bonne granularité — par compétence.

**Ce qui distingue « fermée » de « jamais ouverte ».** Une colonne refermée par l'école garde
des lignes à `points_max` NULL ; une colonne jamais ouverte n'a aucune ligne. Sans cette
distinction, le barème se reposerait tout seul après chaque fermeture. Mesuré : la fermeture
survit au rechargement.

**Le défaut que cette décision a elle-même créé, et sa parade.** L'ouverture automatique
partait au premier rendu, quand `primNotes` est encore vide parce que rien n'est chargé — pas
parce que la colonne est vierge. `setBareme` réécrit alors toute la colonne en conservant
« la note actuelle », qui vaut `null` dans une carte vide : **quatre notes effacées à la
simple ouverture de l'écran.** D'où `primNotesPrets` dans le magasin — faux jusqu'à ce que la
lecture serveur ait abouti (ou, hors ligne, le cache local). Toute écriture dérivée d'une
lecture doit attendre ce drapeau.

**Comment revenir en arrière.** Retirer `baremeOuverture` et son effet, et rendre aux rendus
`criteres` à la place de `criteresActifs` : les colonnes vides réapparaissent en « à définir »
et les compétences maison renaissent à zéro. `primNotesPrets` peut rester — il ne coûte rien
et protège toute écriture dérivée d'une lecture.

## D33

**2026-10-31 — Un écran ne propose pas un réglage qui ne commande rien ; et un
classement que l'école crée doit dire où ses matières s'impriment.**

**Ce qui a été constaté.** Quatre remarques du responsable, le même jour, sur le
même écran — modification de classe, une CE1 bilingue de 44 matières :

- « quand ce sont les matières qui ont des critères, le barème ne détermine pas
  comme les matières classiques change » ;
- « le primaire n'a souvent pas de coef mais je vois sur la modification de
  classe » ;
- « en créant une matière il y a toujours FR/20 EN/100 » ;
- « en créant une classe class 1 ou les autres classes du primaire qui utilisent
  les critères, on n'a pas besoin de FR/20 ou EN/100 ».

Les quatre disent une seule chose, et elle est juste. En maternelle, au primaire
et au premier cycle, la note est portée par les **critères du référentiel** — un
barème par épreuve, « TIC : Pratique 10 puis Écrite 20 ». Le coefficient, lui,
est celui de la **compétence**. Deux commentaires du code l'écrivaient déjà :
`primEngine.js` — « on ne déduit rien de `subjects.max` » — et
`bilingualSubjects.js` — « en APC, `subjects.max` ne sert pas au calcul ».

**Le calcul était donc juste ; l'écran mentait.** Il offrait une case Coef, une
case `/ Max`, un choix « FR /20 · EN /100 » et six boutons de barème à la
création. On tapait 100, on enregistrait, et la saisie continuait sur le barème
du critère sans un mot. Une case qui accepte une valeur sans effet est pire
qu'une case absente : elle fait croire que le réglage est fait.

**La règle posée.** Là où un réglage ne commande rien, l'écran ne le propose
pas : il dit **où il se règle vraiment**. `CelluleBareme` et `CelluleCoef`
rendent « par critère » / « — » avec une bulle qui renvoie à la tête de colonne
de l'écran de saisie ; la légende du tableau, la pastille de création et le
sélecteur « Barème » suivent le moteur résolu. Rien n'est masqué au second cycle
ni au classique, où `grade_max` et `subjects.max` pilotent bien la moyenne
(`bulletinEngine.js`), ni au premier cycle pour le coef, dont le bulletin
officiel imprime les colonnes « Coef » et « M×coef ».

**Deux défauts trouvés en chemin, hors demande.** `templateLabel` n'avait pas de
cas pour `apc_primaire` ni `maternelle` : une classe de primaire s'annonçait
« Classique », l'inverse de ce qu'elle est. Et la case **« Classe bilingue »**
existait à la création mais enfermée dans « Réglages avancés », replié par défaut
et annoncé « rarement nécessaire » — donc jamais vue, d'où des classes bilingues
nées monolingues et un bloc de rattrapage qui encombrait l'écran de
modification. La case est remontée dans le corps du formulaire ; le rattrapage
est retiré, avec son handler et son mémo.

**Le classement maison — et pourquoi aucune table.** « Permet qu'on crée un
classement directement dans modification de classe ». Un classement n'est pas
une étiquette : `subjectGroup.js` le traduit en l'un des **cinq groupes imprimés**
du bulletin, `timetableEngine.js` en tire une couleur. Un classement qui ne
dirait rien de sa famille retomberait sur l'heuristique du nom — le défaut même
que `subjectGroup.js` a fermé (« je crée une matière Espagnol, je choisis
Langue, et sur le bulletin elle est dans AUTRES MATIÈRES »). L'école donne donc
deux choses : le nom qu'elle veut lire, et la famille dont le classement hérite
le comportement.

Le classement vit dans `subjects.category`, encodé `x:<famille>:<Nom>` —
**aucune table, aucune colonne**. Décisif ici : une colonne nouvelle devrait
partir au Cloud AVANT tout paquet LAN, sinon la poussée rejette la ligne
ENTIÈRE (PGRST204), et les écoles ne reçoivent aucune mise à jour automatique.
Pour un confort d'écran, ce prix serait disproportionné. La liste proposée se
**déduit** des matières (`classementsEnUsage`), toutes classes confondues.

Contrepartie assumée : le nom vit dans la clé, donc renommer réécrit les
matières qui le portent (`retouchesRenommage`), et un classement que plus aucune
matière ne porte disparaît de la liste. C'est cohérent avec ce qu'il est — un
classement existe parce que des matières y sont rangées.

**Preuves.** `npm test` 227 ok / 0 ko ; builds LAN et Cloud OK ;
`validate:migrations` 0 avertissement. Écran piloté sous Chrome : CE1 en moteur
primaire affiche « par critère » et plus aucune case de barème, 6eme A garde ses
trois cases ; « Class 1 » montre « EN » sans /100 et la pastille « Primaire
(critères) », et sur une école `classic` la même saisie retrouve « EN /100 » et
ses six boutons ; classement « Langues orientales » créé à l'écran, clé
`x:langues:Langues orientales` écrite, et `subjectGroupKey` le range dans
LANGUES. 30 cas purs sur `classementMaison`, 12 sur `moisFacturables`.

**Comment revenir en arrière.** Rendre à `CelluleBareme` / `CelluleCoef` leur
`input` inconditionnel et retirer `baremeParCritere` / `coefParReferentiel` :
l'écran redevient uniforme, et de nouveau trompeur. Pour le classement maison,
retirer `familleDe` de `subjectGroup.js` et `timetableEngine.js` et remettre
`CATEGORY_BY_ID[choisi]` : les clés `x:…` redeviennent inconnues et les matières
retombent sur l'heuristique du nom — aucune donnée n'est perdue, les clés restent
en base.

## D34 — La pastille remplace le chiffre, et le libellé se décide à la lecture

**Date.** 2026-10-31. **Demande.** « Simplifier la page Registre des services »,
sept sections de consignes, captures d'écran à l'appui.

**Décision 1 — une case de grille porte un ÉTAT, pas un montant.**
`pastilleCellule` (pur, testé) traduit une case en un ton parmi six et ne met un
chiffre que lorsqu'il y a quelque chose à réclamer. Alternative écartée :
garder le montant et le colorer. Elle perdait l'essentiel — `15 000` ne dit pas
si c'est dû, payé ou facturé ; et douze colonnes de montants ne tiennent sur
aucun écran. Conséquence assumée : pour lire les montants il faut cocher
« Afficher les montants », ou ouvrir la fiche.

**Décision 2 — les totaux suivent le filtre, et le disent.**
Sur demande explicite du responsable. Un total général affiché sous une liste
filtrée est le chiffre que l'école recopie dans son cahier, en croyant qu'il
porte sur tout le service. Un bandeau annonce donc la sélection partielle.

**Décision 3 — pas de virtualisation tierce.**
`AGENTS.md` interdit d'introduire une technologie sans autorisation. La liste
rend une tranche de 60 et propose « afficher les N autres », en annonçant
toujours le compte total. Moins savant, zéro dépendance, et honnête.

**Décision 4 — le libellé d'une échéance se décide à la LECTURE.**
Deux populations cohabitent en base : `period_label` porte soit un vrai
libellé, soit la clé recopiée (`2027-01`). Corriger l'écriture ne rattraperait
pas les lignes déjà posées, et un `UPDATE` de rattrapage toucherait des données
financières pour un défaut d'affichage. `libelleEcheance` garde donc ce que
l'école a choisi (« 2e trimestre (après Noël) ») et traduit ce qui n'est que la
clé. Dix cas au banc.

**Décision 5 — une écriture financière ne meurt pas sur une colonne accessoire.**
Voir I34. `insertFeePayment` réessaie sans les colonnes d'enrichissement que le
Cloud ne connaît pas, avec une liste **fermée** : `amount` et `student_id` ne
sont jamais abandonnables, parce qu'une ligne sans montant serait pire qu'une
erreur. Contrepartie : un versement peut arriver sans son mode, et la console le
dit.

## D35 — Supprimer un service se fait dans UN ordre, et pas un autre (2026-11-01)

**Contexte.** Le responsable demande d'effacer ses essais de cantine et de
transport sur la base en ligne, et choisit la suppression réelle plutôt que la
contre-passation.

**Ce que le schéma impose** (lu, pas supposé) :

```
student_fee_items.fee_catalog_id        → SET NULL
fee_schedule_items.student_fee_item_id  → CASCADE
fee_payments.fee_schedule_item_id       → SET NULL
fee_payments.student_fee_item_id        → SET NULL
fee_payments.reversal_of                → RESTRICT
```

**Décision : contre-passations, puis versements, puis abonnements, puis le
service.** Mesuré sur une copie du banc, et figé dans
`scripts/_nettoyageOrdre.test.mjs`.

**Pourquoi pas l'ordre intuitif.** Supprimer le service d'abord ne supprime que
le service : l'abonnement survit avec `fee_catalog_id` à NULL, l'échéance
survit, et **l'argent reste dans la base**. L'écran Cantine filtre sur le
service : ces lignes disparaissent de l'affichage tout en continuant de compter
en balance. L'école croit avoir nettoyé. Mesuré sur copie : service supprimé →
9 abonnements et 67 échéances survivants, 277 500 toujours présents.

**Deux pièges de plus, trouvés au banc.**

1. Un versement peut viser la PÉRIODE (`fee_schedule_item_id`) **ou** le service
   sans préciser de mois (`student_fee_item_id`) — les deux cas cohabitent par
   décision explicite de `supabase_fee_schedule.sql`. N'interroger qu'un seul
   rattachement laisse de l'argent derrière : 1 versement trouvé au lieu de 3.
2. Le verrou `RESTRICT` fait échouer **même un `DELETE` global** : l'ordre n'est
   pas une précaution pour les gros lots, c'est la condition pour que la
   suppression aboutisse, même sur trois lignes.

**Ce qui n'est pas automatisé, et ne le sera pas.** Le script ne devine jamais
quel service est un essai : un essai et un vrai encaissement sont identiques
dans la base. `--liste` montre les montants, le responsable désigne les
identifiants, et sans `--confirmer` le script ne fait que décrire.

**Le prix de cette suppression.** `receipt_no` est séquentiel par (école, année)
et sert à détecter une recette escamotée — le schéma l'écrit. Supprimer un
versement numéroté laisse un trou définitif qui ressemblera, au contrôle, à de
l'argent effacé. Le script énumère les numéros qui vont manquer avant d'agir,
pour que la trace soit portée au registre des incidents.

---

## D36 — La maternelle passe aux UA du primaire, et les notes déjà saisies migrent sous conditions (2026-11-01)

**Où** : `src/core/uaMinedub.js`, `src/core/matEngine.js`, `scripts/migrer-maternelle-ua.mjs`,
`supabase_mat_observations_ua.sql` (**non appliquée**)

**Décision.** La maternelle abandonne « Trimestre 1/2/3 » pour les **UA1–UA8 du primaire**,
regroupées T1=UA1-3, T2=UA4-6, T3=UA7-8. L'identité d'une observation devient
`(eleve_id, domaine_id, ua)`, et non plus `(eleve_id, domaine_id, trimestre_id)`.

**Raison.** Le regroupement était déjà écrit, éprouvé et imprimé pour le primaire
(`uaMinedub.js`). La maternelle réclamait le même découpage : le réécrire aurait créé une
seconde source de vérité pour un découpage officiel qui n'en admet qu'une. `matEngine`
**réexporte** donc les constantes du primaire au lieu de les recopier — un test vérifie
l'identité des objets, pas seulement l'égalité de leur contenu.

**Conséquence.** Trois choses deviennent interdites.

1. Une observation sans `ua` est désormais refusée par le paquet de notes (`mat_sans_ua`) :
   tout code qui en fabriquait doit être corrigé, pas contourné.
2. La file hors-ligne et la poussée doivent viser `eleve_id,domaine_id,ua`. Un `onConflict`
   qui ne correspond à aucune contrainte Postgres échoue en **42P10** et **bloque la file
   sur place** — c'est l'incident `prim_notes` du 2026-09-28, reproduit à l'identique.
3. L'ordre de déploiement n'est pas négociable : SQL Cloud → application Cloud → **paquet
   installé dans chaque école** → migration des données. Une édition LAN qui ignore la
   colonne `ua` reçoit le `trimestre_id` recalculé et rejette silencieusement la seconde
   ligne, son ancienne contrainte unique ne distinguant pas deux UA d'un même trimestre.

**Les notes déjà saisies.** T1→UA1 et T2→UA2, décidés par le responsable. **T3 n'a pas de
règle** : le script les compte, les liste et **ne les transfère pas**. Il n'écrase jamais une
note existante sur l'UA cible — il signale le conflit et s'arrête sur ce cas. Les colonnes
`ancienne_periode`, `ua_migre_le`, `ua_migre_par` rendent le retour arrière exact.

**Retour arrière.** `node scripts/migrer-maternelle-ua.mjs --retour-arriere --confirmer`
restitue période, UA et cote à l'identique (`version` continue de croître, pour que la
synchronisation voie bien un changement). Éprouvé sur base temporaire portant les
contraintes d'après migration : 43 contrôles.

---

## D37 — Un doublon d'élève se juge sur la date ET le lieu de naissance, jamais sur le nom seul (2026-11-01)

**Où** : `src/core/doublonsEleves.js`, `src/lib/studentDuplicate.js` (adaptateur),
`src/components/students/DoublonsPanel.jsx`, `supabase_eleves_non_doublons.sql` (**non appliquée**)

**Décision.** La détection repose sur `date_naissance` **et** `lieu_naissance`, la proximité
du nom n'étant qu'un **prérequis**. Trois niveaux : fort, à vérifier, aucun. Les renforts
(téléphone du parent, noms des parents, adresse, matricule) **ne créent jamais** une alerte
forte à eux seuls.

**Raison, et le défaut qu'elle corrige.** L'ancien code lisait `birth_date` — **une colonne
qui n'existe pas** : le schéma dit `date_naissance`. Le test en place ne l'avait pas vu
parce que ses propres jeux d'essai employaient le mauvais champ. La détection ne regardait
donc, en production, que le nom. Des tests lisent maintenant le **schéma lui-même** et
refusent le retour de `birth_date`.

**Ce que cela interdit.** Une fratrie et des jumeaux partagent date, lieu, adresse et
parents : seul le prénom les sépare. Rendre les renforts suffisants rendrait toute fratrie
« doublon fort ». Les jumeaux sortent donc en `aucun`, avec un drapeau `fratrie` et une
liste à part. Le prix est assumé : deux vrais homonymes nés le même jour au même endroit
sortent en « à vérifier », et c'est la secrétaire qui tranche.

**Jamais bloquant.** La création passe toujours ; la réponse « ce n'est pas un doublon » est
**mémorisée** sur les deux fiches (`students.non_doublons`). Seule reste refusée la **même
saisie** (même matricule, ou nom identique + même date + lieu compatible) — un double clic
d'import, pas un élève.

**Performance.** Aucune comparaison deux à deux : regroupement par date, par téléphone et
par **paires** de préfixes de mots du nom. Mesuré sur 700 élèves réalistes : 12 350
comparaisons, 297 ms, 0 faux positif. Pire cas mesuré (300 noms identiques) : 956 ms.

**Mesure sur la base réelle (lecture seule, 2026-11-01).** THE GENIUS, 713 élèves : **0
paire**, 0 matricule en double. LA RÉUSSITE, 657 élèves : **aucune date de naissance en
base**, donc 3 260 paires « à vérifier » — l'écran de scan annonce désormais combien de
fiches sont sans date ou sans lieu, parce que ces fiches ne peuvent, par construction, pas
sortir mieux que « à vérifier ».

**Retour arrière.** `studentDuplicate.js` reste l'adaptateur : rebrancher l'ancien moteur
revient à y changer trois `export`. La colonne `non_doublons` est additive et son absence ne
casse rien (lecture tolérante).

---

## D38 — Au premier cycle, une compétence peut être évaluée plusieurs fois dans le trimestre (2026-11-01)

**Où** : `src/core/apcEvaluations.js`, `src/components/grades/ApcCompetenceWorkspace.jsx`,
`src/lib/apcBulletinDoc.js`, `supabase_apc_evaluations.sql` (**non appliquée**)

**Décision.** La grille de saisie du premier cycle n'affiche plus une colonne par
compétence, mais **une colonne par évaluation**, numérotée « Éval. 1 », « Éval. 2 »… et
portant le nom de la compétence évaluée. Le nombre d'évaluations est **déduit** du nombre de
compétences (1 → 2, sinon une par compétence) et **surchargeable par matière**
(`schools.apc_evaluations`).

**Raison, et pourquoi ce n'est pas un retour en arrière.** La décision du 2026-10-03
(commit `1f3d066`) a fait de **Trimestre** le sélecteur principal, en notant que « le modèle
reste capable d'en porter plusieurs ». Elle visait à supprimer le **sélecteur de séquence**,
pas la seconde évaluation. Le sélecteur de séquence ne revient pas : les séquences du
trimestre deviennent des **colonnes**, et un test refuse la réapparition du sélecteur.

**La règle de moyenne n'existe plus qu'une fois.** Elle était écrite dans le bulletin ; elle
vit maintenant dans `core/apcEvaluations.js` (`moyenneEvaluations`), appelée par l'écran
**et** par le bulletin. Deux copies d'une règle de moyenne finissent par donner deux
moyennes — et devant le parent, c'est le bulletin qui a raison. Barèmes identiques → moyenne
brute, barème conservé ; barèmes différents → moyenne des proportions sur /20. Le calcul de
matière (`matiereAverage`) n'est pas touché, conformément à la consigne.

**Note provisoire.** Une moyenne calculée sur une évaluation sur deux est **affichée**, en
ambre, avec « 1 évaluation sur 2 saisie » — et **la cote n'est pas annoncée** tant que la
saisie est incomplète : une cote est un jugement, elle attend la note définitive. Le
classeur exporté porte une colonne « Saisie » (`1/2`), sans quoi l'information mourrait à
l'export.

**Ce que cela interdit.**

1. Dépasser la **capacité** du trimestre (compétences × séquences) : au-delà, deux colonnes
   désigneraient la même case et la seconde écraserait la première. Le sélecteur est borné.
2. Exporter deux colonnes au même en-tête : l'en-tête porte le numéro d'évaluation, sinon un
   classeur de matière à une compétence revient avec deux colonnes indiscernables.
3. Laisser un enseignant changer le nombre d'évaluations : il déplacerait les colonnes de
   tous ses collègues sur la même matière. Réservé à la direction.

**Au bulletin.** Pour une compétence évaluée plusieurs fois : « (Éval. 1 : 12 · Éval. 2 :
16) » à la suite de l'intitulé, en petit, la colonne N portant leur moyenne (14). **Aucune
colonne n'est ajoutée** au tableau — sa largeur est déjà contrainte par l'A4.

**Et le détail s'arrête à 2 compétences par matière — c'est une MESURE, pas une
préférence.** Posé sous l'intitulé, il ajoutait une ligne par compétence : le banc
d'impression (`npm run test:print`, scénario « APC 14×4 ») est passé de **3 pages à 4**,
rompant le contrat « une feuille = une page » tenu depuis I27/D28. Trois dispositions ont
été mesurées, pas supposées :

| Disposition | « APC 14×4 » | Verdict |
|---|---|---|
| sous l'intitulé, sur sa propre ligne | 3 → **4** | refusée |
| dans la colonne N, au-dessus de la moyenne | 3 → 3 | refusée À L'ŒIL : la colonne est étroite, « 12 · 16 » s'y coupait en deux et donnait trois nombres empilés qu'on ne sait plus lire |
| **à la suite de l'intitulé, matières de 1-2 compétences** | 3 → 3 | **retenue** |

Un scénario **« APC 14×1 »** a été ajouté au banc pour prouver que le cas demandé tient à
pleine taille : quatorze matières à une compétence évaluée deux fois, donc quatorze détails
sur la même feuille — **2 pages → 2**. Au-delà de 2 compétences, la note de la compétence
reste la moyenne de ses évaluations (le calcul ne change pas) et le détail se lit sur
l'écran de saisie.

**L'écran et le papier portent le même détail, sous la même condition.**
`BulletinApcOfficial.jsx` (aperçu) et `apcBulletinDoc.js` (impression) sont deux rendus des
mêmes données : un test refuse qu'ils divergent. Un parent qui lit l'aperçu puis le PDF ne
doit pas y trouver deux bulletins.

**Déjà conforme, vérifié et non modifié.** `src/lib/classReportEngine.js` moyennait déjà
toutes les séquences du trimestre par compétence : classement et statistiques de classe
utilisaient donc la note de trimestre avant ce travail.

**Retour arrière.** Revenir à une colonne par compétence = forcer `nombre` à
`competences.length` dans `colonnesEvaluations`. Les notes de seconde séquence restent en
base et continuent de compter au bulletin ; l'écran les dénombre et le dit.

## D39 — La synchro passe à 30 s, avec un envoi 3 s après l'écriture, et un voyant pour l'administrateur (2026-11-02)

**Demande.** Synchro LAN ↔ Cloud en moins de 30 s dans les deux sens ; un voyant
OK / en attente / échec visible de l'administrateur à l'école comme en ligne.
**Statut : écrit et testé, NON déployé.** Détail et réglages : `docs/SYNCHRONISATION.md` § 10.

**Ce qu'on a choisi, et pourquoi.**

- **On surveille la base, pas le code.** Le déclencheur SQLite d'I36 enfile toute
  écriture ; le planificateur lit `sqlite_sequence` de `sync_outbox` chaque seconde.
  Appeler le planificateur depuis chaque écriture recréerait la convention qu'I36 a
  supprimée (32 écritures qui ne remontaient pas).
- **Le contrôle d'intégrité et les fichiers gardent 5 min.** À 30 s, un `sync-verify`
  par cycle multiplierait ces appels par dix pour confirmer que rien n'a divergé. C'est
  aussi ce qui conserve la signification de « 12 cycles de divergence = une heure »
  (`syncHealth.js`).
- **Un lien coupé ne compte pas contre la ligne.** Avec un cycle toutes les 30 s, huit
  échecs réseau tiennent dans quatre minutes ; la tête de file saine serait partie en
  quarantaine. Seules les réponses du Cloud comptent.
- **Recul ×2 après échec**, plafonné à 5 min (l'ancienne cadence) : une école hors ligne
  ne martèle pas le Cloud.
- **Un voyant étendu, pas un troisième.** `SyncBadge` existait (LAN, parité seulement) ;
  il est étendu à la file, aux lignes refusées, aux coupures et aux désaccords, et on a
  corrigé son `fetch` nu (403 avalé → voyant masqué : le défaut d'I39 resté ici). Le
  Cloud a son pendant `CloudSyncBadge`, qui lit ce que l'école a DIT au Cloud.

**Ce que 30 s ne garantit pas.** Cloud → école reste un sondage : au pire l'intervalle +
la durée du cycle (≈ 30 s), en moyenne 15 s. Garantir « < 30 s » au pire cas demande ≤ 20 s
(5 328 appels/jour/école). L'instantané exigerait Realtime : non retenu sans autorisation.

**Coût.** 3 888 appels Edge/jour/école au repos, serveur allumé 24 h (ancien : 1 296). Voir
le rapport de session pour les quotas Supabase et leur source.

**Retour arrière.** Code : `NOTESCAM_SYNC_INTERVAL_MS=300000`, plus
`NOTESCAM_SYNC_DEBOUNCE_MS=3600000` **et** `NOTESCAM_SYNC_DEBOUNCE_MAX_MS=3600000` (le
plafond de 15 s borne aussi le débounce : régler l'un sans l'autre ne désactive rien),
ramènent l'ancienne cadence sans redéployer. *(Variables à poser dans
`/etc/notescam/notescam.env` ; non éprouvées en conditions réelles.)*
Cloud : `supabase_sync_etat_lan.sql` porte son propre retour arrière en commentaire.

---

## D40 — Le sous-système anglophone passe de 3 « Terms » à 6 séquences (2026-11-02)

**Demande (responsable, 2026-11-02), écran de saisie des notes, classe FORM2 d'une
école bilingue :** « rend ceci en séquence pas en term trimestre » — et « enlève /100 ».

**Ce qui existait.** `countries/cameroon_en.js` modélisait l'anglophone en **trois
périodes** (`term_1..3`, une « séquence » par trimestre). Les classes francophones de
la MÊME école en comptaient six. Un établissement bilingue comptait donc six
évaluations d'un côté et trois de l'autre, pour un seul calendrier réel.

**Ce qu'on a choisi.** L'anglophone devient le miroir exact du francophone :
**6 séquences groupées deux par deux** en Term 1 (séq. 1-2), Term 2 (3-4), Term 3 (5-6).
Le **Term reste l'unité de restitution** (bulletin, rapport) ; la **séquence devient
l'unité de saisie**, comme côté francophone.

Touché : `countries/cameroon_en.js` (périodes, `periodType`), la saisie
(`pages/Grades.jsx`, `components/grades/SubjectTeacherWorkspace.jsx`), le conseil de
classe, les bulletins (`PERIODS_EN` + le regroupement annuel `[[1,2],[3,4],[5,6]]`, qui
valait `[[1],[2],[3]]` pour EN à trois endroits), les rapports (`PERIODS_EN`, et le
rendu de pastilles propre à l'anglophone **supprimé** : il n'affichait que les
trimestres, donc quatre séquences sur six auraient disparu), les relevés
(`transcriptEngine`) et le calendrier (`calendarTracks`).

**Les clés de calendrier ne sont PAS re-clées.** La piste garde le préfixe `en_term_`
et passe de 3 à 6 entrées (`en_term_1..6`). Re-clé = dates déjà saisies perdues, pour
un simple mot. Même raisonnement que la Guinée équatoriale, qui réutilise `fr_seq_1..3`.

**Le décalage est assumé, et il a été posé au responsable avant d'écrire.** Les notes
anglophones déjà enregistrées le sont sous les numéros 1, 2, 3. Elles se relisent
désormais comme **séquences** 1, 2, 3 : l'ancien « Term 2 » (n° 2) tombe dans le
**Trimestre 1** (séq. 1-2) et l'ancien « Term 3 » (n° 3) dans le **Trimestre 2**.
C'est exactement le risque déjà documenté pour le primaire (`pages/Settings.jsx`,
bascule trimestres → séquences). Le responsable a choisi cette option en connaissance
de cause plutôt qu'un réglage par école : **une école qui a déjà saisi des notes
anglophones cette année doit les reprendre, ou accepter le décalage.**

**Retour arrière.** Remettre `sequences: [1, 2, 3]` et `seqs: [1] / [2] / [3]` dans
`countries/cameroon_en.js`, et les quatre `PERIODS_EN` / regroupements annuels cités
ci-dessus. Aucune migration SQL n'a été écrite ni appliquée : **rien en base ne change**,
seule la lecture des numéros change.

**Au passage :** le suffixe de barème a quitté les sélecteurs de classe —
`FORM2 [EN /100]` devient `FORM2 [EN]` (Notes, Bulletins, Rapports). Le conseil de
classe l'écrivait déjà ainsi. Le badge de barème à côté de la classe, lui, est
conservé : c'est lui qui dit sur quoi on note.

---

## D41 — La feuille de notes à remplir à la main (2026-11-02)

**Demande (responsable, 2026-11-02, quatre photos à l'appui) :** « fais un relevé de
note comme ceci et permets d'extraire vide pour permettre de remplir à la main aussi ».

**Ce que montraient les photos.** Des grilles que les écoles fabriquent elles-mêmes :
(1) compétences 1A…6B en colonnes, chacune avec Oral / Écrit / Pratique / Savoir-être
et un Total, barème écrit sous l'intitulé (« sur 5 », « sur 2 ») ; (2) une grille de
matières (dictée, production, anglais, calcul, problème, sc. et conn., TIC, EPS) avec
Total, Moyenne et Rang. Un élève par ligne, numérotés, remplis au stylo.

**Ce qu'on a écrit.** Trois couches, aucune nouvelle technologie :

- `core/feuilleNotes.js` — **pur et testé** : découpe en pages. Un groupe
  (compétence, bloc de matières) n'est **jamais coupé en deux** — séparer « Oral » de
  son « Total » rendrait la colonne de total inutilisable. Les numéros ne repartent
  pas de 1 à la page suivante : c'est le N° de la liste de classe, appelé à l'oral.
- `lib/feuilleNotesDoc.js` — le papier, **sur le socle `lib/print`** (profil `large`,
  A4 paysage) : aucune règle `@page`, aucune géométrie à la main.
- `components/grades/FeuilleNotesButton.jsx` — le bouton et son dialogue, branché sur
  l'écran classique (`pages/Grades.jsx`) et sur le primaire APC
  (`PrimCompetenceWorkspace`). Le composant ne connaît **rien au métier** : chaque
  écran lui présente ses colonnes.

**Trois choix qui méritent d'être écrits.**

1. **Vierge par défaut.** C'est la demande. « Avec les notes déjà saisies » existe
   aussi, pour relire sur papier — même gabarit, mêmes pages.
2. **Pas d'en-tête ministériel.** Ce n'est pas une pièce remise à un parent mais
   l'outil de travail de l'enseignant : les trois blocs République / Ministère /
   Délégation coûteraient six lignes d'élèves par feuille. On garde l'identification
   nécessaire pour qu'une feuille ramassée sur une table se recolle à sa classe.
3. **Deux densités, et le nombre de pages annoncé pour chacune.** Onze compétences
   × quatre épreuves + leurs totaux font 55 colonnes : une classe de 35 sort sur
   **8 pages** en « confortable » (case de 7 mm, celle où l'on écrit à la main) et
   **6 pages** en « serré ». L'école photocopie à ses frais : elle arbitre, le
   dialogue lui donne les deux chiffres au lieu de choisir pour elle.

**Au primaire, la feuille porte TOUTE l'UA**, pas la compétence sélectionnée : l'écran
montre une compétence à la fois parce que c'est le bon geste au clavier, le papier les
montre toutes parce que c'est le bon geste devant une pile de copies.

**Vérifié.** 35 contrôles sur le moteur de découpe, 23 sur le document (dont
`auditDocument` du socle : aucun `NaN` / `undefined` imprimé), et **rendu réel en PDF
par Chrome** puis relu à l'image — c'est la grille des photos.

**Non fait, à demander si besoin :** le même bouton sur l'écran APC du premier cycle
(`ApcCompetenceWorkspace`) et sur la maternelle (`MatObservationWorkspace`). Même
composant, quelques lignes de branchement.

---

## D42 — Le rattachement aux UA part école par école, pas d'un coup (2026-11-02)

**Contexte.** La migration décidée en **D36** (maternelle : observations rattachées à une
UA et non à un trimestre) n'avait jamais été appliquée. Le responsable l'a demandée sur
une bannière d'écran — « 184 observation(s) de cette classe sont encore rattachées à un
trimestre » — qui désignait **BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 1** (88 en T1 +
96 en T2 = exactement 184).

**Décision.** Appliquer **à cette école seule** (224 observations avec Nursery 2 et
Pre-Nursery), et **pas** aux deux autres écoles pourtant dans le même état (LE SALUT 96,
Collège La retraite 96), bien que le script sache tout migrer d'un geste.

**Pourquoi ce découpage, qui coûte deux exécutions de plus.** La migration recalcule
`trimestre_id`, et UA1 comme UA2 retombent sur le trimestre 1. Pour un couple
(élève, domaine), les deux lignes T1 et T2 portent donc après coup le **même**
`trimestre_id = 't1'`. Un serveur LAN en 0.3.26 ignore la colonne `ua` mais reçoit ce
`trimestre_id` : son ancien `UNIQUE (eleve_id, domaine_id, trimestre_id)` **rejette la
seconde ligne sans rien dire**. La colonne `ua` côté LAN n'arrive qu'en `58b940b`
(0.3.29), et 0.3.27, 0.3.28 et 0.3.29 sont construits et **jamais envoyés** : aucune école
en réseau local ne la porte aujourd'hui. On ne migre donc qu'une école dont il est
**écrit et vérifiable** qu'elle n'a pas de serveur local — `REGISTRE_INCIDENTS` (I12) :
« BRIGHT CONTINENT travaille dans le navigateur ».

**Leçon de méthode, qui a failli faire conclure l'inverse.** Le premier verdict sur le
pré-requis « l'appli Cloud déployée connaît-elle les UA ? » a été **faux** : il reposait
sur `git merge-base --is-ancestor 58b940b main`, et la référence `main` **locale** était
restée au 20 octobre (da83daa) quand `origin/main` était à 8553c8f. **Un pré-requis de
production se juge sur la référence distante**, jamais sur une branche locale qu'on ne
suit pas.

**Ce qui n'a pas bougé : le T3.** Aucune règle n'a été donnée pour lui, donc aucune ligne
n'est déplacée. L'audit a au passage démenti ce que `PROJECT_STATUS.md` affirmait
(« 0 observation réelle en T3 ») : il y en a **96**, dans les deux écoles non migrées.

**Retour arrière.** `node scripts/migrer-maternelle-ua.mjs --retour-arriere --ecole
"BRIGHT CONTINENT BILINGUAL SCHOOL" --confirmer`. Vérifié **chargé et juste** avant
d'annoncer quoi que ce soit : l'aperçu sans `--confirmer` renvoie les 96 lignes sur
**T2**, pas sur T1 — `ancienne_periode` porte donc bien la période d'origine. À ne pas
confondre avec la colonne `ancienne_periode` du tableau d'état affiché par le script, qui
n'est qu'un alias de `trimestre_id` (ligne 181) et montre `t1` partout après migration.

---

## D43 — L'observation générale se saisit classe entière, dans la page Notes (2026-11-02)

**Demande.** « Mets un formulaire pour l'observation globale pour la maternelle et le
primaire directement dans la page notes. »

**Ce qui n'allait pas, et c'était pire que « il manque un champ ».** Le gabarit
`BulletinMatOfficial` imprime depuis toujours la ligne « Appréciation générale de
l'enseignant(e) : ». La prop `appreciation` **n'était jamais passée** par
`renderMatBulletin` : la ligne sortait vide sur **tous** les bulletins de maternelle,
sans que rien ne le signale. Le carnet du primaire, lui, la lisait déjà
(`primAppreciationSaisie`), mais il fallait ouvrir l'écran des bulletins et dérouler
élève par élève pour l'écrire ; sans saisie il retombait sur le libellé de la cote, donc
le **même texte** pour deux élèves de même cote.

**Décision : aucun stockage neuf.** On écrit sous la clé spéciale `__appreciation__` du
créneau de notes — exactement là où `AppreciationEditor` écrit déjà depuis l'écran des
bulletins. Aucune table, aucune migration : le champ voyage par `student_absences` (canal
des champs spéciaux), donc il est déjà synchronisé Cloud **et** LAN et déjà lu en
production. Un second emplacement aurait fait deux vérités pour une seule ligne de
bulletin.

**L'unité est le TRIMESTRE, pas l'UA — et l'écran le dit.** La saisie se fait par UA, mais
le bulletin se tire par trimestre et c'est lui qui porte cette ligne : les périodes UA
déclarent `seqs: [trimestreOfUA(ua)]`, donc le créneau de stockage EST le numéro de
trimestre. Les trois UA d'un trimestre partagent une observation. Le bandeau l'annonce
avant la saisie — sans cela l'enseignante en écrit une par UA et n'en retrouve qu'une.

**Replié par défaut.** La grille reste l'outil principal ; l'en-tête affiche
« 7 / 35 élève(s) renseigné(s) », ce qui rend le panneau trouvable sans pousser la grille
hors de l'écran. Écriture au `blur` et **seulement si le texte a changé** : un `onBlur`
se déclenche à chaque passage de champ, et sans ce garde-fou une classe de 35 produirait
35 écritures et 35 lignes de file de synchronisation pour rien.

**Droit.** Un enseignant de matière non titulaire voit le panneau en lecture seule :
l'appréciation d'ensemble revient au titulaire ou à l'administration.

**Vérifié** : `src/core/_observationGlobale.test.mjs` — **41 contrôles** (clé identique à
`gradeKey`, aucune fuite entre trimestres, jamais `undefined`, pas d'écriture inutile).

---

## D44 — Une UA se nomme et se tire comme une UA, pas comme son trimestre (2026-11-02)

**Demande.** « Rends le bulletin UA1… au lieu de term quand on clique sur UA1 » puis
« les notes de UA1 seulement doivent apparaître, pas pour le terme ».

**Deux défauts, même cause : `period.seqs[0]`.** Pour une période d'une seule UA,
`seqs` vaut `[trimestreOfUA(ua)]` — ce dont la PERSISTANCE a besoin (l'appréciation et la
décision se rangent sur le créneau du trimestre, cf. **D43**). Mais deux endroits s'en
servaient pour décider du CONTENU :

1. `primTitle` et `matTitle` : cliquer « UA 1 » titrait « BULLETIN DU PREMIER
   TRIMESTRE ». Les trois bulletins d'UA d'un même trimestre portaient le même titre —
   une fois photocopiés, plus rien ne les distinguait.
2. `matUas` appelait `uasDuTrimestre(period.seqs?.[0] || 1)` et **ignorait
   `period.uas`** : le bulletin d'UA1 sortait avec trois colonnes, UA1, UA2, UA3, dont
   deux vides. Le primaire lisait déjà `period.uas` (`primUAs`) ; la maternelle, non.

C'est exactement le piège que le commentaire de `PERIODS_PRIMAIRE` décrivait : « une
période d'une seule UA n'a pas de numéro de trimestre à donner, et la dérivation l'aurait
ramenée au trimestre entier. » L'avertissement était écrit ; un seul des deux moteurs
l'avait suivi.

**Correctif.** `period.ua` tranche pour le titre (« BULLETIN DE L'UA1 — MATERNELLE »,
« LEARNING UNIT 1 REPORT CARD »), `period.uas` pour les colonnes. Le repli sur `seqs`
reste pour une clé de période persistée par une version antérieure, qui ne porte pas ces
champs.

**Et une colonne de moins.** Avec une seule UA, le gabarit affichait « UA1 » **puis**
« Synthèse » — deux colonnes portant la même cote, la synthèse d'une unique unité étant
cette unité. `BulletinMatOfficial` retombe désormais sur la mise en page classique
(colonne « Niveau »), celle d'avant les UA ; c'est le titre qui dit laquelle.

**Vérifié par RENDU RÉEL** (`react-dom/server`, pas une relecture du source) :
`src/components/bulletins/_matOfficialUa.test.mjs` — 6 contrôles : une UA → 4 colonnes et
aucune « Synthèse » ; un trimestre → 7 colonnes et ses trois UA, **inchangé** ;
l'appréciation imprimée ; aucun `undefined`.

---

## D45 — L'orientation du bulletin suit le document, plus un réglage global (2026-11-02)

**Demande.** « Le bulletin de la maternelle aussi en paysage » et « le bulletin du
secondaire premier cycle en portrait ».

**Le défaut.** La règle `@page` est **unique** pour l'écran (règle du socle, cf.
`docs/PRINT_ENGINE.md` : la marge et l'orientation appartiennent à `@page`, jamais à une
maquette). Or `profilPage` ne dépendait que de `primOrientation`, un réglage exposé par
le **seul** panneau du primaire APC. Une école qui l'avait posé à « paysage » pour son
carnet de primaire tirait ensuite **tous** ses bulletins en paysage — maternelle et
premier cycle compris — sans aucun réglage pour le dire ni pour revenir en arrière.

**Décision.** C'est la forme du document qui commande :

| Document | **Défaut** | Pourquoi ce défaut |
|---|---|---|
| Maternelle | **paysage** | huit domaines, leurs cotes par UA et une colonne d'observations qu'on doit pouvoir lire : une grille large |
| Secondaire (1er et 2nd cycle) | **portrait** | une liste de matières, haute et étroite ; en paysage la moitié de la feuille reste blanche |
| Primaire APC | **portrait** | inchangé — son sélecteur existait déjà |

**UN DÉFAUT N'EST PAS UNE CONTRAINTE.** Première version de ce correctif : la maternelle
était FORCÉE en paysage et le secondaire FIGÉ en portrait. Le responsable l'a repris le
jour même — « ce n'est pas obligatoire, on peut changer la forme paysage ou portrait » —
et il a raison : on remplaçait un réglage qui fuitait d'un cycle à l'autre par deux
réglages absents, ce qui n'est pas mieux. Les **trois** cycles ont maintenant leur
sélecteur Portrait/Paysage ; seul le défaut diffère. Trois préférences distinctes dans
`uiStore` (`primOrientation`, `matOrientation`, `secOrientation`), donc plus aucune
fuite : régler le carnet du primaire en paysage ne touche plus au bulletin du collège.

**Pourquoi le calcul a déménagé.** `profilPage` était calculé ligne ~1663, deux cents
lignes **avant** les drapeaux de cycle (`isMat`, `isPrim`) : il ne pouvait pas savoir quel
document on rendait. Il vit désormais après eux. Le profil POSÉ et le profil MESURÉ
restent le même objet (`ajusterDensite`, `fitLiveSheets`) — poser la géométrie paysage
tout en mesurant contre la hauteur utile du portrait ferait chercher une densité pour une
page qui n'existe pas.

Les préférences vivent dans le store d'UI, donc **par poste et pour la session** — comme
`primOrientation` depuis l'origine. Un réglage par établissement demanderait une colonne
`schools` et une migration : à demander si une école veut que son choix survive au
redémarrage.


## D46 — Le bulletin de séquence tient sur UNE page, et on dit jusqu'où (2026-11-02)

**Demande.** « Le bulletin de séquence généré fait aujourd'hui 2 pages A4. Je veux qu'il
tienne TOUJOURS sur 1 seule page A4 portrait, quel que soit le nombre de matières
(jusqu'à 14), sans que ça devienne illisible », avec un plancher de police fixé à 6,5 pt
et l'interdiction explicite de toucher aux calculs (moyennes, coef, cotes, rang).

**Ce qui tenait vraiment la deuxième page — et ce n'était pas la police.** Le banc
`scripts/apc-blocs-mesure.mjs` a mesuré, bloc par bloc, le composant réel en média
print. La colonne COMPÉTENCES déclarait 42 % et recevait **186 px sur 720, soit 26 %**.
Sans `table-layout: fixed`, le navigateur ne lit ces pourcentages que comme des souhaits :
il redistribue selon le contenu, et les deux en-têtes les plus longs — « MATIÈRES ET NOM
DE L'ENSEIGNANT » et « Appréciations et Visa », cette dernière pour une colonne **vide**
qui s'octroyait 114 px — prenaient la place du texte des compétences. Chaque intitulé
passait donc à quatre lignes et une ligne de matière faisait 72 px au lieu de 37. Sur
onze matières : **385 px perdus**, pour un débordement de 210. La deuxième page ne venait
pas d'un manque de place, elle venait d'une largeur qui n'était pas tenue.

**Le deuxième verrou était dans le planificateur lui-même.** `core/apcLayout.js`
retenait la première densité tenant « en 2 pages au plus » : il sortait donc 2 pages en
11 pt **sans jamais essayer** une page en 8 pt. Et `_apcLayout.test.mjs` exigeait
« police ≥ 10 pt », ce qui interdisait la solution. Un test qui verrouille le défaut
n'est pas un garde-fou.

**Ce qui a été fait.**
- `table-layout: fixed` + largeurs rééquilibrées (compétences 35 %, numériques élargies),
  libellés d'en-tête raccourcis, clamp **deux lignes** sur les colonnes de texte.
- Le clamp est posé **hors** du bloc `@media print` : à l'écran comme au papier. Dans le
  bloc print, l'aperçu mesurait 1424 px là où l'impression tenait sur une page, et
  `fitLiveSheets` — qui mesure dans `beforeprint`, styles d'écran encore actifs —
  calculait sa réduction sur une hauteur que le PDF n'a jamais.
- Le planificateur essaie **une page d'abord**, sur toutes les densités, plancher 6,5 pt ;
  puis une page **avec le filet de zoom** (tolérance 1,08) ; puis deux pages ; puis le
  repli. Les hauteurs de blocs fixes ont été recalibrées sur la mesure, plus sur un barème.
- Marge de sécurité de 10 % sur les plans multi-pages : à 42 lignes le planificateur
  annonçait deux feuilles et Chrome en imprimait **trois**, dont une quasi blanche.
- Le jumeau PDF `lib/apcBulletinDoc.js` (export en lot) reçoit les **mêmes** largeurs,
  le même `table-layout: fixed` et le même clamp : écran et PDF ne divergent pas.

**LA LIMITE, PARCE QU'IL FAUT LA DIRE.** Les blocs officiels obligatoires occupent 155 mm
des 281 mm utiles (en-tête 22,6 · titre 6,9 · identité 23,0 · en-tête de colonnes 10,8 ·
trois blocs 60,3 · appréciation 12,2 · signatures 19,3). Il reste 126 mm. Le **plafond
mesuré est de 34 lignes de compétence** (`npm run test:print:apc:plafond`) — relevé de 28
à 34 par la passe « une page avec filet ». Au-delà, tenir une page demanderait de passer
sous 6,5 pt, ce que la demande interdit : on sort deux feuilles propres. 14 matières à une
ou deux compétences tiennent donc sur une page ; 14 × 4 (56 lignes) non, et le banc
l'exige explicitement en deux feuilles plutôt qu'en trois.

**Corrections de données livrées avec (Étape 3).** « Nombre de moyennes » comptait
l'effectif (6 au lieu de 3) : `profilClasse` dans `core/apcEngine.js` est désormais la
source unique, et `scBulletinPdf.js` portait le même bogue sous la forme
`count: st.above + (st.total - st.above)`, c'est-à-dire `st.total`. Le placeholder
« M/Mme » disparaît quand le nom de l'enseignant est vide.

**Preuves.** `npm run test:print:apc` (vrai PDF, pages comptées par pdf.js) et
`npm run test:print:apc:plafond`. Captures avant/après dans
`.print-tests/comparaison/`.
