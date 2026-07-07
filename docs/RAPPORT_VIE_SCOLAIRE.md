# Rapport d'implémentation — Module Vie Scolaire (Surveillant)

**Date :** 2026-07-04
**Branche :** `feat/ux-architecture-refactor`
**Objet :** transformation du rôle *surveillant* en module de vie scolaire / discipline complet.
**État :** code écrit et vérifié (syntaxe OK sur 20 fichiers). **Migration SQL non exécutée** — voir §5.

---

## 1. Couverture du cahier des charges

| # | Volet demandé | Livré | Fichier(s) |
|---|---------------|:-----:|-----------|
| 1 | Périmètre (sections / cycles / classes) | ✅ | `surveillantScope.js`, `auth.js`, `authStore.js`, `schoolStore.js`, `StaffManager.jsx` |
| 2 | Tableau de bord Vie Scolaire | ✅ | `pages/VieScolaire.jsx` |
| 3 | Retards | ✅ | `pages/LateArrivals.jsx` |
| 4 | Incidents disciplinaires | ✅ | `pages/Incidents.jsx` |
| 5 | Sanctions | ✅ | `pages/Sanctions.jsx` |
| 6 | Convocations (+ PDF) | ✅ | `pages/ParentMeetings.jsx`, `disciplineDoc.js` |
| 7 | Autorisations de sortie (+ PDF) | ✅ | `pages/ExitPermissions.jsx`, `disciplineDoc.js` |
| 8 | Suivi individuel (fiche discipline) | ✅ | `pages/StudentDisciplineFile.jsx` |
| 9 | Communication parents (SMS) | ⛔ **Déféré** | — (infra absente) |
| 10 | Conseil de discipline | ✅ | `pages/DisciplineCouncil.jsx` |
| 11 | Sécurité (pas d'accès notes/frais/paramètres) | ✅ | gardes de route existantes |
| 12 | 8 tables base de données | ✅ | `supabase_vie_scolaire.sql` |
| 13 | i18n multi-profils (FR/EN/ES) | ✅ | `disciplineTerms.js` + résolution pays |

---

## 2. Architecture

**Fondation (logique pure + données)**
- `src/core/surveillantScope.js` — cycles (fondamental/secondaire), `filterClassesByScope`, `isGlobalScope`, `scopeSummary`.
- `src/core/disciplineTerms.js` — listes localisées `[fr,en,es]` (incidents, gravité, sanctions, sorties, convocations, conseil) + helpers `labelOf`/`colorOf`/`localizedOptions`.
- `src/lib/vieScolaireService.js` — CRUD Supabase par table (fabrique) + `fetchVieScolaireSnapshot`, `fetchStudentDisciplineFile`.
- `src/lib/disciplineDoc.js` — impression A5 (convocation / autorisation de sortie) via HTML→`window.print`.

**Périmètre automatique**
`school_users.scope_*` → `auth.js` (colonnes chargées avec repli 3 niveaux) → `authStore.scope` → `schoolStore.init/_refreshFromSupabase`. Le filtrage réutilise exactement le mécanisme existant du `teacherId` : il ne s'applique **que** si `role === 'surveillant'` et périmètre non global. Vide = tout l'établissement (rétro-compatible).

**UI générique**
`src/components/vieScolaire/RecordsPage.jsx` — CRUD piloté par schéma (champs + colonnes déclaratifs) + `vsCommon.jsx` (contexte, sélecteur Section→Classe→Élève, en-tête). Chaque module ne fait plus que déclarer ses champs.

**Navigation / routes**
Groupe `vie-scolaire` (`config/navigation.js`) et routes (`App.jsx`) réservés à `DISCIPLINE = admin | censeur | surveillant`.

---

## 3. Base de données (`supabase_vie_scolaire.sql`)

- **Périmètre :** `school_users` + `scope_sections text[]`, `scope_cycles text[]`, `scope_class_ids uuid[]`.
- **8 tables :** `late_arrivals`, `disciplinary_incidents`, `disciplinary_actions`, `student_warnings`, `student_detentions`, `parent_meetings`, `exit_permissions`, `discipline_statistics` (= dossier de conseil de discipline).
- **RPC :** `admin_set_staff_scope(...)` (admin only) ; `admin_list_staff` recréée pour renvoyer aussi le périmètre.
- Colonnes de synchro continue (`updated_at`/`version`/`device_id`) sur chaque table, cohérentes avec `staff`.
- Idempotent (réexécutable).

---

## 4. Volet sécurité (recoupe l'audit du 2026-06-23 / 2026-07-04)

**Points conformes**
- **Isolation par établissement :** les 8 tables ont une RLS `school_id ∈ (school_users du user actif)`, **strictement le même modèle** que `staff`, `attendance`, etc. Elles héritent donc de la même robustesse — et de la même **dépendance à C1** (voir ci-dessous).
- **Cloisonnement du rôle :** notes / bulletins / frais / paramètres système restent inaccessibles au surveillant via les gardes de route existantes (`WITH_TEACHER`, `ACADEMIC`, `ADMIN_ONLY`). Aucune route discipline n'ouvre ces domaines.
- **RPC de périmètre :** `admin_set_staff_scope` est `SECURITY DEFINER` et vérifie que l'appelant est `admin` **de la même école** avant toute écriture — pas d'élévation de privilège transverse.

**Points de vigilance**
- ⚠️ **Dépendance à C1 (audit sécurité).** Comme toutes les tables, l'isolation réelle de ces 8 tables **repose sur la RLS de `school_users`**. Tant que le correctif `supabase_security_hardening.sql` (PARTIE 1) n'est pas **confirmé appliqué**, ces nouvelles tables héritent du même risque théorique d'isolation. Rien de spécifique au module, mais à intégrer au périmètre C1.
- **Filtrage de périmètre = applicatif, pas RLS.** La restriction du surveillant à ses sections/cycles/classes est faite **côté front** (store). Un surveillant techniquement malveillant pourrait requêter hors périmètre (dans sa propre école uniquement — jamais une autre école). Acceptable pour un compte de confiance interne ; à durcir par RLS si l'on veut une vraie séparation intra-établissement.
- **Impression (`disciplineDoc.js`) :** contenu échappé via `esc()` (recoupe M2 de l'audit — ici traité). Le document s'ouvre dans une fenêtre `window.open` + `document.write` : données utilisateur systématiquement passées par `esc()`.
- **Aucune donnée sensible nouvelle exposée publiquement** : pas d'upload vers le bucket public `school-assets` dans ce module (n'aggrave pas C2).

---

## 5. À exécuter avant mise en service

1. ▶️ **Lancer `supabase_vie_scolaire.sql`** (Supabase → SQL Editor). Sans ça : colonnes de périmètre + 8 tables absentes → le code retombe sur « accès global » et les pages renvoient des erreurs de fetch.
2. Vérifier/appliquer **C1** (`supabase_security_hardening.sql` PARTIE 1) pour que l'isolation des nouvelles tables soit garantie et pas seulement théorique.
3. (Optionnel) créer un compte surveillant de test et lui affecter un périmètre via **Paramètres → Surveillants → Périmètre**.

---

## 6. Déféré / hors périmètre

- **SMS parents (#9).** Nécessite une passerelle SMS (Twilio-like) + edge function : **absentes**. `messagesService` / `school_messages` = messagerie in-app, pas du SMS. Les prérequis sont prêts (`students.parent_phone`, convocations imprimables) pour y brancher un envoi ultérieurement.
- **RLS de périmètre intra-établissement** (voir §4) : non implémentée (filtrage applicatif suffisant pour un rôle de confiance).
