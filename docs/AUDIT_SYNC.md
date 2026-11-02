# Audit de la synchronisation LAN ↔ Cloud — étape 0

> **État au 1er novembre 2026, fin de journée.**
>
> | Lot | État |
> |---|---|
> | 1 — engorgement de la file (C1) | **livré et mesuré** — 13 314 326 → 6 457 en 88 s ; 2 219 h → 65 min. Voir I35. |
> | 2 — couverture totale (C3, C4) | **livré** — cliquet de couverture ; capture par déclencheur des 32 écritures de `rpc.js` ; `parent_student_links` branchée dans les sept listes. Voir I36. |
> | 2b — Cloud | **appliqué en production** — migration exécutée par le responsable, Edge Functions déployées (push v11 · pull v14 · verify v5 · repair v6). Reste : livrer le paquet LAN à l'école. |
> | 3 — conflits par champ (C5) | **livré** — `sync_shadow`, fusion par champ, horloge logique, ajout seul et champs sensibles. Voir I37 et [`SYNCHRONISATION.md`](SYNCHRONISATION.md). |
> | 4 à 6 | à faire — déclenchement événementiel, soft-delete/numérotation/fichiers, écran de supervision. |
>
> **Ce qui reste ouvert et qu'il ne faut pas croire réglé** : 10 tables ne circulent
> pas (dont 6 sans colonne `id`) ; `sync_conflicts` se remplit mais **aucun écran ne
> l'affiche** ; le Cloud départage encore à la ligne entière. Détail au §7 de
> [`SYNCHRONISATION.md`](SYNCHRONISATION.md).
>
> Le reste de ce document est l'audit d'origine, conservé tel quel — y compris ce
> qu'il affirmait de faux et qui est corrigé plus loin (les 11 tables n'étaient pas
> « absentes du Cloud » : seule la recherche l'était).

**Date** : 31 octobre 2026 · **Périmètre** : `server/cloudSync.js`, `server/db.js`,
`server/query.js`, `server/_sync_contract.test.mjs`, `server/schema.sql`, et les mesures
du déploiement 0.3.27 à THE GENIUS (29/10/2026).

**Aucun code n'a été modifié.** Ce document est le préalable demandé : causes racines,
puis plan. Rien n'est à valider ici sur la foi d'une intuition — chaque cause porte sa
mesure ou son numéro de ligne.

---

## 1. Ce qui existe déjà, et qu'il ne faut pas reconstruire

Il faut le dire d'emblée, parce que le cahier des charges demande plusieurs choses qui
sont **déjà là** :

| Demandé | État |
|---|---|
| File d'envoi persistante sur disque | `sync_outbox` (SQLite, survit aux coupures) |
| Curseurs de reprise | `sync_cursor` (`pull_at`, `tomb_at`) |
| Rattrapage au démarrage | `scheduleCloudSync()` lance un cycle immédiat au boot |
| Réessai sans échec silencieux | compteur `attempts`, `last_error`, `sync_outbox_quarantine` |
| Idempotence | `rawUpsert` en `ON CONFLICT(id) DO UPDATE` |
| UUID côté client | oui, `randomUUID()` dans `query.js` |
| Ordre des dépendances (FK) | `PULL_ORDER` + file de rejeu des orphelins |
| Audit / réparation | `syncVerify.js`, `syncRepair.js`, `syncMerkle.js` |
| Indicateur permanent | `SyncBadge.jsx` |
| Page de supervision | `SyncStatePanel.jsx`, `SyncHistory.jsx`, 6 endpoints `/api/sync/*` |
| Journal des opérations | `syncAudit.js` + `/api/sync/audit` |
| Test de cohérence des listes | `_sync_contract.test.mjs` (7 listes recoupées) |

Le moteur n'est pas à écrire. **Il est à débloquer, à compléter et à corriger sur quatre
points précis.**

---

## 2. Causes racines, par ordre d'impact

### C1 — La file de poussée met environ **onze mois** à s'écouler

C'est la cause n° 1, et elle explique à elle seule « mes changements ne remontent pas ».

Mesuré sur le serveur de THE GENIUS le 29/10/2026 :

```
entrées ............. 13 314 326
pointeurs distincts . 6 457
```

Soit **2 062 entrées pour une seule ligne utile**. Or la poussée lit un lot borné
(`cloudSync.js:34` → `BATCH = 500`) toutes les cinq minutes
(`cloudSync.js:664` → `scheduleCloudSync(5 * 60 * 1000)`), et purge par
`DELETE ... WHERE id <= maxId` : **500 entrées retirées par cycle, quel que soit le
nombre de lignes distinctes qu'elles représentent.**

```
13 314 326 ÷ 500            = 26 629 cycles
26 629 × 5 min              = 2 219 heures de serveur ALLUMÉ
2 219 h ÷ 45 h par semaine  ≈ 49 semaines
```

La file est en **FIFO sur `id`**. Une note saisie ce matin est donc en position
13 000 000 : elle partira dans environ onze mois de fonctionnement. Ce n'est pas une
synchronisation « peu fiable », c'est une synchronisation **à l'arrêt**, et toute
intervention manuelle ne fait que pousser les 500 entrées suivantes.

**La cause structurelle** : `sync_outbox` est un journal en ajout pur
(`schema.sql:1187`, `id INTEGER PRIMARY KEY AUTOINCREMENT`, aucune contrainte d'unicité
sur `(tablename, row_id)`). Quatre endroits y insèrent sans jamais dédoublonner :
`query.js:26`, `notify.js:29`, `notify.js:50`, `governanceApply.js:109`. Chaque
réécriture d'une même ligne empile une entrée de plus, pour toujours.

Le script `dedoublonner-file-poussee.sh` vide le stock. **Il ne corrige pas la cause :
la file se réengorgera.**

> **Reste à identifier** : ce qui réécrit 2 000 fois les mêmes 6 457 lignes. C'est une
> boucle applicative, pas un usage humain. Requête de diagnostic en §5.

### C2 — Les notes ne sont **pas** répliquées, et c'est écrit noir sur blanc

`server/db.js:1115` le dit : « la synchro LAN↔Cloud des notes reste un chantier à part
(les ids de compétences cloud diffèrent du seed local) ». Quatre tables sont inscrites
aux exclusions du contrat (`_sync_contract.test.mjs:80`) :

`apc_notes` · `prim_notes` · `mat_observations` · `prim_competences_non_evaluees`

Elles sont dans `SYNCED_TABLES` — donc horodatées et **mises en file** — mais absentes de
`push_ALLOWED` et de `pull_TABLES`. Elles ne peuvent, par construction, ni monter ni
descendre.

**« L'ajout de notes ne remonte pas » n'est donc pas une panne : c'est l'état déclaré du
système.** Le blocage est réel : les ids du référentiel de compétences divergent entre le
seed local et le Cloud. Répliquer sans traiter les ids écraserait des notes avec des
références qui ne pointent nulle part.

À THE GENIUS : **1 353 notes** en base locale, qui ne sont montées nulle part.

### C3 — Les liens de fratrie et les comptes parents ne sont dans **aucune** liste

`parent_student_links` (`schema.sql:2007`) et `parent_accounts` (`schema.sql:1996`) ne
sont ni dans `SYNCED_TABLES`, ni dans les exclusions documentées. Ils n'existent pour le
moteur de synchronisation **ni comme donnée à répliquer, ni comme écart assumé**.

C'est exactement votre symptôme : les frères et sœurs ajoutés en LAN ne remontent jamais,
et rien ne le signale.

Elles ne sont pas seules. Sur **121 tables** du schéma LAN : 66 déclarées synchronisées,
5 exclues avec motif, et **34 ni l'un ni l'autre**. Après retrait des tables
d'infrastructure locale (licence, état de migration, miroirs), il reste au moins ceci à
trancher :

| Table | Nature |
|---|---|
| `parent_student_links`, `parent_accounts` | liens familiaux — **votre symptôme** |
| `apc_matieres`, `apc_classe_matieres` | matières propres à l'école (0.3.19/0.3.23) |
| `referentiel_libelles` | libellés de matières de l'école |
| `deleted_fee_payments` | paiements annulés — donnée comptable |
| `prim_competences_masques`, `mat_domaines_masques`, `prim_criteres_masques` | compétences masquées par classe |
| `discipline_statistics` | vie scolaire |
| `evaluation_system`, `country_education_config`, `app_settings` | paramètres d'école |
| `users` | comptes (le pont d'identifiants est séparé — à confirmer) |

### C4 — Le test de contrat vérifie la **cohérence**, jamais la **complétude**

Et c'est par là que C3 est passé.

`_sync_contract.test.mjs` est un bon test : il recoupe sept listes et refuse qu'une table
de `SYNCED_TABLES` manque à l'une d'elles. Mais **il part de `SYNCED_TABLES`**. Une table
qui n'y est pas n'est contrôlée par rien : elle n'apparaît dans aucune liste, donc aucune
comparaison ne la réclame. Le test passe, la table n'est répliquée d'aucun côté, et
personne n'est prévenu.

C'est précisément le test que vous demandez au point 1 de vos exigences, et il
**n'existe pas** : il faut partir de `schema.sql` et exiger que **chaque** table soit
« synchronisée » ou « exclue avec motif ».

### C5 — Le dernier qui écrit efface les champs de l'autre, à l'heure de son PC

`remoteWins()` (`cloudSync.js:101`) compare `updated_at`, puis `version`, puis
`device_id` — **au niveau de la ligne**. Quand le distant gagne, `rawUpsert`
(`cloudSync.js:120`) applique `ON CONFLICT(id) DO UPDATE SET` sur **toutes** les colonnes
reçues.

Conséquence : la secrétaire corrige le téléphone d'un élève en LAN, quelqu'un corrige son
nom en ligne une minute plus tard → **la correction du téléphone est perdue**, sans trace
et sans message.

Deux aggravations :

1. `updated_at` est posé par `new Date().toISOString()` sur la machine qui écrit
   (`query.js:19`). **C'est l'horloge du PC de l'école.** Un poste en retard d'une heure
   perd systématiquement tous ses arbitrages. Vous l'aviez anticipé dans vos exigences.
2. Aucune distinction pour les données sensibles. Un paiement, un reçu, une note
   verrouillée s'écrasent par la même règle que n'importe quel champ.

### C6 — Rien ne se déclenche sur un événement : seulement un minuteur de 5 minutes

Le seul déclencheur est `setInterval(..., 5 * 60 * 1000)` (`cloudSync.js:667`), plus un
cycle au démarrage. Il n'y a **ni poussée immédiate à l'écriture**, **ni abonnement
temps réel**, **ni réaction au retour de la liaison**. `recordOutbox()` empile, et c'est
tout — personne ne réveille la boucle.

En soi, 5 minutes serait acceptable au regard de vos critères (« dans les minutes qui
suivent »). Mais combiné à C1, le minuteur ne fait qu'avancer de 500 entrées dans une
file de 13 millions.

---

## 3. Ce que ces six causes expliquent de vos symptômes

| Votre symptôme | Cause |
|---|---|
| « Les notes ne remontent pas » | **C2** (exclusion déclarée) + **C1** |
| « Les frères/sœurs ne remontent pas » | **C3** (table dans aucune liste) |
| « Je dois demander une sync manuelle » | **C1** — la demande manuelle pousse 500 entrées de plus |
| « Des modifications diverses se perdent » | **C5** (écrasement ligne entière) |
| « Ce n'est pas fiable » | **C4** — rien ne garantit qu'une table neuve soit branchée |

---

## 4. Plan de correction proposé

Ordonné par ce qui débloque le plus, pas par difficulté. **Les lots 1 et 2 rendent le
système fonctionnel ; les suivants le rendent conforme à vos exigences.**

### Lot 1 — Désengorger, et empêcher le réengorgement *(prioritaire)*

- Unicité sur `(tablename, row_id)` dans `sync_outbox` : une ligne en attente = **une**
  entrée, mise à jour en place au lieu d'être empilée.
- Migration qui dédoublonne le stock existant (13,3 M → ~6 500) dans la même transaction
  que la création de l'index, avec comptage avant/après.
- Identifier et corriger la boucle qui réécrit 2 000 fois les mêmes lignes.
- Lot adaptatif : tant que la file dépasse un seuil, pousser par lots plus gros.

**Effet attendu** : le retard passe de ~11 mois à un cycle.

### Lot 2 — Le test de complétude, puis brancher ce qu'il révèle

- Test qui lit `schema.sql` et **échoue** si une table n'est ni synchronisée ni exclue
  avec motif écrit. C'est votre exigence n° 1, et c'est le cliquet qui empêche la
  prochaine table d'être oubliée.
- Le faire échouer d'abord (I26 : un détecteur qu'on n'a jamais vu détecter n'en est pas
  un), puis traiter les 34 tables une par une : branchée, ou exclue avec sa raison.
- `parent_student_links` et `parent_accounts` en premier — c'est votre symptôme.

### Lot 3 — Conflits au niveau du champ, sur une horloge fiable

- Horodatage par le **serveur Cloud** (ou horloge logique), plus par le PC de l'école.
- Fusion champ par champ : ne réécrire que les colonnes réellement changées côté gagnant.
- Table `sync_conflicts` + résolution visible pour les données sensibles (paiements,
  reçus, notes verrouillées, périodes verrouillées) — jamais d'écrasement silencieux.
- Paiements et reçus en **ajout seul**, annulation explicite via `deleted_fee_payments`.

### Lot 4 — Déclenchement sur événement

- Réveil de la boucle à l'écriture (poussée immédiate si la liaison existe).
- Détection du retour de liaison → rattrapage, au lieu d'attendre le prochain tick.
- Repli : le minuteur actuel reste le filet.
- Les horaires 7 h–16 h : **paramètre d'affichage pour la supervision uniquement**,
  jamais une condition de déclenchement. (Conforme à votre demande.)

### Lot 5 — Suppressions, numérotation, fichiers

- Soft-delete généralisé avec propagation (aujourd'hui : tombstones + curseur `tomb_at`,
  à auditer table par table).
- Plages de numérotation de reçus par source, pour éliminer toute collision LAN/Cloud.
- Synchronisation incrémentale des pièces (`fileSync.js` existe — à vérifier et compléter).

### Lot 6 — Les tests d'intégration que vous demandez

Les dix scénarios, sur deux nœuds simulés. À écrire **après** les lots 1–3, sinon ils
mesurent un système qu'on est en train de changer.

### Hors lots — la dette qui reste

- **C2 (les notes)** : la réconciliation des ids de référentiel Cloud ↔ seed local est un
  chantier à part entière, et le seul qui ne se règle pas dans le moteur de sync. Tant
  qu'il n'est pas traité, les notes ne circuleront pas. **À arbitrer séparément.**
- `hr_payroll*` : répliquée mais ni auditée ni réparable (écart inscrit depuis le
  18/09/2026).

---

## 5. Ce que je n'ai pas pu vérifier d'ici

Trois choses demandent la base de l'école ou le Cloud, pas le dépôt :

**a) Qui remplit la file.** À passer sur une **copie** de la base du serveur :

```sql
SELECT tablename, COUNT(*) AS entrees, COUNT(DISTINCT row_id) AS lignes,
       COUNT(*) / COUNT(DISTINCT row_id) AS doublons_par_ligne
FROM sync_outbox GROUP BY tablename ORDER BY entrees DESC LIMIT 15;
```

**b) Ce qui dort en quarantaine** — des lignes définitivement écartées, avec leur motif :

```sql
SELECT tablename, last_error, COUNT(*) FROM sync_outbox_quarantine
GROUP BY tablename, last_error ORDER BY COUNT(*) DESC LIMIT 20;
```

**c) L'état réel du curseur** : `SELECT * FROM sync_cursor;` — pour savoir de quand date
la dernière descente effective.

---

## 6. Ce que je demande avant d'écrire du code

Trois arbitrages, parce qu'ils changent le travail et qu'ils vous appartiennent :

1. **Ordre.** Le lot 1 seul rétablit la remontée. Je le fais d'abord et seul, ou
   j'enchaîne 1 → 2 → 3 ?
2. **Les notes (C2).** Chantier séparé des ids de référentiel : on l'ouvre maintenant,
   ou on livre la sync sans les notes en le disant clairement ?
3. **Les 34 tables.** Je vous propose un classement « à synchroniser / à exclure » que
   vous validez, ou je tranche moi-même et vous relisez le résultat ?

Et une confirmation : je travaille sur une **copie** de la base de THE GENIUS pour les
mesures du §5 — je ne touche à rien en production sans votre accord explicite.
