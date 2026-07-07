# Rapport — Rôle actuel du « surveillant » dans NotesCam

_Date : 2026-07-04 · Portée : état des lieux factuel, sans modification de code._

---

## 1. Définition et stockage du rôle

- Le rôle vit dans **`school_users.role`**, valeur `'surveillant'`.
- Contrainte SQL (`supabase_staff_roles.sql`) :
  `CHECK (role IN ('admin','teacher','censeur','surveillant'))`.
- Créé par l'admin uniquement, via la RPC `admin_create_staff_account(uuid, text, role)`
  (rôle limité à `censeur | surveillant`). Listé par `admin_list_staff(role)`,
  activé/désactivé par `admin_set_staff_active(uuid, bool)`.
- Aucune colonne de périmètre : **pas de section, pas de cycle, pas de classe rattachée.**
  La seule dimension stockée est `role` + `active` + `full_name`.

**Libellé** (`src/lib/roleLabel.js`) : FR « Surveillant » · EN « Supervisor » · ES « Jefe de disciplina ».

**Description officielle affichée** (`src/components/StaffManager.jsx`, l.16-19) :
> « Le surveillant gère la discipline, l'assiduité (absences) et les élèves —
> sans accès aux notes, frais ni paramètres. »

---

## 2. Ce que le surveillant peut faire (navigation)

Source unique : `src/config/navigation.js` (rôles par item) + gardes de route `src/App.jsx`.

| Module | Route | Accès surveillant | Nature |
|--------|-------|:---:|--------|
| Tableau de bord | `/app` | ✅ | Commun à tous |
| **Élèves** | `/app/students` | ✅ **lecture seule** | Consultation |
| **Absences** | `/app/absences` | ✅ écriture | Saisie + stats |
| **Conseil de classe** | `/app/conseil` | ✅ | Discipline / décisions |
| Paramètres | `/app/settings` | ✅ | Commun (profil, langue…) |
| Aide | `/app/aide` | ✅ | Commun |
| Classes | `/app/classes` | ❌ | admin + censeur |
| Notes / Bulletins / Documents | `/app/grades`… | ❌ | avec enseignant |
| Surveillance (`/monitor`) | `/app/monitor` | ❌ | admin + censeur (**suivi des enseignants**, pas des élèves) |
| Frais | `/app/fees` | ❌ | admin + censeur |
| Rapports | `/app/reports` | ❌ | admin + censeur |
| Palmarès | `/app/palmares` | ❌ | admin + censeur |
| Enseignants / Personnel | `/app/teachers`… | ❌ | admin |
| Année scolaire / Historique | `/app/year`… | ❌ | admin |

Ensembles de rôles définis dans `App.jsx` :
- `DISCIPLINE = ['admin','censeur','surveillant']` → Élèves, Conseil.
- `ALL_STAFF = [...tous]` → Absences, Paramètres, Aide.

---

## 3. Restrictions d'écriture effectives

- **Élèves** : `canEdit = role === 'admin' || role === 'censeur'`
  (`src/pages/Students.jsx` l.762). Le surveillant voit la liste mais **aucun**
  bouton Ajouter / Importer / Modifier / Supprimer / sélection groupée /
  changer de classe. Doublé côté base par une RLS `role IN ('admin','censeur')`.
- **Absences** : écriture autorisée (insert/update/delete sur `attendance`).
- **Conseil de classe** : accessible ; comportement d'écriture non restreint au rôle.

---

## 4. Le point central : AUCUNE notion de section

C'est le cœur du problème à améliorer.

- Un surveillant voit **tout l'établissement**, toutes sections confondues
  (maternelle / primaire / premier cycle / second cycle).
- La « section » existe déjà comme **outil de tri d'affichage** :
  `SECTIONS` + `classSectionKey()` dans `src/core/engineResolver.js`,
  et le composant `SectionFilterSelect` + `inSection()` utilisé dans
  `Absences.jsx` et `Students.jsx`.
  → Mais c'est un **filtre manuel choisi par l'utilisateur**, pas une restriction
  liée au compte. Rien n'empêche un surveillant de tout voir.
- Conséquence : impossible de modéliser un grand établissement réel avec
  **plusieurs surveillants généraux**, un par cycle (ex. « surveillant du
  primaire », « surveillant du 1er cycle », « surveillant du lycée »).

---

## 5. Fonctionnalités « métier discipline » réellement présentes

- Le seul vrai outil discipline du surveillant est **Absences** (saisie + stats,
  seuil d'alerte ≥ 10 dans `StatsTab`).
- **Il n'existe PAS de module dédié** incidents / sanctions / convocations /
  retenues. Les occurrences de « discipline » dans le code ne sont que des
  **colonnes de bulletin** (conduite/discipline), pas un module de vie scolaire.
- La page **« Surveillance » (`/app/monitor`)** ne concerne PAS la discipline des
  élèves : c'est le **suivi de l'activité des enseignants** (cockpit), réservé
  admin + censeur. Le surveillant n'y a pas accès et n'a aucun tableau de bord
  discipline élève.

---

## 6. Synthèse des lacunes

| # | Lacune | Conséquence |
|---|--------|-------------|
| 1 | **Aucun rattachement surveillant → section(s)** | Tous les surveillants voient tout ; impossible de spécialiser par cycle. |
| 2 | **Filtrage section purement cosmétique (UI)** | Aucune isolation réelle des données ; contournable. |
| 3 | **Pas de module discipline dédié** | Le rôle se limite de fait aux absences. |
| 4 | **Pas de tableau de bord vie scolaire** | Aucune vue d'ensemble (élèves à risque, retards récurrents…) pour le surveillant. |
| 5 | **Écriture élèves interdite** | Cohérent aujourd'hui, mais à réévaluer si le surveillant doit gérer des données de discipline sur la fiche élève. |

---

## 7. Pistes d'amélioration (non implémentées — pour cadrer le prompt)

1. **Rattacher un surveillant à une/plusieurs sections**
   - Nouvelle donnée sur `school_users` (ex. `sections text[]`),
     valeurs alignées sur `SECTIONS` (`maternelle`/`primaire`/`premier_cycle`/`second_cycle`).
   - Vide/null = tout l'établissement (rétro-compatible).
   - Filtrage **automatique** des classes visibles (Absences, Élèves, Conseil)
     via `classSectionKey(cls)`.
   - Idéalement doublé d'une **RLS** pour une vraie isolation (sinon cosmétique).
   - UI d'affectation dans `StaffManager.jsx` (cases à cocher des sections).

2. **Tableau de bord discipline** scopé aux sections du surveillant
   (réutilise la logique de seuil de `StatsTab`).

3. **Module incidents/sanctions** (convocation, retenue, avertissement) —
   aujourd'hui totalement absent.

4. **Affichage du périmètre** dans la sidebar/profil (« Surveillant — Primaire »)
   quand plusieurs surveillants coexistent (`roleLabel.js`).

---

## 8. Fichiers clés (pour un futur prompt d'implémentation)

- `src/config/navigation.js` — items + rôles autorisés.
- `src/App.jsx` — ensembles `DISCIPLINE` / `ALL_STAFF` + gardes `ProtectedRoute`.
- `src/core/engineResolver.js` — `SECTIONS`, `classSectionKey()`.
- `src/components/SectionFilterSelect.jsx` — `inSection()`.
- `src/pages/Absences.jsx`, `src/pages/Students.jsx` — filtrage section actuel (manuel).
- `src/components/StaffManager.jsx` + `src/lib/staffAccounts.js` — création/gestion des comptes.
- `supabase_staff_roles.sql` — contrainte de rôle + RPCs `admin_*_staff`.
- `src/lib/roleLabel.js` — libellés de rôle.
