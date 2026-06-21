# NotesCam — Architecture de migration Offline‑First → Cloud

> Document d'architecture. Conçu comme le ferait l'équipe derrière Google Workspace Offline / Notion Offline : **le local est la source de vérité**, le cloud est une réplique activable, et la bascule ne doit jamais recréer ni perdre quoi que ce soit.
>
> Ancré sur le code réel : `server/schema.sql`, `server/activateCloud.js`, `server/authBridge.js`, `server/cloudSync.js`, et les fonctions edge `provision-tenant` / `set-password` / `sync-pull` / `sync-push`.

---

## 0. TL;DR — décisions clés et corrections

1. **Le local est la source de vérité.** Tous les `id` de domaine (école, classes, élèves, notes, frais, memberships…) sont des UUID générés localement et **préservés à l'identique** par `upsert(onConflict:'id')`. Zéro doublon, zéro re‑clé.

2. **« Mêmes hash de mots de passe » est la mauvaise invariante — et c'est impossible.** Le local hache en **scrypt** ; Supabase Auth gère ses propres hash **bcrypt** et n'accepte aucune injection de hash. La bonne invariante est **« même identifiant »** (même e‑mail + même mot de passe), garantie par le **pont d'identifiants** (`authBridge.js`) — voir §5. Aucun reset, aucune recréation.

3. **L'identité auth a deux espaces d'ID.** L'ID applicatif (`school_users.id`, `teachers.auth_user_id` …) est préservé ; l'ID d'authentification (`auth.users.id` côté Supabase) est **généré par Supabase** et **mappé** via `users.cloud_user_id`. On préserve donc les identités sans pouvoir forcer l'UID auth — d'où la table de correspondance.

4. **Lacune concrète détectée :** la table **`staff`** (module Personnel) **n'est pas** dans `PUSH_ORDER` → les données Personnel ne sont pas migrées aujourd'hui. À corriger (voir §4 et §10).

5. **« Report cards / bulletins » et « academic years » ne sont pas des tables.** Les bulletins sont **calculés** de façon déterministe à partir de `grades` + `subjects` + `evaluation_system` ; les années sont des **colonnes texte** (`current_year`, `academic_year`, `school_year`, `year_label`). Les préserver = préserver leurs sources, pas copier un artefact. Voir §4.

6. **Le push « une longue requête HTTP » est fragile.** On le remplace par un **job idempotent, repris par curseur, avec manifeste + checksums + phase de vérification + bascule transactionnelle de licence** (two‑phase activate). Voir §3 et §6.

---

## 1. Data Architecture — structure locale & cloud

### 1.1 Deux moteurs, un seul modèle logique

| | Local (LAN / offline) | Cloud (online) |
|---|---|---|
| Moteur | SQLite (`better-sqlite3`) | Postgres (Supabase) |
| Auth | table `users` (scrypt) | `auth.users` (bcrypt, managé) |
| Isolation | imposée par le serveur Node (`security.js`) | **RLS** par `school_id` |
| RPC | fonctions Node (`rpc.js`) | `SECURITY DEFINER` / edge functions |
| Types | TEXT (uuid/ts/json), INTEGER (bool), REAL | uuid, timestamptz, jsonb, bool, numeric |

Le schéma SQLite (`server/schema.sql`) est la **traduction 1:1** des 40+ `supabase_*.sql`. C'est la fondation qui rend la migration possible : **mêmes noms de tables, mêmes colonnes, mêmes clés**. La règle d'or à tenir dans le temps : *toute migration Postgres a son équivalent SQLite, et réciproquement* (voir §9, « parité de schéma »).

### 1.2 Classification des tables (détermine ce qui migre)

```
A. DONNÉES MÉTIER (migrées, id préservé) :
   schools · classes · subjects · students · grades · teachers · staff
   student_fees · fee_payments · attendance · student_absences
   student_class_assignments · academic_periods · sequence_dates
   timetable_slots · school_messages · teacher_notifications

B. IDENTITÉ (migrée via fonction edge, PAS par upsert direct) :
   users  → auth.users (mapping cloud_user_id)
   school_users → memberships (id préservé)
   superadmins → JAMAIS migré (global, hors tenant)

C. CONFIG GLOBALE (déjà en cloud, NON poussée) :
   country_education_config · evaluation_system

D. ÉTAT LOCAL (jamais migré) :
   license_activation · migration_state · pwd_mirror_queue
   cloud_activation · cloud_push_state · sync_outbox · sync_cursor
```

> **Calculé, donc non stocké :** *bulletins / report cards* (déterministes depuis A+C) et *palmarès / rangs* (recalculés). « Mêmes bulletins » = mêmes entrées + même `evaluation_system` ⇒ même rendu, bit pour bit.

---

## 2. Tenant Architecture — créer le tenant en préservant les identités

Le tenant **n'est jamais « créé à neuf »** : il est **upserté sur l'`id` local de l'école**. Tout passe par la fonction edge `provision-tenant` (la `service_role` ne descend **jamais** sur le PC).

```
PC (serveur LAN)                         Edge: provision-tenant (service_role)
─────────────────                         ─────────────────────────────────────
1. admin signUp/login cloud  ──JWT──►     getUser(JWT) → caller
2. POST { school, admin_email,            garde-fous :
          members[] }         ──────►       • caller.email == admin_email   (403 sinon)
                                            • school.id NEUF ou déjà au caller (409 sinon)
                                          upsert schools (id préservé, clés nulles retirées)
                                          pour chaque member :
                                            ensureAuthUser(email) → cloud_uid (créé si absent)
                                            upsert school_users {id préservé, user_id=cloud_uid, role…}
                                          émet server_token scellé (haché en base)
3.  ◄── { server_token, map[] } ──────    map = [{local_user_id, cloud_user_id}]
4. persiste cloud_user_id + server_token (pont d'identifiants armé)
```

**Pourquoi un mapping et pas un UID forcé ?** Supabase Auth génère l'UID — on ne peut pas le choisir. La correspondance `users.cloud_user_id` (+ `map[]`) est donc l'invariant qui permet de remapper les FK auth (`teachers.auth_user_id`, `staff.auth_user_id`) du référentiel local vers le référentiel cloud sans toucher aux `id` de domaine.

**Tenant isolation :** RLS cloud filtre par `school_id` ; le `server_token` est **scopé à une école** (haché, révocable) ⇒ un poste compromis ne peut écrire que dans SON tenant (`set-password` revérifie l'appartenance avant tout).

---

## 3. Migration Flow — 8 étapes (redessinées en job repris)

Principe : **un job de migration** persistant (étend `cloud_activation`), piloté par l'assistant via polling. **Aucune étape ne dépend du maintien d'une longue requête HTTP.**

| # | Étape | Action | Idempotence / reprise |
|---|-------|--------|------------------------|
| 1 | **Validation** | compte cloud (signUp) + e‑mail vérifié + licence locale valide + 1 seule école | rejouable |
| 2 | **Analysis** | scan SQLite : `counts{}` par table + **manifeste** (id+`row_hash`) + total octets | recalculable |
| 3 | **Tenant Creation** | `provision-tenant` (école + comptes + memberships + `server_token`) | upsert ⇒ sûr en reprise |
| 4 | **Data Export** | snapshot **cohérent** (transaction lecture) → lots ordonnés FK, FK auth remappées | pur (lecture) |
| 5 | **Secure Upload** | upsert par lots de 500, **curseur `cloud_push_state` par table** | reprend au lot non terminé |
| 6 | **Cloud Import** | côté cloud, les upserts atterrissent sous RLS (jeton admin) ; tombstones ignorés | upsert par `id` |
| 7 | **Integrity Verification** | recompte cloud vs local + compare **checksums agrégés** par table | lecture, rejouable |
| 8 | **Cloud Activation** | si §7 OK : `migration_state`/licence → `cloud`, arme la sync continue, publie clé RSA | **flip atomique** en dernier |

**Two‑phase activate :** tant que §7 n'est pas vert, l'école **reste en mode local** (rien n'est « activé »). La bascule (§8) est le **dernier** geste, atomique et réversible.

---

## 4. Database Strategy — quoi migrer, dans quel ordre

### 4.1 Ordre de poussée (respect des FK)

```
schools                      (le tenant lui-même — via provision-tenant)
academic_periods
classes
subjects
students
teachers
staff                        ◄── À AJOUTER (lacune actuelle, module Personnel)
grades                       (onConflict: class_id,student_id,subject_id,sequence)
student_fees
fee_payments
attendance
student_absences
student_class_assignments
sequence_dates
timetable_slots
school_messages
teacher_notifications
```

> `PUSH_ORDER` actuel (`activateCloud.js`) **omet `staff`**. Correctif : insérer `'staff'` juste après `'teachers'`, remapper `staff.auth_user_id` (local→cloud) comme pour `teachers`, et **garder un guard** : si la table `staff` n'existe pas côté cloud (migration `supabase_staff_personnel.sql` non jouée), journaliser et ignorer plutôt qu'échouer tout le job.

### 4.2 Mapping des entités demandées → réalité du schéma

| Demandé | Réalité NotesCam | Migration |
|---|---|---|
| users | `users` + `auth.users` | edge `provision-tenant` + bridge |
| roles / permissions | `school_users.role` (`admin/teacher/censeur/surveillant`) ; pas de table permissions (RBAC par rôle) | porté par le membership (id préservé) |
| school | `schools` (id préservé = **même school code**, ici l'`id`) | upsert by id |
| classes / subjects / students / grades | tables dédiées | upsert by id (+ clé naturelle pour grades) |
| attendance | `attendance` **+ `student_absences`** | les deux |
| fees | `student_fees` **+ `fee_payments`** | les deux |
| **bulletins / report cards** | **calculés** (pas de table) | préservés via grades+config |
| settings | colonnes `schools.*` (langue, country_system, baromètre, en‑têtes, signatures, logo…) | inclus dans l'upsert école |
| **academic_years** | **colonnes texte** + `academic_periods` (état des séquences) | préservés via colonnes + table périodes |

---

## 5. Identity Preservation — le cœur du problème

### 5.1 Ce qui est *réellement* préservé

- **e‑mails / usernames** : copiés tels quels (clé de réconciliation `email` COLLATE NOCASE).
- **IDs de domaine** : préservés à l'octet (`upsert onConflict:'id'`).
- **rôles / memberships** : `school_users.id` + `role` préservés.
- **mot de passe (credential)** : **identique**, sans reset — via le pont (ci‑dessous).
- **UID auth** : **mappé**, pas copié (Supabase le génère) → `users.cloud_user_id`.

### 5.2 Pourquoi on ne « migre pas les hash »

```
LOCAL                         CLOUD (Supabase Auth)
scrypt(salt:hash)             bcrypt managé, write-only via Admin API
        │                              ▲
        └──── impossible à copier ─────┘   (aucune API n'accepte un hash externe)
```

On préserve donc le **mot de passe**, pas son hash, par **convergence paresseuse** :

1. **Admin :** son mot de passe est **connu au moment de l'activation** (il le tape dans l'assistant). `provision-tenant` crée/relie son compte ; `set-password` aligne immédiatement le cloud. ⇒ il se reconnecte cloud **avec exactement le même identifiant**, tout de suite.
2. **Personnel (teachers/staff) :** au moment de l'activation, on n'a que le **hash** (jamais le clair). Leur compte cloud est créé avec un mot de passe aléatoire **jamais communiqué**. À leur **prochaine connexion locale**, le serveur capte le clair en mémoire et appelle `set-password` (jeton scellé) ⇒ le cloud s'aligne. Hors‑ligne ? le clair part dans `pwd_mirror_queue` (**AES‑256‑GCM**, clé locale) et est rejoué à la reconnexion. **Jamais bloquant pour l'auth locale.**
3. **Sens Cloud → Local :** un changement fait en ligne est déposé chiffré **RSA‑OAEP** (clé publique de CE serveur, `credential_outbox`), déchiffré localement (clé privée jamais exposée) et re‑haché scrypt.

> Garantie nette : *aucun mot de passe lisible au repos* (scrypt local · bcrypt cloud · file AES · outbox RSA), et *aucun utilisateur ne recrée de compte ni ne reset*.

---

## 6. Data Integrity — comptes, checksums, rapports, rollback

### 6.1 Manifeste & checksums (étape 2 + 7)

Pour chaque table migrée, à l'export on calcule une **empreinte agrégée déterministe** :

```js
// row_hash stable, indépendant de l'ordre des colonnes
rowHash = sha256(JSON.stringify(sortKeys(stripVolatile(row))));   // ignore updated_at
tableChecksum = sha256(rows.map(r => r.id + ':' + rowHash).sort().join('|'));
manifest[table] = { count, checksum: tableChecksum };
```

`stripVolatile` retire les colonnes non significatives (`updated_at` posé par défaut côté cloud). À l'étape 7, on relit le cloud par tenant et on recalcule le **même** checksum :

```
PASS  si   cloud.count == local.count  ET  cloud.checksum == local.checksum   (par table)
```

### 6.2 Rapport de validation (persisté dans le job)

```json
{
  "status": "verified",
  "tables": {
    "students": { "local": 412, "cloud": 412, "checksum_match": true },
    "grades":   { "local": 9381, "cloud": 9381, "checksum_match": true },
    "staff":    { "local": 23,  "cloud": 23,  "checksum_match": true }
  },
  "identities": { "members": 23, "mapped": 23, "admin_aligned": true },
  "generated_at": "2026-06-22T08:14:00Z"
}
```

### 6.3 Rollback

- **Avant §8 (activation) :** rien n'a basculé. Annuler = ne pas flipper la licence ; le cloud peut contenir des données partielles **inertes** (l'école reste locale). Re‑lancer reprend par curseur.
- **Nettoyage optionnel :** edge `rollback-tenant` (service_role) qui `DELETE WHERE school_id = ?` sur les tables de données **et** révoque le `server_token` — utile pour repartir propre.
- **Après §8 :** la source de vérité devient partagée ; le « rollback » est un **switch‑back** vers local (la sync continue rejoue les deltas). On ne *supprime* pas le cloud.

---

## 7. Failure Recovery — scénarios

| Panne | Comportement attendu | Mécanisme |
|---|---|---|
| **Internet coupe** | le job se fige proprement, **pas de blocage UI** | timeouts réseau (déjà ajoutés : `withTimeout` + `AbortController`) ⇒ erreur claire ≤ 30 s |
| **Upload s'arrête à 45 %** | reprise **au lot non terminé**, pas de re‑push des tables `done` | curseur `cloud_push_state(pushed,total,done)` |
| **Import cloud échoue (RLS / colonne manquante)** | échec **localisé** à la table, message edge propagé, tables précédentes conservées | upsert par table + journal `log` |
| **Validation échoue (§7)** | **activation refusée**, l'école **reste locale**, rapport détaille la table fautive | two‑phase activate (flip en dernier) |
| **Crash PC pendant le job** | au redémarrage, l'assistant lit `phase` et **reprend** | `cloud_activation.phase` + curseurs |
| **Requête /run coupée mais serveur OK** | l'UI **finalise via polling** dès `phase=='done'` | (déjà corrigé) polling fait autorité |

Invariant de sécurité : **tant que §7 n'est pas vert, la licence locale reste « source de vérité »**. Une migration ratée n'a aucun effet observable côté école.

---

## 8. UX Redesign — 6 phases, progression réelle

```
┌─ Activer NotesCam Cloud ───────────────────────────────┐
│  ① Vérification  ② Analyse  ③ Transfert  ④ Import       │
│  ⑤ Validation    ⑥ Activation                          │
│                                                        │
│  Transfert sécurisé          ████████████░░░░  73 %     │
│  ✓ Établissement & réglages migrés                      │
│  ✓ 23 comptes (rôles, e‑mails préservés)                │
│  ✓ 18 classes · 142 matières                            │
│  ✓ 412 élèves                                           │
│  ⟳ 6 842 / 9 381 notes…                                 │
│  ◦ Frais & paiements                                    │
│  ◦ Présences                                            │
│                                                        │
│  [Détails techniques ▾]   journal de migration          │
└────────────────────────────────────────────────────────┘
```

- **Progression réelle** = `Σ pushed / Σ total` (pondérée par table), pas un faux spinner.
- **Checklist verte par entité** alimentée par `cloud_push_state` (et non par l'optimisme).
- **Étape ⑤ Validation** affiche le rapport §6.2 ; **⑥ Activation** n'apparaît que si la validation est verte.
- **Reprise** : si un job existe (`phase≠done`), bannière « reprendre » (déjà en place) — ne re‑pousse pas l'acquis.
- **Anti‑blocage** : tout appel réseau borné ; toute coupure ⇒ message clair + relais par polling.

---

## 9. Security Architecture

| Domaine | Conception |
|---|---|
| **Chiffrement en transit** | tout en **HTTPS/TLS** (Supabase + edge). Aucun secret en clair sur le réseau. |
| **Auth de migration** | JWT admin (issu de SON signUp cloud) pour `provision-tenant` ; **`server_token` scopé + haché + révocable** pour `set-password`/`publish-server-key`. |
| **`service_role`** | **uniquement** dans l'environnement des fonctions edge. **Jamais** sur le PC école. |
| **Tenant isolation** | RLS Postgres par `school_id` ; `set-password` revérifie l'appartenance ; `provision-tenant` bloque le détournement d'un `school_id` tiers (403/409). |
| **Secrets au repos** | scrypt (local) · bcrypt (cloud) · `pwd_mirror_queue` AES‑256‑GCM · `credential_outbox` RSA‑OAEP. **Aucun** mot de passe lisible. |
| **Backup avant migration** | `update-notescam.ps1` sauvegarde `C:\ProgramData\NotesCam` ; **ajouter** un dump SQLite horodaté **déclenché par l'étape ①** (pré‑migration), indépendant de l'installeur. |
| **Recovery** | restauration = redéploiement de l'installeur + restauration du dossier de données ; le pont d'identifiants reste valide (jeton + clé RSA persistés dans les données). |

---

## 10. Synchronization Future (post‑migration)

La base est **déjà posée** (`cloudSync.js`, `sync_outbox`, `sync_cursor`, edge `sync-pull`/`sync-push`, gate `NOTESCAM_CLOUD_SYNC=1`). Cible :

- **Local cache / offline work** : le LAN reste pleinement opérationnel hors‑ligne ; toute écriture alimente `sync_outbox` (op `upsert|delete`, anti‑écho lors des écritures de sync).
- **Reconnection sync** : à la reconnexion, **push** des deltas (`sync_outbox`) puis **pull** par curseur (`updated_at` + tombstones).
- **Conflict resolution** : **LWW** (last‑writer‑wins par `updated_at`) comme défaut, avec deux durcissements recommandés :
  1. **tombstones** pour les suppressions (déjà prévus) afin d'éviter la résurrection de lignes ;
  2. pour les entités sensibles (notes verrouillées via `academic_periods.is_locked`), **refuser** l'écriture distante sur une période fermée (résolution déterministe orientée métier, pas seulement horodatage).
- **Évolution** : passer LWW → **CRDT par champ** seulement si plusieurs sites concurrents écrivent la même ligne (rare en mono‑école ; utile en multi‑campus).

---

## Annexe A — Les 10 livrables (synthèse)

1. **Architecture** : local = vérité, cloud = réplique activable ; pont d'identifiants ; two‑phase activate. (§1, §2, §3)
2. **Database design** : classification A/B/C/D ; ordre FK ; parité SQLite↔Postgres. (§1.2, §4)
3. **Migration workflow** : 8 étapes idempotentes, reprises par curseur. (§3)
4. **API design** : edge `provision-tenant` (tenant+mapping), `set-password` / `publish-server-key` (jeton scellé), `sync-pull`/`sync-push` ; à ajouter `verify-tenant` (recompte+checksum) et `rollback-tenant`. (§2, §6)
5. **Backend strategy** : job persistant `cloud_activation` + `cloud_push_state` ; export snapshot cohérent ; remap FK auth ; **ajouter `staff`** + manifeste/checksums. (§3–§6)
6. **Frontend UX** : 6 phases, progression réelle, checklist par entité, reprise, anti‑blocage. (§8)
7. **Failure handling** : timeouts bornés, reprise par curseur, validation bloquante, polling‑authoritative. (§7)
8. **Security** : TLS, `service_role` confinée, jeton scopé/révocable, RLS, secrets chiffrés au repos, backup pré‑migration. (§9)
9. **Scalability** : push par lots (500), pagination edge, checksums par table ; multi‑tenant natif par RLS ; chemin LWW→CRDT. (§4, §10)
10. **Production‑ready** : (a) corriger `staff` ; (b) ajouter manifeste+checksums+`verify-tenant` ; (c) backup SQLite déclenché à l'étape ① ; (d) garde de **parité de schéma** en CI ; (e) journal de migration exportable ; (f) bouton « relancer la vérification » dans l'UI.

## Annexe B — Backlog d'implémentation priorisé

| Prio | Tâche | Fichier(s) | Effort |
|---|---|---|---|
| P0 | Ajouter `staff` au `PUSH_ORDER` + remap `auth_user_id` + guard table absente | `server/activateCloud.js` | S |
| P0 | Backup SQLite horodaté déclenché à l'étape ① (pré‑migration) | `server/activateCloud.js`, `server/backup.js` | S |
| P1 | Manifeste + checksums à l'export ; étape ⑤ Validation bloquante | `server/activateCloud.js` + edge `verify-tenant` | M |
| P1 | UI : 6 phases, checklist par entité, étape Validation, « relancer la vérif » | `src/components/CloudActivationWizard.jsx` | M |
| P2 | `rollback-tenant` (DELETE scopé + révocation jeton) | `supabase/functions/rollback-tenant` | M |
| P2 | Garde de parité de schéma SQLite↔Postgres en CI | `scripts/`, CI | M |
| P3 | Durcir la résolution de conflits (tombstones + périodes verrouillées) | `server/cloudSync.js`, edge sync | M |

---

*Rédigé pour NotesCam. La sécurité du pont d'identifiants et la préservation des `id` sont déjà en place dans le code ; ce document formalise l'architecture cible et liste les écarts concrets (à commencer par `staff` et la phase de vérification d'intégrité).*
