# Recette générale — Architecture hybride sélective LAN / Cloud (H7)

> **Phase H7 (recette générale finale).** Aucune décision métier ni architecture
> H1–H6 modifiée. Recette réelle des scénarios normaux **et** d'échec, non-régression
> complète, build. Date : 2026-07-27 · Branche : `feat/ux-architecture-refactor`.

---

## 1. Portée et invariants vérifiés

La recette valide la chaîne de bout en bout de la gouvernance financière distante et
du flux notes, sur **une école en mode hybride réaliste** :

```json
{ "finance": { "execution": "lan", "governance": "cloud" },
  "notes":   { "execution": "cloud" },
  "default": { "execution": "hybrid" } }
```

Invariants réaffirmés (aucun n'a été modifié en H7) :

- **Finance LAN-authoritative** : le Cloud n'émet que des **intentions** (`domain_events`) ;
  le LAN est la **seule autorité** qui vérifie et applique. Aucune mutation d'état
  financière n'est jamais écrite directement par le Cloud.
- **« Appliqué côté Cloud ⇒ confirmé par le LAN »** (décision #6) : le Cloud ne voit
  « appliqué » qu'au retour d'une confirmation poussée par le LAN.
- **Re-vérification à l'application** : école, `remote_access_allowed`, permission,
  version exacte, plafond annuel, idempotence, ordre causal — tout est ré-imposé côté LAN.
- **Politique par module** : les notes suivent leur propre politique (`notes`)
  indépendamment de `finance` ; la finance opérationnelle n'est jamais répliquée.

---

## 2. Recette H7 — les 7 volets (`server/_hybrid_recette.test.mjs`)

Scénario bout en bout multi-modules, Cloud simulé en mémoire + transport edge injecté
(aucun réseau réel). **Résultat : 59 / 59 ✅.**

| Volet | Objet | Assertions clés | Verdict |
|---|---|---|---|
| **V1** | Dry-run global | prévoit 4 intentions, **0** événement inséré, **0** curseur avancé, file locale vide | ✅ |
| **V2** | Bout en bout finance | pull 4 intentions → drain (create+allocate+activate+revise) → enveloppe 100k→120k → dépense soumise → décision Cloud approuvée → appliquée LAN → 4+1 confirmations repoussées | ✅ |
| **V3** | Politique par module | notes (`grades`, `apc_notes`, `mat_observations`, `prim_notes`, `student_absences`) **pull-only** ; finance opérationnelle **jamais répliquée** ; frais = `default` hybride ; structure budgétaire projetée en lecture (push-only) | ✅ |
| **V4** | Notifications (H5) | moment 1 décideurs **distants** notifiés (local sans accès distant exclu) ; moment 2 demandeur notifié ; moment 3 décideur notifié des 4 opérations ; **aucun doublon** | ✅ |
| **V5** | Sécurité — tous les rejets | (a) autre école → `rejected_other_school` ; (b) pas d'accès distant → `rejected_no_remote_access` (malgré rôle suffisant) ; (c) permission insuffisante → `rejected_unauthorized` ; (d) conflit de version → `rejected_version_conflict` ; (e) dépassement de plafond → `rejected_rule`. **Zéro mutation** dans tous les cas ; rejets tracés + notifiés | ✅ |
| **V6** | Idempotence / ordre / réseau | activate avant create → **différé** (pas rejeté) puis appliqué au re-drain ; coupure pull → erreur remontée, curseur figé, rien tiré ; reprise → tiré + appliqué sans perte ; re-drain → **0 ré-application**, versions stables, **0 notif dupliquée** ; re-tirer tout le journal → **0 doublon** (ON CONFLICT id DO NOTHING) | ✅ |
| **V7** | Reconstruction d'audit | bijection 1 confirmation ↔ 1 opération appliquée ; chaîne intention→application→confirmation reconstructible ; chaque confirmation a sa ligne `audit_events` ; acteur (non-répudiation) + `applied_at` préservés ; état des lignes actives **rejoué depuis les événements == état en base** ; **aucune mutation directe côté Cloud** | ✅ |

Scénarios d'échec réellement exercés (pas seulement les cas passants) : autre école,
absence d'accès distant, permission insuffisante, conflit de version, dépassement de
plafond, doublon/idempotence, ordre causal inversé, coupure puis reprise réseau,
re-drain sans double application, notifications sans doublon, reconstruction complète
de l'audit.

---

## 3. Non-régression complète

Toute la suite de tests du dépôt (`server/**` + `src/**`, fichiers `_*.test.mjs`) a été
rejouée. **56 fichiers de test, 56 verts, 0 échec.**

Détail des suites de l'architecture hybride :

| Suite | Résultat |
|---|---|
| `server/_hybrid_recette.test.mjs` (recette H7) | **59 / 59** ✅ |
| `src/lib/_policyEngine.test.mjs` (politique par module) | **81** assertions ✅ |
| `server/_event_sync.test.mjs` (transport H3-a) | 23 / 23 ✅ |
| `server/_governance_apply.test.mjs` (décision dépense H3-b/H4) | 26 / 26 ✅ |
| `server/_budget_ops_apply.test.mjs` (opérations budgétaires H3b-3) | 37 / 37 ✅ |
| `server/_budget_ops_e2e.test.mjs` (dry-run + e2e H3b-5) | 26 / 26 ✅ |
| `server/_gov_notifications.test.mjs` (notifications H5) | 17 / 17 ✅ |
| `server/_cloud_sync.test.mjs` (réplication tables) | 23 / 23 ✅ |

### Correction pendant la recette

Un seul échec est apparu, **sans rapport avec l'architecture hybride** :

- `server/_activate_cloud.test.mjs` — assertion `« 16 tables marquées terminées »`
  périmée. La cause réelle : `PUSH_ORDER` de `server/activateCloud.js` compte
  désormais **17** tables (`school_units` y a été ajouté avec le travail
  identité-par-unité, commit `1a3ac68`), et chaque table de l'ordre est marquée
  `done=1` à un push complet. Le comportement du code est correct ; seul le compte
  codé en dur du test n'avait pas suivi. **Correction limitée à la cause réelle**
  (test-only, 16 → 17) ; aucune logique métier ni architecture H1–H6 touchée. Suite
  re-jouée : `_activate_cloud` 21 / 21 ✅.

---

## 4. Build

`npm run build` (édition Cloud, Vite 5) : **✅ built in 2m 20s**, PWA générée
(precache 93 entrées). Aucune erreur.

---

## 5. Bilan

| Élément | État |
|---|---|
| Recette H7 (7 volets, normaux + échecs) | ✅ 59 / 59 |
| Flux notes Cloud→LAN | ✅ (V3) |
| Finance LAN-authoritative | ✅ (V2, V3, V7) |
| Non-régression complète | ✅ 56 / 56 fichiers |
| Build | ✅ 2m 20s |

L'architecture hybride sélective LAN/Cloud (H1→H6) est **validée de bout en bout**.

---

## 6. Actions manuelles restantes avant installation pilote

L'ensemble du code et des tests est vert, mais l'**activation en production** de la
gouvernance financière distante suppose les vérifications suivantes côté exploitation
(rappel : gates inertes par défaut — rien ne s'active sans ces réglages explicites) :

1. **Migrations Supabase** — déjà confirmées EN BASE le 2026-07-27 sur le projet
   `ltxopwoxvgslsgzixbpx` (10/10 checks lecture seule) :
   `supabase_deployment_policy.sql`, `supabase_domain_events_sync.sql`,
   `supabase_governance_decisions.sql`, `supabase_h4_remote_governance.sql`,
   `supabase_budget_operations.sql`. Sur **toute nouvelle instance pilote**, rejouer
   ces 5 migrations avant activation.
2. **Edge functions** — `events-pull` et `events-push` déployées (H3-a). À redéployer
   sur toute nouvelle instance.
3. **Politique de déploiement** — renseigner `schools.deployment_policy` (JSON) pour
   l'école pilote. Défaut `null` = comportement actuel identique (gates OFF, aucun
   changement). La gouvernance distante ne s'active que si
   `governance.finance === 'cloud'`.
4. **Accès distant sélectif** — positionner `school_users.remote_access_allowed = true`
   **uniquement** pour les décideurs autorisés à agir depuis Internet (défaut `false`
   = sécurisé). Un droit financier local **ne suffit pas** : l'accès distant est une
   capacité orthogonale re-vérifiée à l'application.
5. **Synchronisation d'événements** — activer le drain périodique via la variable
   d'environnement `NOTESCAM_CLOUD_SYNC=1` côté serveur LAN pilote.
6. **Rôle Contrôleur** (view-only) — seedé côté cloud ; l'assigner aux comptes concernés
   si utilisé.

> Tant que les points 3–5 ne sont pas explicitement configurés, l'instance reste en
> comportement **actuel** (aucune gouvernance distante active) — l'installation pilote
> peut donc démarrer sans risque et n'activer la gouvernance distante que sur décision.
