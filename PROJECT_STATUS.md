# PROJECT_STATUS — NotesCam

> **Source unique de l'état du projet.** À relire au début de chaque session, et à
> actualiser à la fin. Toute ligne ici doit être vérifiable par une commande ou un
> fichier : si une information ne peut pas être prouvée, elle est marquée « à vérifier ».
>
> Dernière mise à jour : **2026-10-22** (passe « matières dédoublonnées, carnet du
> primaire » — § 4 quaterdecies) · branche `caisse-journal-et-sync-0.3.15` **poussée sur
> `main`** le 2026-10-22 (`270432e`), déploiement Vercel **READY** ·
> `package.json` = **0.3.21** · paquets **Windows ET Linux construits, non envoyés** ·
> déploiement Vercel à jour (`0dd169b`)
>
> **0.3.21 porte les correctifs I12 et I13.** I12 : la note d'une matière s'écrivait dans
> la matière suivante — le défaut que le responsable signalait depuis le matin. I13 : une
> table synchronisée neuve naissait vide et ne se remplissait jamais, trouvé en préparant
> le paquet Linux, **avant** l'envoi (les 11 écritures de caisse de THE GENIUS auraient
> été invisibles pour toujours).
>
> **Les deux paquets ont été VÉRIFIÉS dans leur contenu, pas dans le dépôt :**
>
> | | Windows | Linux |
> |---|---|---|
> | Fichier | `packaging/Output/NotesCam-Setup-0.3.21.exe` | `packaging/linux/Output/notescam-linux-x64-0.3.21.tar.gz` |
> | Taille | 30 793 439 o | 53 512 195 o |
> | SHA-256 | `60429d0d…531c40b21` | `94aca9db…236cedc18` |
> | Notice | `packaging/NOTICE-MISE-A-JOUR-0.3.21-WINDOWS.txt` | `packaging/linux/NOTICE-MISE-A-JOUR-0.3.21.txt` |
> | Script | — (installeur) | `packaging/linux/deploy-0.3.21.sh` |
>
> Contrôlé dans chaque paquet : `app/package.json` annonce 0.3.21 · les **deux** clés de
> ligne composées sont dans le bundle (une par écran de saisie — une seule aurait laissé
> un écran cassé) · `db.js` porte la règle « table entière » · les cinq tables sont dans
> `schema.sql`.
>
> ⚠ **La 0.3.20 est ABANDONNÉE, ne pas la distribuer** : construite puis remplacée le même
> jour, avant tout envoi. Sa notice porte un bandeau qui le dit. L'exe 0.3.21 a lui aussi
> été reconstruit après I13 — seule l'empreinte ci-dessus est valable.
>
> ⚠ **Une matière cochée dans la classe n’était pas toujours saisissable** (incident **I16**) :
> une matière n’est proposée à la saisie que si elle est RATTACHÉE au niveau de la classe, et
> rien ne posait ce rattachement quand la matière existait déjà à un autre niveau. Mesuré :
> **12 classes, 6 écoles**, une quarantaine de matières cochées et non notables (BRIGHT
> CONTINENT 5ème : 6 ; THE GENIUS 5eme et 6eme : Chinois). Corrigé — le rattrapage rattache
> au lieu de ne savoir que créer, et ne recrée JAMAIS un nom existant.
>
> ⚠ **À trancher avec le responsable** : ce rattrapage s’exécute AUTOMATIQUEMENT à l’ouverture
> de l’écran de saisie, pour un compte habilité — donc une écriture en base déclenchée par une
> simple visite. Un bouton explicite est peut-être préférable.
>
> ⚠ **Les doublons restaient AFFICHÉS après leur suppression** (incident **I15**) :
> l'empreinte du référentiel APC était l'id de la version nationale, donc insensible aux
> lignes maison de l'école, et le cache n'était pas keyé par école. Corrigé — empreinte
> sensible aux lignes maison, téléchargement filtré sur l'école active, cache par école.
> **Se répare tout seul au premier chargement après déploiement** (l’empreinte stockée n’a
> plus le même format), sans rien vider. Avant déploiement, le contournement est de vider
> les données du site : Ctrl+Shift+R ne suffit pas, IndexedDB y survit.
>
> ✅ **Doublons du référentiel de BRIGHT CONTINENT : corrigés en production** le
> 2026-10-22, sur autorisation explicite. 5 groupes → 0 ; 9 matières, 27 compétences et 6
> notes jumelles retirées ; les notes des matières gardées (6/3/1) sont intactes.
> Sauvegarde conservée dans `zz_sauv_apc_doublons_20261022_*` — **à ne pas supprimer avant
> validation par l'école**. Voir incident **I11 ter**.
>
> ✅ **CI : cause trouvée et corrigée** (incident **I14**). Rouge depuis le 2026-10-20 sur
> `npm test`, pour **un seul test** — `server/_file_access.test.mjs`, 6 assertions en 404.
> `server/index.js` n'enregistrait pas `/files/` dans la branche « `dist/` absent », et la
> CI lance les tests AVANT le build. Vérifié dans les deux sens : sans `dist/`, **25/6 avant
> correction, 31/0 après** ; suite complète sans `dist/` = **193 ok / 0 ko** ; clone vierge
> avec `npm ci` = **192 ok / 1 ko** sur le code non corrigé, ce qui écarte Linux, les
> dépendances, les fichiers gitignorés et la version de Node.
> **CONSTATÉ** : exécution **17** sur `981a0f0` = **success**, le 2026-10-22 de 17:13 à
> 17:14 UTC. Première verte après **neuf échecs consécutifs** (exécutions 8 à 16). Les
> étapes `Build edition cloud` et `Build edition LAN` ont tourné **pour la première
> fois** : le pipeline s'arrêtait avant elles depuis le 2026-10-20, donc rien ne
> vérifiait en CI que les deux éditions se construisent.

---

## 1. Objectif du produit

Plateforme de gestion scolaire pour l'Afrique francophone et anglophone : multi-écoles,
multi-pays, multi-langues. Deux éditions sur un seul codebase :

- **Cloud** — Supabase (Postgres + Auth + RLS + Storage) déployé sur Vercel.
- **LAN** — serveur Fastify + SQLite installé sur un PC d'école, pour travailler sans
  Internet, avec synchronisation différée vers le Cloud (voir `LAN_EDITION.md`).

La contrainte structurante est l'**école hors-ligne** : aucune saisie ne doit être perdue
quand le réseau tombe, et la file de poussée ne doit jamais se bloquer. Les quatre
derniers correctifs de release portent tous sur ce point.

## 2. Repères techniques vérifiés le 2026-10-18 (tests et travaux : 2026-10-19)

| Élément | Valeur | Vérifié par |
|---|---|---|
| Projet Supabase prod | `ltxopwoxvgslsgzixbpx` (eu-west-1, Postgres 17.6) | MCP `list_projects` |
| Projet Vercel | `notescam-saas` / `prj_OAkFCO7ckKBZV8qr1Mgb39V7OUSB` | `.vercel/project.json` |
| Pages applicatives | 54 | `ls src/pages/*.jsx` |
| Tests | **185**, dont **185 ok / 0 ko** | `npm test` (2026-10-19, 529 s) |
| Migrations | 205 fichiers plats `supabase_*.sql` + 20 migrations CLI | `ls` |
| Historique | 325 commits, 76 sur les 30 derniers jours | `git log` |
| Branches locales | 18, dont **2 seulement** portent du travail absent de `main` | `git rev-list main..<b>` |

## 3. État réel des modules

**Livrés et en service** — notes et bulletins (moteurs par système éducatif : classique,
APC, SC/second cycle, maternelle, bilingue spécial), élèves, classes, matières, frais et
catalogue, budgets et dépenses, RH et personnel, vie scolaire (absences, sanctions,
retards, incidents, conseils de discipline et de classe), relevés et transcripts,
tableau d'honneur, emploi du temps, espace parent, synchronisation LAN/Cloud,
sauvegarde et restauration, super-admin.

**En cours, non commité** (voir § 5) — caisse (`CashBook.jsx` câblé sur `/app/caisse`,
`cashBookEngine`, `cashBookService`, import Genius), synchronisation de fichiers
(`server/fileSync.js`, fonction edge `asset-sync`), import d'enseignants
(`src/lib/teacherImport.js`), `sourceKey`, synchro des signalements.

**Documenté sans code dédié** — cantine : `docs/MODULE_CANTINE.md` décrit un module à
venir ; aujourd'hui « cantine » n'existe que comme catégorie dans les frais, budgets et
dépenses. Ne pas le compter comme livré.

## 4. Travaux terminés dans la session du 2026-10-18

1. **118 notes saisies pour BRIGHT CONTINENT BILINGUAL SCHOOL** (séquence 1, année
   `2024-2025`), classes 6ème / 5ème / 4ème Esp / 3EME ESP, matières Histoire,
   Géographie, ECM, EPS, Mathématiques, Espagnol, PCT. Trois matières créées en 6ème
   (Histoire, Géographie, ECM, coef 2, /20) car la classe n'avait qu'une matière
   « Histoire-Géographie » fusionnée. Écriture directe en base, hors application.
2. **Bandeau des matières non cochées retiré** de l'écran Bulletins (`45af74b`,
   31 lignes). Il était déjà en `no-print` : le bulletin imprimé est inchangé.
3. **`npm test` créé** (`scripts/run-tests.mjs`) : lance les 176 tests colocalisés en une
   commande, respecte le loader documenté dans l'en-tête de chaque test, exclut
   `packaging/` (899 copies figées des sources livrées). Porte un **cliquet d'échecs
   connus** (`ECHECS_CONNUS`) : un défaut documenté ici ne bloque pas, tout échec nouveau
   bloque — même principe que `server/_sync_contract.test.mjs`.
4. **Correctif du bandeau déployé en production** : commit `45af74b` poussé sur `main`,
   déploiement Vercel `dpl_ADfvmBZqHoc6wRMYMTQ63SfzdBJd`, état `READY`.
5. **CI créée** (`.github/workflows/ci.yml`) : `validate` → `validate:migrations` →
   `npm test` → build cloud → build LAN, sur `push main`, sur chaque *pull request* et à
   la demande. Aucun secret, aucun job de déploiement.
6. **E2E Playwright amorcé** : `@playwright/test@1.60.0` ajouté (seule la bibliothèque
   `playwright` était présente, pour le rendu d'impression — c'était la vraie raison de
   l'absence d'E2E). `playwright.config.mjs` cible **l'édition LAN uniquement**, sur base
   SQLite jetable, avec refus explicite de toute cible non locale. `npm run test:e2e` :
   **3 tests de fumée passent**, 21 parcours critiques déclarés en `test.fixme`.

## 4 bis. Édition LAN 0.3.16 — les trois écrans que l'école ne pouvait pas modifier

Demande : une version **LAN** où l'école peut modifier son **référentiel de
compétences**, son **profil** et ses **barèmes**. Décision prise avec le responsable :
ne **pas** couper la synchronisation Cloud — elle est déjà inactive par défaut (elle
exige un jeton scellé **et** une activation explicite du mode hybride).

**Défaut trouvé pendant la vérification, et corrigé.** « Compétences du primaire →
Ajouter » échouait **toujours**, en LAN comme au Cloud : `addRefLigne` envoyait
`code: null`, or `prim_competences.code` est `NOT NULL` dans les deux schémas
(`server/schema.sql:1427`, `supabase_apc_primaire.sql:72`, et `information_schema` de la
base de production). Les deux autres gestes (masquer, renommer) marchaient, ce qui
faisait croire à un problème de permissions. Correctif : `codeMaison`
(`src/lib/referentielEcole.js`), pastille dérivée du libellé, jamais commençant par un
chiffre. Décision **D7** au journal. Pas de migration : le schéma n'est pas touché.

**Preuve par exécution, depuis les deux paquets livrables eux-mêmes** (serveur démarré
sur une base neuve, gestes rejoués en HTTP) : **15 contrôles OK** sur l'archive Linux
et **15 contrôles OK** sur le payload de l'installeur Windows — renommer / retirer /
ajouter une compétence du primaire, référentiel national resté inécrivable, barème /10
posé sur une colonne vide puis note saisie dans la même ligne, nom + téléphone + photo
du profil, et **aucune synchro Cloud active**.

| Artefact | Taille | SHA-256 |
|---|---|---|
| `packaging/linux/Output/notescam-linux-x64-0.3.16.tar.gz` | 53 416 669 | `5b53d83bd2ab2bc0fbdf27a214198cd147f950f51a87086d25688b44953669fc` |
| `packaging/Output/NotesCam-Setup-0.3.16.exe` | 30 751 010 | `bfee71232e437e26cdebe90d036f19b23951998f2c79b15953a53e336d32cb20` |

L'installeur Windows a été **reconstruit** après coup pour embarquer
`REDEMARRER-APRES-MAJ.cmd`, `sauvegarder-et-redemarrer.mjs` et la version
enrichie de `verifier-correctifs.mjs` (voir § 4 ter). L'empreinte ci-dessus est
la seule valable ; celle relevée en premier (`ee4420f3…`) est **périmée**.
L'archive Linux, elle, est inchangée : son `deploy-0.3.16.sh` faisait déjà le
redémarrage — le défaut était propre au vecteur Windows.

Accompagnement : `packaging/linux/deploy-0.3.16.sh` (sauvegarde vérifiée + contrôles des
trois écrans) et `packaging/linux/NOTICE-MISE-A-JOUR-0.3.16.txt`.
**Rien n'a été envoyé à une école.**

### 4 ter. Ce qui bloquait VRAIMENT sur le poste — incident I8

La 0.3.16 **était installée** sur ce poste (fichiers de `C:\Program Files\NotesCam` à
jour), et les trois écrans refusaient quand même. Cause établie, pas supposée : le
processus `node.exe` du port 8080 avait démarré **la veille** et annonçait encore
`0.3.4`. Les tables neuves étant posées **au démarrage**, la base restait à l'ancien
schéma. Son propre journal le disait : `[schema] colonne inconnue ignorée:
prim_competences.school_id`. Le barème passait parce que sa clé d'unicité avait été
posée par une version antérieure déjà redémarrée — d'où « l'un marche, les deux autres
non ».

**Faute de méthode de ma part, à ne pas refaire** : toutes mes vérifications portaient
sur une base **neuve**. Une base neuve ne peut pas reproduire un défaut de migration et
ne dit rien du processus en mémoire. Désormais : comparer la version des **fichiers**,
la version que le **serveur annonce**, et ce que la **base** porte.

Vérifié depuis, sur une **copie de la base réelle** de ce poste (COLLÈGE LA RETRAITE,
233 élèves, 10 054 notes, 13 806 en file, `integrity_check = ok`), avec le serveur
**installé** :

| Contrôle | Résultat |
|---|---|
| Migration sur la base existante (3 `school_id`, 3 tables de masques, `referentiel_libelles`, 3 colonnes de profil) | **10/10 posées** |
| Élèves / notes / file après migration | **233 / 10 054 / 13 806, inchangés** |
| Renommer, masquer, **ajouter** une compétence du primaire (« 1A Communiquer en français ») | **OK** |
| Référentiel du ministère resté inécrivable | **OK** |
| Profil : nom, téléphone, photo | **OK** |
| Barème /10 sur colonne vide puis note, une seule ligne | **OK** |

**Deux symptômes signalés qui ne se reproduisent PAS dans cette base** — ils viennent
d'un autre poste, ou d'une file restée dans le navigateur. Ne pas les traiter sans
données :

| Symptôme signalé | Ce que dit la base de ce poste |
|---|---|
| `prim_notes · upsert — ON CONFLICT ... does not match any UNIQUE constraint` | La contrainte `prim_notes_uniq (eleve_id, competence_id, critere_id, ua)` **existe** ici, et **au Cloud aussi** (`pg_constraint`, vérifié). Le libellé est celui de **SQLite**, donc d'un serveur LAN dont la table porte encore l'ancienne clé. |
| « Je crée un élève, il s'en crée six » | **Un seul** élève créé le 18/10 (« GOUDJA », 16 h 49), **une seule** ligne, **une seule** entrée en file. Aucun élève créé deux fois dans la même minute. |

`packaging/verifier-correctifs.mjs` répond désormais aux deux depuis n'importe quel
poste : il compare la version des fichiers à celle du serveur en marche, liste les clés
uniques réelles de `prim_notes`, signale les élèves créés plusieurs fois dans la même
minute, et dit **avant** tout redémarrage si la reconstruction de `prim_notes`
échouerait (une seule ligne hors des `CHECK` `ua ∈ [1;8]` / `points_max ∈ ]0;200]`
suffirait à la faire avorter — ce que l'ancien contrôle ne disait pas).

**Geste restant, et il demande l'administrateur** : redémarrer le service.
`packaging/REDEMARRER-APRES-MAJ.cmd` le fait (arrêt → sauvegarde vérifiée → redémarrage
→ contrôle), est désormais embarqué par l'installeur et figure au menu Démarrer. Je ne
peux pas le lancer : le service tourne sous SYSTEM, `Stop-Process` rend « Accès refusé ».

## 4 quater. BRIGHT CONTINENT — 19 notes d'Espagnol remises à leur place (2026-10-19)

Demande : « importe ces notes sur Bright Continent, première séquence »
(`Toutes_les_notes_par_classe_et_matiere (2).xlsx`, 118 lignes).

**Rien n'a été importé, et c'était la bonne décision** : les 118 notes étaient **déjà**
au Cloud depuis le 18/10 (§ 4). Réimporter aurait été refusé ligne par ligne —
`grades_class_student_subject_seq_key (class_id, student_id, subject_id, sequence)` ne
contient pas l'année.

Le vrai défaut, trouvé en réconciliant le classeur au Cloud : **19 notes d'Espagnol
écrites sous Mathématiques** (5ème 8, 4ème Esp 5, 3EME ESP 6) — mêmes élèves, mêmes
valeurs, mauvaise matière. C'est ce qui donnait des colonnes Espagnol vides.

**Appliqué sur autorisation explicite**, 3 `UPDATE` ciblés par identifiant, en
transaction, avec auto-contrôle refusant le commit hors de 19 / 0 / 118.
**Vérifié après coup** : réconciliation complète, **21 couples (classe, matière)
identiques, 0 écart, 118 = 118**.

Script, retour arrière et état relevé avant : `docs/corrections/` (nouveau dossier,
hors du préfixe `supabase_` réservé aux migrations).

Écarté après vérification, à ne pas « corriger » de réflexe : l'année `2024-2025` des
notes face à `current_year = 2026-2027` n'est pas un défaut — `fetchGrades`
(`src/lib/schoolService.js:222`) ne filtre pas par année, et toutes les écoles de la
plateforme sont dans ce cas.

### Pourquoi l'école ne les voyait pas — constaté à l'écran, pas déduit

`schools.bulletin_engine = 'officiel'` et aucun `bulletin_engine` par classe : les quatre
classes (6ème–3EME ESP, `cycle = secondaire`) sont donc résolues en **APC MINESEC**
(`src/core/engineResolver.js:216`). Conséquences, vérifiées en ouvrant l'application en
ligne avec le compte « Directeur » :

- l'écran **Notes** affiche « Saisie par compétences (APC) », qui lit `apc_notes`
  (26 lignes pour cette école) — **jamais `grades`**. Les 118 notes importées y sont donc
  structurellement invisibles ;
- son sélecteur **Matière** liste les **15 matières du référentiel national**, dont
  `Latin`, `Cultures Nationales`, `ESF`, `Travail Manuel` que la classe **n'a pas**, et
  **sans Espagnol** que la classe **a**. C'est le « on voit les matières qui ne sont pas
  cochées » : `ApcCompetenceWorkspace:218` part de `referentiel.matieres` et ne restreint
  aux matières de la classe que pour un enseignant en mode `subjectScoped` — jamais pour
  un admin. `core/refClassScope.js` existe exactement pour cela mais n'est branché que
  sur Bulletins, `pvEngine` et `classReportEngine` ;
- en revanche, le **bulletin au format « Classique »** lit bien `grades` : les notes
  s'affichent, Espagnol **14,5** compris pour ADJI OUSMANE CHERIF — la correction des 19
  notes est donc visible et juste.

**Décision à prendre par le responsable**, non tranchée ici : ces classes doivent-elles
rester en APC (les 118 notes n'ont alors pas de place — une note /20 par matière ne se
convertit pas en notes par compétence, et Espagnol n'existe pas au référentiel national),
ou passer au moteur classique ? Rien n'a été modifié.

## 4 quinquies. Tout en Excel, et le classeur des bulletins du second cycle (2026-10-19)

Demande : « ajouter au second cycle un bouton import et export en Excel, et rendre tous
les import et export en Excel ». Deux points tranchés avec le responsable avant d'écrire :
l'écran visé est **Bulletins** (celui de saisie des notes avait déjà ses deux boutons,
`Grades.jsx:887` et `:958`), et le CSV n'est **plus accepté à l'import** — Excel
uniquement.

**1. Le classeur des bulletins du second cycle.** Nouveau
`src/components/bulletins/ScBulletinExcelIO.jsx`, posé sous le sélecteur de format et
visible seulement sur `sc_officiel`. Export : un **récapitulatif** de la classe
(matières rangées par groupe comme sur le bulletin imprimé, moyennes de groupe, moyenne
générale, rang, décision) **plus une feuille par séquence** de la période. Import :
seules les feuilles dont le **nom porte un numéro de séquence** sont relues — le
récapitulatif ne contient que des moyennes de période et ne doit jamais redevenir des
notes (décision **D9**). Toute la logique est dans `src/lib/scBulletinSheet.js`, l'écran
ne fait que brancher les magasins.

**Preuve** : `src/lib/_scBulletinSheet.test.mjs`, **40 contrôles**, dont l'**aller-retour
réel** — le test extrait le vrai découpage d'en-têtes d'`exportCsv.js` (celui de l'écran
Notes) et vérifie qu'un classeur exporté puis relu ne produit **aucune** écriture. Sont
aussi fixés : cellule vide qui n'efface rien, note hors barème rejetée et non tronquée,
élève / matière inconnu listé et jamais rattaché au plus proche, comptage des
remplacements, regroupement des écritures en un `saveGrade` par élève et par séquence.

**2. Plus aucun CSV** (décision **D8**). `downloadCSV` et `triggerDownload` sont
supprimés ; les trois lecteurs d'`exportCsv.js` passent par un `readWorkbookAoa`
unique qui refuse ce qui n'est pas un classeur, avec un message qui dit quoi faire.
`EXCEL_ACCEPT` est la source unique des extensions proposées. Converti : caisse,
frais (export **et** import, qui découpait son propre CSV), rapports (4 exports),
personnel (export + modèle), élèves, enseignants, notes, compétences — plus les
libellés, l'aide, et les dictionnaires ES / TR.

**3. B2 est clos, et sa cause est établie.** Les deux tests qui extraient les fonctions
internes d'`exportCsv.js` **en découpant son texte** cherchaient la borne de fin sur
`\nfunction ` : une `export function` glissée entre la fonction extraite et la
suivante embarquait le mot-clé `export` dans `new Function` — « Unexpected token
'export' ». Second piège trouvé au même endroit : le corps découpé finit souvent sur une
**ligne de commentaire**, qui avalait le `; return X;` collé à sa suite (la fonction
compilait et ne rendait rien). Les deux bornes sont corrigées, `ECHECS_CONNUS` de
`scripts/run-tests.mjs` est **vide**, et la suite est à **180 ok / 0 ko**.

**Rien n'a été déployé, rien n'a été commité.**

## 4 sexies. THE GENIUS — « student_fees · upsert : duplicate key » (2026-10-19)

Signalé par l'école, lu dans le bandeau de synchronisation du navigateur :
`duplicate key value violates unique constraint "student_fees_student_id_academic_year_key"`.

**Cause établie.** `student_fees` porte `UNIQUE(student_id, academic_year)` au Cloud
(relevé dans `pg_constraint`) comme en LAN, mais tout le chemin d'écriture upsertait sur
`id` — et `saveFee` fabrique un `uuid()` neuf dès que la fiche n'est pas dans le cache
local. L'INSERT heurtait la ligne que le Cloud détient déjà sous un autre id : refus
23505, élément **bloqué dans la file du poste**, rejoué à chaque cycle puis mis en
quarantaine. Le dû saisi au guichet n'arrivait jamais. Incident **I9**, décision **D10**.

**Données de production vérifiées (lectures seules)** : école
`6b68407b-3d2e-426b-81ff-c4e68e66120a`, 693 fiches de frais en `2026-2027`
(133 980 000 F dus, 84 274 000 F encaissés) et **891 versements, aucun orphelin**. Le
blocage était dans la file du poste, pas dans les données — **rien à réparer en base**.

**Correctif** : `upsertFee` écrit dans la ligne existante et rend son id ;
`adopterIdFraisDistant` (schoolStore) réaligne le cache local ; `src/lib/sync.js` fait le
même rattrapage pour les éléments **déjà bloqués** — la file se résorbe d'elle-même au
prochain cycle, sans intervention sur le poste. Le cache de paiement du Cloud n'est
jamais écrasé (`fee_payments` fait foi, `reconcileFeesPaid` est monotone).

**Preuve** : `src/lib/_feeUpsertConflit.test.mjs` **21/21**, `npm test -- --filter fee`
**9 ok / 0 ko**, `npm test -- --filter sync` **17 ok / 0 ko**, `npm run build` OK.
Au passage, le double `./db` de `_syncBatch.hooks.mjs` a reçu `feesDB` (trois tests de
synchro ne chargeaient plus le module).

**POUSSÉ SUR `main` le 2026-10-20** sur autorisation explicite : commit `a65c5d3`
(rebasé sur `e9f9989`, tests rejoués après rebase), poussé dans `e9f9989..5ce28dc`.
Le déploiement Vercel part du GitHub, mais **il n'est pas vérifié ici** : aucun jeton
Vercel sur ce poste et le domaine de production n'est écrit nulle part dans le dépôt.
À constater sur le tableau de bord Vercel. Une fois en ligne, la file bloquée du poste
de l'école se résorbe d'elle-même au cycle de synchronisation suivant.

**Reste ouvert, même famille** : `sync-push` et le pull LAN (`rawUpsert`) travaillent
aussi `ON CONFLICT(id)` ; une fiche de frais dont l'id diverge entre LAN et Cloud ne peut
ni monter ni descendre. Inerte tant que la synchro hybride n'est pas activée — à traiter
avant de l'activer dans une école.

## 4 septies. Matières : classe, saisie et bulletin alignés — tous systèmes (2026-10-19)

Demande du responsable : « le choix de matière dans la modification de la classe, les
matières qui s'affichent sur le bulletin et à l'entrée des notes : ça doit être
identique » — *pour tous les systèmes*. Décision **D11**.

**Deux écarts trouvés, aucun des deux visible à l'écran.**

1. **L'ENSEMBLE, sur les trois cycles à référentiel national** (APC 6e–3e, primaire APC,
   maternelle). Ces écrans de saisie sont organisés par ligne du *référentiel*, pas par
   ligne `subjects` : ils proposaient **tout** le référentiel de la classe, alors que le
   bulletin, lui, ne gardait que ce que couvraient les matières cochées (`refClassScope`,
   branché au bulletin seul). Une enseignante pouvait saisir un trimestre entier
   d'Informatique que le bulletin ne portait pas. Le bandeau qui annonçait les lignes
   écartées ayant été retiré du bulletin (`45af74b`), le filtre était **muet**.
2. **L'ORDRE, sur tous les systèmes.** Huit écrans listaient `subjects` avec **cinq tris
   différents**. Seul le bulletin honorait `position` — la colonne qu'écrit
   « Réorganiser les matières ». L'administration rangeait les colonnes du bulletin, et
   la grille de saisie gardait l'ordre des coefficients : **la colonne que l'on croyait
   remplir n'était pas celle que l'on remplissait.**

**Correctif.** `src/core/subjectOrder.js` (nouveau) porte l'ordre unique et le périmètre
d'une classe ; les huit écrans l'appellent. Les trois postes de saisie officiels
appellent `refClassScope` comme le bulletin, avec son garde-fou (rien de reconnu ⇒ liste
complète, **jamais un écran vide**) et **annoncent** ce qui a été écarté, ainsi que les
matières cochées qui ne correspondent à rien au référentiel. L'appariement APC lit
désormais le libellé **anglais** officiel : seule la saisie passait un libellé localisé,
si bien que « Computer Science » se résolvait à la saisie et pas au bulletin.

Classique, second cycle et bilingue spécial partaient déjà des lignes `subjects` : leur
ensemble était déjà bon, seul l'ordre les concernait.

**Preuve** : `src/core/_subjectOrder.test.mjs` **19/19** (neuf), `_refClassScope.test.mjs`
**complété de 14 contrôles**, `npm test` **182 ok / 0 ko** (500 s), `npm run build` et
`npm run build:lan` OK.

**Commité et DÉPLOYÉ EN PRODUCTION** le 2026-10-19, sur autorisation explicite du
responsable, et **seul** : commit `1509d67` sur la branche de travail, greffé sur
`origin/main` par *cherry-pick* en `e9f9989` pour n'emporter **que** ce correctif.
`origin/main` : `2a9ad8e` → `e9f9989`.

Preuve de l'arbre **exact** qui est parti (worktree isolé sur `origin/main` + ce seul
commit) : `npm test` **165 ok / 0 ko**, `npm run build` et `build:lan` OK,
`npm run validate` 11/11. Preuve que le code est **réellement en ligne** : le bundle de
production a changé (`index-BKfPC-TO` → `index-T_5Hpr9E`) et le chunk
`Grades-D8vYGf2r.js` servi par `notescam-saas.vercel.app` contient les deux nouveaux
bandeaux (« ne sont pas cochées pour cette classe », « du référentiel officiel »).

✅ **Divergence RÉSORBÉE le 2026-10-20, par une autre voie que prévu.** `origin/main`
porte maintenant `da83daa` (« le rattrapage du doublon marchait au Cloud, pas sur les
postes ») : le **contenu** du correctif des frais est en production — vérifié, `sync.js` y
compte 3 occurrences de `feesDB` et le double de test 2. `b49ff5d` est donc **superseded**,
pas en attente : il n'y a plus de rebase à faire. Le paragraphe ci-dessous décrit l'état du
2026-10-19 et n'est conservé que pour l'historique.

⚠️ ~~**Divergence créée, à résorber avant le prochain push de `main`.**~~ `main` en local
(sorti dans le worktree `deploy-frais`) est resté à `b49ff5d` — le correctif des frais
THE GENIUS, **toujours pas déployé**. `origin/main` porte maintenant `e9f9989` à la
place. `b49ff5d` doit donc être **rebasé** sur `origin/main` avant d'être poussé ; il ne
l'a pas été ici parce que le responsable a demandé que **seules** les matières partent.
Restent aussi non poussés : caisse (`860a8dc`), les deux correctifs de synchro
(`ec40aa8`, `eb7a2b4`) et la livraison Linux (`3eb0f16`).

Le texte de ce § et la décision **D11** ne sont **pas** dans le commit déployé : ils sont
physiquement entrelacés, dans le même hunk, avec les § 4 bis à 4 sexies et les décisions
D7 à D10 d'autres sessions, encore non commités. Ils partent avec le lot « documents de
suivi ».

**Reste ouvert.** Sur un bulletin **officiel**, une matière maison (hors référentiel
national) ne peut pas s'imprimer : c'est le référentiel qui le veut, pas le logiciel.
L'écran le dit maintenant au lieu de la faire disparaître en silence, mais l'école qui
veut cette matière doit passer par le moteur classique.


## 4 octies. THE GENIUS — les 4 classes bilingues portent les deux programmes (2026-10-19)

Demande : « les unités d'apprentissage des matières ANGLOPHONES doivent se retrouver sur
les classes bilingues ; fusionne les classes anglophones avec les francophones, classique
comme APC, et laisse le choix d'ajouter ou de retirer une matière ». Puis, sur le
bulletin : « c'est le même bulletin, juste bilingue, certaines matières en FR et d'autres
en EN. »

**Les 4 salles, identifiées en base (lecture seule)** : `SIL BIL`, `CP BIL`, `CE1 BIL`,
`CE2 BIL` — `system = 'FR'`, `cycle = 'primaire'`, 46 élèves au total. Elles portaient
**exactement les 11 matières francophones** de leurs classes jumelles, **aucune matière
anglophone** ; les classes anglophones de la même école en portent 12, sur /100. Aucune
note n'est encore saisie dans ces classes (`grades`, `prim_notes`, `apc_notes` = 0) :
l'école est en train de les configurer, donc rien à migrer.

**La source est la classe JUMELLE, précisé par l'école bulletins en main** : « CE1 BIL =
fusion des matières de Class 3 + CE1 ». La correspondance n'est pas devinée — elle est
déjà dans le dépôt (`primaireNiveauSlug` : Class 3 = CE1 ; Class 1 = SIL), et
`niveauPartage` n'ajoute que le premier cycle (6e↔Form 1 … Form 5↔Seconde). Le niveau
équivalent est présélectionné, les autres classes restent proposées.

**Essai à blanc sur les listes réelles de production** : CE1 BIL (11 matières /20) ←
Class 3 (12 matières /100) donne **12 ajouts**, aucune matière remplacée, un bulletin de
23 lignes, et un élève à 75 % des deux côtés sort à **15/20**.

**Livré** : `src/core/bilingualSubjects.js` (fusion depuis la classe jumelle, repli sur le
tronc du niveau, barème par côté), `schoolStore.completerClasseBilingue` (n'ajoute que ce
qui manque),
et dans `Classes.jsx` : case « Classe bilingue » à la création, bascule + catalogue
élargi avec pastille FR/EN + bouton « Ajouter les N matières manquantes » dans l'écran de
la classe, et choix du côté (donc du barème) pour une matière **hors référentiel**.
Décision **D15**.

**Le bulletin n'a pas eu à changer, et c'est vérifié** : `calcFR` normalise déjà chaque
note par le barème de sa matière (`bulletinEngine.js:81`), donc une classe Français /20 +
English /100 a une moyenne juste ; l'écran de saisie lit déjà `subject.max` partout.

**APPLIQUÉ EN PRODUCTION le 2026-10-20, sur autorisation explicite** : **45 lignes
`subjects` créées** sur les quatre classes, copiées de leur jumelle du niveau équivalent
(SIL BIL ← Class 1 A, CP BIL ← Class 2, CE1 BIL ← Class 3, CE2 BIL ← Class 4), chacune
avec le coefficient et le barème /100 que l'école avait posés sur la classe d'origine.
Le commit était refusé hors de 45 lignes exactement. **Aucune ligne modifiée, aucune
supprimée** : « Chinois », déjà portée par trois des quatre classes, n'a pas été
recréée. État relevé après coup : CE1 BIL 23 matières (11 /20 + 12 /100), les trois
autres 22 (11 + 11), **0 note touchée** (ces classes n'en portaient aucune).

Script, retour arrière (écrit **avant** l'application, 45 identifiants figés) et
complément d'horodatage : `docs/corrections/2026-10-19-genius-classes-bilingues*.sql`.

Relevé au passage, **non corrigé** : `subjects.created_at` n'a pas de valeur par défaut
au Cloud et l'application ne le renseigne pas — une quinzaine de matières maison de cette
école (« Genius Labs », « Étude de texte »…) n'ont donc pas de date de création. Sans
conséquence fonctionnelle ; à traiter avec le chemin d'écriture, pas en base.

**Preuve** : `src/core/_bilingualSubjects.test.mjs` **82/82**, `--filter bil` 7 ok / 0 ko,
`--filter class` 4 ok / 0 ko, `--filter ref` 7 ok / 0 ko, `--filter subject` 1 ok / 0 ko,
`npm run build` ✓ (1027 modules). **Commité et poussé** : `5ce28dc` sur `main`.

## 4 undecies. « Je choisis Langue, le bulletin range en Autres matières » (2026-10-19)

Signalé après la mise en production de D11. Décision **D12**.

**Cause.** Deux taxonomies côte à côte. L'école pose un classement à la création
(`subjects.category` : sciences, informatique, langues, litteraire, eps, autre) et
l'emploi du temps l'honore depuis toujours. Le bulletin, lui, ne l'a **jamais lu** : il
rangeait dans ses cinq groupes par une heuristique sur le **nom**. Le menu
« Classement » n'avait aucun effet sur le document qui sort de l'établissement.

**Correctif.** `src/core/subjectGroup.js` (nouveau) : le classement **choisi** décide, le
nom n'est qu'un repli pour les matières dont l'école n'a rien dit. `litteraire` est le
seul cas ambigu (il couvre l'histoire-géo-philo **et** les arts, que le bulletin sépare) :
le nom y tranche, sciences humaines par défaut.

**Ce que l'audit a trouvé en passant** — en faisant traverser l'heuristique par **tous**
les noms du référentiel MINESEC : **20 des 56 tombaient en AUTRES**. Les sigles officiels
(`PCT`, `ECM`, `EAC`, `ESF`), reconnus écrits en entier mais pas abrégés, alors que toute
école les abrège. Toutes les langues au-delà des cinq listées (grec, italien, chinois,
portugais). Et **deux fautes d'écriture** : `manuelle?` exige deux `l`, donc « Travail
manuel » n'a **jamais** été reconnu ; `morale` ne pouvait pas reconnaître l'anglais
« Moral Education ». Les 56 noms officiels sont maintenant classés ; une matière maison
(« Zumba ») tombe toujours en AUTRES, où l'école peut la reclasser elle-même.

**Puis « tout toucher », demandé par le responsable — second cycle et bilingue aussi,
mais PAS de la même façon.** Les cinq groupes du classique/APC sont une commodité
d'affichage : le classement de l'école peut en décider. Les GROUPE 1 / GROUPE 2 du second
cycle et les domaines du bilingue sont fixés par l'**arrêté**, série par série : laisser
`category` les réécrire fabriquerait un bulletin officiel **non conforme**. Le classement
n'y touche donc pas, et c'est décidé.

Leur vrai défaut était ailleurs : ils cherchaient au référentiel le groupe, le coefficient
et la charge horaire par **égalité exacte du nom**. « Maths », « S.V.T », « Philo »,
« Hist-Géo » ne tombaient sur aucune ligne — la matière perdait son groupe réglementaire,
son coefficient officiel et sa charge, atterrissait sous AUTRES MATIÈRES, et rien ne le
disait. `src/core/refNameMatch.js` (nouveau) rapproche par nom exact, puis sans
ponctuation, puis par préfixe, puis mot à mot, **toujours sous contrainte de
non-ambiguïté** et sans aucun « au plus proche ». L'écran **nomme** celles qui restent
dehors. Deux libellés de repli figés en français (`scEngine`, `bilEngine`) suivent enfin
la langue : une classe Form 1–5 lisait « AUTRES MATIÈRES » sur un bulletin anglais.

**Puis le levier qui manquait (décision D13).** `refNameMatch` refuse de deviner : en cas
d'ambiguïté, ou pour un intitulé qu'aucune règle n'atteint (« Ed Civique », un nom propre à
l'établissement), la matière reste hors groupe. L'écran la **nommait** sans qu'on puisse la
**placer**. Sur une classe de second cycle, chaque ligne de matière porte donc un menu
`auto / Groupe 1 / Groupe 2` (`subjects.sc_groupe_ordre`, colonne déjà présente des deux
côtés — **aucune migration**). « auto » rend la main au référentiel ; un ordre posé à la
main n'est jamais réécrit. Réservé au second cycle : ailleurs ces groupes ne veulent rien
dire. Pas `category` comme levier, et c'est voulu — ce que l'école connaît, c'est l'arrêté
de SA série, donc on lui donne le **groupe officiel lui-même**, nommé comme sur le
bulletin. Le gabarit de grille du tableau, recopié **quatre fois**, est au passage défini
une seule fois.

Preuve par exécution, base SQLite **neuve** et vrai schéma du serveur : colonnes présentes
sans migration manuelle, écriture relue (`{"name":"Maths","sc_groupe_ordre":1}`), retour à
« auto » rendant `null`. `_sync_contract` et `_upsert_keys` au vert : l'écriture traverse
la synchro et ne peut pas boucler en file hors-ligne. Les 7 cellules de chaque rangée du
tableau sont alignées sur le nouveau gabarit, vérifiées rangée par rangée (bouton compris).

**État des deux correctifs de cette passe (D12 + D13)** : `npm test` **185 ok / 0 ko**
(619 s), `npm run build` et `npm run build:lan` OK, `npm run validate` 11/11.

Vérifié au passage et **non modifié** : « Groupe 99 » n'a jamais pu s'imprimer,
`scEngine.js` le remappait déjà en AUTRES MATIÈRES.

**Preuve** : `_subjectGroup.test.mjs` **76 contrôles** (dont l'audit des 56 noms officiels
en garde-fou), `_refNameMatch.test.mjs` **46 contrôles** (dont autant de cas « on ne place
rien » que de cas positifs). `npm test` **185 ok / 0 ko** (529 s), `npm run build` et
`build:lan` OK, `npm run validate` 11/11.

**Commité et poussé le 2026-10-20** (`5ce28dc`), déploiement Vercel à constater sur
le tableau de bord — non vérifié ici.


## 4 nonies. Paquet Windows 0.3.18 (2026-10-20)

Demande : « fais le .exe avec les modifications ». Construit depuis l'arbre de travail,
donc avec les chantiers non commités des autres sessions **en plus** des deux correctifs
de cette session — à savoir : caisse, synchro de fichiers, import d'enseignants, « tout
en Excel », contrat de synchro.

**Version 0.3.18, et non 0.3.17** : un `NotesCam-Setup-0.3.17.exe` existe déjà (19/10,
12 h 37) et ne contient **aucune** de ces modifications. Deux binaires différents qui
annoncent le même numéro, c'est exactement l'incident **I8** — le serveur annonce
`package.json.version`, qui a donc été bumpé.

**Défaut trouvé EN préparant ce paquet, et corrigé avant de livrer** : le rattrapage du
doublon de frais ne reconnaissait que le libellé **Postgres**. En LAN la base est SQLite
et dit `UNIQUE constraint failed: student_fees.student_id, student_fees.academic_year` —
le correctif était donc **inerte sur les postes d'école**, là où le guichet travaille
hors ligne. `estDoublonFrais` est désormais exporté et partagé par `upsertFee` et
`src/lib/sync.js`. Commit `da83daa`, poussé. Voir I9, deuxième paragraphe.

| Artefact | Taille | SHA-256 |
|---|---|---|
| `packaging/Output/NotesCam-Setup-0.3.18.exe` | 30 473 684 | `a767e2698ebb1c012757f31e08a7490017b0d2486349019bba150e984775ab17` |

**Contrôles exécutés sur le paquet lui-même** :

| Contrôle | Résultat |
|---|---|
| Contrôle du payload par le script de build (aucune donnée, aucune clé) | **OK — le payload ne porte que du code** |
| Serveur du payload démarré sur une base NEUVE, `GET /api/version` | **0.3.18** |
| Nouvelles chaînes dans le bundle livré (`Classe bilingue`, `Fusionner avec`) | présentes dans `dist/assets/Classes-*.js` |
| Garde-fou des frais dans le bundle livré (les deux libellés d'erreur) | présent dans `dist/assets/index-*.js` |
| `_feeUpsertConflit` / `--filter fee` / `--filter sync` | **31/31 · 9 ok 0 ko · 17 ok 0 ko** |

Accompagnement : `packaging/NOTICE-MISE-A-JOUR-0.3.18-WINDOWS.txt` (ASCII strict, CRLF
vérifiés : 0 octet non ASCII, 0 fin de ligne Unix). Elle porte l'empreinte, les trois
gestes d'installation — dont le redémarrage du service, celui qu'on oublie — et le retour
arrière vers 0.3.17.

**RIEN N'A ÉTÉ ENVOYÉ À UNE ÉCOLE.** L'envoi reste un acte humain, à autoriser pour cet
envoi-là.

## 4 duodecies. « Allemand et Espagnol restent dans Autres » — le créneau (2026-10-20)

Signalé après D12. Décisions **D13** (levier) et **D14** (créneau).

**Deux erreurs de diagnostic de ma part, corrigées par le responsable.** J'ai d'abord
conclu au second cycle : il a répondu **premier cycle**. La bonne lecture est que le
**programme bilingue spécial couvre aussi 6e–3e**, et que son bulletin (`bilEngine`) a un
bac « AUTRES MATIÈRES ». C'est le seul chemin produisant ce symptôme sur une 6e–3e : le
bulletin APC officiel n'a pas de bac « AUTRES », et sur le classique « Allemand » et
« Espagnol » tombaient **déjà** dans LANGUES par le nom, avant même D12.

**La cause.** Ni l'arrêté du second cycle ni l'arrêté 239-23 ne nomment la langue : ils
ouvrent un **créneau** — « Langue vivante II » / « Langue Vivante II (LVII) » — que
l'établissement remplit. « Espagnol » ne pouvait tomber sur aucune ligne, par **aucune**
règle de nom. Ce n'est pas un nom à reconnaître, c'est un créneau à remplir.

**Correctif** : une langue posée par l'école prend le créneau de sa série et hérite de son
groupe/domaine, coefficient et charge. Liste explicite et courte ; latin, grec, anglais,
français et langues nationales portent leur propre ligne et le nom passe **toujours**
avant le créneau. Sûr même à deux créneaux : les 15 lignes du second cycle se résument à
un triplet (`g1`, coef 3, charge 3). Garde-fou à l'exécution comparant `groupe_ordre`
**et** `domaine_ordre` — n'en regarder qu'un le rendait aveugle sur l'autre bulletin.

**Preuve** : `_refNameMatch.test.mjs` **111 contrôles**, `_subjectGroup.test.mjs` **76**.
Arbre de travail : `npm test` **185 ok / 0 ko**. Arbre **exact** déployé (worktree isolé
sur `origin/main` + ce seul commit) : **169 ok / 0 ko**, deux builds OK, `validate` 11/11.

**Commité et poussé** : `1d90cc8` sur la branche, cherry-pick **`65dabb0`** sur `main`
(`da83daa` → `65dabb0`), 7 fichiers, aucun schéma ni donnée ni migration.

**Ce qui n'est PAS parti : le menu « Groupe 1 / Groupe 2 » (D13).** Dans `Classes.jsx`, sa
colonne d'en-tête est **adjacente** au bloc « classe bilingue » d'une autre session, non
commité : contextes 3, 2 et 1 essayés, aucun ne les sépare. Il partira avec ce lot-là.

**Deuxième piège, propre aux worktrees de vérification** : `packaging/license/private-key.pem`
est **gitignoré** (`.gitignore:55`), donc absent d'un worktree neuf, et
`server/_license_machine.test.mjs` échoue sans elle. Il faut la copier **avant** le run et
ne la retirer qu'**après** — l'avoir retirée pendant un run a produit un « 1 ko » qui
n'avait rien à voir avec le code. Et il faut la retirer avant tout commit.

**Piège rencontré, à ne pas refaire** : j'ai tenté le contexte **zéro** pour les séparer.
Sans contexte, `git apply` place par **numéro de ligne** et mon `const school` a atterri
au milieu d'un littéral d'objet — build cassé. C'est la vérification sur l'arbre isolé qui
l'a attrapé. Le tri hunk par hunk doit rester en contexte **vérifié**.


## 4 decies. Paquet Linux 0.3.18 (2026-10-20)

Demande : « fais d'abord la version Linux avec les changements ». C'est le vecteur de
THE GENIUS (voir `LAN_EDITION.md` et les notices `packaging/linux/`).

| Artefact | Taille | SHA-256 |
|---|---|---|
| `packaging/linux/Output/notescam-linux-x64-0.3.18.tar.gz` | 53 015 377 | `b21d80e8899b4b47bd242413336bc8cc97768563fc7149dc0cfc6b033e136be7` |
| `packaging/Output/NotesCam-Setup-0.3.18.exe` | 30 473 684 | `a767e2698ebb1c012757f31e08a7490017b0d2486349019bba150e984775ab17` |

**15 contrôles exécutés sur l'archive extraite** (lecture seule) :

| Contrôle | Résultat |
|---|---|
| Version du paquet (`app/package.json`) | **0.3.18** |
| Garde-fou du script de build : ni base, ni clé, ni `.env` | **aucune base, aucune clé** |
| Recherche indépendante de `*.db` / `*.key` / `*.pem` / `.env*` dans l'archive | **liste vide** |
| `Classe bilingue` et `Fusionner avec` dans le `dist` livré | **PASS** |
| `student_fees_student_id_academic_year` (rattrapage des frais) | **PASS** |
| `academic_year/i` — détection du message **SQLite**, celle qui manquait | **PASS** |
| `Exporter Excel` et `seuls les classeurs Excel` (acquis 0.3.17) | **PASS** |
| 7 garde-fous serveur (caisse et signalements dans `syncVerify`, refus conservés dans `cloudSync`, `TOMB_CHUNK`, `update_my_profile`, `guardReferentielNational`, tables de masques) | **7/7 PASS** |
| `source_balance_raw` **reste absente** (B1 : migration Cloud en attente) | **PASS** |

Accompagnement : `packaging/linux/deploy-0.3.18.sh` — dérivé du 0.3.17 éprouvé (arrêt du
service, sauvegarde `VACUUM INTO` **vérifiée** avant de toucher à l'application,
normalisation CRLF, comptages qui ne doivent pas diminuer, `school_id` inchangé), avec
**4 contrôles neufs** sur le contenu de la 0.3.18, dont celui du message SQLite. Validé
par `bash -n`. Et `packaging/linux/NOTICE-MISE-A-JOUR-0.3.18.txt` (UTF-8), qui porte la
table des correspondances de niveau FR↔EN.

**Défaut relevé et corrigé au passage** : `NOTICE-MISE-A-JOUR-0.3.17.txt` portait encore
`@TAILLE@` et `@SHA@` **non remplacés** — un administrateur ne pouvait donc pas vérifier
l'empreinte de l'archive 0.3.17 avant de l'installer. Les deux valeurs réelles y sont
désormais (53 427 173 octets, `49e278a7ee8a54b7…`).

**RIEN N'A ÉTÉ ENVOYÉ À AUCUNE ÉCOLE.** L'envoi reste un acte humain, à autoriser pour
cet envoi-là.

## 4 terdecies. « Une matière maison doit garder son classement » (2026-10-20)

Demande du responsable, après la mise en ligne de D12/D14 : « on doit pouvoir être libre
de créer une matière même si ça ne fait pas partie du référentiel, et ça doit s'afficher
sur le bulletin dans sa vraie catégorie de classement, pas aller automatiquement sur
Autres matières. » Décision **D16**.

**Diagnostic mené dans le navigateur de l'école**, session ouverte sur THE GENIUS,
année 2026-2027, compte FONGANG. L'écran Notes charge normalement ; les sections offertes
sont Maternelle / Primaire / **Premier cycle**, et les classes de premier cycle sont
**5eme, 6eme, FORM1, FORM2** — les quatre classes **bilingues**. C'est donc bien le
bulletin du programme bilingue qui est en cause, ce qui confirme D14.

**Écarté par la mesure, pas par intuition** (lectures seules en production) : les 31
colonnes de `subjects` sont toutes présentes (`category`, `sc_groupe_ordre`,
`bil_domaine`…) ; le site répond 200 ; les droits colonne `authenticated` sur `subjects`
et `grades` sont complets ; **0** matière ou note orpheline ; la policy RESTRICTIVE
`secteur: cloisonnement` est active mais **ne verrouille aucun compte** (8 comptes
cloisonnés, au pire 4/28 classes accessibles). Aucune de ces trois hypothèses n'était la
bonne — et l'écriture des notes fonctionne, le responsable l'a confirmé.

**Correctif.** Sur le bulletin bilingue, une matière hors référentiel rejoint le domaine
de son classement. Les domaines y sont **thématiques** et recouvrent exactement les cinq
familles : Langues et littératures / Sciences humaines / Sciences et technologies / Arts
et cultures nationales / Développement personnel. Seuls le nom et l'ordre du domaine sont
repris — coefficient et charge restent ceux de l'école, aucun chiffre officiel n'existant
pour une matière absente de l'arrêté.

**Preuve** : `_subjectGroup.test.mjs` **97 contrôles**, dont les deux pièges que le test a
trouvés et pas la relecture — `/science/` qui attrapait « Sciences humaines » et envoyait
les mathématiques chez les historiens, et le groupe ARTS_SPORTS qui, faute de domaine
« Arts » en sous-système anglophone, rabattait les matières artistiques sur le domaine du
sport.


## 4 terdecies bis. « Quand je crée une matière, rien n'apparaît » (2026-10-20)

Signalé pour BRIGHT CONTINENT. Décision **D17**, migration
`supabase_apc_matieres_maison.sql` **appliquée en production** sur autorisation explicite.

**Diagnostic sur les données réelles.** L'école est en `bulletin_engine = 'officiel'` :
ses 6e–3e lisent le référentiel APC, son primaire les 11 compétences nationales, sa
maternelle les 8 domaines. Dans les trois cas l'écran se construit **à partir du
référentiel**, pas des lignes `subjects` — une matière créée dans « Modifier la classe »
n'existait donc nulle part. Mesuré : « Étude de texte », « Expression Orale »,
« Expression écrite », « Correction orthographique », « Langue Turc », « TM »,
« Philosophie », « Sciences Physiques » n'étaient réclamées par aucun référentiel.

**Écarté par la mesure** (lectures seules en production) : les 31 colonnes de `subjects`
sont présentes, le site répond 200, les droits colonne sont complets, **0** matière ou
note orpheline, et la policy RESTRICTIVE `secteur: cloisonnement` ne verrouille aucun
compte (8 cloisonnés, au pire 4/28 classes). Le filtre de périmètre du primaire ne retient
pas moins de **10 ou 11 compétences sur 11** selon les classes — il n'était pas en cause.

**Correctif** : l'école peut désormais **posséder** ses matières de premier cycle, et tout
ce qui est coché se matérialise — y compris les matières **déjà créées**, rattrapées en
une fois à l'ouverture de l'écran, sans toucher aux notes existantes.

**Deux garde-fous**, dont un ouvert par la fonctionnalité elle-même : la policy Cloud
`USING (true)` **remplacée** (sinon chaque école voyait les matières maison des 43 autres),
et `guardReferentielNational` étendu côté LAN aux deux nouvelles tables (sinon une école
LAN pouvait réécrire une matière nationale, que le seed aurait restaurée au redémarrage).

**Preuve** : `_referentielEcole.test.mjs` **52 contrôles** (23 neufs : les trois lignes
posées, le `school_id` partout, les refus de la base, « paramètres manquants → aucune
écriture à moitié »). Parité LAN prouvée sur une base SQLite neuve. Migration vérifiée
après coup : **43/43 matières toujours nationales, 72/72 rattachements inchangés**.


## 4 quaterdecies. Matières en double, et le carnet qui se taisait un trimestre sur deux (2026-10-22)

Deux demandes : « continue à résoudre les anomalies des matières qui se dupliquent,
vérifie et corrige toutes les anomalies de toutes les classes », puis « finis le travail
du bulletin du primaire de THE GENIUS ».

### Ce qui a été ÉCRIT en production, après autorisation explicite

**1. 34 matières de classe en double, retirées.** 33 couples (classe, matière),
4 écoles : goudja 15, THE GENIUS 10, BRIGHT CONTINENT 8 (toute la Nursery 2),
Collège La retraite 1. Un cas à trois copies (5eme de THE GENIUS, « Histoire »).
Incident **I10**, décision **D18**.

- *Avant écriture*, en lecture seule : **0** note en conflit de valeur, 10 notes
  strictement identiques à retirer, **0** à déplacer. Les 10 notes de SVT portaient la
  même valeur, pour le même élève, à la **même seconde**, sur les deux identifiants —
  une saisie écrivait sur les deux copies.
- *Après écriture* : **0** couple en double, **0** note orpheline, SVT a gardé ses
  10 notes, Home Economics ses 41, « Expression Écrite » a retrouvé le rang 3 de sa
  copie. **34 `sync_tombstones`** + 10 pour les notes : les écoles en LAN retireront la
  ligne d'elles-mêmes au prochain cycle. Sans ces pierres tombales, l'école aurait gardé
  son doublon et l'aurait repoussé au Cloud.
- Outils : `scripts/audit-matieres-doublons.mjs` (lecture seule, garde-fou qui refuse
  toute requête non-lecture), `docs/corrections/2026-10-22-matieres-doublons.sql`, son
  `-RETOUR-ARRIERE.sql` (lignes et notes réinsérées colonne par colonne, tombstones
  retirés) et `.etat-avant.json` (l'état complet avant écriture).

**2. Le carnet du primaire activé pour THE GENIUS.**
`prim_bulletin_mode = 'carnet'` sur `6b68407b-…`, par identifiant et non par nom
(deux écoles portent « Genius »). Ce qui manquait n'était pas du code : la colonne était
en prod, les cinq blocs étaient écrits, le bouton était à l'écran — mais seule
**COLLÈGE LA RETRAITE** (école de recette) portait `'carnet'`. La vérification avait été
faite là, et l'école qui l'avait demandé ne l'avait jamais eu.
`docs/corrections/2026-10-22-genius-carnet-primaire.sql`, retour arrière en pied.

**Ce que le carnet ne montrera pas encore, et pourquoi ce n'est pas un défaut.**
THE GENIUS porte **zéro note de primaire** : ni compétence (`prim_notes` = 0), ni note
classique (0 sur les 17 classes de son primaire). Le réglage est donc en place et
vérifié, mais l'écran restera vide jusqu'à la première saisie dans « Compétences du
primaire ». Le référentiel national, lui, est bien là (11 compétences). À dire à l'école
telle quelle : le carnet est prêt, il attend ses notes.

### Ce qui a été corrigé dans le CODE

**EN LIGNE depuis le 2026-10-22** — `f4dce88` (le lot), `8872c23` (la fusion avec
`origin/main`), puis `b8b9438` (doublon de langue) et `270432e` (en-tête anglais, logo
par secteur). Le responsable a lancé le `push` lui-même (`f5c27c7..270432e`) ; le
déploiement Vercel de `270432e` est **READY**. Les 44 écoles du Cloud l'ont, après un
rechargement forcé de la page (Ctrl+Shift+R) — le service worker sert l'ancienne
interface jusque-là.

**Côté LAN, le paquet Windows 0.3.20 est construit, et RIEN N'EST ENVOYÉ.**
`packaging/Output/NotesCam-Setup-0.3.20.exe`, 30 791 053 octets, SHA-256
`760f39368a31ec14ec17fb0922c7843b73f892f5567e9e399bd44ff0be515eb9`. Vérifié sur le
paquet lui-même, pas sur le dépôt : `app/package.json` embarqué annonce bien 0.3.20, et
le bundle livré porte les deux correctifs du jour (`Regional Delegation for the` ×2, et
la table des paires de traduction `[["francais","french"],…]`). Notice :
`packaging/NOTICE-MISE-A-JOUR-0.3.20-WINDOWS.txt` (ASCII, CRLF).

Cette version **pose cinq tables neuves** côté LAN — `cash_movements`,
`referentiel_libelles`, `apc_competences_masques`, `prim_competences_masques`,
`mat_domaines_masques` — créées au DÉMARRAGE du serveur : le redémarrage du service
après installation n'est donc pas optionnel, et la notice le dit à sa place d'étape 2.
Le paquet **Linux** de THE GENIUS n'est pas construit pour 0.3.20.

**3. Le carnet ne se tait plus un trimestre sur deux.** Décision **D19**. Les cinq blocs
n'étaient câblés que sur la disposition **compacte**, que « Auto » ne choisit que pour une
période d'UNE unité d'apprentissage. Dès qu'on imprimait un trimestre (UA1-3), la
disposition détaillée reprenait la main et le carnet perdait ses regroupements, son
travail académique et sa répartition — sans message. `BulletinPrimAnnualUA` reçoit
maintenant les mêmes props, depuis la même source, et `groupesDe` du moteur reste le seul
calcul. Preuve : `src/core/_carnetPrimaire.test.mjs`, **34 contrôles**, dont la
comparaison stricte des groupes entre les deux formes de ligne.

**4. Deux matières au même rang ne s'échangent plus entre écrans.** 6 rangs partagés en
5eme chez THE GENIUS, 8 dans la 3e de LA RÉUSSITE. À rangs égaux `bySubjectOrder`
rendait `0` ; `Array.sort` étant stable, l'ordre retombait sur celui de la **liste
reçue**, qui n'est pas la même d'un écran à l'autre. Le défaut que **D11** avait fermé,
revenu par la porte des ex æquo. Le départage continue sur le coefficient, le nom, puis
l'identifiant (`src/core/subjectOrder.js`, 4 contrôles neufs dans
`_subjectOrder.test.mjs`).

### Audit de TOUTES les classes — ce qui est sain, et ce qui ne l'est pas

12 contrôles d'intégrité sur l'ensemble des 44 écoles, tous à **0** sauf deux :
note dont la matière appartient à une autre classe, note dont l'école diffère de celle de
la matière, doublon de note (élève, matière, séquence, année), coefficient nul,
barème nul, note sur une matière supprimée, matière rattachée à une classe supprimée,
matière sans classe, note sans matière, matière sans nom, classe sans nom.

| Constat | Nombre | Verdict |
|---|---|---|
| Note dont l'élève n'est plus dans la classe de la note | 58 | **Pas un défaut** : l'élève a changé de classe, la note garde la sienne. Toutes en 2024-2025, écoles de test |
| Classe avec des élèves et aucune matière | 8 | **Pas un défaut** : maternelles qui s'auto-configurent à l'ouverture de l'écran (3 réelles, à LA RÉUSSITE), le reste en écoles de test |
| Classe dont l'année diffère de celle de l'école | 131 | **Pas un défaut** : le produit crée une ligne par année scolaire |
| Classe sans titulaire | 190 | **Pas un défaut** : les écoles ne l'ont pas renseigné |
| Barèmes divergents entre classes du même niveau | 15 niveaux | Réel, mais **décision d'école** (voir ci-dessous) |
| Deux matières au même rang dans une classe | 18 | 10 disparus avec les doublons ; 8 restants désormais **ordonnés de façon stable** |

### Trois écarts préparés, NON appliqués — ils appartiennent à l'école

| Fichier (`docs/corrections/`) | Ce qu'il faut demander |
|---|---|
| `2026-10-22-coefficients-a-trancher.sql` | 7 coefficients divergeaient entre les deux copies fusionnées (GENIUS 5eme : SVT, Histoire, Étude de texte, 2 contre 1 ; goudja : Anglais 3 contre 4, Biology 3 contre 2, EPS 2 contre 1). Changer un coefficient change une **moyenne** |
| `2026-10-22-genius-baremes-classes-paralleles.sql` | Class 1 A se contredit : `grade_max = 20` alors que ses 12 matières sont toutes en /100. Class 1 B est en /100. NURSERY 1 A est déclarée FR /20, NURSERY 1 B EN /100 — peut-être **voulu** dans une école bilingue. Les 4 classes portent **zéro note** : le moment est favorable |
| `2026-10-22-genius-5eme-rangs-partages.sql` | Renumérotation 0→15 de la 5eme, qui supprime 6 ex æquo et 7 trous sans déplacer une seule matière. L'ordre d'un bulletin appartient à l'école |

### Tests

`npm test` → **189 ok, 1 ko**. L'échec est `server/_bulletinSecurityE2E.test.mjs`
(« fetch failed »), **relancé seul : 39/39**. Même intermittence de démarrage que
`_referentiel_http` (§ 8) — pas un défaut de code, mais un faux rouge qui coûtera cher en
CI. `npm run build` → OK.

## 5. Travaux en cours — 69 fichiers non commités

38 fichiers modifiés (+1303 / −510) et 31 non suivis. Regroupement proposé pour des
commits séparés et relisibles :

| Lot | Fichiers | État |
|---|---|---|
| **Caisse** | `cashBookEngine.js`, `cashBookService.js`, `CashBook.jsx`, `scripts/import-caisse-genius.mjs`, `scripts/lib/caisseWorkbook.mjs`, `supabase_cash_book*.sql`, `docs/DEPLOIEMENT_CAISSE.md` + 3 tests | Tables `cash_sessions` / `cash_movements` **déjà en prod** (2 sessions). Migration `raw_balance` **non appliquée** (voir B1) |
| **Synchro de fichiers** | `server/fileSync.js`, `supabase/functions/asset-sync/`, `_file_sync.test.mjs` | Tests présents et au vert |
| **Import d'enseignants** | `src/lib/teacherImport.js`, `_teacherImport.test.mjs` + hooks, `src/pages/Teachers.jsx` (+273), refactor `exportCsv.js` | Tests au vert — **B2 clos** le 2026-10-19 |
| **Tout en Excel + classeur du second cycle** | `src/lib/exportCsv.js`, `scBulletinSheet.js` + son test, `components/bulletins/ScBulletinExcelIO.jsx`, `Bulletins.jsx`, `Fees.jsx`, `Reports.jsx`, `CashBook.jsx`, `Students.jsx`, `Teachers.jsx`, `Personnel.jsx`, `Grades.jsx`, `Help.jsx`, `staffExport.js`, `GradeImportPanel.jsx`, `CompetenceGradeIO.jsx`, `i18n_es/tr`, `scripts/run-tests.mjs` | Tests au vert (180/180), **build cloud et LAN OK**. Décisions D8 et D9 |
| **Contrat de synchro** | `server/cloudSync.js`, `db.js`, `query.js`, `rpc.js`, `syncRepair.js`, `schema.sql`, 4 fonctions edge, `_sync_contract.test.mjs` | Tests au vert |
| **Divers** | `sourceKey.js`, `supabase_sync_signalements.sql`, `docs/MODULE_CANTINE.md`, paquets Windows/Linux | — |

## 6. Blocages

**B1 — `supabase_cash_book_raw_balance.sql` non appliquée au Cloud.**
Vérifié : `cash_movements` et `budget_expenses` n'ont pas la colonne `source_balance_raw`
en prod. `server/db.js:1282` documente la conséquence et la parade retenue le 18/10/2026 :
la colonne est **volontairement retenue côté LAN**, car `sync-push` applique la ligne
entière et une colonne inconnue du schéma Cloud fait **refuser la ligne** — toute dépense
ou tout mouvement modifié à l'école cesserait de remonter. À rétablir **en même temps**
que la migration, jamais avant. Voir `docs/JOURNAL_DECISIONS.md` D1.

**~~B2~~ — CLOS le 2026-10-19.** Le refactor d'`exportCsv.js` ne casse plus rien ;
`ECHECS_CONNUS` de `scripts/run-tests.mjs` est vide et la suite est à **180 ok / 0 ko**.

Cause exacte, enfin établie — elle n'était pas dans le COMPORTEMENT du module mais dans
l'**ordre de ses déclarations**. `_importStudents` et `_studentFieldsIO` extraient les
fonctions internes d'`exportCsv.js` par découpage de texte, d'une déclaration
`function` à la suivante (`indexOf('\nfunction ')`). Une `export function` glissée
entre la fonction extraite et la suivante tombait donc **dans** le découpage, et
`new Function` refusait le mot-clé : « SyntaxError: Unexpected token 'export' ». C'est
pourquoi aucun changement pris isolément ne la reproduisait. Second piège au même
endroit : le corps découpé finit souvent sur une **ligne de commentaire**, qui avalait le
`; return X;` collé à sa suite — la fonction compilait alors sans rien rendre.

Corrigé dans les deux tests : la borne de fin reconnaît **toute** déclaration de premier
niveau (`function`, `export function`, `export async function`, `const`, `class`)
et le `return` est posé sur sa propre ligne. L'extraction ne dépend donc plus de l'ordre
des déclarations. Le garde-fou reste inscrit dans `exportCsv.js` (près de
`parseGradesRows`, exportée par un alias pour cette raison même) et dans les deux tests.

## 7. Risques

| # | Risque | Constat vérifié |
|---|---|---|
| R1 | 71 fichiers non commités, en 7 lots. Plus aucun ne casse de test (182/182) | § 5 |
| R2 | **La recette se fait en production** : l'école `[RECETTE] École B (isolation)` vit dans le projet Supabase de prod. Aucun environnement séparé | `select * from schools` |
| R3 | Deux systèmes de migrations en parallèle (205 plats + 20 CLI) ; `validate:migrations` ne contrôle que 3 fichiers ciblés | `scripts/validate-migrations.mjs` (`TARGETS`) |
| R4 | `README.md` annonce « Sprint 1 livré » sur un produit 0.3.15 déployé en écoles | `head README.md` |
| R5 | **Dérive de schéma** : des tables existent en prod sans que leur fichier de migration soit commité (`supabase_cash_book.sql`, `supabase_sync_signalements.sql`) | § 5 |
| ~~R6~~ | ~~Aucune CI~~ — **traité le 2026-10-18** : `.github/workflows/ci.yml`. Reste à vérifier que le premier run passe sur GitHub | — |
| R7 | Les 8 parcours critiques sont déclarés mais **non écrits** (`test.fixme`) : il manque une école de semence et un compte de test sur la base jetable. Les briques existent (`seed:ecole`, `seed-college-la-retraite`, `reset-password-cli`) | `npm run test:e2e` |

## 8. Prochaine action exacte

**Poser à l'école les trois questions du § 4 quaterdecies**, dans cet ordre d'urgence :

1. **Barèmes de THE GENIUS** — Class 1 A annonce /20 et note ses 12 matières sur /100.
   Les 4 classes concernées portent **zéro note** : corriger maintenant ne déplace aucune
   moyenne, attendre les premières notes rendrait le même geste coûteux.
2. **Sept coefficients** divergeaient entre les copies fusionnées. Les valeurs en vigueur
   sont celles des lignes qui portaient les notes, et restent plausibles — rien ne presse,
   mais l'école doit savoir que la question existe.
3. **Rangs de la 5eme** — renumérotation prête, à appliquer seulement si l'école la veut.

Le SQL et son retour arrière sont prêts pour les trois (`docs/corrections/`), **aucun
n'est appliqué**.


**Commiter les sept lots du § 5, séparément.** Le lot « matières : classe, saisie et
bulletin alignés » (§ 4 septies, décision **D11**) est autonome : il ne touche ni schéma,
ni données, ni synchronisation, et il se relit seul.

**Commiter les six autres lots, séparément.** Le verrou est levé : B2 est clos et la
suite est à 180 ok / 0 ko, donc plus rien n'empêche de commiter — `exportCsv.js`, tiré à
la fois par l'import d'élèves et par celui d'enseignants, est désormais au vert pour les
deux. Ordre suggéré : « Tout en Excel + classeur du second cycle » et « Import
d'enseignants » **ensemble** (ils partagent `exportCsv.js`), puis caisse, synchro de
fichiers, contrat de synchro, divers.

**À faire valider par le responsable avant livraison en école** : un `.csv` qui
circulerait déjà dans une école est maintenant **refusé** à l'import (décision D8, prise
sur sa consigne « tout en Excel »). La parade tient en une phrase, et le message de refus
la porte : ouvrir le fichier dans Excel, « Enregistrer sous » → Classeur Excel.

Ensuite, dans l'ordre : appliquer B1 (migration Cloud **puis** rétablir les deux
`ensureColumn`) → décider de R2 (environnement de recette) → trancher le moteur des
classes de BRIGHT CONTINENT (§ 4 quater).

**Pour la 0.3.16 (§ 4 bis)**, rien n'est en attente de décision technique : les deux
paquets sont construits et vérifiés par exécution. Il reste un acte **humain** —
envoyer à l'administrateur de l'école l'archive, `deploy-0.3.16.sh` et la notice, et le
laisser lancer la commande. **À ne pas faire sans autorisation explicite pour cet
envoi-là.**

Deux points mineurs relevés et non traités :
- `server/_referentiel_http.test.mjs` a échoué une fois sur « serveur non prêt » en
  30 s, puis passé au ré-essai immédiat. Intermittence de démarrage, pas de défaut de
  code — à surveiller en CI, où un faux rouge coûterait cher.
- `src/lib/_referentielEcole.test.mjs` s'exécute avec un loader
  (`_referentielEcole.hooks.mjs`) qui double `./supabase` : le module testé le tire, et
  `import.meta.env` n'existe pas hors de Vite.

## 9. Tests exécutés le 2026-10-18

```
npm test                  → 177 ok, 2 ko (B2, tolérés par le cliquet), 597 s cumulées
                            Aucune régression : les 2 échecs sont exactement ceux de B2.
                            Le relevé « 176 tests » du matin est périmé — `find` compte
                            aujourd'hui 180 fichiers `_*.test.mjs` hors packaging, le
                            lanceur en exécute 179. Écart d'1 à élucider (à vérifier).
npm test -- --filter referentiel → 5 ok, 0 ko
vérification des paquets  → 15/15 sur l'archive Linux, 15/15 sur le payload Windows
npm run validate          → 11/11 tests critiques, 0 échec — BUILD AUTORISÉ
npm run validate:migrations → idempotence et sûreté OK, 0 avertissement
npm run build             → ✓ built in 19.30s
npm run build:lan         → ✓ built in 1m 60s
npm run test:e2e          → 3 passés (fumée), 21 ignorés (parcours en test.fixme)
```

## 10. Outillage — état des autorisations du 2026-10-18

| Chantier | État |
|---|---|
| Push du correctif en production | **fait**, déploiement `READY` |
| CI GitHub Actions | **fait**, premier run à vérifier |
| E2E Playwright | **amorcé** : fumée au vert, parcours à écrire (R7) |
| Beads | **bloqué côté installation** : Go absent du poste, et le paquet npm `beads` est `zenozeng/beads`, sans rapport. Le vrai outil est le module Go `github.com/steveyegge/beads` (v0.21.1), qui s'installe par un script distant exécuté en shell — à lancer par le responsable, pas par l'agent |
