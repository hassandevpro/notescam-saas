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

## Sécurité — points de vigilance

- **HTTP sur le LAN** : `http://<IP>` n'est pas un contexte sécurisé → le Service
  Worker / mode PWA hors-ligne ne s'activera pas sur les appareils clients
  (l'app fonctionne quand même, le serveur étant toujours présent). Pour le PWA,
  prévoir un certificat (auto-signé installé sur les postes, ou cert local de confiance).
- L'autorisation remplace la RLS : toute nouvelle route doit re-vérifier rôle + école.
