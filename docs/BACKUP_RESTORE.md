# Sauvegarde, export et restauration

Paramètres → **Sauvegarde & restauration** (admin uniquement).

## La règle qui rend un nouveau module automatique

Aucune liste de tables n'est maintenue dans l'app. À chaque export, sauvegarde
ou restauration, les tables sont **découvertes dans le schéma réel** :

> toute table qui porte une colonne `school_id` appartient à la sauvegarde de
> l'école (+ la ligne `schools`).

| Où | Découverte |
|---|---|
| Cloud | `public._backup_catalog_internal()` (`supabase_backup_restore.sql`) — `pg_class` / `pg_attribute` / `pg_constraint` |
| LAN | RPC `backup_catalog` (`server/rpc.js`) — `sqlite_master` / `PRAGMA` |

**Pour qu'un nouveau module soit sauvegardé : donnez `school_id` à ses tables.**
C'est tout. En LAN, la table doit aussi figurer dans `ALLOWED_TABLES`
(`server/db.js`) — ce qui est de toute façon nécessaire pour que le module
fonctionne. Une table avec `school_id` absente de `ALLOWED_TABLES` est signalée
dans les logs serveur (`[backup] tables avec school_id hors API`) ; elle reste
couverte par la sauvegarde fichier `.db`.

Une table de module **sans** `school_id` (rattachée seulement par FK à une table
parente) **n'est pas sauvegardée** dans l'export JSON. Ne créez pas de table métier
sans `school_id`.

## Exclusions

Secrets et mécanique interne, jamais exportés : noms contenant `token`,
`secret`, `password`, `pwd`, `pairing`, `credential`, `sms_settings`, ou
commençant par `sync_`, plus `school_backups`. La liste est en double
(`src/lib/backupCore.js` et `public._backup_is_excluded`) ; un test vérifie
qu'elles concordent (`src/lib/_backupCore.test.mjs`). Chaque sauvegarde liste
ses tables exclues dans `excluded`.

## Sauvegardes automatiques

- **Cloud** : `public.backup_snapshot_all()` chaque nuit à 02:17 UTC via
  `pg_cron`. Garde 7 automatiques + 5 manuelles par école. **pg_cron doit être
  activé** (Dashboard → Database → Extensions) puis le fichier rejoué ; sinon un
  avertissement s'affiche et seules les sauvegardes manuelles existent.
  Limite : ces instantanés vivent dans la même base — ils protègent des erreurs
  humaines, pas de la perte du projet (prévoir PITR Supabase).
- **LAN** : copie `.db` (`VACUUM INTO`) toutes les 2 h + au démarrage. Garde les
  14 plus récentes + une par jour sur 14 jours (`NOTESCAM_BACKUP_KEEP`,
  `NOTESCAM_BACKUP_KEEP_DAYS`). Les photos/logos (`files/`) ne sont pas dans ces
  copies.

## Restauration

- **JSON (cloud et LAN)** — `src/lib/backupEngine.js`. Aperçu obligatoire.
  Mode `missing` (défaut) : réinsère ce qui manque, ne touche à rien d'existant.
  Mode `overwrite` : remet aussi à l'état sauvegardé les lignes qui diffèrent.
  **Rien n'est jamais supprimé.** Les écritures passent par le client normal
  (RLS cloud, gardes `query.js` en LAN) ; une ligne refusée est comptée et
  signalée. Les lignes restaurées reçoivent `updated_at = now` pour gagner à la
  synchronisation LAN ↔ Cloud. Les colonnes de licence de `schools` ne sont
  jamais écrasées. La sauvegarde d'une autre école est refusée.
- **Fichier `.db` (LAN)** — programmée (`restore-pending.json`), appliquée au
  prochain démarrage du serveur avant l'ouverture de la base. L'ancienne base et
  son WAL partent dans `DATA_DIR/pre-restore/`. **Refusée si la synchro Cloud est
  active** : la base restaurée repartirait de ses anciens curseurs et le Cloud
  réécraserait les lignes / rejouerait les suppressions.

## Tests

```bash
node src/lib/_backupCore.test.mjs        # logique pure + parité JS/SQL
node server/_backup_engine.test.mjs      # export → sinistre → restauration, sur SQLite réel
```
