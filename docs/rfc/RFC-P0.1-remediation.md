# RFC P0.1 — Remédiation du socle ERP (durabilité, sécurité, sync)

| | |
|---|---|
| **Statut** | Draft — à valider avant tout code |
| **Auteur** | Architecture (revue critique du socle P0) |
| **Date** | 2026-07-08 |
| **Portée** | `src/kernel/*`, `src/domains/signalement/*`, `server/*`, `supabase/functions/*`, migrations SQL |
| **Bloque** | Module #2 RBAC/ABAC et tout câblage de flux métier |
| **Réfs** | Revue critique (C1/C2/C3, H1–H5, M1–M7), `docs/ARCHITECTURE_KERNEL.md`, mémoire `kernel_p0_ddd`, `continuous_sync_phase2`, `security_audit` |

> **Règle** : aucune modification de code tant que ces RFC ne sont pas validées.
> Les blocs SQL/JSON ci-dessous sont des **esquisses de modèle**, pas du code livrable.

---

## 0. Décisions transverses (ADR)

Quatre décisions structurent les 8 RFC. Elles sont argumentées dans les RFC qui les portent, mais listées ici car partagées.

| ADR | Décision | Portée | RFC porteuse |
|---|---|---|---|
| **ADR-1** | **Horloge logique hybride (HLC)** `⟨wall_ms, counter, device_id⟩` sur chaque event | ordre causal offline | RFC-5 |
| **ADR-2** | **L'event est écrit dans la même transaction que la donnée** (outbox transactionnel via RPC/tx) | durabilité | RFC-2 |
| **ADR-3** | **Consommateurs idempotents** (clé = `event_id`) + livraison *at-least-once* = effectively-once | livraison | RFC-6 |
| **ADR-4** | **Agrégats à workflow = event-sourced** ; les données de masse (élèves, notes) restent CRUD | modèle | RFC-4 |

**Distinction fondatrice** : on sépare le **journal d'events** (append-only, immuable, autorité) de l'**état matérialisé** (projection requêtable, reconstructible). Cette séparation résout à elle seule les conflits (RFC-5), la duplication audit (RFC-4) et la reprise (RFC-7).

---

## RFC-1 — Audit infalsifiable (défaut C2)

### 1.1 Cause précise
La policy réelle :
```sql
CREATE POLICY domain_events_insert ON public.domain_events FOR INSERT
  WITH CHECK (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()));
```
autorise **tout membre authentifié** à insérer un event via PostgREST. Pire : `actor_id`, `actor_name`, `event_type`, `payload`, `occurred_at` sont **fournis par le client** → un utilisateur peut forger `SignalementClosed by=Directrice`. Côté LAN, `server/query.js` n'applique **aucun** contrôle d'auteur.

### 1.2 Pourquoi l'architecture échoue
L'audit est censé être la **source de confiance** qui surveille les acteurs, mais il est écrit par le **même client** qu'il surveille, sans horodatage ni auteur de confiance, sans scellé. La prétention « non-répudiation / corrige H1 » était fausse.

### 1.3 Solutions envisagées
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | Écriture events **uniquement via Edge Function `service_role`** ; l'edge dérive `actor_id` du JWT, timbre `occurred_at`, refuse tout override | Prévention forte ; auteur/temps de confiance ; simple à raisonner | +1 latence réseau (cold start edge) ; LAN nécessite un équivalent |
| **B** | Garder l'INSERT client mais **trigger `BEFORE INSERT`** qui force `actor_id = auth.uid()`, `occurred_at = now()`, whitelist `event_type` | Aucune latence edge ; perf conservée | `payload` reste libre ; surface d'écriture client conservée |
| **C** | **Chaînage cryptographique** : `event_hash = H(prev_hash ‖ canonical(event))` + HMAC serveur | Détection *a posteriori* de toute falsification/suppression ; vérifiable | Ne **prévient** pas l'insertion ; complexité ; coût de vérif |
| **D** | Ledger externe (QLDB/immudb) | Immuabilité native | Infra lourde, pas d'offline, hors budget solo |

### 1.4 Décision
**A + C**, avec B comme mécanisme LAN.
- **Prévention** (A) : le client n'écrit plus jamais d'event en direct. En cloud, une **RPC Postgres `SECURITY DEFINER`** (`emit_event`) insère l'event en timbrant `actor_id`/`occurred_at` côté serveur (voir RFC-2, même RPC que l'outbox transactionnel). On **retire la policy INSERT client**. En LAN, le serveur Node (déjà `service_role` de fait) joue ce rôle : `query.js` ajoute le timbrage d'auteur pour `domain_events` (mécanique B).
- **Détection** (C) : chaque event porte `prev_hash`/`event_hash` (chaîne par `(school_id, aggregate_type)`) + `sig` HMAC. Un endpoint `verify-audit` rejoue la chaîne.

*Justification* : A empêche la forge, C la rend **prouvablement** détectable même si un attaquant obtient un accès base ; les deux sont peu coûteux et fonctionnent Cloud **et** LAN.

### 1.5 Diagramme
```
Client ──(intent)──► emit_event() RPC (SECURITY DEFINER, service_role)
                        │  actor_id ← auth.uid()      (client ne peut pas mentir)
                        │  occurred_at ← now()
                        │  prev_hash ← head(school, aggregate)
                        │  event_hash ← H(prev_hash ‖ canonical(evt))
                        │  sig ← HMAC(secret, event_hash)
                        ▼
                   domain_events  (INSERT client REFUSÉ par RLS)
                        ▲
LAN: localClient ──► /api/db ──► query.js (timbre actor/occurred/hash) ──┘
```

### 1.6 Flux des events
`intent → emit_event() → [validation auteur/temps] → chaînage+scellé → INSERT atomique → dispatch (RFC-6)`.

### 1.7 Modèle de données (esquisse)
```
domain_events  (+colonnes)
  actor_id       uuid    -- FORCÉ serveur (auth.uid / session LAN)
  occurred_at    tstz    -- FORCÉ serveur
  prev_hash      text    -- chaîne par (school_id, aggregate_type)
  event_hash     text    -- H(prev_hash ‖ canonical(event))
  sig            text    -- HMAC(server_secret, event_hash)
  event_version  int     -- schéma du payload (ADR/futur upcaster)
RLS: SELECT = membre école ; INSERT/UPDATE/DELETE = AUCUNE policy client (service_role only)
```

### 1.8 Impacts sur le code existant
- `src/kernel/index.js` : `bus.store.append` n'appelle plus `repo('domain_events').insert` mais la RPC `emit_event` (cloud) / endpoint dédié (LAN).
- `supabase/functions/` : nouvelle fonction/RPC `emit_event` + `verify-audit`.
- `server/query.js` : branche de timbrage pour `domain_events`.
- Migration `supabase_domain_events.sql` : **retirer** `domain_events_insert`, ajouter colonnes de scellé.
- Corrige au passage la faille **H1 de `security_audit`** (vérif djb2 forgeable) en la remplaçant par HMAC chaîné.

### 1.9 Plan de migration
1. Ajouter colonnes (`prev_hash`, `event_hash`, `sig`, `event_version`) — nullable, additif.
2. Déployer RPC `emit_event` + `verify-audit`.
3. Basculer `kernel/index.js` sur la RPC (drapeau `NOTESCAM_AUDIT_SEALED=1`).
4. Retirer la policy INSERT client.
5. Backfill du chaînage sur l'historique existant (job unique).

### 1.10 Tests d'acceptation
- INSERT direct client sur `domain_events` → **rejeté** (RLS).
- Event émis via RPC : `actor_id == auth.uid()` même si le client envoie un autre `actor_id`.
- Falsification d'une ligne (modif `payload` en base) → `verify-audit` **détecte** la rupture de chaîne.
- Suppression d'une ligne → trou de chaîne **détecté**.
- LAN : event via `/api/db` timbré serveur, chaîne vérifiable hors-ligne.

### 1.11 Risques
- Cold start edge (latence) → mitigé par RPC in-DB plutôt qu'edge HTTP.
- Gestion du secret HMAC (rotation) → stocker en secret Supabase / `server/data/jwt-secret.key` (déjà présent en LAN).
- Backfill hash sur gros volume → job idempotent, par lots.

### 1.12 Rollback
Ré-activer la policy INSERT client ; les colonnes de scellé restent nullable (inoffensives). Drapeau `NOTESCAM_AUDIT_SEALED=0` rebranche l'ancien `append`.

---

## RFC-2 — Outbox Pattern durable (défaut C3, durabilité)

### 2.1 Cause précise
`unitOfWork.commit()` applique les écritures **puis** publie les events, hors transaction. Un crash entre les deux → **donnée sans event** (audit/notif jamais déclenchés). Un `applyOp` #2 qui échoue après #1 → **écriture partielle sans rollback**. `eventBus.onError` = `console.warn`, **aucun replay**.

### 2.2 Pourquoi l'architecture échoue
« Persist-then-publish » ne garantit rien sans transaction commune ni relayeur. En pratique la livraison est *at-most-once*. L'« outbox durable » n'existe pas : rien ne rejoue un event non dispatché.

### 2.3 Solutions
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | **Outbox transactionnel** : donnée + event insérés dans **une même transaction** (RPC Postgres `SECURITY DEFINER` ; tx `better-sqlite3` en LAN). Un **relay** lit les events `pending` et dispatch, marque `dispatched`. | Atomicité réelle ; identique Cloud/LAN ; testable ; pas d'infra externe | 1 RPC par cas d'usage agrégat ; relay à écrire |
| **B** | **CDC / WAL** (Supabase Realtime, `wal2json`) : dispatch depuis le journal WAL, pas de double écriture | Élégant ; zéro outbox applicatif | Dépend d'infra cloud ; LAN SQLite sans WAL logique exploitable pareil ; couplage fort |
| **C** | **Event-first** (event sourcing) : l'event est écrit d'abord, la donnée est une projection | Le plus propre ; outbox = journal lui-même | Refonte des écritures (voir RFC-4) |

### 2.4 Décision
**A** comme socle universel, **compatible C** pour les agrégats event-sourced (RFC-4). La RPC `emit_event` de RFC-1 devient l'unique point d'écriture atomique **donnée+event**. Un **relay de dispatch** (RFC-6) découple l'effet de bord du commit.

*Justification* : A fonctionne à l'identique Cloud et LAN (les deux ont des transactions locales), se teste sans infra, et réutilise `sync_outbox` déjà présent en LAN.

### 2.5 Diagramme
```
Cas d'usage ─► RPC apply_command(data_ops[], event)   ── TRANSACTION ──┐
                 INSERT/UPDATE data …                                    │ atomique
                 INSERT domain_events (dispatch_status='pending')        │
               COMMIT ◄──────────────────────────────────────────────────┘
                     │
   Relay loop ◄──────┘  SELECT events WHERE dispatch_status='pending'
        │               → dispatch aux subscribers (idempotent, RFC-6)
        └── UPDATE dispatch_status='dispatched'
```

### 2.6 Flux
`command → apply_command (tx: data + event pending) → commit → relay poll → dispatch → mark dispatched`.

### 2.7 Modèle de données (esquisse)
```
domain_events (+)
  dispatch_status  text  default 'pending'   -- 'pending'|'dispatched'|'dead'
  dispatched_at    tstz
  attempts         int   default 0
Index: (school_id, dispatch_status) WHERE dispatch_status='pending'   -- file de travail
```
LAN : réutilise/aligne `sync_outbox` (déjà écrit par `recordOutbox` dans `query.js`).

### 2.8 Impacts
- `src/kernel/unitOfWork.js` : `commit()` n'orchestre plus write-puis-publish ; il **assemble une commande** transmise à `apply_command` (RPC cloud / tx LAN).
- `src/kernel/eventBus.js` : `publish` ne dispatch plus en synchrone ; il **append** seulement (le relay dispatch).
- Nouveau **relay** (kernel) + RPC `apply_command`.

### 2.9 Plan de migration
1. Colonnes `dispatch_status/attempts` (additif).
2. RPC `apply_command` (cloud) + wrapper tx (LAN).
3. Introduire le relay derrière drapeau `NOTESCAM_OUTBOX_RELAY=1`, en parallèle du dispatch actuel (double, idempotent).
4. Couper l'ancien dispatch synchrone.

### 2.10 Tests d'acceptation
- Kill du process **après commit, avant dispatch** → au redémarrage le relay dispatch l'event (aucune perte).
- Échec d'un `data_op` dans la commande → **aucun** event `pending` créé (atomicité).
- Un abonné qui throw → event reste `pending`, retenté (RFC-6), jamais silencieusement perdu.

### 2.11 Risques
- Latence de dispatch (poll) → intervalle court + notification directe en ligne.
- Croissance de la file `pending` si un abonné est durablement KO → dead-letter (RFC-6/7).

### 2.12 Rollback
Drapeau `NOTESCAM_OUTBOX_RELAY=0` → retour au dispatch inline ; colonnes restent nullable.

---

## RFC-3 — Synchronisation LAN ↔ Cloud robuste (défauts C1, H2)

### 3.1 Cause précise
- **C1** : `ALLOWED_TABLES` (`server/db.js`) ne contient pas `domain_events`/`audit_events`/`signalements` → `query.js` répond « Table non autorisée ». **Le socle est mort en LAN.**
- **H2** : les subscribers ne tournent qu'à l'émission, sur l'appareil émetteur. Les events **répliqués** (pull) n'exécutent aucun handler → audit/notif absents sur les autres postes. `audit_events` n'est pas dans `SYNCED_TABLES`.
- **M3** : `seq` (bigserial) n'existe qu'en cloud ; `null` en LAN → curseur de pull inopérant.

### 3.2 Pourquoi l'architecture échoue
Deux mécanismes de sync coexistent sans être réconciliés : LWW par ligne (Phase 2) pour les données mutables, et un « curseur seq » **jamais implémenté** pour le log d'events. Le log append-only ne se réplique pas et ne re-projette pas.

### 3.3 Solutions (réplication du log d'events)
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | Traiter les events comme des lignes synced ordinaires (LWW) | Réutilise Phase 2 tel quel | LWW inutile (immuable) ; pas d'ordre causal ; pas de re-dispatch |
| **B** | **Sync du log par curseur HLC** : chaque nœud suit le dernier HLC tiré ; à l'ingestion, les events passent par le **dispatcher local** (re-projection + audit + notif), idempotent | Ordre causal ; re-dispatch (corrige H2) ; audit = projection locale par nœud | Nécessite HLC (RFC-5) + dispatcher idempotent (RFC-6) |
| **C** | Moteur de réplication **unifié** : transport commun `sync-pull/push`, deux modes (LWW rows / append-only log) | Une seule voie réseau ; cohérent | Refactor du moteur de sync |

### 3.4 Décision
**B, monté dans le transport existant (esprit C).**
- Corriger **C1** : ajouter les 3 tables à `ALLOWED_TABLES`, `domain_events`+`signalements` à `SYNCED_TABLES` (audit exclu, voir infra).
- **audit_events devient une projection LOCALE** (dérivée des events par chaque nœud) → **non synchronisée**, ce qui supprime la divergence entre éditions et la double écriture (M2).
- À l'ingestion d'events pull, le **dispatcher local** rejoue projection+réactions (corrige H2), idempotent par `event_id`.

*Justification* : le log d'events est la seule chose à répliquer ; tout le reste (état, audit, notif) se **recalcule** localement de façon déterministe.

### 3.5 Diagramme
```
Nœud A (LAN)                         Cloud                      Nœud B (LAN autre école/poste)
 emit_event ─► domain_events ──push──► domain_events ──pull────► domain_events
                                         (curseur HLC par nœud)      │
                                                                     ▼ dispatcher local
                                                          projection signalements + audit_events + notif
```

### 3.6 Flux
`emit (A) → push → cloud log → pull (B, since HLC) → dispatcher local (B) → projette état + audit + réactions`.

### 3.7 Modèle de données (esquisse)
```
sync_cursors  (par nœud)
  device_id   text
  peer        text          -- 'cloud' | device distant
  last_hlc    text          -- dernier HLC ingéré  (curseur)
  PRIMARY KEY (device_id, peer)

ALLOWED_TABLES  += domain_events, signalements        -- corrige C1
SYNCED_TABLES   += domain_events, signalements        -- audit_events EXCLU (projection locale)
```

### 3.8 Impacts
- `server/db.js` : `ALLOWED_TABLES`, `SYNCED_TABLES`.
- `supabase/functions/sync-pull` & `sync-push` : mode log (curseur HLC) en plus du mode LWW.
- `server/cloudSync.js` : ingestion → dispatcher local.
- `kernel` : `attachAudit` alimente une **projection** locale, plus une table synced.

### 3.9 Plan de migration
1. **Hotfix C1** immédiat : whitelist (débloque le LAN) — livrable isolé, faible risque.
2. HLC (RFC-5) puis curseur de log dans `sync-pull`.
3. Dispatcher d'ingestion (re-dispatch) derrière drapeau.
4. Retirer `audit_events` de toute sync ; le régénérer par projection.

### 3.10 Tests d'acceptation
- LAN : CRUD `signalements` via `/api/db` **fonctionne** (n'est plus « Table non autorisée »).
- Event émis sur nœud A → après sync, **présent** sur nœud B **et** ligne d'audit + notification **régénérées** sur B.
- Rejeu d'un pull (doublon) → **pas** de double audit (idempotence).
- Coupure réseau puis reprise → curseur HLC reprend sans trou ni doublon.

### 3.11 Risques
- Ordre d'ingestion incorrect → mitigé par tri HLC avant fold.
- Explosion du log en pull initial → pagination par curseur + borne.

### 3.12 Rollback
Drapeau `NOTESCAM_LOG_SYNC=0` → revient au mode Phase 2 pur ; le hotfix `ALLOWED_TABLES` reste (inoffensif, seulement permissif).

---

## RFC-4 — Event Sourcing léger (défauts H3, M2)

### 4.1 Cause précise
`signalements` est mis à jour en **LWW** (Phase 2). Sur une machine à états, deux transitions concurrentes → une décision **écrasée silencieusement**. Et `audit_events` **duplique** le log (2× écritures/stockage).

### 4.2 Pourquoi l'architecture échoue
LWW convient à des champs commutatifs (un numéro de téléphone), **pas** à une machine à états où l'ordre et la légalité des transitions comptent. Par ailleurs stocker l'état **et** un log **et** un audit, c'est trois copies désynchronisables.

### 4.3 Pertinence (question posée : « si pertinent »)
**Oui, mais ciblé.** Event sourcing **uniquement pour les agrégats à workflow** (`signalement`, futurs Maintenance/Patrimoine/approbations/congés). Les **données de masse** (élèves, notes, paiements) restent **CRUD** — les event-sourcer serait coûteux et inutile (pas de machine à états conflictuelle). D'où **ADR-4** + un **registre** explicite des agrégats event-sourced.

### 4.4 Solutions
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | Event sourcing **pur** (pas de table d'état, fold à chaque lecture) | Vérité unique ; audit gratuit | Lectures coûteuses ; requêtes/liste difficiles |
| **B** | **Event-sourced + projection matérialisée (CQRS-lite)** : events = autorité, table d'état reconstructible pour les requêtes | Requêtes rapides ; audit = log ; conflits par rejeu | Projecteur à maintenir ; cohérence éventuelle |
| **C** | Statu quo CRUD + log séparé | Rien à changer | Divergence log/état (le défaut actuel) |

### 4.5 Décision
**B (CQRS-lite)** pour les agrégats à workflow. `signalements` **reste** comme table, mais **requalifiée en projection** reconstruite par `fold(domain_events)`. L'audit **est** le log (plus de table `audit_events` synchronisée ; projection locale seulement pour l'affichage).

*Justification* : conserve la performance de lecture, supprime la triple copie, et rend les conflits **résolubles par rejeu déterministe** (RFC-5).

### 4.6 Diagramme
```
Command ─► valide(état courant, base_version) ─► emit event(s)  [autorité]
                                                     │
                                     ┌───────────────┴───────────────┐
                              Projector (state)                Projector (audit view)
                                     ▼                                ▼
                              signalements (read model)        audit_events (local, non-synced)
```

### 4.7 Flux
`command → charge projection → garde de transition → emit event → projector met à jour signalements → (rejeu ordonné en cas de sync)`.

### 4.8 Modèle de données (esquisse)
```
event_sourced_aggregates            -- registre (quels agrégats sont ES)
  aggregate_type  text primary key  -- 'signalement', 'maintenance_ticket', …

signalements  (= projection, +)
  last_event_hlc  text              -- position de la projection (idempotence)
  base_version    int               -- pour la garde optimiste des commands

aggregate_snapshots  (optionnel, perf)
  aggregate_type, aggregate_id, hlc, state jsonb
```

### 4.9 Impacts
- `src/domains/signalement/service.js` : les transitions **émettent des events** ; elles ne font plus `uow.stage('update')` en direct — un **projecteur** applique l'état.
- `src/kernel/` : ajout d'un `projector` générique (fold) + registre d'agrégats ES.
- `auditSubscriber` : devient projection de vue locale (plus une table synced).

### 4.10 Plan de migration
1. Introduire le registre + projecteur, en **shadow** (projette dans une table `signalements_v2`) et comparer à l'existant.
2. Bascule lecture sur la projection (drapeau `NOTESCAM_ES_SIGNALEMENT=1`).
3. Retirer les écritures CRUD directes de l'état.

### 4.11 Tests d'acceptation
- `fold(events)` d'un signalement = état attendu après chaque transition.
- Reconstruction complète depuis un log vide → projection **identique** à l'état de référence.
- Deux commandes valides séquentielles → un seul état cohérent, deux events.

### 4.12 Risques
- Bug de projecteur = état faux → mitigé par reconstruction reproductible + tests de fold.
- Cohérence éventuelle visible à l'UI → afficher l'état optimiste local.

### 4.13 Rollback
Drapeau ES à 0 → retour au CRUD LWW ; les events continuent d'être écrits (inoffensif), la projection est ignorée.

---

## RFC-5 — Gestion des conflits de synchronisation (défauts H3, M3)

### 5.1 Cause précise
Aucune métadonnée causale : `updated_at` (horloge murale, dérive entre postes) + LWW. Deux transitions offline depuis la même base → écrasement muet ; ordre indéterminé.

### 5.2 Pourquoi l'architecture échoue
La causalité offline ne peut pas reposer sur l'horloge murale (postes désynchronisés, pas d'Internet). LWW ne « résout » pas un conflit, il en **cache** un.

### 5.3 Solutions
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | LWW horloge murale (actuel) | Simple | Perte muette ; dérive d'horloge |
| **B** | **HLC + rejeu déterministe + règles de la machine à états** ; `ConflictDetected` vers une file de résolution si transitions incompatibles | Ordre causal sans NTP ; aucune perte (tout est dans le log) ; humain seulement si ambigu | Complexité modérée ; définir les précédences |
| **C** | CRDT (state-based) | Convergence auto | La machine à états n'est pas un CRDT naturel ; lourd |
| **D** | File de fusion manuelle systématique | Contrôle total | UX intenable |

### 5.4 Décision
**B**. HLC `⟨wall_ms, counter, device_id⟩` (**ADR-1**) ordonne totalement les events sans horloge synchronisée. La projection **rejoue** dans l'ordre HLC. Quand deux events branchent depuis la **même `base_version`** vers des états **incompatibles** (ex. `resolved` vs `rejected`), on applique une **précédence déclarée** par la machine à états ; si aucune n'est définie → event `ConflictDetected` + entrée dans une **file de résolution** (humain).

### 5.5 Diagramme
```
Poste A (offline)  assigned ─(hlc A)─► resolved
Poste B (offline)  assigned ─(hlc B)─► rejected
        │ sync
        ▼
  fold ordonné par HLC :
     base_version identique + cibles incompatibles
        → précédence machine à états ?  oui → gagnant déterministe
                                        non → ConflictDetected → file de résolution
```

### 5.6 Flux
`command(base_version) → event(hlc, base_version, causation_id) → sync → fold trié HLC → détection de branche → résolution (précédence | humain)`.

### 5.7 Modèle de données (esquisse)
```
domain_events (+)
  hlc            text   -- '⟨wall_ms⟩.⟨counter⟩.⟨device_id⟩'
  base_version   int    -- version de projection au moment de la command
  causation_id   uuid   -- event ayant causé celui-ci
  correlation_id uuid   -- déjà présent (fil du workflow)

sync_conflicts
  id, school_id, aggregate_type, aggregate_id,
  event_a, event_b, reason, status ('open'|'resolved'), resolved_by, resolved_at
```

### 5.8 Impacts
- `domainEvent.js` : ajouter `hlc`, `base_version`, `causation_id`.
- `signalement.js` : déclarer les **précédences** de transitions concurrentes.
- Projecteur (RFC-4) : tri HLC + détection de branche.
- Nouvelle vue « conflits à résoudre » (UI, hors RFC).

### 5.9 Plan de migration
1. Générateur HLC + colonnes (additif, défaut dérivé de `updated_at` pour l'existant).
2. Tri HLC dans le projecteur.
3. Règles de précédence + `ConflictDetected`.

### 5.10 Tests d'acceptation
- Deux transitions concurrentes incompatibles → **aucune perte** dans le log ; état final déterministe **quel que soit l'ordre d'arrivée**.
- Cas ambigu → `ConflictDetected` créé, état laissé en attente de résolution.
- HLC : monotone par device, total après merge.

### 5.11 Risques
- Précédences mal définies → conflits mal tranchés ; mitigé par défaut « escalade humaine ».
- Dérive `wall_ms` extrême → HLC borne le décalage (composant counter).

### 5.12 Rollback
Ignorer HLC → retour au tri `updated_at` LWW (les colonnes restent). File de conflits désactivable.

---

## RFC-6 — Garanties de livraison des événements (défauts C3, H1, M1)

### 6.1 Cause précise
Dispatch **synchrone séquentiel** dans le chemin de commit (`eventBus.publish` await chaque handler). Pas de retry, pas d'idempotence (`auditSubscriber` insère avec `uuid()` neuf, pas `event_id`).

### 6.2 Pourquoi l'architecture échoue
Un handler lent (SMS/WhatsApp réel du futur #4) **bloque l'action utilisateur**. Un handler qui échoue perd l'effet. Un rejeu (sync) **duplique** l'audit.

### 6.3 Solutions
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | Dispatch inline synchrone (actuel) | Simple | Bloquant ; sans retry ; sans idempotence |
| **B** | **Dispatch asynchrone via file de livraison** (outbox-of-dispatch) + **consommateurs idempotents** (`processed_events`) + retry/backoff + dead-letter | Effets hors chemin critique ; at-least-once → effectively-once ; reprise | File + suivi par (subscriber,event) |
| **C** | Broker externe (Kafka/Redis Streams) | Scalable | Infra lourde, pas d'offline |

### 6.4 Décision
**B**. `publish` = **append seulement** (RFC-2). Un **relay** livre à chaque subscriber nommé, avec **backoff** et **dead-letter** après N tentatives. Idempotence via table `processed_events(subscriber, event_id)` **unique** (**ADR-3**). Les effets de bord quittent le chemin critique (corrige **H1**).

### 6.5 Diagramme
```
publish → [append domain_events(pending)]         (rapide, non bloquant)
Relay loop:
  for event in pending, ordered HLC:
     for subscriber in registry:
        if (subscriber,event) in processed_events: skip        (idempotence)
        try deliver → insert processed_events                  (at-least-once)
        catch: attempts++, backoff ; attempts>N → dead_letter
```

### 6.6 Flux
`append → relay → (par subscriber) idempotence-check → deliver → mark processed | retry | dead-letter`.

### 6.7 Modèle de données (esquisse)
```
processed_events
  subscriber text, event_id uuid, processed_at tstz
  PRIMARY KEY (subscriber, event_id)          -- idempotence

dispatch_dead_letter
  event_id, subscriber, error, attempts, first_seen, last_seen
```

### 6.8 Impacts
- `eventBus.js` : scindé en **EventStore** (append) + **Dispatcher** (relay) — corrige aussi F2/SRP.
- `auditSubscriber.js` et abonnés : deviennent **idempotents** (upsert par `event_id`).
- Subscribers **nommés** + registre.

### 6.9 Plan de migration
1. Table `processed_events` + registre nommé.
2. Rendre `attachAudit` et réactions idempotents.
3. Relay derrière `NOTESCAM_ASYNC_DISPATCH=1` (coexiste, idempotent).
4. Retirer le dispatch inline.

### 6.10 Tests d'acceptation
- Même event livré 2× → **un seul** effet (audit unique).
- Handler qui throw 2 fois puis réussit → **livré** (retry) ; compteur `attempts`.
- Handler KO au-delà de N → **dead-letter**, le reste du système continue.
- Commit d'une command → **retour immédiat** (pas d'attente d'un envoi SMS).

### 6.11 Risques
- Latence perçue (effet différé) → dispatch prioritaire en ligne + toasts optimistes.
- Croissance `dead_letter` → alerte + rejeu manuel (RFC-7).

### 6.12 Rollback
`NOTESCAM_ASYNC_DISPATCH=0` → dispatch inline ; `processed_events` reste (inoffensif).

---

## RFC-7 — Reprise après panne

### 7.1 Cause précise
Aucune procédure de reprise : un crash laisse potentiellement des events non dispatchés (avant RFC-2/6) ou des états partiels.

### 7.2 Pourquoi l'architecture échoue
Sans outbox transactionnel ni relay, rien ne « reprend » au redémarrage. La cohérence dépend de l'absence de crash — hypothèse intenable en zone à électricité intermittente.

### 7.3 Matrice des scénarios de crash (après RFC-2/6)
| Instant du crash | Effet | Reprise |
|---|---|---|
| Avant `commit` | Rien écrit | Rien à faire (command à rejouer par l'utilisateur) |
| Après `commit`, avant dispatch | Donnée+event présents (atomique), `pending` | Relay dispatch au boot |
| Pendant dispatch (handler i ok, j non) | `processed_events` partiel | Relay reprend les subscribers manquants (idempotent) |
| Pendant sync (push/pull) | Curseur non avancé | Reprise au dernier `last_hlc`, dédupliqué |

### 7.4 Solutions
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | **Réconciliateur au boot** : scanne `pending` + gaps `processed_events`, reprend | Simple, déterministe ; s'appuie sur RFC-2/6 | Coût de scan au démarrage |
| **B** | Checkpoint périodique par subscriber (HLC) | Reprise rapide | État de checkpoint à maintenir |
| **C** | Rejeu complet du log à chaque boot | Robuste | Coûteux à grande échelle |

### 7.5 Décision
**A + B** : réconciliateur au boot (reprend `pending`/gaps) **et** checkpoint HLC par subscriber pour éviter le rescan complet. `C` réservé à la **reconstruction** (RFC-8), pas au boot courant.

### 7.6 Diagramme
```
Boot ─► Reconciler
         ├─ events WHERE dispatch_status='pending'  → relay
         ├─ subscriber checkpoints (last_hlc)        → livrer le delta manquant
         └─ dead_letter WHERE attempts>N             → alerte (pas de blocage)
```

### 7.7 Modèle de données (esquisse)
```
subscriber_checkpoints
  subscriber text primary key, last_hlc text, updated_at tstz
(réutilise processed_events + dispatch_status + sync_cursors)
```

### 7.8 Impacts
- Nouveau **reconciler** appelé au démarrage (`server/index.js` LAN ; init app cloud).
- Health-check : compteur `pending` ancien / `dead_letter` → surface d'alerte.

### 7.9 Plan de migration
1. `subscriber_checkpoints` (additif).
2. Reconciler au boot (idempotent, sans risque).
3. Métriques `pending age` / `dead_letter`.

### 7.10 Tests d'acceptation
- Kill -9 pendant dispatch → au redémarrage, tous les subscribers rattrapent, **sans doublon**.
- Coupure secteur pendant sync → reprise exacte au curseur, **sans trou ni doublon**.
- `dead_letter` non vide → alerte visible, système **non bloqué**.

### 7.11 Risques
- Scan de boot lent si `pending` énorme → borné + indexé.
- Boucle de retry infinie → plafond N + dead-letter.

### 7.12 Rollback
Désactiver le reconciler (drapeau) ; l'outbox reste, reprise manuelle possible via endpoint de rejeu.

---

## RFC-8 — Sauvegarde et restauration

### 8.1 Cause précise
La sauvegarde existante (`server/backup.js` en LAN, PITR Supabase en cloud) sauvegarde **l'état**. Avec l'event log comme autorité (RFC-4), une sauvegarde qui perd/altère le log **détruit la source de vérité** et invalide la chaîne d'audit (RFC-1).

### 8.2 Pourquoi l'architecture actuelle échoue
Aucune garantie d'intégrité du **log** ni de reconstruction des projections après restauration ; pas de sauvegarde **par établissement** (granularité tenant) pour un ERP multi-écoles.

### 8.3 Solutions
| | Solution | Avantages | Inconvénients |
|---|---|---|---|
| **A** | **Infra** : PITR Supabase (cloud) + snapshot fichier SQLite (`backup.js`, LAN) | Déjà en place ; simple | Granularité base entière ; pas portable Cloud↔LAN ; ne vérifie pas la chaîne |
| **B** | **Export/import logique du log par tenant** : dump `domain_events` d'une école (+ chaîne), restauration = import + **rebuild des projections** + **vérif de chaîne** | Granularité école ; portable (réutilise `cloud_to_lan_migration`) ; vérifiable | Rebuild à écrire ; volume du log |
| **C** | Archivage WAL continu | RPO proche de 0 | Complexe, infra |

### 8.4 Décision
**A (DR infra) + B (sauvegarde logique par tenant, autoritaire)**. La sauvegarde de référence d'une école = **son log d'events scellé** (RFC-1) ; la restauration = *import log → vérif chaîne → rebuild projections*. A reste le filet de sécurité niveau plateforme. B alimente aussi la **migration Cloud↔LAN** déjà existante et la portabilité 10 ans.

### 8.5 Diagramme
```
Backup (école X):  domain_events[X]  +  manifest(chain_head_hash, from_hlc, to_hlc, count)
                        │
Restore:  import events → verify_chain() ──fail──► refus (corruption détectée)
                              │ ok
                              ▼
                    rebuild projections (fold) → signalements, audit view, …
```

### 8.6 Flux
`export(log tenant + manifeste scellé) → stockage → restore(import → verify → rebuild)`.

### 8.7 Modèle de données (esquisse)
```
backup_manifest
  id, school_id, from_hlc, to_hlc, event_count,
  chain_head_hash text,     -- doit égaler event_hash du dernier event
  created_at, created_by, edition ('cloud'|'lan')
```

### 8.8 Impacts
- `server/backup.js` : ajoute l'export **logique par école** (pas seulement le fichier SQLite).
- Réutilise les fonctions de `cloud_to_lan_migration` / `local_to_cloud_activation` (ETL IDs préservés).
- Restauration : appelle `verify-audit` (RFC-1) avant rebuild.

### 8.9 Plan de migration
1. Export logique par tenant (additif, ne remplace pas les snapshots).
2. Restore vers **staging** puis bascule (jamais in-place).
3. Vérif de chaîne obligatoire avant activation.

### 8.10 Tests d'acceptation
- Restauration reconstruit une projection **identique** à l'original (hash d'état égal).
- Manifeste altéré / event manquant → `verify_chain` **échoue** → restauration **refusée**.
- Restauration **scopée** à une école → **aucune fuite** d'une autre école (isolation).
- Export cloud → import LAN → projections cohérentes (portabilité).

### 8.11 Risques
- Volume du log à long terme → snapshots d'agrégat (RFC-4) + rétention/archivage (F1).
- Restore partiel → staging + swap atomique.

### 8.12 Rollback
Conserver N sauvegardes ; restauration en staging → l'ancienne base reste active jusqu'au swap ; échec de vérif = pas de swap.

---

## 9. Séquencement global & dépendances

```
Phase A (débloquer — Critique)         Phase B (cohérence)              Phase C (résilience)
─────────────────────────────         ───────────────────             ────────────────────
C1 hotfix ALLOWED_TABLES (RFC-3.1)  →  HLC (RFC-5) ─────────────────►  Reprise (RFC-7)
Audit scellé (RFC-1) ──────────────►  Event sourcing signalement       Backup logique (RFC-8)
Outbox transactionnel (RFC-2) ─────►  (RFC-4) ────────────────────►    Sync log complet (RFC-3.2)
Livraison async+idempotente (RFC-6)   Conflits (RFC-5) 
```
**Dépendances dures** : RFC-2 précède RFC-6/7 ; RFC-5(HLC) précède RFC-3.2/4 ; RFC-1 précède RFC-8 (vérif de chaîne).

**Livrable minimal pour rendre le socle déployable** = Phase A (C1+RFC-1+RFC-2+RFC-6). Le module #2 RBAC/ABAC ne démarre **qu'après** Phase A.

## 10. Risques transverses
- **Sur-ingénierie** : HLC/ES/CQRS pour un dev solo → mitigé en ciblant l'ES aux seuls agrégats à workflow (ADR-4) et en gardant le CRUD ailleurs.
- **Budget de migration** : chaque RFC est **derrière un drapeau** et **additive** → intégration progressive, conforme aux règles projet.
- **Compatibilité LAN packagé** (`.exe`) : migrations de schéma SQLite additives ; suivre `lan_packaging_deploy`.

## 11. Definition of Done (validation des RFC)
- [ ] Les 3 défauts Critiques ont une solution choisie et argumentée (✔ RFC-1/2/3).
- [ ] Chaque RFC : diagramme, flux, modèle, impacts, migration, tests, risques, rollback (✔).
- [ ] Séquencement et drapeaux définis (✔ §9).
- [ ] **Aucun code produit** avant validation (✔).

## 12. Questions ouvertes (à trancher avant Phase A)
1. `emit_event` : **RPC Postgres** `SECURITY DEFINER` (préféré, in-DB, pas de cold start) ou **Edge Function** ? — reco : RPC.
2. Secret HMAC d'audit : réutiliser `server/data/jwt-secret.key` (LAN) et un secret Supabase (cloud) ? Rotation ?
3. Précédences de la machine à états signalement en cas de conflit (`resolved` vs `rejected`) : règle métier à fixer avec toi.
4. Intervalle du relay de dispatch (temps réel vs batch) et seuil `N` du dead-letter.
