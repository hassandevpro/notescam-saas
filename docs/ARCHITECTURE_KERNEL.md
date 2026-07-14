# Socle P0 — Kernel (DDD / Clean Architecture)

Fondation transverse réutilisable par **tous** les domaines de l'ERP
(académique, vie scolaire, RH, finances, maintenance, signalement, patrimoine).
Objectif : chaque domaine est **indépendant** et fonctionne à l'identique en
**Cloud (Supabase)**, **LAN (SQLite)** et **hors-ligne**.

## Composants (`src/kernel/`)

| Fichier | Rôle |
|---|---|
| `domainEvent.js` | Fabrique d'events immuables (convention « au passé »). Enveloppe polymorphe `aggregate_type` + `aggregate_id`. |
| `eventBus.js` | publish/subscribe + dispatch. Isole les abonnés en échec (retourne les échecs). |
| `repository.js` | Accès données agnostique via un **driver** injecté. |
| `unitOfWork.js` | **Transactional outbox** : données métier + append `domain_events` validés ensemble via `driver.commit(opList)` (atomique) quand le driver le supporte ; repli séquentiel sinon. Dispatch APRÈS persistance. |
| `outboxRelay.js` | Rejoue l'outbox vers les abonnés **idempotents** (rattrape un dispatch manqué : crash, coupure, abonné KO). Suivi `acked` (event.id traités) injecté. |
| `rbac.js` | RBAC + hook **ABAC** (isolation école). `*` = super_admin cross-tenant. |
| `auditSubscriber.js` | Abonné `*` → chaque event devient une ligne d'audit. Zéro appel en dur. |
| `drivers/pgDriver.js` | Driver Cloud **et** LAN (client supabase / localClient, même API). |
| `drivers/memoryDriver.js` | Driver mémoire pour tests / offline pur. |
| `permissions.js` | Registre de grants par défaut (point d'ancrage du futur module RBAC). |
| `index.js` | Câblage applicatif (le seul à importer le client réel). |

## Pourquoi ces choix (vs ERPNext / Temporal)

- **Un seul driver Cloud/LAN** : `localClient` réexpose déjà `supabase.from()`,
  aliasé par Vite. Aucune plomberie réseau à réécrire par domaine.
- **Transactional outbox** plutôt qu'un workflow engine externe (Temporal) :
  impossible à faire tourner hors-ligne sur SQLite en zone rurale. En LAN,
  données + event d'outbox sont écrits dans **une seule transaction** SQLite
  (`/api/db/batch` → `runBatch`, `PRAGMA synchronous=FULL` pour survivre à la
  coupure secteur) : un crash ne peut laisser ni donnée sans event, ni l'inverse.
  Les projections (audit, notif) sont des consommateurs **asynchrones et
  idempotents**, rattrapés par `outboxRelay`. L'outbox `domain_events` se
  **réplique via la sync Phase 2**. (Cloud supabase-js : pas de transaction
  multi-tables côté client → repli séquentiel ; atomicité Cloud = future RPC.)
- **REST unifié**, pas de GraphQL : PostgREST + `rpc.js` suffisent pour un seul
  mainteneur.

## PoC transverse — Signalement (`src/domains/signalement/`)

Entité **générique routable** vers n'importe quel domaine (maintenance,
patrimoine…), avec **machine à états** (`new → triaged → assigned → in_progress
→ resolved → closed`, `rejected`). Un seul flux prouve la collaboration :
données + events + audit + notifications + RBAC/ABAC, **sans couplage**.

## Persistance

- Cloud : `supabase_domain_events.sql` (events + audit) + `supabase_signalement.sql`.
- LAN : tables dans `server/schema.sql` ; `signalements` ajouté à `SYNCED_TABLES`.
- Offline (IndexedDB) : stores `domain_events`, `audit_events`, `signalements`
  (DB v15, `src/lib/db.js`).

## Tests

```
node src/kernel/_kernel.test.mjs
node src/domains/signalement/_signalement.test.mjs
```

## Résilience — état & compromis (revue « déploiement multi-écoles »)

- **Crash / coupure secteur** : atomicité données+outbox garantie en LAN
  (transaction unique + `synchronous=FULL`) ; le relay rejoue un dispatch manqué.
  ✔ traité.
- **Idempotence de l'audit** : la ligne d'audit reprend l'`id` de l'event
  (1:1) et est écrite en **upsert** → un rejeu réécrit la même ligne, pas de
  doublon. ✔ traité.
- **Conflit de sync (LWW)** : résolution **déterministe et cohérente** des deux
  côtés `(updated_at, version, device_id)` — `sync-push` (Cloud) aligné sur
  `remoteWins` (LAN) ; `version` désormais **monotone** (incrémentée à chaque
  update local) → départage fiable même à horodatage égal. ✔ traité. Reste ⚠ :
  la **dérive d'horloge** (updated_at reste primaire) et la reconstruction de
  l'état des entités à machine à états — leur histoire faisant foi est le **log
  d'events append-only** (résolu quand la réplication par `seq` arrivera, #2 ci-dessous).
- **Réplication outbox/audit** : `domain_events`/`audit_events` **non répliqués**
  (absents des edge `sync-pull/push`) et `seq` **non peuplé en LAN**. ⚠ à traiter.
- **Non-répudiation** : ✔ traité. Cloud → écriture d'events par la seule fonction
  `kernel_emit` (`SECURITY DEFINER`, `actor_id = auth.uid()`, audit dérivé dans
  la même transaction ; RLS d'insert applicative supprimée). LAN → `domain_events`
  / `audit_events` **append-only** (update/delete refusés, jamais d'écrasement) et
  `actor_id` **estampillé par le serveur** depuis la session (le client ne peut pas
  forger). `sameSchool` ne considère plus `school_id=null` comme global (bypass fermé).

## Reste à câbler (suite P0)

1. `LocalDriver` IndexedDB (offline pur) branché sur `repo()` selon `edition.js`.
2. Réplication des `domain_events` par **curseur `seq`** dans `sync-pull`
   (append-only, distinct du LWW des lignes mutables) + **peupler `seq` en LAN**.
3. Persister le suivi `acked` du relay (table dédiée) + déclenchement au boot.
4. Bridge `notify` → `notificationsService` (module #4).
5. Migrer un flux existant (ex. `GradeSubmitted`) vers le bus, en retirant les
   appels en dur à `notificationsService` / `historyService`.
6. (Cloud) Déployer `kernel_emit` (dans `supabase_domain_events.sql`) avant de
   migrer un flux Cloud vers le bus : la RLS refuse désormais l'insert direct
   dans `domain_events`/`audit_events`, l'écriture passe par cette RPC.
