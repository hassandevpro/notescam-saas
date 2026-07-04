# NotesCam — Refonte de l'architecture UX / IA / Navigation

> Document de référence produit + architecture. Rédigé en agissant comme Product Manager Senior,
> UX Architect, SaaS Architect et Mobile UX Expert. Aucun choix existant n'est validé d'office :
> tout est réévalué à partir du code réel (`src/App.jsx`, `src/components/Sidebar.jsx`,
> `src/components/Layout.jsx`, `src/pages/*`).

---

## 1. Audit critique de l'existant

### 1.1 Méthode

Audit conduit sur le code source réel, pas sur une description. Mesures clés relevées :

| Symptôme | Preuve dans le code | Gravité |
|---|---|---|
| Méga-pages | `Settings.jsx` **857 lignes**, `AcademicYear.jsx` **845 lignes**, `Dashboard.jsx` 757, `TeacherMonitor.jsx` 653 | 🔴 Critique |
| Menu plat non hiérarchique | `Sidebar.jsx` rend ~18 entrées de 1er niveau pour l'admin, **sans groupes repliables** | 🔴 Critique |
| Navigation dupliquée | 4 tableaux `adminGroups` / `censeurGroups` / `surveillantGroups` / `teacherGroups` codés en dur, ~280 lignes de JSX répété | 🟠 Élevé |
| Mobile = drawer de 18 liens | `Layout.jsx` : hamburger → `Sidebar` coulissante ; **aucune bottom-nav**, aucune action au pouce | 🔴 Critique |
| Structure IA codée dans le JSX | Les groupes vivent dans le composant : impossible de piloter par rôle/pays/feature sans toucher au rendu | 🟠 Élevé |
| Incohérence métier des groupes | « Scolarité » mélange référentiel (Classes/Matières/Élèves) ET évaluations (Notes/Bulletins/Relevés/Conseil) ET assiduité (Absences) | 🟠 Élevé |
| Pas de groupe Finances / Vie scolaire / Personnel distincts | `fees`+`personnel` rangés ensemble sous « Gestion » ; `absences` sous « Scolarité » | 🟡 Moyen |

### 1.2 Analyse par axe

**1. Architecture de l'information** — L'IA actuelle est *organisée par écran technique*, pas par
*tâche métier*. Un directeur qui veut « gérer la scolarité » trouve dans le même bloc le référentiel
(classes/matières) et les livrables d'évaluation (bulletins/relevés), qui relèvent de moments et de
rôles différents. Le mélange augmente le temps de localisation d'une fonction.

**2. Navigation mobile** — C'est le point le plus faible. Le pattern actuel (hamburger → tiroir
plein écran de 18 liens) est un anti-pattern mobile : zone de tap haute (hors pouce), liste longue à
scroller, pas de raccourci vers les 3-4 tâches réellement quotidiennes (saisir des notes, voir un
élève, imprimer un bulletin). Aucune persistance de contexte visible.

**3. Navigation desktop future** — Le menu plat ne tient pas la montée en charge fonctionnelle :
chaque nouvelle fonctionnalité = +1 entrée de 1er niveau. À 25-30 entrées, la sidebar devient
illisible. Absence de repli = tout est toujours affiché.

**4. Scalabilité fonctionnelle** — La structure de menu étant *du code*, ajouter un module impose
d'éditer 1 à 4 tableaux JSX + gérer manuellement la visibilité par rôle. Pas de source unique.

**5. Charge cognitive** — Méga-pages (`Settings` 857 l.) = scroll infini, plusieurs boutons
« Enregistrer », sections rarement utilisées (licence, signatures) toujours visibles. La page force
l'utilisateur à scanner l'intégralité pour trouver un réglage.

**6. Sécurité des actions critiques** — La promotion d'année, l'archivage et l'import cohabitent dans
`AcademicYear.jsx`. Une action destructrice (promotion = duplication massive d'élèves, cf. mémoire
`year_promotion_roster_fix`) n'a pas de parcours dédié, sécurisé et confirmé étape par étape.

**7. Hiérarchie des modules** — Plate. Aucune notion de « domaine » (Évaluations, Vie scolaire,
Finances). L'œil ne peut pas s'appuyer sur une structure stable.

**8. Cohérence métier** — Conseil de classe (délibération sur notes) est rangé en « Scolarité » alors
qu'il appartient au domaine Évaluations. Surveillance (`monitor`) est en « Analyses » alors qu'elle
relève du pilotage de la vie scolaire.

**9. Évolutivité multi-pays** — `useCountry()` existe et résout déjà la config pays, mais la
**navigation ne la consomme pas** : impossible aujourd'hui de masquer/renommer une entrée selon le
pays (ex. « Séquences » au Cameroun vs « Trimestres » au Gabon vs « Trimestres ES » en Guinée Eq).

**10. Évolutivité multi-profils** — Les 4 rôles sont gérés par duplication. Ajouter un rôle (ex.
« comptable », « parent admin ») = un 5e tableau dupliqué. Non tenable.

### 1.3 Ce qui est sain et doit être préservé

- Lazy-loading des pages (`App.jsx`) — bon pour le bundle mobile.
- Gardes de routes par rôle (`ProtectedRoute allow={...}`) — la sécurité d'accès est déjà centralisée.
- `usePlan().f` (feature flags par plan) et `useCountry()` — les briques d'évolutivité existent, il
  faut les **brancher** sur la navigation.
- i18n `t(fr, en, es)` — déjà tri-lingue.
- Le découpage en pages lazy reste pertinent ; **on ne réécrit pas le cœur métier**.

---

## 2. Nouvelle architecture fonctionnelle (IA cible)

Principe directeur : **organiser par domaine métier**, pas par écran. 8 domaines stables, chacun
repliable, alimentés par une **source unique** (`src/config/navigation.js`) consommée par les 3
surfaces (desktop, tablette, mobile).

```
🏠 Tableau de bord

📚 Scolarité          (le référentiel : qui/quoi/quand)
   ├ Classes
   ├ Matières
   ├ Élèves
   └ Emploi du temps

📝 Évaluations        (le cœur du produit : produire des résultats)
   ├ Notes
   ├ Bulletins
   ├ Relevés
   └ Conseil de classe

👥 Vie scolaire       (le quotidien : présence & discipline)
   ├ Absences
   └ Surveillance (cockpit)

💰 Finances
   └ Frais scolaires

👨‍🏫 Personnel
   ├ Enseignants
   └ Personnel & rôles

📊 Rapports

⚙ Administration
   ├ Paramètres
   ├ Année scolaire
   ├ Historique & sauvegardes
   └ Aide
```

**Mapping vers les routes existantes (aucune route inventée, zéro lien mort) :**

| Domaine | Entrée | Route existante | Rôles | Feature flag |
|---|---|---|---|---|
| — | Tableau de bord | `/app` | tous (sauf teacher → grades) | — |
| Scolarité | Classes | `/app/classes` | admin, censeur | — |
| Scolarité | Matières | `/app/subjects` | admin, censeur | — |
| Scolarité | Élèves | `/app/students` | admin, censeur, surveillant | — |
| Scolarité | Emploi du temps | `/app/timetable` | admin, censeur, teacher | `hasTimetable` |
| Évaluations | Notes | `/app/grades` | admin, censeur, teacher | — |
| Évaluations | Bulletins | `/app/bulletins` | admin, censeur, teacher | — |
| Évaluations | Relevés | `/app/releves` | admin, censeur, teacher | — |
| Évaluations | Conseil de classe | `/app/conseil` | admin, censeur, surveillant | — |
| Vie scolaire | Absences | `/app/absences` | tous | `hasAbsences` |
| Vie scolaire | Surveillance | `/app/monitor` | admin, censeur | — |
| Finances | Frais scolaires | `/app/fees` | admin, censeur | `hasFees` |
| Personnel | Enseignants | `/app/teachers` | admin | `hasTeachers` |
| Personnel | Personnel & rôles | `/app/personnel` | admin | `hasTeachers` |
| Rapports | Rapports | `/app/reports` | admin, censeur | — |
| Administration | Paramètres | `/app/settings` | tous | — |
| Administration | Année scolaire | `/app/year` | admin | — |
| Administration | Historique | `/app/historique` | admin | — |
| Administration | Aide | `/app/aide` | tous | — |

> **Note de cohérence métier** : Conseil de classe migre de « Scolarité » → « Évaluations » ;
> Surveillance migre de « Analyses » → « Vie scolaire ». Ces deux corrections suppriment les deux
> principales incohérences relevées en 1.2-§8.

---

## 3. Arborescence complète du SaaS (sous-pages cibles)

Les méga-pages se cassent en **hubs + sous-pages** (onglets desktop, sheet/accordion mobile). On garde
une route racine par hub (rétrocompatibilité) et on ajoute des sous-routes.

### 3.1 Administration (casse de `Settings.jsx` 857 l.)

```
/app/settings                     → Hub (grille de cartes)
  /app/settings/school            → Établissement (nom, logo, adresse, n° établissement)
  /app/settings/bulletins         → Apparence des bulletins (police, template, en-tête pays)
  /app/settings/signatures        → Signatures officielles
  /app/settings/users             → Utilisateurs & rôles
  /app/settings/calendar          → Calendrier scolaire (déplacé hors de TeacherMonitor)
  /app/settings/license           → Licence & abonnement
  /app/settings/advanced          → Paramètres avancés (sync cloud, export, danger zone)
```

### 3.2 Année scolaire (casse de `AcademicYear.jsx` 845 l.)

```
/app/year                         → Tableau de bord année (état, jalons, raccourcis)
  /app/year/periods               → Périodes académiques (séquences/trimestres/semestres)
  /app/year/promotion             → Promotion & redoublements (ASSISTANT sécurisé)
  /app/year/archive               → Archivage
  /app/year/history               → Historique des années
  /app/year/migration             → Migration / Import (depuis autre app)
  /app/year/tools                 → Outils avancés (démo, reconstruction roster)
```

### 3.3 Historique & sauvegardes (casse de `History.jsx`)

```
/app/historique                   → Hub
  /app/historique/audit           → Journal · Corbeille · Traçabilité
  /app/historique/backups         → Sauvegarde auto · Export · Import · Restauration
```

### 3.4 Surveillance — cockpit (refonte de `TeacherMonitor.jsx`)

```
/app/monitor                      → Cockpit (vue adaptée au rôle)
   - Progression globale de la saisie
   - Enseignants en retard
   - Matières manquantes par classe
   - Classes bloquées (verrou notes)
   - Alertes critiques + échéances proches
   - Dernières activités (depuis historyService)
   Vues : Directeur (tout) · Censeur (pédagogie) · Surveillant (assiduité/discipline)
```

---

## 4. Parcours utilisateurs optimisés

**P1 — Enseignant saisit ses notes (mobile, quotidien)**
Bottom-nav « Notes » (1 tap) → classe pré-sélectionnée (persistée `uiStore.gradesClassId`) → séquence →
matière → saisie. 1 tap vers la tâche n°1, contre 2 (hamburger + scroll + tap) aujourd'hui.

**P2 — Directeur imprime un bulletin (mobile)**
Bottom-nav « Bulletins » → contexte persisté → impression. Quota Starter visible avant action.

**P3 — Directeur promeut l'année (desktop, rare, critique)**
Administration → Année scolaire → Promotion & redoublements → **assistant** :
`1. Vérifications (pré-requis) → 2. Règles de passage → 3. Aperçu (qui passe / redouble / sort) →
4. Confirmation forte (saisir le nom de l'établissement) → 5. Exécution + journal`.
L'irréversible n'est jamais à un clic.

**P4 — Censeur pilote la saisie (cockpit)**
Vie scolaire → Surveillance → voit en un écran : % saisie, retards, classes bloquées, alertes. Action
directe « relancer l'enseignant » depuis l'alerte.

**P5 — Admin configure les signatures (desktop, rare)**
Administration → Paramètres → carte « Signatures » → sous-page courte, un seul « Enregistrer ».

---

## 5. Wireframes textuels

### 5.1 Desktop — shell

```
┌────────────┬──────────────────────────────────────────────┐
│  NotesCam  │  [≡] École X · 2025-2026      ⟳ sync   🔔     │  ← header (Layout)
│  Gestion   ├──────────────────────────────────────────────┤
│            │                                                │
│ 🏠 Tableau │   <contenu de la page>                         │
│            │                                                │
│ 📚 Scolar.▾│                                                │
│   Classes  │                                                │
│   Matières │                                                │
│   Élèves   │                                                │
│   Emploi   │                                                │
│ 📝 Évalu. ▸│  ← groupe replié (chevron)                     │
│ 👥 Vie sc.▸│                                                │
│ 💰 Finance▸│                                                │
│ 👨‍🏫 Person.▸│                                                │
│ 📊 Rapports│                                                │
│ ⚙ Admin  ▸ │                                                │
├────────────┤                                                │
│ 👤 H. Ous. │                                                │
│ 🌐 FR/EN/ES│                                                │
│ ⎋ Déconnex.│                                                │
└────────────┴──────────────────────────────────────────────┘
```

### 5.2 Mobile — shell (bottom-nav)

```
┌──────────────────────────────┐
│ [≡] École X · 2025-26   🔔    │  ← header compact
├──────────────────────────────┤
│                              │
│   <contenu pleine largeur>   │
│                              │
│                              │
├──────────────────────────────┤
│  🏠     📝     👥     📊    ⋯ │  ← bottom-nav (pouce)
│ Accueil Notes  Élèves Rapp. Plus│
└──────────────────────────────┘
        │
        └─ « Plus » ouvre une sheet : groupes complets repliables
```

### 5.3 Settings Hub

```
Administration › Paramètres
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 🏫 Établiss. │ │ 🎨 Bulletins │ │ ✍ Signatures │
│ Nom, logo…   │ │ Apparence    │ │ Officielles  │
└──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 👥 Utilisat. │ │ 📅 Calendrier│ │ 🔑 Licence   │
└──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐
│ ⚙ Avancés    │
└──────────────┘
```

### 5.4 Assistant Promotion (sécurité)

```
Année scolaire › Promotion & redoublements
[●——○——○——○——○]  Étape 1/5 — Vérifications
  ✓ Notes verrouillées pour toutes les classes
  ✓ Conseils de classe clôturés
  ⚠ 2 classes sans décision de passage   [Corriger]
                                   [Annuler]  [Suivant →]
...
Étape 4/5 — Confirmation
  Cette action duplique 412 élèves vers 2026-2027 et archive 2025-2026.
  Action irréversible. Tapez « École X » pour confirmer : [__________]
                                   [← Retour]  [Lancer la promotion]
```

---

## 6. Architecture mobile

- **Bottom-nav** (4 destinations primaires + « Plus ») = pattern SaaS mobile standard. Destinations
  primaires choisies par rôle (les tâches quotidiennes), définies par `mobilePrimary` dans la config.
- **« Plus »** ouvre une bottom-sheet contenant l'arborescence complète repliable (réutilise les
  mêmes groupes que la sidebar — source unique).
- Header mobile réduit (nom école + cloche). Le hamburger devient secondaire / supprimable une fois la
  bottom-nav en place.
- Hubs (Settings/Year/Historique) en mobile : la grille de cartes devient la nav ; les onglets
  desktop deviennent une liste verticale.

## 7. Architecture desktop / tablette

- **Desktop** : sidebar fixe 240px, groupes **repliables** (état persistant `localStorage`), groupe
  actif auto-déplié selon la route courante.
- **Tablette** : sidebar repliable en rail d'icônes (collapsée), bascule au tap. Même config.
- Hubs : onglets horizontaux (desktop) sous le titre du hub.

---

## 8. Plan de migration depuis l'existant

Migration **progressive et non destructive** (cf. règle mémoire `feedback_rules` : ne pas recréer à
zéro, préserver la logique métier). Aucune route existante n'est supprimée.

| Phase | Action | Risque | Réversible |
|---|---|---|---|
| **0** | Branche dédiée `feat/ux-architecture-refactor` | — | ✅ |
| **1** | Introduire `src/config/navigation.js` (source unique) | nul (additif) | ✅ |
| **2** | Sidebar consomme la config + groupes repliables | faible (mêmes routes) | ✅ |
| **3** | Ajouter `MobileNav` (bottom-nav) ; garder le hamburger en secours | faible | ✅ |
| **4** | Casser `Settings` en hub + sous-routes (1 onglet ⇒ 1 sous-page, copie du JSX existant) | moyen | ✅ par onglet |
| **5** | Casser `AcademicYear` + **assistant Promotion** | moyen-élevé | ✅ |
| **6** | Cockpit Surveillance + sortir le calendrier vers Paramètres | moyen | ✅ |
| **7** | Casser `History` → Audit / Sauvegardes ; brancher journalisation systématique | faible | ✅ |
| **8** | Brancher `useCountry()` sur les libellés/visibilité de périodes | faible | ✅ |

**Toutes les phases 1-8 sont livrées** (voir §12 pour l'état détaillé). Chaque page-hub conserve sa
route racine existante (rétrocompatibilité totale) ; les onglets remplacent le scroll vertical.

## 9. Structure des routes / pages (cible)

```
/                       Landing
/login /signup /…       Auth
/app                    HomeRoute (Dashboard | redirection teacher/superadmin)
/app/classes /subjects /students /students/:id /timetable      Scolarité
/app/grades /bulletins /releves /conseil                       Évaluations
/app/absences /monitor                                         Vie scolaire
/app/fees                                                      Finances
/app/teachers /personnel                                       Personnel
/app/reports                                                   Rapports
/app/settings(/school|bulletins|signatures|users|calendar|license|advanced)   Admin
/app/year(/periods|promotion|archive|history|migration|tools)                 Admin
/app/historique(/audit|backups)                                               Admin
/app/aide
/superadmin  /parent/:token  /verify/:code
```

Implémentation des sous-routes : routes imbriquées React Router (`<Route path="settings" element={<SettingsHub/>}><Route path="school" .../></Route>`) avec `<Outlet/>`.

## 10. Structure des composants React

```
src/
  config/
    navigation.js          ← SOURCE UNIQUE (groupes, rôles, flags, mobilePrimary)
  components/
    nav/
      Sidebar.jsx          ← desktop/tablette, groupes repliables (consomme config)
      NavGroup.jsx         ← groupe repliable
      NavItem.jsx          ← item + badge + lock
      MobileNav.jsx        ← bottom-nav (mobilePrimary) + bouton « Plus »
      MoreSheet.jsx        ← bottom-sheet arborescence complète
    layout/
      Layout.jsx           ← shell (header + sidebar + main + MobileNav)
    hubs/
      HubLayout.jsx        ← titre + onglets + <Outlet/> (Settings/Year/Historique)
      SettingCard.jsx
    wizard/
      Wizard.jsx           ← coquille stepper réutilisable (Promotion, Onboarding…)
      ConfirmDanger.jsx    ← confirmation forte (saisie du nom)
  pages/
    settings/  year/  historique/   ← sous-pages (1 fichier par onglet)
```

Conventions : un item de menu = un objet de config ; un composant nav ne *décide* jamais de la
structure, il *rend* la config. Visibilité = `roles.includes(role) && (!feature || f[feature])`.

## 11. Organisation des dossiers (cible)

Regrouper par **domaine** plutôt que par type, à mesure que les pages se cassent :

```
src/
  config/          navigation, constantes UI
  components/
    nav/ layout/ hubs/ wizard/ ui/   (primitives partagées)
    bulletins/ (existant)
  features/        (cible long terme — par domaine)
    scolarite/ evaluations/ vie-scolaire/ finances/ personnel/ admin/
  pages/           (transitoire — migrées vers features/ au fil des phases)
  lib/ store/ core/ countries/   (inchangés — cœur métier préservé)
```

> Pour ce commit, on introduit `src/config/` et `src/components/nav/` sans déplacer l'existant, afin
> de rester non destructif. La migration vers `features/` est une phase ultérieure.

## 12. Plan d'implémentation — état réel

1. ✅ `src/config/navigation.js` — source unique multi-rôle / multi-flag / mobile.
2. ✅ `Sidebar` refactorisée — groupes repliables, dépliage auto sur la route active, état persistant.
3. ✅ `MobileNav` + `MoreSheet` — bottom-nav par rôle (destinations `mobilePrimary` + sheet).
4. ✅ Intégration `Layout` (desktop sidebar + mobile bottom-nav, padding bas du `main`).
5. ✅ `HubTabs` — primitive de hub réutilisable (titre + onglets sticky + onglet persistant).
6. ✅ **Paramètres** cassés en hub modulaire : Profil & licence · Établissement · Apparence des
   bulletins · Signatures officielles · Utilisateurs · Calendrier scolaire · Paramètres avancés.
   Sauvegarde par onglet (chaque onglet persiste l'objet `form` complet).
7. ✅ **Année scolaire** cassée en hub : Tableau de bord · Périodes académiques · Promotion &
   redoublements · Archivage & historique · Migration · Outils avancés.
8. ✅ **Assistant Promotion sécurisé** (`PromotionWizard`) : Vérifications → Règles → Aperçu →
   Confirmation forte (saisie du nom de l'établissement) → Exécution. Irréversible jamais en 1 clic.
9. ✅ **Historique** séparé en **Audit** (Journal/traçabilité, Corbeille) et **Sauvegardes**
   (export/import/restauration). Le journal trace déjà user/date/action/cible/détails.
10. ✅ **Cockpit Surveillance** : panneau d'alertes critiques (retards, à risque, sans notes, classes
    sans enseignant, enseignants en retard) + progression globale ; calendrier **retiré** de ce module
    (déplacé dans Paramètres) ; en-tête de vue adapté au rôle (Directeur / Censeur).
11. ✅ Multi-pays : labels nav en i18n (fr/en/es) ; vocabulaire des périodes
    (séquences/terms/trimestres) **data-driven** dans `src/countries/*`, consommé par `PeriodsManager`
    — un futur pays = un fichier, sans toucher au cœur métier ni à la nav.
12. ✅ Build de non-régression vert après chaque étape (`vite build`).

### Reste optionnel (amélioration continue, non bloquant)
- Routes imbriquées profondes (`/app/settings/school`…) si l'on veut des URLs partageables par onglet
  (aujourd'hui l'onglet actif est persisté en `localStorage`, ce qui couvre 95 % du besoin).
- `ConfirmDanger` extrait en composant générique réutilisable au-delà de la promotion.

## 13. Code livré dans ce commit

- `src/config/navigation.js`
- `src/components/nav/Sidebar.jsx` (remplace l'ancienne `Sidebar.jsx`)
- `src/components/nav/MobileNav.jsx`
- `src/components/nav/MoreSheet.jsx`
- Intégration dans `src/components/Layout.jsx`

Priorités respectées : **simplicité** (1 source de vérité), **cohérence métier** (8 domaines),
**sécurité** (assistant promotion spécifié), **performance mobile** (bottom-nav, lazy inchangé),
**scalabilité** (ajout d'un module = 1 objet de config ; ajout d'un rôle = 1 valeur dans `roles`).
</content>
