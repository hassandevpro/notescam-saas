# AGENTS.md — NotesCam SaaS

Plateforme de gestion scolaire (multi-écoles, multi-pays, multi-langues) pour l'Afrique francophone/anglophone. Deux éditions partagent le même codebase :

- **Cloud** : Supabase (Postgres + Auth + RLS), déployée sur Vercel.
- **LAN** : auto-hébergée sur un PC d'école (Fastify + SQLite via `node:sqlite`), pour fonctionner hors-ligne. Voir `LAN_EDITION.md`.

## Stack

- Frontend : Vite + React 18 + Tailwind CSS + React Router 6 + Zustand
- Backend cloud : Supabase (Postgres, Auth, RLS, Storage, Realtime)
- Backend LAN : Node/Fastify + SQLite, dans `server/`
- PDF/documents : `pdf-lib`, `jspdf`, `pdfjs-dist`, `html-to-image`
- Vidéo marketing : Remotion (`remotion/`)

## Commandes

```bash
npm run dev              # dev cloud (Vite, http://localhost:3000)
npm run build             # build cloud -> dist/
npm run build:lan         # build édition LAN
npm run server             # démarre le serveur Fastify/SQLite (LAN)
npm run lan                 # build:lan + server
npm run validate            # valide la cohérence sync (rapide)
npm run validate:full        # validation sync complète
npm run validate:migrations   # valide les migrations SQL
```

## Architecture (`src/`)

- `core/` — moteurs de calcul de bulletins/notes par système éducatif (APC, classique, maternelle, système SC…), avec tests `_*.test.mjs` colocalisés.
- `kernel/` — event bus, unit of work, repository, RBAC, permissions : couche domaine partagée.
- `domains/` — modules métier isolés (finance, signalement).
- `governance/` — moteur de workflow d'approbation, catalogue de permissions, rôles.
- `countries/` — configuration par pays (Cameroun FR/EN, Congo, Gabon, Guinée équatoriale, Côte d'Ivoire) : grading, terminologie, référentiels.
- `lib/` — services métier (un fichier par domaine : budget, fees, HR, discipline, transcripts, sync, i18n…), chacun avec ses tests `_*.test.mjs`.
- `store/` — état global Zustand (auth, école, notifications, UI, toasts, messages).
- `components/` / `pages/` — UI React, organisée par domaine (budgets/, fees/, hr/, grades/, transcripts/, vieScolaire/…).

## Base de données

- Migrations à la racine : fichiers plats `supabase_*.sql` (un fichier par feature/sprint), appliqués à Supabase. Pas de dossier de migrations numérotées classique à ce niveau — voir aussi `supabase/migrations/` pour les migrations gérées par la CLI Supabase.
- RLS : chaque table sensible a ses policies définies dans le `.sql` correspondant (ex. `supabase_security_hardening.sql`, `supabase_fee_integrity.sql`).
- Toujours écrire une migration **additive et idempotente** (`IF NOT EXISTS`, etc.) plutôt que d'éditer un fichier déjà appliqué en prod.

## Conventions importantes

- **Ne jamais commiter `.env.local`** (déjà gitignoré) — contient les clés Supabase du projet.
- L'édition LAN ne doit **jamais casser l'édition cloud** : tout accès données passe par `src/lib/supabase.js`, aliasé vers `src/lib/localClient.js` uniquement en mode `lan` (voir `LAN_EDITION.md`). Ne pas contourner cette abstraction.
- Les moteurs de notes/bulletins (`core/*Engine.js`) sont spécifiques à un système éducatif national — ne pas mutualiser sans vérifier `countries/` et les docs `docs/APC_REFERENTIEL_FORMAT.md` / `docs/SC_REFERENTIEL_FORMAT.md`.
- Tests colocalisés en `_nomDuFichier.test.mjs` à côté du fichier testé (pas de dossier `__tests__` séparé).
- Docs d'architecture détaillées dans `docs/` (ex. `ARCHITECTURE_KERNEL.md`, `CLOUD_MIGRATION_ARCHITECTURE.md`, `UX_ARCHITECTURE.md`) — les consulter avant de toucher au kernel, à la sync, ou à la gouvernance.

## Précautions

- Le repo contient des dizaines de fichiers `supabase_*.sql` représentant l'historique réel des migrations appliquées en production : ne pas les supprimer ni les réordonner.
- Ne pas exécuter de SQL destructif (`DROP`, `TRUNCATE`, resets) contre la base sans confirmation explicite de l'utilisateur.
