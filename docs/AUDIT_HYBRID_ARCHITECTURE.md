# Audit — Architecture hybride sélective LAN / Cloud

> **Phase H0 (audit only).** Aucun code, aucune migration, aucune suppression, aucune
> refonte Budget V3. Document de décision à valider avant toute implémentation.
> Date : 2026-07-26 · Branche : `feat/ux-architecture-refactor`.

---

## A. Architecture actuelle (réelle, telle qu'elle tourne)

### A.1 Deux éditions, un seul code

Le produit se compile en **deux éditions** depuis une même base, via un alias Vite
(`vite.config.js`, `mode === 'lan'`) :

| | Édition **Cloud** (`npm run build`) | Édition **LAN** (`npm run build:lan`) |
|---|---|---|
| Client data | `@supabase/supabase-js` → Postgres cloud | `src/lib/localClient.js` → HTTP vers Fastify local |
| Auth | Supabase Auth (JWT) | JWT local signé (`server/security.js`) |
| RLS | Postgres RLS (policies SQL) | **Guards serveur** (`budgetGuard.js`, `guardAppendOnly`) — pas de RLS par ligne pour la lecture |
| Storage | bucket Supabase | fichiers disque (`FILES_DIR`) |
| Realtime | WebSocket Supabase | **polling** 8 s (`makeChannel` dans localClient) |
| RPC | fonctions Postgres | `server/rpc.js` |

L'app React est **strictement identique** dans les deux cas : elle importe toujours
`./supabase`, que Vite redirige. C'est la propriété la plus importante à préserver.

### A.2 Il existe DÉJÀ deux mécanismes de synchronisation distincts

**(1) Navigateur Cloud hors-ligne → Cloud** — `src/lib/sync.js` + IndexedDB `syncQueue`.
Le PWA cloud met en file les écritures quand `navigator.onLine` est faux, puis les
rejoue à la reconnexion. Portée : notes, absences, students… Rejeu direct via
`supabase.from(table).upsert()`. Pas de LWW, pas de version : `onConflict` seul.

**(2) Serveur LAN ↔ Cloud** — `server/cloudSync.js` + edge `sync-pull` / `sync-push`.
Synchro **bidirectionnelle continue** (Phase 2), *gated* par `NOTESCAM_CLOUD_SYNC=1`
+ jeton serveur. C'est le canal qui compte pour la mission.
- **Transport** : le serveur LAN appelle les 2 edge functions, authentifié par un
  **jeton scellé d'école** (`school_server_tokens`, hash SHA-256). La `service_role`
  reste confinée au cloud.
- **Push** : `sync_outbox` (rempli par `query.js/recordOutbox` sur chaque écriture LAN)
  → `sync-push` applique en LWW côté cloud.
- **Pull** : curseur `updated_at` par table → `sync-pull` renvoie lignes modifiées +
  `sync_tombstones`. Application locale par `rawUpsert` (anti-écho : n'alimente pas
  l'outbox).
- **LWW déterministe** identique des deux côtés : `updated_at` → `version` → `device_id`
  (`remoteWins` LAN ≡ `wins` edge). Colonnes ajoutées à toutes les `SYNCED_TABLES`
  (`server/db.js`).
- **Offline** : le pull échoue silencieusement, le cycle est simplement réessayé au
  prochain tick (5 min). Le LAN n'attend jamais le cloud (déjà conforme §6 mission).
- **Dry-run** : `/api/sync/dry-run` calcule le plan sans rien écrire — outil de recette.

**Constat clé** : la synchro actuelle est une **réplication de TABLES** (state-based,
LWW ligne à ligne). Ce n'est PAS une synchro d'**événements/commandes**. Toute la
liste `PULL_ORDER` / `ALLOWED` est répliquée intégralement dans les deux sens dès que
le jeton existe.

### A.3 Backbone d'événements (existe, sous-utilisé)

Le socle DDD P0 est **déployé** : `domain_events` + `audit_events` (append-only),
fonction `kernel_emit()` (SECURITY DEFINER, non-répudiation : `actor_id = auth.uid()`
forcé, insertion event + audit atomique, idempotence par `id`), UoW à outbox
transactionnel (`kernel/unitOfWork.js`), relay (`outboxRelay.js`), RBAC/ABAC
(`kernel/rbac.js`).

**MAIS** : un seul domaine l'utilise — **Signalement** (`src/domains/signalement/`).
La **finance (Budgets/Dépenses/Déblocages) n'émet AUCUN domain event** : elle écrit
en direct via `budgetService` / `expenseService` / `unlockService`
(`supabase.from(...).upsert(...)`). L'infrastructure « commande/événement vérifiable »
existe donc déjà, mais la finance n'est pas branchée dessus.

### A.4 Modèle finance actuel (Budget V3 + Dépenses)

- **Budget V3** (`budgetLinesEngine.js`) : la LIGNE (`budget_chapters` scope défini)
  porte le montant annuel, réparti par période (%) et secteur (%). Source de vérité métier.
- **Dépenses** (`expenseEngine.js`) : machine à états
  `draft → submitted → approved → paid` (+ `rejected`, `cancelled`). `COMMITTING` =
  submitted/approved/paid. Le « reste » n'est jamais stocké (recalculé).
- **Séparation approbation ≠ paiement DÉJÀ présente** : `approved` et `paid` sont deux
  transitions distinctes (§5 mission déjà respecté au niveau modèle).
- **Enforcement serveur LAN** : `server/budgetGuard.js` est la frontière de confiance.
  Il rejoue les moteurs purs (chaîne budgétaire, machine à états, permissions, plafond
  de validation) sur CHAQUE écriture `/api/db` et `/api/db/batch` — **non contournable**
  par appel API direct. L'acteur = session serveur (`userId`), jamais le payload.
- **Validation par montant** (`validationEngine.js` + `governanceEngine.js`) :
  barème `schools.validation_rules` (défaut <25k RAF / 25k–250k Coordonnateur /
  >250k Fondatrice). `canValidateAmount()` résout le rôle habilité. Gate derrière
  `schools.budget_validation` (OFF par défaut).
- **Déblocage de ligne** (`unlockService.js`) : `budget_unlock_requests`
  `pending → refused | authorized | increased`, décision historisée
  (`decided_by`, `decided_role`, `decided_at`, `version`). **C'est déjà une "décision"
  historisée** — le patron le plus proche de la gouvernance distante voulue.

### A.5 Rôles & permissions

- **Rôle de base** : `school_users.role` (admin / censeur / surveillant / teacher).
- **Rôles de gouvernance ADDITIFS** : `user_governance_roles` (fondatrice,
  coordonnateur_general, raf, principal, caissier…). RBAC kernel = `actor.roles[]`.
- **Catalogue configurable** : `governance_roles` (table) + `governanceEngine.js`
  dérive permissions / pages / dashboards / validations **sans nom codé en dur**.
  Phase 1 faite ; éditeur de catalogue = Phase 2.
- **Comptes délégués** : `school_users.permissions` (JSON) — pages autorisées granulaires.
- **Contrôleur** : **n'existe pas encore** comme rôle. À ajouter au catalogue
  (données, pas de `if role === 'controller'`).

### A.6 Isolation & RLS cloud (finance)

`supabase_phase_f_budget_rls.sql` : RLS `FOR ALL` sur budgets / chapters / expenses /
unlocks. `has_budget_access(school)` = **admin OU tout détenteur d'un
`user_governance_roles`**, + `user_covers_sector()`. Isolation d'école = OK.
**Mais** : aucune notion de « ce rôle a le droit d'accéder depuis Internet ». Un RAF
ou un caissier avec rôle de gouvernance passerait la RLS finance en cloud aujourd'hui.

### A.7 Notes enseignants (flux cloud existant)

`schools.grade_entry_mode` (`principal` | `subject`) + RLS `grades` mode-aware :
en mode `subject`, un teacher n'écrit que sur `subjects.teacher_id = lui`. La brique
d'isolation « prof ne voit que ses matières » **existe déjà en RLS**. Le prof n'a
aucune policy sur les tables finance → déjà isolé de l'argent côté cloud.

---

## B. Écarts (ce qui empêche le scénario client aujourd'hui)

| # | Écart | Détail |
|---|---|---|
| **B1** | **Pas de politique de déploiement par établissement/module** | Aucun flag `deployment_mode` / `module_policy`. La synchro est tout-ou-rien (`NOTESCAM_CLOUD_SYNC=1` réplique TOUT). Impossible d'exprimer « finances = LAN-first + gouvernance cloud, notes = cloud+LAN, bulletins = LAN ». |
| **B2** | **La finance n'émet pas de commandes/événements** | La décision distante voulue (§3 mission) doit être « un événement/commande métier identifiable et vérifiable ». Or la finance écrit des lignes d'état, pas des événements. Le backbone `domain_events`/`kernel_emit` existe mais n'est pas branché finance. |
| **B3** | **Synchro = réplication de tables, pas de commandes** | Une décision cloud (approbation) serait aujourd'hui une simple modif de la ligne `budget_expenses` répliquée en LWW. → risque d'écrasement d'un état local changé entre-temps (le LWW compare `updated_at`, il n'exige PAS un `expected_version`). §11 mission (rejet explicite sur version périmée) non couvert. |
| **B4** | **Minimisation des données absente** | `sync-pull` renvoie l'intégralité des tables de l'école (finance comprise). Pour « la Fondatrice approuve à distance », rien ne restreint le payload cloud au strict nécessaire. §7 mission non couvert. |
| **B5** | **Pas de distinction "accès applicatif" vs "accès réseau"** | Un détenteur de rôle finance passe la RLS cloud quel que soit le canal. Impossible d'autoriser Fondatrice/Contrôleur à distance tout en gardant RAF/caissier LAN-only (§3-4 mission). |
| **B6** | **Rôle Contrôleur inexistant** | À créer dans le catalogue `governance_roles` + permissions de consultation/validation. |
| **B7** | **Idempotence des décisions non garantie de bout en bout** | `unlock`/`expense` ont `version`, mais rien n'empêche qu'une même décision distante, re-synchronisée deux fois, soit ré-appliquée si elle transite comme un simple upsert LWW (idempotent par hasard sur l'état, pas sur l'effet — ex. « increased » qui bumpe un montant). §12 mission fragile. |
| **B8** | **Enforcement serveur uniquement en LAN** | `budgetGuard.js` protège le serveur LAN. Côté cloud, l'équivalent est la RLS + (partiellement) rien pour la machine à états dépense. Une décision appliquée côté cloud puis répliquée LAN NE repasse PAS par `budgetGuard` (rawUpsert). → la vérification de la décision distante à l'application locale (§ recette 14) n'existe pas. |
| **B9** | **Notifications non branchées sur les flux finance** | `notificationService` (interne OK, externes en file non envoyée) existe mais aucun flux finance ne l'appelle. §13 mission à câbler. |

---

## C. Architecture cible (la plus simple et robuste)

### Principe directeur : séparer les 4 plans (comme demandé §mission)

1. **Lieu d'exécution/stockage** → *politique de déploiement par module* (config établissement).
2. **Synchronisation** → *2 canaux distincts* : réplication d'état (existant) **+** un
   **canal de commandes de gouvernance** (nouveau, minimal).
3. **Permissions** → RBAC/gouvernance existant + une **capacité "accès distant"** (nouvelle
   dimension, orthogonale au rôle).
4. **Workflows de validation** → machine à états finance existante, **pilotée par des
   commandes** au lieu d'upserts directs pour les transitions sensibles.

### C.1 Le LAN reste la source de vérité opérationnelle finance

Rien ne change à Budget V3 ni à `budgetGuard`. Le RAF/caissier/admin travaillent en
LAN comme aujourd'hui. La dépense vit et s'engage localement.

### C.2 La décision distante = une COMMANDE, pas une réplication de ligne

Le flux cible (schéma) :

```
LAN                                   CLOUD
────────────────────────────────────────────────────────────
RAF crée dépense (LAN, budgetGuard)
  → submitted, montant 450k
  → budgetGuard : montant > seuil
    ⇒ statut LOCAL = "en_attente_approbation_distante"
  → émet DECISION_REQUEST (commande sortante)
       { id, school, expense_id, expected_version,
         montant, ligne, demandeur, motif, snapshot_minimal }
  ─────────── sync push (canal commandes) ───────────►
                                        decision_requests (cloud)
                                        + notification Fondatrice
                                        Fondatrice consulte (payload minimal)
                                        APPROVE / REJECT / REQUEST_CHANGE / COMMENT
                                        ⇒ decision_records (cloud, signé, idempotency_key)
  ◄────────── sync pull (canal commandes) ────────────
budgetGuard VÉRIFIE la décision :
  - école == token ✔
  - expected_version == version locale actuelle ? (sinon REJET explicite, journalisé)
  - permission du décideur au moment de la décision ✔
  - idempotency_key jamais appliquée ✔
  ⇒ applique UNE fois : submitted → approved
  ⇒ notification locale RAF "approuvée par Fondatrice"
  ⇒ audit_events : chaîne complète reconstituable
```

Points cible :
- La table `budget_expenses` **n'est PAS répliquée pour la décision** : c'est la
  **commande** qui traverse. La ligne locale ne bouge que quand le LAN applique la
  décision, sous contrôle de `budgetGuard`.
- **Approbation ≠ paiement** conservé : `approved` ≠ `paid`, le décaissement reste une
  action LAN distincte (§5 mission déjà OK).
- **Offline** : tant que la décision n'est pas revenue, la dépense reste
  `en_attente_approbation_distante`. Le reste du LAN n'attend rien (§6). Jamais de
  fallback « pas d'Internet ⇒ approuver ».

### C.3 Réutiliser le backbone existant plutôt qu'inventer

- La **commande sortante** = une ligne `domain_events` finance (ex.
  `ExpenseRemoteApprovalRequested`) émise par le LAN via l'UoW à outbox.
- La **décision cloud** = un `domain_event` (`ExpenseApprovedRemotely`) émis via
  `kernel_emit` (non-répudiation, acteur = `auth.uid()` cloud).
- La **traçabilité** (§4 mission) tombe naturellement : `domain_events`/`audit_events`
  contiennent déjà école, agrégat, id, acteur, occurred_at, correlation_id. Il manque
  juste `expected_version`, `role_at_decision`, `idempotency_key`, `applied_at` dans le
  payload — champs, pas nouvelles tables.

> **Décision d'architecture à trancher (voir §H)** : réutiliser `domain_events` comme
> canal de commandes (recommandé, zéro nouvelle table structurelle) **vs** créer une
> table dédiée `governance_decisions`. Recommandation : `domain_events` +
> une vue/index dédiés.

### C.4 Notes Cloud → LAN

Aucun changement structurel : le flux existe déjà (RLS `grade_entry_mode`, réplication
`grades` cloud→LAN via `sync-pull`). À cadrer : le prof saisit sur le **Cloud**, la
réplication d'état ramène `grades` vers le LAN. Isolation finance/prof déjà garantie
par RLS (le prof n'a aucune policy finance). **Seul écart** : quand un établissement est
`LOCAL_ONLY`, il faut que le sous-domaine « notes » puisse rester `CLOUD+LAN` — d'où la
politique **par module** (§C.5).

### C.5 Politique de déploiement par module (le cœur configurable)

Un unique document de politique par école, ex. conceptuel (à ne PAS coder maintenant) :

```
school_policy = {
  finance:   { execution: 'lan',   governance: 'cloud' },  // LAN-first + décisions cloud
  notes:     { execution: 'hybrid' },                       // cloud+LAN
  bulletins: { execution: 'lan' },
  default:   { execution: 'lan' }
}
```

La couche sync lit cette politique pour décider **quelles tables répliquer dans quel
sens** et **quels domaines ouvrent un canal de commandes**. Générique → pas de version
spéciale par école (§1, §16 mission).

---

## D. Source de vérité par domaine

| Domaine | Autoritatif | Justification |
|---|---|---|
| **Finance opérationnelle** (dépense, engagement, paiement, budget V3, structure) | **LAN** | LAN-first, `budgetGuard` = frontière de confiance. Le cloud n'a qu'une copie de lecture. |
| **Décisions de gouvernance** (approbation/refus/correction/déblocage à distance) | **Cloud** (émission) → **LAN** (application vérifiée) | Le décideur est distant ; la décision naît côté cloud mais n'a d'effet qu'après vérification LAN (version/permission/idempotence). |
| **Notes** | **Cloud** si saisie prof en ligne, sinon **LAN** ; réconciliées vers LAN | Selon la politique module. Réplication d'état LWW acceptable (une note = un fait ponctuel, faible concurrence). |
| **Bulletins / calculs** | **LAN** (par défaut, moteurs locaux) | Consommateurs de notes ; pas de concurrence multi-site. |
| **Notifications** | **Émetteur = celui qui produit le fait** ; jamais source de vérité | §13 mission. Interne LAN sans Internet ; externe en file. |
| **Utilisateurs / mots de passe** | **Miroir** LAN⇄Cloud (déjà en place : `authBridge`, `mirrorToCloud`, pont chiffré) | Identités doivent exister des deux côtés (prof cloud + RAF LAN). |
| **Permissions / rôles / catalogue gouvernance** | **Cloud** = référentiel, répliqué LAN (lecture) | `governance_roles` déjà dans les tables synchronisées. `budgetGuard` lit la copie LAN. |
| **Audit / domain_events** | **Append-only des deux côtés**, fusionnés par `seq`/`id` | Immuable ; idempotent par `id`. |

---

## E. Stratégie de synchronisation (cible)

| Aspect | Réplication d'état (existant) | **Canal de commandes de gouvernance (nouveau)** |
|---|---|---|
| **Quoi** | Tables selon politique module (minimisée) | Événements finance : demande de décision, décision, application |
| **Sens** | bidirectionnel (LWW) | LAN→Cloud (demande) ; Cloud→LAN (décision) |
| **Quand** | tick continu + `online` | même tick ; priorité aux commandes |
| **Comment** | `sync-push`/`sync-pull` + `sync_outbox` + curseurs | mêmes edge functions, sous-flux `domain_events` filtré finance |
| **Offline** | curseur, reprise idempotente | commande reste en outbox ; décision reste en attente ; jamais d'auto-approbation |
| **Conflits** | LWW (`updated_at`→`version`→`device_id`) | **PAS de LWW** : `expected_version` obligatoire ; si version locale ≠ attendue ⇒ **REJET explicite journalisé** ; le décideur doit re-décider sur la nouvelle version |
| **Idempotence** | upsert `onConflict=id` | `idempotency_key` par décision ; `applied_at` local ; ré-application = no-op tracé |

**Minimisation (§7)** : le payload de demande de décision ne contient que
`{ référence, ligne/rubrique, montant, demandeur, date, motif, disponible pertinent,
justificatif si autorisé, étape workflow }`. **Pas de réplication de toute la finance**
vers le cloud juste pour une approbation — à arbitrer avec toi : soit on répplique la
table `budget_expenses` en lecture cloud (simple mais large), soit on ne pousse que la
commande (minimal mais le cloud reconstruit une vue partielle). **Recommandation :
commande minimale + vue cloud dérivée, finance non répliquée par défaut.**

---

## F. Modèle de sécurité (threat model minimal)

| Menace | Défense cible | État actuel |
|---|---|---|
| **Accès non autorisé (Internet)** | Capacité « accès distant » orthogonale au rôle : RLS cloud finance = `has_budget_access` **ET** `remote_access_allowed(user)`. RAF/caissier : non ; Fondatrice/Contrôleur : oui. | ❌ à ajouter (B5) |
| **Usurpation d'approbation** | Décision émise via `kernel_emit` (acteur = `auth.uid()` cloud, non forgeable) ; `budgetGuard` revérifie permission **au moment de l'application** ET conserve `role_at_decision`. | ⚠️ infra OK, pas branché finance (B2/B8) |
| **Replay** | `idempotency_key` unique par décision ; `applied_at` local ; edge `sync-push` déjà idempotent (`onConflict`) ; append-only par `id`. | ⚠️ partiel (B7) |
| **Modification d'une demande après approbation** | `expected_version` : la décision cible une version précise ; toute modif locale ultérieure ⇒ version change ⇒ décision périmée rejetée. | ❌ à ajouter (B3) |
| **Fuite inter-écoles** | Jeton scellé = 1 école (`schoolOfToken`) ; RLS `school_id IN (school_users…)` ; `belongs()` dans sync-push ; ABAC kernel `sameSchool`. | ✅ solide |
| **Compromission d'un poste client LAN** | Session `sessionStorage` + idle 30 min ; `budgetGuard` = acteur session, pas payload ; jeton serveur en fichier `0600`. Poste compromis limité aux permissions de la session. | ✅ raisonnable |
| **Conflit LAN/Cloud** | Réplication d'état = LWW déterministe (déjà symétrique) ; commandes = rejet explicite sur version. | ⚠️ LWW OK, commandes à faire |
| **Accès aux justificatifs** | Justificatif joint à la commande **seulement si autorisé** (flag par politique) ; storage cloud vs LAN à cloisonner. | ❌ à définir |

**Invariant de sécurité central** (§14 mission) : *un utilisateur cloud ne doit jamais
modifier une donnée financière en connaissant un ID*. Cible : côté cloud, la finance est
**lecture seule** (ou absente) ; la seule écriture cloud est l'émission d'une **décision**
(événement), qui n'a d'effet qu'après re-vérification par `budgetGuard` côté LAN. Les
mutations financières restent le monopole du LAN.

---

## G. Impact (par couche)

- **Tables** : aucune nouvelle table structurelle recommandée (réutiliser `domain_events`
  / `audit_events`). Champs additionnels dans le *payload* des events finance. Nouveaux
  *flags* : politique par module (école), capacité `remote_access_allowed`. (Migrations
  en phase ultérieure, pas maintenant.)
- **Services** : `expenseService` / `unlockService` gagnent un chemin « émettre une
  commande » (via UoW) pour les transitions sensibles ; le chemin direct reste pour les
  actions locales non gouvernées.
- **RPC** : côté cloud, une RPC `submit_governance_decision` (SECURITY DEFINER, via
  `kernel_emit`). Côté LAN, `budgetGuard` gagne `verifyRemoteDecision()`.
- **RLS** : ajouter le prédicat `remote_access_allowed` sur les tables finance cloud ;
  garder la finance en lecture seule côté cloud (pas de policy write finance).
- **Routes/UI** : écran « décisions à traiter » pour Fondatrice/Contrôleur (cloud) ;
  badge « en attente d'approbation distante » sur la dépense (LAN) ; rôle Contrôleur au
  catalogue.
- **Sync engine** : `cloudSync.js` + edge fonctions lisent la politique module (quelles
  tables) + traitent le sous-flux commandes `domain_events` finance en priorité.
- **Notifications** : câbler `notificationService.notify()` sur les 3 moments
  (soumise / à approuver / approuvée).
- **Budget V3** : **inchangé**. `budgetGuard` = seul point d'extension (application
  vérifiée des décisions).
- **Notes** : inchangé (flux existant), soumis à la politique module.

---

## H. Plan d'implémentation proposé (à valider AVANT tout code)

> Découpage révisé par rapport à H0-H7 de la mission, pour coller à l'existant
> (backbone events déjà là, LWW déjà là). Chaque phase : objectif · fichiers · migration ·
> tests · risque · rollback. **Rien n'est codé tant que tu n'as pas validé §H et les
> 5 points de décision ci-dessous.**

**H1 — Politique de déploiement par module (fondation, inerte). ✅ LIVRÉ (2026-07-26).**
Objectif : un document de politique par école, lu par la sync, défaut = comportement
actuel. · Fichiers livrés : `src/lib/policyEngine.js` (moteur pur) +
`src/lib/_policyEngine.test.mjs` ; câblage inerte dans `server/cloudSync.js`
(`shouldPush`/`shouldPull` en tête de pull/push/tombstones) ; colonne LAN
`schools.deployment_policy` (`server/db.js` ensureColumn) ; migration
`supabase_deployment_policy.sql` (jsonb nullable, additive). · Tests : policyEngine 37/37
(dont inertie prouvée sur politique null/vide/illisible) ; `server/_cloud_sync.test.mjs`
23/23 inchangé (non-régression = inertie confirmée). · Risque : faible (inerte si null).
· Rollback : ignorer la colonne / retirer les 3 gardes `shouldPush/shouldPull`.
· **À exécuter par Hassan** : `supabase_deployment_policy.sql` dans Supabase (sans quoi
le push d'une ligne `schools` échouerait faute de colonne cloud).

**H2 — Finance émet des événements (sans changer le comportement). ✅ LIVRÉ (2026-07-26).**
Objectif : brancher Budgets/Dépenses sur l'UoW/`domain_events` (miroir des écritures
actuelles), en OBSERVATION. · Fichiers livrés : `src/domains/finance/events.js`
(vocabulaire : cycle de vie dépense + déblocage + révision/réallocation) +
`src/domains/finance/emit.js` (émetteur best-effort, fire-and-forget, import kernel
DYNAMIQUE) + `_events.test.mjs` ; câblage additif dans `src/lib/expenseService.js`
(upsert/delete), `src/lib/unlockService.js` (create/decide), `src/lib/budgetOpsService.js`
(révision + réallocation create/decide). · Migration : AUCUNE (tables `domain_events`/
`audit_events` déjà déployées Cloud + LAN). · Tests : vocabulaire 20/20 ; émission
non testée en intégration (best-effort, hors chemin critique). · Risque : faible
(fire-and-forget, jamais de throw, zéro latence ajoutée). · Rollback : retirer les
appels `emitFinanceEvent(...)` (les 2 fichiers `domains/finance` restent inertes).
· **Deux constats pour H3** :
  (a) L'**activation de ligne** budgétaire n'est PAS émise en H2 (le générique
      `upsertBudgetChapter` ne distingue pas activation vs re-sauvegarde → bruit) ;
      elle sera émise AUTORITAIREMENT en H3b par `budgetGuard` (qui connaît prev→active).
  (b) `domain_events`/`audit_events` ne sont **pas encore répliqués LAN↔Cloud**
      (chantier curseur `seq` explicitement différé, cf. `server/db.js`). Les événements
      H2 restent donc LOCAUX à chaque édition. **H3 doit construire ce canal de
      réplication d'événements** (curseur `seq`, idempotence par `id`) — c'est le
      transport du canal de commandes de gouvernance.

**H3 — Canal de commandes de gouvernance (le cœur) — cas rodé : approbation de dépense.**
Objectif : demande de décision distante + application vérifiée, sur le cas le plus
simple (approuver/refuser une dépense existante). · Fichiers :
`budgetGuard.verifyRemoteDecision()`, sous-flux commandes dans `cloudSync`/edge, RPC
cloud `submit_governance_decision`. · Migration : payload enrichi (expected_version,
idempotency_key, role_at_decision, applied_at). · Tests : recette §19 (versions
divergentes, replay, offline). · Risque : **élevé** (intégrité argent) → dry-run
d'abord. · Rollback : drapeau `finance_remote_governance` OFF.

**H3b — Gestion budgétaire à distance (NOUVELLE — voir Addendum).**
Objectif : Fondatrice/Coordonnateur créent/modifient/révisent/activent un budget
depuis Internet, appliqué LAN via l'enforcement existant. Les opérations sont des
**intentions** (domain events), jamais des écritures cloud directes. · Fichiers :
`budgetGuard.verifyRemoteBudgetOperation()` (nouveau), routage vers `guardBudgetLine`/
`guardBudgetStructure`/`guardBudgetAllocations` (create/modif/activation) et vers les
RPC `budget_create_revision` / `budget_create_line_realloc` (révision/réallocation) ;
`budgetService`/`budgetLineService`/`budgetPeriodService`/`budgetOpsService` gagnent un
**mode "émission d'intention"** côté édition Cloud ; RPC cloud `submit_budget_operation`
via `kernel_emit`. · Migration : payload d'intention (op_type, aggregate_id autoritatif,
expected_version, idempotency_key, correlation_id) ; projection lecture de la STRUCTURE
budgétaire côté cloud (voir H4). · Tests : cap annuel re-vérifié à l'application (course
d'activation), routage révision→RPC, création avec id préservé, rejet explicite +
renvoi `BudgetOperationRejected`, offline. · Risque : **très élevé** (cap ferme,
création d'agrégat, ordonnancement causal) → après H3, dry-run obligatoire. · Rollback :
drapeau `finance_remote_governance` OFF (même drapeau que H3).

**H4 — Accès distant sélectif (sécurité réseau ≠ permission). ✅ LIVRÉ (2026-07-26).**
Fichiers : `school_users.remote_access_allowed` (LAN `db.js` + Cloud migration) ;
`server/governanceApply.js` (re-vérif §5a `rejected_no_remote_access` — sécurise H3-b) ;
`policyEngine.js` (projection LECTURE structure : `financeStructureProjected` +
`FINANCE_STRUCTURE_TABLES`) ; rôle `controleur` préparé (view-only) dans `roles.js` +
`permissions.js` ; migration `supabase_h4_remote_governance.sql` (has_remote_access +
finance_lan_mode + RLS finance lecture seule gouvernée conditionnée au mode LAN +
`can_decide_expense` gated remote + seed contrôleur). Tests : `_governance_apply` 26/26
(dont « financier local sans accès distant » → rejeté), `_policyEngine` (projection
structure), gouvernance 4/4, non-régression e2e/sync/kernel. **À exécuter** :
`supabase_h4_remote_governance.sql`. **Edge** : aucune à redéployer. Écoles Cloud/hybride
inchangées (verrou conditionné à `finance:lan+governance:cloud`).
Objectif : capacité `remote_access_allowed`, RLS finance cloud restreinte, rôle
Contrôleur au catalogue, finance opérationnelle cloud lecture seule **+ projection
lecture de la STRUCTURE budgétaire** (budgets / lignes / périodes / allocations) pour
les gestionnaires distants — nécessaire pour créer/réviser/activer (contrôle du cap
annuel, config des lignes). Les dépenses/paiements opérationnels restent NON répliqués.
· Fichiers : `supabase_*_rls` (phase future), `governance_roles` seed (perms `BUDGET_*`
pour fondatrice/coordonnateur). · Migration : flag + policies read structure. · Tests :
RAF cloud = refusé ; Fondatrice/Coordonnateur cloud = lecture structure + émission
d'intentions ; personne ne mute la finance côté cloud directement. · Risque : moyen.
· Rollback : policy précédente conservée en commentaire (déjà l'habitude).

**H5 — Notifications hybrides.** Câbler `notify()` sur les 3 moments ; interne LAN
offline OK ; externe en file. · Risque : faible.

**H6 — Notes Cloud→LAN sous politique module.** Vérifier que `notes: hybrid` fonctionne
même si `finance: lan`. · Risque : faible (flux existant).

**H7 — Sécurité, idempotence, recette complète §19.** Dry-run + scénario de bout en
bout + reconstruction d'audit.

---

## Annexe — Découpage détaillé de H3 (à valider avant code, 2026-07-26)

H3 se scinde en **H3-a** (transport : réplication du journal d'événements) puis
**H3-b** (sémantique : approbation/refus de dépense à distance). **H3b-budget**
(opérations budgétaires distantes) réutilisera intégralement ces deux briques.

### H3-a — Réplication des `domain_events` LAN ↔ Cloud — ✅ LIVRÉ (2026-07-26)

**Fichiers livrés** : `server/eventSync.js` (cycle pull/push, curseurs, apply idempotent,
anti-écho, dry-run, injectable) ; edge `supabase/functions/events-pull/index.ts` &
`events-push/index.ts` ; `server/db.js` (`ensureColumn domain_events.replicated_from`) ;
`server/index.js` (`scheduleEventSync`, même gate `NOTESCAM_CLOUD_SYNC=1`) ; migration
`supabase_domain_events_sync.sql` (index + doc, **à exécuter** puis déployer les 2 edge).
**Tests** : `server/_event_sync.test.mjs` **23/23** (dry-run, push/pull, idempotence,
anti-écho, ordre seq/rowid, coupure pull→push continue, reprise après interruption,
doublons). Non-régression : `_cloud_sync` 23/23 inchangé. **Rollback** : retirer l'appel
`scheduleEventSync()` (le cycle événements s'arrête ; l'état continue) ; colonne/curseurs
inertes. **INERTE fonctionnellement** : rien ne consomme encore les événements répliqués
(H3-b appliquera les décisions). Aucune mutation financière déclenchée par H3-a.

**Principe** : le journal `domain_events` est APPEND-ONLY et IMMUABLE → sa réplication
n'est PAS du LWW, c'est un **log shipping monotone par curseur `seq`**, idempotent par
`id`. Aucune résolution de conflit (un événement ne se modifie jamais).

- **Sens** : bidirectionnel. LAN→Cloud (la demande d'approbation doit atteindre la
  Fondatrice) ; Cloud→LAN (la décision doit atteindre le serveur qui l'applique).
- **Curseur `seq`** : deux curseurs persistés dans `sync_cursor` (LAN), distincts des
  curseurs d'état (`pull_at`/`tomb_at`) :
  - `event_pull_seq` = dernier `seq` **cloud** (bigserial) appliqué localement ;
  - `event_push_seq` = dernier `seq` **local** (rowid SQLite) poussé vers le cloud.
- **Idempotence / doublons** : insertion `ON CONFLICT (id) DO NOTHING` des DEUX côtés.
  Un lot rejoué (crash entre apply et avancement du curseur) est un no-op. Le curseur
  n'avance qu'APRÈS application réussie du lot.
- **Anti-écho** : à l'application d'un événement tiré du cloud, on l'estampille
  `replicated_from='cloud'` (colonne LAN additive). Le PUSH ne sélectionne que les
  événements d'origine locale (`replicated_from IS NULL`). L'écho éventuel d'un événement
  local revenu par le pull est neutralisé par l'idempotence (`id` déjà présent).
- **Ordre** : expédition par `seq` CROISSANT → l'ordre causal d'une même source est
  préservé (l'émetteur append dans l'ordre). L'ordre inter-sources n'a pas d'importance
  au transport : chaque événement est auto-porteur ; les dépendances causales sont
  gérées à l'APPLICATION (H3-b/H3b-budget via `correlation_id` + version d'agrégat).
- **Coupure Internet** : les événements s'accumulent dans `domain_events` (durable) ;
  les curseurs ne bougent pas ; le LAN continue de fonctionner. **Reprise** : au retour
  du réseau (et au boot), on repart des curseurs persistés — zéro perte, zéro double
  application.
- **Transport** : 2 nouvelles fonctions edge `events-pull` / `events-push`
  (service_role, auth par le jeton scellé, périmètre = école du jeton), SÉPARÉES des
  edge d'état (sync-pull/push) pour ne pas toucher au chemin LWW existant.
  - Sécurité : le push insère l'événement cloud avec service_role en **conservant
    l'`actor_id` estampillé par le LAN** (on NE passe PAS par `kernel_emit`, qui exige
    `auth.uid()`). Confiance = le serveur LAN de l'école (jeton scellé). Documenté au
    threat model.
- **Portée** : par défaut on réplique TOUT `domain_events` (volume faible, événements
  minimaux). *Option (à trancher)* : filtrer le push par politique
  (`governanceChannel(module)`) pour ne pousser que les événements des modules à
  gouvernance distante — recommandé comme raffinement, pas bloquant.

**Migrations H3-a**
- Cloud (`supabase_domain_events_sync.sql`) : quasi rien — `domain_events` a déjà
  `seq bigserial`, PK `id`, index `(school_id, seq)`. Éventuel `GRANT`/index de confort.
- LAN (`server/db.js`) : `ensureColumn('domain_events','replicated_from','TEXT')` ;
  `seq` local = `rowid` (natif, aucune colonne). Nouveaux curseurs = lignes
  `sync_cursor` (aucun schéma).

**Fichiers H3-a**
- Neufs : `supabase/functions/events-pull/index.ts`, `supabase/functions/events-push/index.ts`,
  `server/eventSync.js` (cycle push/pull événements + curseurs + apply idempotent).
- Modifiés : `server/db.js` (colonne + curseurs), `server/index.js` (planifie le cycle,
  même gate `NOTESCAM_CLOUD_SYNC=1` + jeton), `server/cloudSync.js` (appel côte à côte).

**Tests H3-a** (`server/_event_sync.test.mjs`, edge injecté) : idempotence (double
apply = 1 ligne), avancement de curseur, anti-écho (événement tiré non re-poussé),
offline (pull échoue → push continue, curseur pull non avancé), reprise (curseur
persistant), ordre (`seq` croissant).

**Rollback H3-a** : gate off (le cycle événements ne tourne plus ; l'état continue).
Colonnes/curseurs additifs inertes. Retrait des 2 edge functions.

### H3-b — Approbation / refus d'une dépense à distance — ✅ LIVRÉ (2026-07-26)

**Fichiers livrés** : `server/governanceApply.js` (autorité LAN : verifyRemoteDecision +
applyPendingDecisions + emitApprovalRequest + scheduleDecisionApply) ; table LAN
`applied_decisions` (schema.sql) ; `budgetGuard.js` (blocage approbation locale en mode
distant) ; `query.js` (hook demande d'approbation sur soumission) ; `index.js`
(scheduleDecisionApply) ; Cloud `supabase_governance_decisions.sql`
(submit_governance_decision + can_decide_expense) ; client
`src/lib/governanceDecisionService.js` ; vocabulaire `src/domains/finance/events.js`
(ExpenseRemoteApprovalRequested / ExpenseApprovalGranted|Refused / ExpenseDecisionRejected).
**Tests** : `server/_governance_apply.test.mjs` **24/24** (approbation, refus, doublon,
mauvaise version, autre école, non autorisé/plafond, reçu 2× après reconnexion, reprise
sans double application, blocage approbation locale, gate inerte hors mode distant).
Non-régression : _http_e2e, _cloud_sync, _event_sync, H1/H2 inchangés.
**À exécuter (Hassan)** : `supabase_governance_decisions.sql` dans Supabase.
**INERTE par défaut** : tout est gaté sur `governanceChannel(policy,'finance')==='cloud'`
(aucune école ne l'a → comportement inchangé). Contrainte #7 : non activable en prod
avant H4 (verrou réseau `remote_access_allowed`).

**Modèle sans nouveau statut (Budget V3 intouché)** : en mode gouvernance distante
(`policyEngine.governanceChannel(policy,'finance')==='cloud'`), `budgetGuard` REFUSE la
transition LOCALE `submitted → approved` (aucun acteur local ne détient l'autorité que
le barème réserve au distant). La dépense reste `submitted`, avec un libellé DÉRIVÉ
« en attente d'approbation distante » (calculé, pas un statut stocké). `approved` ne
peut être atteint QUE par application d'une décision distante vérifiée.

**Flux**
1. RAF soumet (LAN). Le montant relève d'un palier distant → `budgetGuard` bloque
   l'approbation locale ; émission d'un événement **`ExpenseRemoteApprovalRequested`**
   (payload MINIMAL §7 : réf, ligne/rubrique, montant, demandeur, date, motif,
   disponible pertinent, justificatif si autorisé, **`expected_version`** = version
   courante de la dépense). → H3-a le pousse au cloud.
2. **Cloud** — Fondatrice/Coordonnateur voient la demande (événements sans décision
   correspondante). Ils appellent la RPC **`submit_governance_decision`** (SECURITY
   DEFINER) :
   - **Vérification des permissions** : `governanceEngine.hasPermission(EXPENSE_APPROVE)`
     + `canValidateAmount(montant)` (barème → rôle habilité ; Fondatrice = dernier
     recours) + périmètre école. (Le verrou RÉSEAU `remote_access_allowed` qui interdit
     au RAF/caissier d'atteindre le cloud est formalisé en H4 ; **point à trancher** :
     inclure une garde minimale dès H3-b, ou l'assumer en H4.)
   - N'écrit PAS `budget_expenses` (finance cloud en lecture) : émet seulement
     **`ExpenseApprovalGranted` / `ExpenseApprovalRefused` / `ExpenseChangeRequested`**
     (via `kernel_emit`, `actor_id=auth.uid()`), payload = décision + `expected_version`
     (échoée) + `decided_role` + `idempotency_key` (= id de l'événement de décision).
   - **Aucun statut « appliqué » côté Cloud** : l'UI affiche « décision transmise — en
     attente d'application par le serveur de l'école ». (Invariant #6.)
3. H3-a tire la décision vers le LAN.
4. **LAN** — `verifyRemoteDecision(event)` (nouveau `server/governanceApply.js`, appelé
   par `eventSync` sur un événement de décision) :
   - **Déjà traité ?** `applied_decisions(event_id PK)` → présent = no-op (idempotence).
   - **Périmètre** : `event.school_id` == école locale.
   - **Conflit de version** : `expected_version` == `expense.version` ? Sinon → **REJET
     explicite journalisé** (émet `ExpenseDecisionRejected` motif `version_conflict`),
     aucune application ; le décideur devra re-décider sur la nouvelle version.
   - **Re-vérification de permission** (défense en profondeur, §14) : `decided_role`
     revalidé contre le catalogue + barème pour ce montant.
   - **Application UNE fois** via le chemin GUARDÉ (`budgetGuard.enforceExpense`) :
     `submitted→approved` (ou `→rejected` / `→draft`). Marque `event_id` dans
     `applied_decisions` (+ `applied_at`).
   - Émet l'événement de CONFIRMATION **`ExpenseApproved` / `ExpenseRejected`**
     (estampillé `applied_at` LAN) → H3-a le renvoie au cloud → l'UI cloud bascule ALORS
     sur « appliqué ». Notifie le RAF localement (best-effort ; câblage complet en H5).
- **Refus** : appliqué comme `rejected`. **Conflit** : rejeté sans effet + événement.
  **Déjà traité** : no-op idempotent.

**Migrations H3-b**
- Cloud (`supabase_governance_decisions.sql`) : RPC `submit_governance_decision`
  (SECURITY DEFINER) + `GRANT EXECUTE authenticated`. Pas de nouvelle table (l'événement
  EST l'enregistrement). Vue optionnelle « demandes en attente » (confort UI).
- LAN : table `applied_decisions(event_id TEXT PRIMARY KEY, expense_id TEXT, decision
  TEXT, result TEXT, applied_at TEXT)` (idempotence + audit d'application) ;
  `budgetGuard` gagne le refus d'approbation locale en mode distant. Gate = dérivé de la
  politique (aucune colonne : `governanceChannel(policy,'finance')`).

**Fichiers H3-b**
- Neufs : `server/governanceApply.js` (`verifyRemoteDecision`), `supabase_governance_decisions.sql`,
  écran cloud « Décisions à approuver » (`src/pages/…`).
- Modifiés : `server/budgetGuard.js` (refus approbation locale en mode distant),
  émission de `ExpenseRemoteApprovalRequested` (chemin submit, `src/lib/expenseService.js`
  ou `src/domains/finance/`), `server/eventSync.js` (aiguille les événements de décision
  vers `governanceApply`), `src/pages/Expenses.jsx` (badge « en attente d'approbation
  distante »).

**Tests H3-b** (`server/_governance_apply.test.mjs`) : approbation appliquée UNE fois ;
double réception = no-op (idempotence) ; `expected_version` périmé = rejet sans
application ; refus = `rejected` ; re-vérif permission ; « appliqué » seulement après
confirmation LAN.

**Rollback H3-b** : politique sans `governance:'cloud'` → aucun événement de demande,
chemin d'approbation locale restauré ; `verifyRemoteDecision` dormant ; `applied_decisions`
inerte ; RPC cloud inutilisée.

### Où s'insère H3b-budget (rappel — APRÈS H3-b, dépend de H4)

Réutilise **tel quel** H3-a (transport) et le patron H3-b (demande → décision cloud →
application LAN vérifiée → confirmation), étendu aux opérations de STRUCTURE :

| Besoin | Mécanisme | Brique |
|---|---|---|
| Création d'un budget à distance | Événement `BudgetOperationRequested{op:create}` ; **id d'agrégat autoritaire dans la commande** (I5) ; matérialisé LAN avec ce même id | H3-a + H3b-budget |
| Modification / révision | `op:modify` (upsert guardé) / `op:revise` → **routé vers RPC** `budget_create_revision` (jamais upsert, I3) | `verifyRemoteBudgetOperation` |
| Lignes budgétaires | `op:create/modify` sur `budget_chapters` (ligne) via `guardBudgetLine` | budgetGuard |
| Allocations période/secteur | `op:alloc` via `guardBudgetAllocations` (gel si ligne active) | budgetGuard |
| Activation | `op:activate` → `guardBudgetLine.canActivateLineAnnual` **re-vérifie le cap annuel à l'application** (R-cap) ; rejet explicite si dépassé | budgetGuard |
| Ordre (créer ligne → activer) | `correlation_id` + `seq` ; dépendance manquante = **différée**, pas rejetée (R-order) | eventSync/apply |
| Cloud → LAN | même canal événements H3-a | H3-a |
| Voir la structure pour décider | **projection LECTURE de la structure** vers le cloud (enveloppe, lignes activées, allocations) | **H4** (dépendance) |

**Ordonnancement proposé (raffinement à confirmer)** : `H3-a → H3-b → H4 → H3b-budget`.
Raison : H3b-budget a besoin de la projection lecture de structure et de
`remote_access_allowed`, tous deux livrés par **H4**. (Le plan initial plaçait H3b avant
H4 ; on inverse pour respecter la dépendance.)

---

## Addendum — Impact ciblé : gestion budgétaire à distance (2026-07-26)

> Audit d'impact SEUL (l'audit A→H reste la référence, non refait). Raffine §D, §E, §F,
> §G et le plan §H. Budget V3 **inchangé**.

### Ad.1 Nature de l'exigence (delta vs architecture validée)

Jusqu'ici la seule écriture cloud validée était une **décision sur un objet existant**
(approuver une dépense). La nouvelle exigence demande des **opérations d'écriture sur la
STRUCTURE budgétaire** depuis Internet : **créer / modifier / réviser / activer** un
budget. C'est un changement de nature : l'objet peut ne pas encore exister côté LAN
(création depuis le cloud), et l'activation déclenche un **contrôle d'intégrité fort**
(cap annuel ferme, config de ligne complète, gel des lignes actives).

**L'invariant tient sans réversion** : ces opérations sont modélisées comme des
**INTENTIONS (domain events)**, jamais des écritures cloud directes. La finance reste
mutée **uniquement** par le LAN, à travers `budgetGuard`. Le cloud n'émet qu'une
intention signée ; le LAN est l'autorité qui l'applique **ou la rejette**.

### Ad.2 Impacts détectés

- **I1 — Vocabulaire de commandes élargi.** Le canal (H3) ne porte plus seulement
  `ExpenseApprovalRequested/Decision` mais aussi `BudgetOperationRequested`
  (op_type ∈ create | modify | revise | activate) et son verdict
  `BudgetOperationApplied` / `BudgetOperationRejected`.
- **I2 — Application LAN doit passer par l'enforcement, pas par `rawUpsert`.** L'écart
  B8 (le pull applique via `rawUpsert` qui court-circuite `budgetGuard`) devient
  **critique** : une intention d'activation appliquée en `rawUpsert` sauterait le cap
  annuel. → un applicateur dédié `verifyRemoteBudgetOperation()` doit router chaque
  intention vers `guardBudgetLine` (activation/gel), `guardBudgetStructure` (pas de
  modif silencieuse d'un budget actif) et `guardBudgetAllocations`.
- **I3 — Révision / réallocation ⇒ RPC, pas upsert.** `budget_reallocations` /
  `budget_revisions` / `budget_line_reallocations` sont **réservées aux RPC**
  (`guardBudgetStructure` rejette tout upsert générique). Une intention de **révision**
  distante doit donc être appliquée en appelant `budget_create_revision` (puis, le cas
  échéant, `budget_decide_revision`), et une réallocation via `budget_create_line_realloc`
  — jamais un upsert. La révision a déjà son propre sous-workflow create→decide avec
  `decided_role` : la décision distante s'y insère naturellement.
- **I4 — Projection lecture de la STRUCTURE vers le cloud.** Pour créer/réviser/activer,
  le gestionnaire distant doit VOIR la structure (enveloppe annuelle, lignes déjà
  activées pour le cap, config période/secteur). → raffinement de la décision #2 : on
  projette en **lecture seule** les tables de structure (`budgets`, `budget_chapters`,
  `budget_periods`, `budget_line_periods`, `budget_line_sectors`) vers le cloud, gated
  par `remote_access_allowed` + permission `BUDGET_*`. Dépenses/paiements restent LAN-only.
- **I5 — Identité d'agrégat autoritaire depuis la commande.** Un budget/ligne créé
  côté cloud reçoit son `id` (uuid) dans l'intention ; le LAN le **matérialise avec ce
  même id** (jamais régénéré) pour préserver l'idempotence et les références FK
  (chapters → budget_id) des commandes suivantes.
- **I6 — Ordonnancement causal.** « créer une ligne » puis « activer la ligne » sont
  deux intentions dépendantes. L'application LAN doit respecter l'ordre causal
  (`correlation_id` + `seq` de `domain_events`), distinct de l'ordre FK de réplication
  (`PULL_ORDER`/`tierRank`) déjà en place.
- **I7 — Permissions Coordonnateur "selon permissions".** Directement couvert par
  `governanceEngine.hasPermission` + les `GOV_PERM.BUDGET_*` existants ; le
  `budgetWorkflow` préparé (inerte) fournit déjà la chaîne submit→sector→finance→approve.
  Aucun `if role === …`. Fondatrice = autorité suprême (dernier recours) déjà gérée par
  `canValidateAmount` / `topComplexRank`.

### Ad.3 Fichiers / composants qui changeront

| Composant | Changement |
|---|---|
| `server/budgetGuard.js` | **Nouveau** `verifyRemoteBudgetOperation()` : vérifie école/version/permission/idempotence puis route vers `guardBudgetLine` / `guardBudgetStructure` / `guardBudgetAllocations`. |
| `server/budgetOps.js` + `server/rpc.js` | Invoqués par l'applicateur pour révision/réallocation distantes (`budget_create_revision`, `budget_create_line_realloc`, `budget_decide_*`). Ajout éventuel : acteur = décideur distant tracé. |
| `src/lib/budgetService.js`, `budgetLineService.js`, `budgetPeriodService.js`, `budgetOpsService.js` | **Mode "émission d'intention"** côté édition Cloud (create/modify/activate/revise → domain event) au lieu d'écriture directe. Côté LAN : inchangé (écriture directe guardée). |
| `server/cloudSync.js` + edge `sync-push`/`sync-pull` | Sous-flux commandes budget (priorité, causalité) ; projection lecture structure. |
| RPC cloud (edge) | `submit_budget_operation` via `kernel_emit` (non-répudiation, acteur = `auth.uid()`). |
| RLS (`supabase_phase_f_budget_rls` — phase future) | Read structure gated `remote_access_allowed` ; **aucune** policy write finance côté cloud. |
| `governance_roles` (seed) + capacité `remote_access_allowed` | Perms `BUDGET_*` pour fondatrice/coordonnateur ; flag distant. |
| UI Cloud (`src/pages/Budgets.jsx`, services) | Écrans budget en **mode intention** pour gestionnaires distants (badge "en attente d'application LAN"). |

### Ad.4 Nouveaux risques (spécifiques à cette exigence)

- **R-cap — Course d'activation.** Le cloud active la ligne X sur une vue périmée ;
  entre-temps le LAN a activé Y et le cap annuel est atteint. → **mitigation** : le cap
  est **re-vérifié à l'application** par `guardBudgetLine.canActivateLineAnnual` ;
  rejet explicite `BudgetOperationRejected` renvoyé au cloud (§11). Jamais d'application
  aveugle.
- **R-rpc — Contournement du chemin tracé.** Appliquer une révision/réallocation par
  upsert générique sauterait la traçabilité RPC. → **mitigation** : l'applicateur
  MAPPE strictement op_type→RPC ; `guardBudgetStructure` rejette déjà tout upsert sur
  les tables d'opérations (double filet).
- **R-id — Collision / régénération d'id.** Si le LAN régénère l'id à la matérialisation,
  les commandes suivantes (activer la ligne qu'on vient de créer) échouent. →
  **mitigation** : id autoritaire dans la commande, `ON CONFLICT(id) DO NOTHING`
  idempotent (I5).
- **R-order — Application hors ordre causal.** Activer avant créer. → **mitigation** :
  file de commandes ordonnée par `seq`/`correlation_id` ; une intention dont la
  dépendance manque est **différée**, pas rejetée.
- **R-exposure — Élargissement de la surface cloud.** La projection structure augmente
  les données exposées vs décision #2. → **mitigation** : lecture seule, structure
  uniquement (pas d'opérationnel), gated `remote_access_allowed` + `BUDGET_*`, isolation
  école inchangée.
- **R-authority — Deux mutateurs.** Tentation d'écrire le budget directement côté cloud
  "pour aller vite". → **règle non négociable** : le cloud n'émet QUE des intentions ;
  le LAN reste seul mutateur. Aucune policy write finance côté cloud.

### Ad.5 Compatibilité Budget V3

**Aucune modification de Budget V3.** L'exigence réutilise tel quel :
`budgetLinesEngine` (cap, config, imputation), `budgetGuard` (activation/gel/structure),
`budgetOps` (révision/réallocation RPC), `governanceEngine`/`validationEngine`
(permissions/plafonds), `budgetWorkflow` (chaîne inerte prête). Le seul ajout est un
**applicateur d'intentions** au-dessus de ces briques + un **mode émission** côté Cloud.
La sémantique métier (montants, cap, statuts, gel) est strictement celle de V3.

---

## Décisions verrouillées (validées par Hassan, 2026-07-26)

1. **Canal de la décision** → ✅ **Réutiliser `domain_events`** (0 table structurelle).
   LAN émet `ExpenseRemoteApprovalRequested` (outbox UoW) ; Cloud émet
   `ExpenseApprovedRemotely` / `ExpenseRejectedRemotely` via `kernel_emit`
   (acteur = `auth.uid()`) ; LAN applique via `budgetGuard.verifyRemoteDecision()`.
   Payload finance enrichi : `expected_version`, `role_at_decision`, `idempotency_key`,
   `applied_at`.
2. **Minimisation** → ✅ **Commande minimale seule** pour les DÉCISIONS. La finance
   opérationnelle (dépenses/paiements) n'est PAS répliquée vers le cloud ; seul le
   payload strict de décision traverse. **Raffiné par l'exigence "gestion budgétaire à
   distance"** (Addendum) : la **STRUCTURE budgétaire en lecture seule** (budgets /
   lignes / périodes / allocations) EST projetée vers le cloud pour les gestionnaires
   distants autorisés — indispensable pour créer/réviser/activer un budget (contrôle du
   cap annuel, config des lignes). Ce n'est pas la finance opérationnelle : dépenses et
   paiements restent LAN-only.
3. **Accès distant** → ✅ **Capacité `remote_access_allowed` par utilisateur**
   (orthogonale au rôle). RLS finance cloud = `has_budget_access(school)` **ET**
   `remote_access_allowed(user)`. Fondatrice/Contrôleur ON ; RAF/Caissier OFF.
4. **Périmètre v1** → ✅ **Approbation de dépense seule** comme cas RODÉ du canal
   (H3). **Étendu (2026-07-26)** par l'exigence "gestion budgétaire à distance" :
   création / modification / révision / activation de budget par Fondatrice/Coordonnateur
   depuis Internet, ajoutées en **phase H3b** (même canal de commandes, même invariant,
   risque supérieur). Déblocages / demande de correction / commentaires = toujours v2.
5. **Politique module v1** → ✅ simple JSON `schools.deployment_policy` (nullable,
   défaut = comportement actuel), **sans UI de configuration** en v1.
7. **Contrainte de production (ajoutée 2026-07-26, validée Hassan)** → ⛔ **TANT QUE
   H4 n'est pas terminé ET testé, aucune fonctionnalité de gouvernance financière
   distante n'est activable en production Internet.** H3-a/H3-b sont livrés derrière des
   gates OFF ; le verrou réseau `remote_access_allowed` (H4) est le prérequis
   d'activation. Objectif final : LAN = source de vérité des opérations financières ;
   Cloud = interface distante de gouvernance autorisée ; **aucune mutation Cloud ne
   modifie directement les données financières LAN** (Cloud émet une intention → LAN
   vérifie permissions + version + état + plafonds + idempotence → LAN applique ou
   refuse → renvoie le résultat au Cloud).
6. **Invariant de confirmation (ajouté 2026-07-26)** → ✅ une opération affichée
   « appliquée » côté Cloud DOIT avoir reçu la confirmation du LAN. Le Cloud n'affiche
   jamais « appliqué » sur la seule émission d'une intention : l'état visible côté Cloud
   pour une commande de gouvernance suit `requested → (au LAN) applied|rejected → (retour
   sync) confirmé`. L'événement de confirmation (`BudgetOperationApplied` /
   `ExpenseApproved…` estampillé `applied_at` LAN) est la SEULE source qui fait passer
   l'UI cloud à « appliqué ». Tant qu'aucune confirmation n'est revenue : « en attente
   d'application par le serveur de l'école ».

---

*Fin de l'audit H0. Architecture cible validée. AUCUNE implémentation engagée — en
attente du feu vert explicite pour démarrer H1.*
