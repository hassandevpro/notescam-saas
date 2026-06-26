// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION — SOURCE UNIQUE DE VÉRITÉ
// ─────────────────────────────────────────────────────────────────────────────
// Toute la structure de navigation de l'app vit ici. Les composants de rendu
// (Sidebar desktop/tablette, MobileNav bottom-bar, MoreSheet) la *consomment*
// mais ne décident JAMAIS de la structure.
//
// Ajouter un module     = ajouter un objet `item` ci-dessous.
// Restreindre un module = ajuster `roles` et/ou `feature`.
// Ajouter un rôle       = ajouter sa valeur dans les `roles` concernés.
//
// Chaque item :
//   to            route (doit exister dans App.jsx — zéro lien mort)
//   icon          clé dans components/nav/icons.jsx
//   label         tuple i18n [fr, en, es] — passé à t(...label)
//   roles         rôles autorisés (aligné sur ProtectedRoute dans App.jsx)
//   feature?      flag de plan requis (clé de usePlan().f) → sinon affiché verrouillé
//   end?          NavLink exact match (pour /app)
//   badge?        affiche le compteur de notifications non lues
//   mobilePrimary? apparaît dans la bottom-nav mobile (sinon: dans « Plus »)
//
// NB cohérence métier vs ancienne sidebar :
//   - Conseil de classe : Scolarité → Évaluations
//   - Surveillance      : Analyses  → Vie scolaire
// ─────────────────────────────────────────────────────────────────────────────

export const ROLES = {
  ADMIN: 'admin',
  CENSEUR: 'censeur',
  SURVEILLANT: 'surveillant',
  TEACHER: 'teacher',
};

const ALL = ['admin', 'censeur', 'surveillant', 'teacher'];

// Groupes ordonnés. `id` sert de clé d'état (repli) et de dépliage auto.
export const NAV_GROUPS = [
  {
    id: 'home',
    label: null, // pas d'en-tête : entrée racine
    items: [
      { to: '/app', icon: 'home', end: true,
        label: ['Tableau de bord', 'Dashboard', 'Panel'],
        roles: ALL, mobilePrimary: true },
    ],
  },
  {
    id: 'scolarite',
    label: ['Scolarité', 'Academics', 'Escolaridad'],
    icon: 'classes',
    items: [
      { to: '/app/classes',   icon: 'classes',   label: ['Classes', 'Classes', 'Clases'],
        roles: ['admin', 'censeur'] },
      { to: '/app/subjects',  icon: 'subjects',  label: ['Matières', 'Subjects', 'Asignaturas'],
        roles: ['admin', 'censeur'] },
      { to: '/app/students',  icon: 'students',  label: ['Élèves', 'Students', 'Alumnos'],
        roles: ['admin', 'censeur', 'surveillant'], mobilePrimary: true },
      { to: '/app/timetable', icon: 'timetable', label: ['Emploi du temps', 'Timetable', 'Horario'],
        roles: ['admin', 'censeur', 'teacher'], feature: 'hasTimetable' },
    ],
  },
  {
    id: 'evaluations',
    label: ['Évaluations', 'Assessment', 'Evaluación'],
    icon: 'grades',
    items: [
      { to: '/app/grades',    icon: 'grades',    label: ['Notes', 'Grades', 'Notas'],
        roles: ['admin', 'censeur', 'teacher'], mobilePrimary: true },
      { to: '/app/bulletins', icon: 'bulletins', label: ['Bulletins', 'Report Cards', 'Boletines'],
        roles: ['admin', 'censeur', 'teacher'], mobilePrimary: true },
      { to: '/app/releves',   icon: 'transcript', label: ['Documents', 'Documents', 'Documentos'],
        roles: ['admin', 'censeur', 'teacher'] },
      { to: '/app/conseil',   icon: 'conseil',   label: ['Conseil de classe', 'Class Council', 'Junta de evaluación'],
        roles: ['admin', 'censeur', 'surveillant'] },
      { to: '/app/palmares',  icon: 'trophy',    label: ["Tableaux d'honneur", 'Honour rolls', 'Cuadros de honor'],
        roles: ['admin', 'censeur'] },
    ],
  },
  {
    id: 'vie-scolaire',
    label: ['Vie scolaire', 'School Life', 'Vida escolar'],
    icon: 'absences',
    items: [
      { to: '/app/absences', icon: 'absences', label: ['Absences', 'Attendance', 'Ausencias'],
        roles: ALL, feature: 'hasAbsences' },
      { to: '/app/monitor',  icon: 'monitor',  label: ['Surveillance', 'Monitoring', 'Supervisión'],
        roles: ['admin', 'censeur'], badge: true },
    ],
  },
  {
    id: 'finances',
    label: ['Finances', 'Finance', 'Finanzas'],
    icon: 'fees',
    items: [
      { to: '/app/fees', icon: 'fees', label: ['Frais scolaires', 'School Fees', 'Tasas escolares'],
        roles: ['admin', 'censeur'], feature: 'hasFees' },
    ],
  },
  {
    id: 'personnel',
    label: ['Personnel', 'Staff', 'Personal'],
    icon: 'teachers',
    items: [
      { to: '/app/teachers',  icon: 'teachers', label: ['Enseignants', 'Teachers', 'Profesores'],
        roles: ['admin'], feature: 'hasTeachers' },
      { to: '/app/personnel', icon: 'students', label: ['Personnel & rôles', 'Staff & roles', 'Personal y roles'],
        roles: ['admin'], feature: 'hasTeachers' },
    ],
  },
  {
    id: 'rapports',
    label: ['Rapports', 'Reports', 'Informes'],
    icon: 'reports',
    items: [
      { to: '/app/reports', icon: 'reports', label: ['Rapports', 'Reports', 'Informes'],
        roles: ['admin', 'censeur'], mobilePrimary: true },
    ],
  },
  {
    id: 'administration',
    label: ['Administration', 'Administration', 'Administración'],
    icon: 'settings',
    items: [
      { to: '/app/settings',   icon: 'settings', label: ['Paramètres', 'Settings', 'Ajustes'],
        roles: ALL },
      { to: '/app/year',       icon: 'year',     label: ['Année scolaire', 'Academic Year', 'Año escolar'],
        roles: ['admin'] },
      { to: '/app/historique', icon: 'history',  label: ['Historique', 'History', 'Historial'],
        roles: ['admin'] },
      { to: '/app/aide',       icon: 'help',     label: ['Guide / Aide', 'Help guide', 'Ayuda'],
        roles: ALL },
    ],
  },
];

// ── Helpers de filtrage ──────────────────────────────────────────────────────
// Un item est visible si le rôle est autorisé. Le flag `feature` n'enlève PAS
// l'item : il le marque `locked` (verrou affiché, comme l'ancienne sidebar) afin
// d'inciter à la montée de plan.

function visibleForRole(item, role) {
  return item.roles.includes(role);
}

/**
 * Groupes filtrés pour un rôle donné. Chaque item reçoit `locked` calculé.
 * @param {string} role
 * @param {object} f  features de plan (usePlan().f)
 */
export function getNavGroups(role, f = {}) {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items
        .filter((it) => visibleForRole(it, role))
        .map((it) => ({ ...it, locked: it.feature ? !f[it.feature] : false })),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Destinations primaires de la bottom-nav mobile (max 4) + entrée « Plus ».
 * On prend les items `mobilePrimary` visibles ; on complète si le rôle en a
 * moins de 4 (ex. teacher) avec ses premiers items disponibles.
 */
export function getMobilePrimary(role, f = {}, max = 4) {
  const groups = getNavGroups(role, f);
  const flat = groups.flatMap((g) => g.items);
  const primary = flat.filter((it) => it.mobilePrimary);
  const result = [...primary];
  if (result.length < max) {
    for (const it of flat) {
      if (result.length >= max) break;
      if (!result.some((r) => r.to === it.to)) result.push(it);
    }
  }
  return result.slice(0, max);
}
