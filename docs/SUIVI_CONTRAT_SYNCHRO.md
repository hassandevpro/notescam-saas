# Suivi — écarts du contrat de synchronisation LAN/Cloud

Écarts identifiés pendant B6.1 (21/09/2026), **laissés hors périmètre par décision
explicite**. Ce fichier existe pour qu'ils restent des décisions en attente et non
des oublis : chacun porte son coût, son déclencheur et ce qu'il faudrait faire.

Le cliquet automatique est ailleurs : `server/_sync_contract.test.mjs` fait
ÉCHOUER le test pour tout écart qui n'y est pas inscrit, et
`scripts/audit-contrat-deploye.mjs` compare le déployé aux sources.

---

## 1. `class_fee_grids` — hors périmètre B6.1

**État.** Déclarée dans `SYNCED_TABLES` (`server/db.js`) — donc estampillée
`updated_at`/`version`/`device_id` et mise en outbox à chaque modification — mais
absente des quatre listes des Edge Functions **et** de `PULL_ORDER`
(`server/cloudSync.js`). Ses changements partent dans l'outbox et sont purgés
sans jamais atteindre le Cloud.

**Pourquoi ce n'était pas bloquant pour B1→B6.** La dette réelle d'un élève ne
dépend pas de cette table : `src/lib/feeEngine.js` donne la priorité à
l'INSTANTANÉ figé sur l'élève (`fee.tranches`), la grille n'étant qu'un repli, et
`student_fees.tranches` porte cet instantané (`server/schema.sql:238`).
`student_fees` se réplique. Les montants dus affichés côté Cloud sont donc
exacts. C'est en outre un gabarit de **scolarité**, sans rapport avec les frais
périodiques de B1→B6.

**Ce qui reste faux.** Le Cloud détient 55 grilles figées au jour de l'ETL
d'activation (`server/activateCloud.js`). Si une école modifie un tarif en LAN,
le Cloud garde l'ancien. Conséquences, toutes limitées à la CONFIGURATION :
- un élève inscrit **depuis le web** avant que son instantané ne soit figé prend
  le tarif du repli, c'est-à-dire l'ancien ;
- le total échelonné déclaré (`grid.amount_echelonne`, `feeEngine.js:110`) se
  replie sur la somme des tranches, ce qui diverge si la grille déclarait un
  total différent de cette somme.

**Coût d'un traitement.** Ajouter la table aux quatre listes **et** à
`PULL_ORDER`. Attention : la RLS Cloud réserve l'écriture à la caisse
(`class_fee_grids: écriture caisse`, migration `20260805091500_fee_integrity`).
À valider avant, sans quoi les lignes seront rejetées et perdues comme
aujourd'hui, mais plus discrètement.

**Déclencheur.** Dès qu'une école modifie ses grilles après activation, ou à la
première inscription faite depuis le web sur un tarif révisé.

---

## 2. `signalements` — enfant sans parent

`signalement_comments` et `signalement_history` se répliquent ; le `signalements`
qui les porte, non. La FK Cloud refuse alors l'insertion, la ligne est comptée
`skipped` et l'outbox est purgée : le commentaire est perdu.

Inscrit dans `server/_sync_contract.test.mjs` (contrôle 6). Trouvé le 18/09/2026.

---

## 3. `hr_payroll*` — répliquée, mais ni auditée ni réparable

Depuis le 21/09/2026, `hr_payroll`, `hr_payroll_catalog` et `hr_payroll_items`
montent **et** redescendent : l'asymétrie de production est corrigée (`sync-push`
déployée les connaissait, `sync-pull` non — la paie montait sans jamais revenir).

Elles restent **absentes de `sync-verify` et `sync-repair`**, ce qui a été
confirmé en production le 21/09/2026 : `sync-repair` sur `hr_payroll` répond
`bad_table`. Conséquence : une ligne de paie perdue ne sera jamais détectée ni
reconstituée — c'est le seul chemin de rattrapage qui existe.

Inscrit dans `server/_sync_contract.test.mjs` (`GAPS_CONNUS`).

**Jeux DIFFÉRENTS de part et d'autre — comportement attendu après 0.2.7.**
Relevé le 22/09/2026 sur la démo COLLÈGE LA RETRAITE : Cloud et LAN portent
chacun 16 bulletins, 99 lignes, 7 entrées de catalogue et 16 membres du
personnel… avec **0 identifiant commun** (deux seeds indépendants, cf. le
`--reset` qui casse l'alignement). Aucune donnée n'a été arbitrée, supprimée ni
réconciliée : ce qui suit décrit seulement ce que FERA le code.

Des ids disjoints ne peuvent pas entrer en conflit : il n'y a ni écrasement ni
perte, mais **union**. Au premier démarrage en 0.2.7, la relecture complète fait
descendre les lignes Cloud : côté LAN, la paie passerait de 16 à 32 bulletins et
le personnel de 16 à 32 — deux jeux pour les mêmes personnes, sous deux
identités. Le Cloud, lui, ne bouge pas : les bulletins LAN anciens ne sont plus
dans l'outbox, et `hr_payroll*` n'est ni auditée ni réparable (ci-dessus), donc
rien ne les y renvoie.

Le personnel se dédoublerait **de toute façon** (`staff` est dans `PULL_ORDER`
depuis longtemps, et toute montée de version qui ajoute une colonne remet déjà
le curseur à zéro) ; c'est la paie que la 0.2.7 ajoute à ce constat.

**Portée : la DÉMO seulement.** Pour THE GENIUS, le Cloud ne contient aucune
ligne de paie (vérifié le 22/09/2026), et ses lignes Cloud viennent de l'ETL
d'activation de son propre LAN — donc avec les MÊMES ids. La 0.2.7 n'y produit
aucun dédoublement. Avant d'installer la 0.2.7 sur la démo, en revanche, il faut
décider quoi faire de cet alignement rompu — c'est une décision, pas un
correctif automatique.

---

## 4. `fee_schedule_items` absente de l'ETL d'activation

`server/activateCloud.js` (`PUSH_ORDER`) ne liste pas la table. Une école qui
s'active après avoir créé des échéances en LAN ne les enverra pas lors de la
migration initiale.

**Atténué** depuis le 21/09/2026 côté Edge : `sync-verify` et `sync-repair`
couvrent la table, et l'auto-réparation tourne à chaque cycle de synchro
(`server/cloudSync.js`). Correctif éventuel de l'ETL : une ligne, après
`student_fee_items` (ordre FK).

**ATTENTION — l'atténuation était fausse jusqu'au 22/09/2026.** Le côté LAN
manquait : `VERIFY_TABLES` (`server/syncVerify.js`) ne listait pas
`fee_schedule_items`. Or `autoRepair` ne répare que ce que ce contrôle déclare
divergent — le rattrapage n'aurait donc JAMAIS été déclenché, quoi que sachent
les Edge Functions. Corrigé dans la 0.2.7 (une ligne) et verrouillé par les
contrôles 2b et 16 à 21 de `server/_sync_rattrapage.test.mjs`, dont un scénario
de bout en bout qui fait tourner le VRAI `verifyIntegrity` : sans la ligne, il
ne signale aucune divergence et le Cloud reste incomplet.

---

## 5. `cash_sessions` — contraintes LAN plus permissives que le Cloud

Le Cloud impose deux CHECK que le schéma LAN (`server/schema.sql:338-358`) n'a
pas :
- `cash_sessions_no_self_validation` — personne ne valide son propre comptage ;
- `cash_sessions_variance_explained` — un écart non nul doit être justifié pour
  clore la journée.

Un arrêté LAN qui viole l'un des deux sera refusé à la montée. L'erreur est
loguée (`[sync-push] upsert error`) mais la ligne est perdue avec la purge de
l'outbox.

**Traité en 0.2.7 (22/09/2026).** Deux triggers `cash_sessions_cloud_checks_ins`
/ `_upd` dans `server/schema.sql` reproduisent les deux règles à l'identique
(`btrim` ↔ `trim`, `IS DISTINCT FROM` ↔ `=` sur valeur non nulle). Le refus a
lieu à la saisie, avec un message explicite. Triggers plutôt que CHECK : SQLite
ne sait pas ajouter une contrainte à une table existante, et les bases déjà
installées doivent être couvertes. Aucune ligne existante n'est touchée.
Prouvé par `server/_cash_sessions_cloud_checks.test.mjs` (16 cas).

L'écran respectait déjà ces règles (`requiresExplanation` appelé avec une
tolérance de 0, `canValidate`) : seule une requête forgée sur `/api/db` pouvait
produire un arrêté refusé ensuite par le Cloud.

Le trigger `trg_freeze_validated_cash_session`, lui, **ne gêne pas** la synchro :
il s'auto-désactive pour le `service_role` (`auth.uid() IS NOT NULL`). Vérifié le
21/09/2026.

---

## 6. Collision d'unicité secondaire sur `fee_schedule_items` — DETTE B6.2

`sync-push` écrit en `upsert(row, { onConflict: 'id' })` — il ne connaît que la
clé primaire. Or la table porte aussi `UNIQUE(student_fee_item_id, period_key)`,
des deux côtés. Si le même couple (frais, période) était généré de part et
d'autre avec des ids différents, l'INSERT serait rejeté et la ligne perdue.

Mesuré par le contrôle 26 de `server/_sync_contract.test.mjs`. Traitement : un
id déterministe dérivé du couple métier, **dans le web ET dans le LAN à la fois**
(l'un sans l'autre ne ferme rien).

**Correction du 22/09/2026 : le risque est RÉEL en mode hybride.** Cette note
disait « sans effet tant que le web ne génère pas ». Or il génère : B2 est en
production web (`origin/main`), et `generateSchedule`
(`src/lib/feeScheduleService.js`) crée les échéances manquantes avec un `uuid()`
aléatoire. Si le web et le LAN génèrent le même (frais, période) entre deux
cycles de synchro (5 min), les deux lignes ont des ids différents :
- à la MONTÉE, le Cloud refuse la ligne LAN (unicité) — comptée `skipped` ;
- à la DESCENTE, le LAN refuse la ligne Cloud (même unicité) — `rawUpsert`
  échoue, la ligne part en file de rejeu et y reste.
Aucune dette n'est dupliquée (l'unicité tient des deux côtés), mais les deux
bases gardent chacune SA ligne pour la même période, et un versement rattaché à
l'une est invisible pour l'autre. Constat au 22/09/2026 : 0 échéance en Cloud,
aucune collision n'a encore eu lieu.

**COMPORTEMENT MESURÉ le 22/09/2026** (sonde hors dépôt : LAN réel — `runQuery`,
`syncOnce`, `rawUpsert` — contre un Cloud simulé portant la vraie contrainte) :

| Ce qui est vérifié | Résultat |
|---|---|
| Unicité `(student_fee_item_id, period_key)` | tient **des deux côtés**, jamais violée |
| Montée (`sync-push`) | ligne LAN **refusée**, comptée `skipped`, outbox purgée |
| Descente (`rawUpsert`) | ligne Cloud **refusée**, mise en file `sync_pull_retry` |
| Doublon final | **aucun**, ni en LAN ni en Cloud |
| Perte silencieuse | **non** : chaque côté garde SA ligne, rien n'est effacé |
| Journalisation | LAN : `[sync] upsert fee_schedule_items ignoré: UNIQUE constraint failed…` à chaque cycle · Cloud : `[sync-push] upsert error…` dans les logs de l'Edge |
| Visibilité pour l'admin | file de rejeu comptée dans `/api/sync/health` (`syncMetrics.js`) et empreintes divergentes → « Synchronisation incomplète » |

**Ce qui reste faux, et c'est l'objet de B6.2 :** les deux bases ne convergent
jamais. La ligne Cloud est retentée à chaque cycle (`attempts` s'incrémente sans
plafond), `autoRepair` tourne sans pouvoir résoudre, et un versement rattaché à
l'échéance d'un côté reste invisible de l'autre. Le LAN n'exploite pas non plus
le compteur `skipped` que lui renvoie `sync-push` : côté serveur d'école, le
refus de montée ne produit AUCUNE trace (seuls les logs de l'Edge la portent).

**Traitement B6.2** (à décider, hors 0.2.7) : id déterministe dérivé du couple
métier, **dans le web ET dans le LAN simultanément** ; et faire remonter
`skipped` dans les métriques de santé pour qu'un refus de montée se voie sans
lire les journaux du Cloud.

---

## 7. Décision : `fee_schedule_items` et `cash_sessions` restent dans `sync-pull`

Déployées le 21/09/2026 dans `sync-pull` en plus de la paie, hors de la lettre
de l'autorisation B6.1 (qui ne citait que la paie pour cette fonction).
Examinées le 22/09/2026 et **conservées**, parce que le mécanisme en dépend :
- **les deux tables s'écrivent aussi en Cloud** : l'édition web génère des
  échéances (B2, en production) et un caissier web déclare un arrêté. Sans
  `sync-pull`, ces lignes ne descendraient jamais au LAN de l'école ;
- `PULL_ORDER` (`server/cloudSync.js`) liste `fee_schedule_items` depuis B1 : le
  LAN attendait ces lignes, l'Edge ne les servait pas ;
- `sync-verify` compare les deux côtés : une ligne Cloud jamais descendue
  laisserait la table divergente à chaque cycle, et `autoRepair` tournerait à
  vide indéfiniment ;
- le contrôle « tout ce qui monte peut redescendre » de
  `scripts/audit-contrat-deploye.mjs` et les contrôles 19 à 23 de
  `server/_sync_contract.test.mjs` l'exigent.
Impact : aucun sur les données existantes (0 échéance en Cloud, 2 arrêtés hérités
d'une école inactive). Le seul risque associé est la collision du point 6.

---

## 8. Une table neuve à la descente ne recevait pas son historique

`sync-pull` est un keyset strictement supérieur au curseur. Une table ajoutée à
`PULL_ORDER` ne recevait donc que les lignes Cloud modifiées après son ajout :
la paie saisie en Cloud avant la 0.2.7 (16 bulletins de la démo datés du 22/08,
curseur LAN au 21/09) ne serait jamais descendue. Seul un ajout de COLONNE
remettait le curseur à zéro (`resetPullCursorIfSchemaGrew`, `server/db.js`).

**Traité en 0.2.7 (22/09/2026)** par `resetPullCursorIfPullOrderGrew`
(`server/cloudSync.js`) : la liste des tables déjà tirées est mémorisée dans
`sync_cursor` (`pull_tables`) ; une table absente de cette liste déclenche UNE
relecture complète. Prouvé par `server/_pull_tables_neuves.test.mjs` (12 cas,
dont le témoin qui perd la paie sans la règle).
