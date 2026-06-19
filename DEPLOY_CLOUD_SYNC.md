# Déploiement — Migration & Synchronisation Cloud ↔ LAN

Guide pas à pas pour activer toute la chaîne :
**Cloud → Local/LAN**, **Local → Cloud (LOCAL FIRST)**, **mots de passe unifiés**, et
**synchronisation continue bidirectionnelle**.

> À dérouler **dans l'ordre**. Cocher au fur et à mesure.

---

## 0. Prérequis

- [ ] Un projet **Supabase** existant (le projet cloud de NotesCam).
- [ ] La **CLI Supabase** installée (`npm i -g supabase`) et connectée :
  ```bash
  supabase login
  supabase link --project-ref <REF_DU_PROJET>      # REF = identifiant du projet (Dashboard → Settings → General)
  ```
- [ ] Le schéma cloud à jour, **dont la table `academic_periods`** (sync incluse) :
  exécuter `supabase_active_period.sql` si ce n'est pas déjà fait.

> ℹ️ Les fonctions edge utilisent `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`,
> **injectées automatiquement** par Supabase dans l'environnement des fonctions.
> Aucune clé secrète à poser à la main, et la `service_role` ne quitte jamais le cloud.

---

## 1. SQL côté cloud (Dashboard → SQL Editor → coller → Run)

Exécuter, dans cet ordre :

- [ ] **`supabase_server_tokens.sql`** — jetons serveur scellés par école (pont d'identifiants + sync).
- [ ] **`supabase_credential_channel.sql`** — canal chiffré Cloud → Local pour les mots de passe.
- [ ] **`supabase_sync_phase2.sql`** — colonnes de sync (`updated_at`/`version`/`device_id`),
      triggers `updated_at`, table `sync_tombstones`, triggers de suppression.

> Tous sont **idempotents** (`IF NOT EXISTS`, `CREATE OR REPLACE`) → ré-exécutables sans risque.

---

## 2. Fonctions edge (depuis la racine du dépôt)

```bash
supabase functions deploy set-password
supabase functions deploy issue-server-token
supabase functions deploy provision-tenant
supabase functions deploy sync-pull
supabase functions deploy sync-push
```

| Fonction | Rôle | Auth de l'appelant |
|---|---|---|
| `issue-server-token` | Émet le jeton scellé d'une école (à la migration/activation) | JWT admin |
| `provision-tenant` | LOCAL FIRST : crée école + comptes + memberships | JWT admin |
| `set-password` | Met à jour un mot de passe cloud (Local → Cloud) | Jeton scellé |
| `sync-pull` | Renvoie les changements cloud + tombstones | Jeton scellé |
| `sync-push` | Applique les changements locaux (LWW) | Jeton scellé |

- [ ] Les 5 fonctions déployées.

---

## 3. Environnement du serveur LAN (sur le PC école)

Le serveur Node lit ces variables (process.env) :

- [ ] `VITE_SUPABASE_URL` = URL du projet Supabase (ex. `https://xxxx.supabase.co`) — **requis**
      (sert d'URL de base aux fonctions edge **et** à l'ETL).
- [ ] `VITE_SUPABASE_ANON_KEY` = clé anon — requis pour la **migration** (Cloud→Local et signup LOCAL FIRST).
- [ ] `NOTESCAM_CLOUD_SYNC=1` = **active la synchronisation continue** (laisser absent pour la garder désactivée).

> Le **jeton serveur** et l'**identifiant device** sont générés automatiquement
> dans le dossier de données (`C:\ProgramData\NotesCam`). Rien à configurer.

- [ ] Pour le **packaging .exe** : inclure `@supabase/supabase-js` dans les `node_modules` du serveur embarqué.

---

## 4. Scénarios — comment chacun s'active

### A. Cloud → Local/LAN (école qui quitte le cloud)
1. Installer NotesCam LAN sur le PC serveur (base vide).
2. CLI : `npm run migrate:cloud -- --url <URL> --key <ANON> --email <admin> --password <****> --local-password <****>`
   *(ou via l'endpoint `/api/migrate/cloud` si un assistant SPA est branché)*.
3. Vérifier le récapitulatif d'intégrité → **débrancher Internet**. Tout fonctionne en local.

### B. Local → Cloud (LOCAL FIRST : école vendue en local, convertie au cloud)
1. Dans l'app LAN (admin) → bouton **« ☁ Activer NotesCam Cloud »**.
2. Étapes : compte cloud → vérification e-mail → analyse → tenant → migration → activation.
3. Identifiants **préservés** (aucun doublon), mot de passe admin **conservé**.

### C. Mots de passe unifiés (les deux sens)
- Automatique une fois `provision-tenant` / `issue-server-token` + `set-password` déployés.
- Personnel : mot de passe poussé au cloud à leur **prochaine connexion locale**.
- ⚠️ **À faire dans l'app cloud** : sur « changer mon mot de passe », chiffrer le nouveau
  mot de passe avec la clé publique du serveur (`/api/credential/pubkey` → `school_credential_keys`)
  et l'insérer dans `credential_outbox` (sens Cloud → Local).

### D. Synchronisation continue LAN ↔ Cloud
1. **D'abord valider en simulation** (voir §5) — fortement recommandé.
2. Poser `NOTESCAM_CLOUD_SYNC=1` sur le serveur école et redémarrer.
3. Le serveur synchronise au démarrage puis toutes les 5 min (quand le cloud est joignable).

---

## 5. Validation en simulation (DRY-RUN) — avant d'activer la sync

Sans `NOTESCAM_CLOUD_SYNC=1` (ou avec, peu importe), depuis l'app LAN (admin) :

- [ ] Bouton **« 🔍 Vérifier la sync »** → **Lancer la simulation**.
- [ ] Ou en HTTP : `POST /api/sync/dry-run` (Bearer = session admin).

Le rapport liste **ce qui SERAIT** poussé/tiré (décisions LWW), **sans rien écrire**.
Journal complet : `C:\ProgramData\NotesCam\sync-dryrun.log`.

- [ ] Vérifier : volumes cohérents, **aucune suppression surprise**, décisions LWW attendues.
- [ ] Si OK → activer (§4-D).

---

## 6. Exploitation & sécurité

- **Révoquer un poste compromis** (sans toucher aux comptes/données) :
  ```sql
  update school_server_tokens set revoked_at = now() where school_id = '<UUID_ÉCOLE>';
  ```
- **Résolution de conflits** : Last-Write-Wins (`updated_at` → `version` → `device_id`).
- **Sauvegardes** locales automatiques : déjà actives (`server/backup.js`).

---

## 7. Tests automatisés (validation technique)

```bash
cd server
node _migrate_cloud.test.mjs     # Cloud → Local + pont d'identifiants (27)
node _activate_cloud.test.mjs    # Local → Cloud (LOCAL FIRST) (21)
node _cloud_sync.test.mjs        # Sync continue + LWW + dry-run (23)
node _http_e2e.test.mjs          # Chaîne HTTP complète (relancer si flake au 1er démarrage)
```

---

## Récap des fichiers livrés

| Côté | Fichiers |
|---|---|
| Serveur | `server/migrate.js`, `activateCloud.js`, `authBridge.js`, `cloudSync.js` (+ endpoints dans `index.js`) |
| Edge | `supabase/functions/{set-password,issue-server-token,provision-tenant,sync-pull,sync-push}/index.ts` |
| SQL cloud | `supabase_server_tokens.sql`, `supabase_credential_channel.sql`, `supabase_sync_phase2.sql` |
| SPA | `CloudActivationWizard.jsx`, `CloudSyncPanel.jsx` (montés dans `App.jsx`) |
