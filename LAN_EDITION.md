# NotesCam — Édition LAN (hors-ligne)

Version auto-hébergée sur un PC Windows d'école : serveur Node + **SQLite local**,
accessible par les autres appareils du réseau. **Le même codebase** sert les deux
éditions — la version cloud (Supabase) reste strictement inchangée.

## Principe (comment ça ne casse pas le cloud)

Toute la SPA passe par `src/lib/supabase.js`. En mode `lan`, Vite **aliase** cet
import (et les `createClient()` secondaires) vers `src/lib/localClient.js`, un
**adaptateur qui reproduit l'API de supabase-js** mais parle au serveur local
en HTTP. Le build par défaut (cloud) n'a aucun alias : il embarque le vrai
client Supabase, comme avant.

```
SPA React ──(édition cloud)──► supabase-js ──► Supabase (Postgres+Auth+RLS)
          └─(édition lan)────► localClient.js ──HTTP──► serveur Fastify ──► SQLite
```

| Couche Supabase | Remplacement LAN | Fichier |
|---|---|---|
| Postgres | SQLite (`node:sqlite`, intégré à Node 24 — **aucun module natif**) | `server/schema.sql`, `server/db.js` |
| Auth (JWT) | users locaux, mot de passe scrypt, JWT HS256 | `server/security.js` |
| RLS | autorisation applicative (vérif rôle/école sur chaque route) | `server/query.js`, `server/rpc.js` |
| RPC (×11) | fonctions Node | `server/rpc.js` |
| Storage | fichiers sur disque + `/files` | `server/index.js` |
| Realtime | `.channel().on(...).subscribe()` simulé par **polling** de la table filtrée | `localClient.js` |

## Démarrer en développement

```bash
npm run build:lan      # compile la SPA en édition LAN -> dist/
npm run server         # démarre Fastify sur http://0.0.0.0:8080
# ou les deux d'un coup :
npm run lan
```

Puis : `http://localhost:8080` sur le PC serveur, `http://<IP-du-PC>:8080` depuis
les autres appareils du LAN.

Données par défaut dans `server/data/` (base, sauvegardes, fichiers, secret JWT).
En production, pointer ailleurs via variables d'env :

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` / `HOST` | écoute | `8080` / `0.0.0.0` |
| `NOTESCAM_DATA_DIR` | dossier données | `server/data` |
| `NOTESCAM_BACKUP_KEEP` | nb de sauvegardes gardées | `14` |
| `NOTESCAM_LICENSE_PUBKEY` | clé publique Ed25519 (SPKI base64) | — |

## Première configuration

1. Ouvrir l'app → **Inscription** : crée le 1ᵉʳ utilisateur (admin) + l'école
   (RPC `signup_school_and_admin`, mono-établissement).
2. Ajouter classes, élèves, profs… exactement comme en cloud.

## Sauvegardes

- Automatiques toutes les 2 h + au démarrage (`VACUUM INTO`, rotation 14 copies)
  dans `server/data/backups/`.
- Manuelles : `POST /api/backup` (admin). **Copier régulièrement ce dossier sur
  une clé USB / 2ᵉ disque** — le PC serveur est un point de défaillance unique.

## État d'implémentation

**Fait & testé** (14 tests de bout en bout passants) :
- ✅ Serveur Fastify + SQLite (`node:sqlite`, zéro module natif)
- ✅ Auth locale (signup/login/JWT/scrypt) + autorisation par rôle (ex-RLS)
- ✅ API DB générique (select/insert/upsert/update/delete, filtres, embed `schools(*)`)
- ✅ Les 11 RPC, fichiers/storage, sauvegarde auto, vérif licence offline
- ✅ Builds LAN **et** cloud vérifiés (cloud strictement intact)

**Fait depuis** :
- ✅ **Installateur .exe** (Inno Setup) : Node portable + tâche planifiée Windows
  (auto-start au boot, restart auto) + règle pare-feu entrante. Voir `packaging/`.
- ✅ **Génération des clés de licence** : paire Ed25519 (`packaging/license/keygen.mjs`),
  signature (`sign-license.mjs`), publique dans `NOTESCAM_LICENSE_PUBKEY`.
- ✅ **Écran d'activation** côté SPA (`LanLicenseGate.jsx` → `POST /api/license/activate`).
- ✅ **Realtime → polling** : `.channel().on('postgres_changes',…).subscribe()` est
  simulé par un sondage périodique (8 s, `VITE_LAN_POLL_MS`) de la table filtrée.
  Sémantique INSERT/UPDATE préservée → notifications & messages arrivent en quasi
  direct sans WebSocket. Code applicatif et build cloud inchangés.

**Restant** :
- ⬜ ETL optionnel export Supabase → import SQLite (écoles passant du cloud au LAN).

## Licence — verrou par machine (node-locked)

- L'écran d'activation affiche un **identifiant machine** stable (Windows
  MachineGuid → MAC → aléatoire persistant, haché en `A1B2-C3D4-E5F6-7890`).
- L'école communique cet identifiant à l'éditeur, qui signe une licence liée :
  `node packaging/license/sign-license.mjs --school "…" --plan pro --machine A1B2-C3D4-E5F6-7890`.
- À l'activation, le serveur refuse une licence dont `machine_id` ne correspond
  pas à ce poste (`machine_mismatch`). Une licence **sans** `machine_id` reste
  valable partout (rétrocompatible).

## Mise à jour automatique (OTA)

Un serveur d'école se met à jour seul : il interroge le manifeste `app_releases`,
télécharge l'installeur signé, le vérifie, puis passe la main à
`packaging/update-notescam.ps1` (sauvegarde → arrêt → installation → relance).

**Chaîne de confiance — les deux verrous sont obligatoires :**

1. le `sha256` du fichier téléchargé doit être exactement celui du manifeste ;
2. une signature **Ed25519** de l'éditeur sur `notescam-release:<version>:<sha256>`
   doit être valide. Lier la version à l'empreinte interdit de rejouer la
   signature d'une ancienne publication sur un autre binaire.

La clé de publication est **distincte** de celle des licences : une compromission
de la clé de licence ne doit jamais permettre d'exécuter du code sur les serveurs
d'école. Un binaire refusé est **supprimé** immédiatement.

**Sans clé publique de publication livrée dans l'installation, l'OTA est inactive**
et l'école reste sur l'installeur manuel — c'est le défaut, et c'est voulu.

**Procédure de publication (éditeur) :**

```bash
node packaging/release/keygen-release.mjs            # UNE FOIS — clé privée hors dépôt
node packaging/release/sign-release.mjs \
  --file dist-installer/NotesCam-Setup.exe \
  --version 0.3.0 --url https://cdn.exemple.cm/NotesCam-Setup-0.3.0.exe
# → affiche l'INSERT à coller dans Supabase, APRÈS mise en ligne du fichier
```

**Garde-fous côté école** (chacun a son motif, lisible sur `/api/update/auto`) :

- **parité** — aucune mise à jour tant que Cloud ≠ LAN (les notes doivent être
  remontées avant de remplacer le binaire) ;
- **fenêtre de maintenance** — `auto_update_window`, défaut `19-05` ;
- **serveur au repos** — aucune écriture depuis 15 min (même signal que le script
  manuel : la date du journal WAL) ;
- **interrupteur** — réglage `auto_update`, ou `POST /api/update/auto`.

Une version marquée `mandatory` passe outre fenêtre et repos, jamais la parité.

## Sécurité — points de vigilance

- **HTTP sur le LAN** : `http://<IP>` n'est pas un contexte sécurisé → le Service
  Worker / mode PWA hors-ligne ne s'activera pas sur les appareils clients
  (l'app fonctionne quand même, le serveur étant toujours présent). Pour le PWA,
  prévoir un certificat (auto-signé installé sur les postes, ou cert local de confiance).
- L'autorisation remplace la RLS : toute nouvelle route doit re-vérifier rôle + école.
