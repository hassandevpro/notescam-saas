# Emploi du temps — Planificateur scolaire premium

Refonte du module `Emploi du temps` : d'une simple liste de créneaux vers un
planificateur comparable à Pronote / Skolengo / EducMaster, intégré nativement à
NotesCam (Cloud Supabase **et** LAN SQLite).

> **Note sur la stack.** Le cahier des charges mentionnait Next.js + TypeScript +
> shadcn/ui. NotesCam est une application **Vite + React 18 (JSX) + TailwindCSS 3 +
> framer-motion + zustand**, livrée en deux éditions (Cloud + LAN packagé .exe).
> Le module a donc été livré dans la stack réelle du produit (sinon : rupture de
> build et du packaging LAN), avec **dnd-kit** comme demandé pour le glisser-déposer.
> Les « interfaces TypeScript » ci-dessous documentent les contrats de données
> (le code applique ces formes en JSX).

---

## 1. Architecture UX

```
┌──────────────────────────────────────────────────────────────────────┐
│  Emploi du temps                                       [ Imprimer/PDF ]│
│  Planificateur scolaire — glissez-déposez, détectez les conflits.      │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   ◀ Dashboard  │
│  │ 42 h   │ │  8     │ │  11    │ │  6     │ │  3 ⚠    │     (5 KPI)    │
│  │ heures │ │ profs  │ │matières│ │ libres │ │conflits│               │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘               │
├──────────────────────────────────────────────────────────────────────┤
│  ⚠ 3 conflits détectés                              [ Voir le détail ] │ ◀ Bandeau
├──────────────────────────────────────────────────────────────────────┤
│  [ Classe | Enseignant | Salle | Matière ]   [ 6ᵉ A ▾ ]   ◀ ViewSwitcher
├──────────────────────────────────────────────────────────────────────┤
│        │ Lundi    │ Mardi    │ Mercredi │ Jeudi    │ Vendredi│ Samedi  │ ◀ Grille
│ 07:30  │ ▌Maths   │ ▌Anglais │          │ ▌SVT     │ ▌EPS    │         │
│   ↓    │  M. Atangana       │    +     │  Mme Eyo │  Sport  │    +    │
│ 09:30  │  Salle 12          │          │          │         │         │
│ ──────────────────────────────────────────────────────────────────── │
│ 09:45  │ ▌Français│    +     │ ▌Histoire│    +     │ ▌Physiq │         │
│   ↓    │          │          │          │          │ (rouge⚠)│         │
│ 11:45  │          │          │          │          │         │         │
└──────────────────────────────────────────────────────────────────────┘
```

**Hiérarchie de lecture** (du général au particulier) :
1. **Dashboard** — état de santé global du planning en un coup d'œil (KPI).
2. **Bandeau conflits** — la seule alerte rouge, impossible à manquer.
3. **ViewSwitcher** — relit le même planning sous 4 angles.
4. **Grille** — le plan de travail : glisser-déposer, éditer, ajouter.

---

## 2. Wireframe — carte de cours enrichie

```
┌─────────────────────────┐
│▌ 07:30 – 09:30      ✎ 🗑 │  ← barre d'accent = couleur catégorie
│▌ Mathématiques          │  ← titre (matière ou libellé libre)
│▌ 👤 M. Atangana         │  ← enseignant
│▌ 📍 Salle 12            │  ← salle
│▌ ● SCIENCES             │  ← badge catégorie
└─────────────────────────┘
```

Un liseré rouge `box-shadow: 0 0 0 1px #ef4444` entoure toute carte impliquée
dans un conflit.

---

## 3. Interfaces (contrats de données)

```ts
// Ligne réelle de la table timetable_slots (Cloud + LAN)
interface TimetableSlot {
  id: string;
  school_id: string;
  class_id: string;
  academic_year: string;
  day_of_week: 1 | 2 | 3 | 4 | 5 | 6;   // 1 = Lundi … 6 = Samedi
  start_time: string;                    // "HH:MM[:SS]"
  end_time: string;
  subject_id: string | null;
  teacher_id: string | null;
  label: string | null;                  // texte libre si pas de matière
  room: string | null;                   // ← NOUVELLE colonne (Vue Salle)
}

interface Category {
  id: 'sciences' | 'langues' | 'litteraire' | 'informatique' | 'eps' | 'autre';
  label: [fr: string, en: string, es: string];
  keywords: string[];
  color: { bg: string; border: string; text: string; dot: string };  // HEX
}

// Créneau « décoré » pour le rendu (jamais persisté tel quel)
interface DecoratedSlot extends TimetableSlot {
  title: string;
  subjectName: string | null;
  teacherName: string | null;
  className: string | null;
  category: Category;
  color: Category['color'];
  start: string;  // "HH:MM"
  end: string;
}

type ViewKind = 'class' | 'teacher' | 'room' | 'subject';

interface Conflict {
  kind: 'teacher' | 'room' | 'class' | 'overflow';
  day: number;
  a: TimetableSlot;            // 1er créneau impliqué
  b?: TimetableSlot;           // 2nd (pour les chevauchements)
  entity?: string;            // nom partagé (prof / salle)
}

interface DashboardStats {
  totalHours: number;
  teacherCount: number;
  subjectCount: number;
  freeCells: number;
  conflictCount: number;
}
```

---

## 4. Composants React

| Fichier | Rôle |
|---|---|
| `pages/Timetable.jsx` | Orchestrateur : chargement, état, mutations, vues |
| `components/timetable/TimetableDashboard.jsx` | 5 cartes KPI (cockpit) |
| `components/timetable/ConflictBanner.jsx` | Bandeau d'alerte + détail dépliable |
| `components/timetable/ViewSwitcher.jsx` | Segmented control 4 vues + sélecteur d'entité |
| `components/timetable/TimetableGrid.jsx` | Grille heures × jours + `DndContext` (dnd-kit) |
| `components/timetable/CourseCard.jsx` | Carte de cours enrichie, draggable |
| `components/timetable/SlotEditor.jsx` | Formulaire ajout/édition (+ salle, aperçu couleur) |
| `components/timetable/TimetablePrint.jsx` | Rendu PDF premium (logo, année, signature) |

**Logique métier (pure, testable) :** `lib/timetableEngine.js`
**Configuration (couleurs/trame) :** `config/timetableConfig.js`

---

## 5. Logique métier — `timetableEngine.js`

- `inferCategory(name)` — déduit la catégorie par mots-clés (zéro colonne SQL).
- `decorateSlot(slot, ctx)` — enrichit un créneau pour l'affichage.
- `buildTimeRanges(slots)` — lignes de la grille = trame par défaut ∪ plages réelles.
- `buildGrid(slots, ranges, days)` — matrice `[plage][jour] → créneaux`.
- `detectConflicts(slots, ctx)` — **à l'échelle de toute l'école** :
  - conflit **enseignant** (même prof, créneaux sécants) ;
  - conflit **salle** (même salle, créneaux sécants) ;
  - conflit **classe** (deux cours simultanés pour une classe) ;
  - **dépassement horaire** (hors `07:00–18:30`, durée > 4 h, ou fin ≤ début).
- `computeStats(...)` — KPI du dashboard.
- `filterByView(slots, view, entityId)` — projection Classe/Enseignant/Salle/Matière.

### Glisser-déposer
`TimetableGrid` enveloppe la grille dans un `DndContext`. Chaque carte est
`useDraggable`, chaque cellule `useDroppable`. Au drop, le créneau **snappe** sur
la plage cible : `day_of_week`, `start_time`, `end_time` sont réécrits, l'identité
(classe, matière, prof, salle) est préservée → `upsert`. Aucun mouvement = aucun
appel réseau.

> **Sécurité d'écriture :** l'état React conserve les créneaux **bruts**. Avant
> tout `upsert`, `toPayload()` ne garde que les colonnes réelles — on n'envoie
> jamais `title/color/category` au backend (Supabase rejette les colonnes
> inconnues ; le LAN les ignorerait silencieusement).

---

## 6. Couleurs automatiques par catégorie

| Catégorie | Accent | Exemples de matières |
|---|---|---|
| Sciences | 🟢 émeraude | Maths, Physique, Chimie, SVT, Techno |
| Informatique | 🟣 violet | Informatique, NTIC, Programmation |
| Langues | 🔵 bleu | Anglais, Français, Allemand, Espagnol |
| Littéraire | 🟡 ambre | Histoire-Géo, Philo, ECM, Arts, Musique |
| EPS | 🔴 rose | EPS, Sport |
| Autre | ⚪ ardoise | Récréation, libellés libres |

Couleurs en HEX appliquées via `style={{}}` (et non en classes Tailwind
dynamiques, qui seraient purgées par le JIT).

---

## 7. Impression PDF premium

`window.print()` → A4 paysage. En-tête : **logo école + nom + vue + année
scolaire**. Grille colorée par catégorie. Pied : **bloc de signature de
l'administration** + nom de l'école + date. (`@media print` masque tout le chrome
applicatif et révèle `.tt-print`, même principe que le bulletin.)

---

## 8. Migrations à exécuter

- **Cloud (Supabase)** : exécuter `supabase_timetable_room.sql`
  (`ALTER TABLE timetable_slots ADD COLUMN room text`).
- **LAN (SQLite)** : automatique au démarrage via `ensureColumn('timetable_slots',
  'room', …)` dans `server/db.js` (table `timetable_slots` déjà répliquée).

---

## 9. Justification UX

- **Notion / Linear** → densité maîtrisée : KPI en cartes, segmented control pour
  les vues, fonds très clairs et accents nets ; aucune fioriture, tout est
  actionnable.
- **Stripe** → le dashboard supérieur traduit un système complexe (le planning de
  l'établissement) en 5 chiffres lisibles ; la carte « conflits » bascule en rouge
  comme un indicateur de santé.
- **Google Calendar** → grille temps × jours, cartes colorées par type, glisser-
  déposer direct ; le mental model est immédiat pour tout personnel scolaire.
- **Pronote / EducMaster** → multi-vues (Classe/Enseignant/Salle/Matière) sur un
  même jeu de données, et détection de conflits inter-classes : c'est ce qui
  sépare un « tableau de créneaux » d'un vrai **planificateur d'établissement**.
- **Décisions clés** : conflits calculés à l'échelle de l'école (un prof ne peut
  être à deux endroits, même dans deux classes) ; couleurs **dérivées** du nom de
  matière (aucune saisie supplémentaire pour l'utilisateur) ; ajout de cours
  réservé à la Vue Classe (où le `class_id` est non ambigu) — les autres vues
  restent en lecture + déplacement, ce qui évite les créneaux orphelins.
```
