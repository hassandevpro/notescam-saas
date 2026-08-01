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
import { isPathPermitted } from './capabilities';
import { effectivePages } from '../governance/governanceEngine';
import { catalogOrDefault } from '../governance/defaultCatalog';

export const ROLES = {
  ADMIN: 'admin',
  CENSEUR: 'censeur',
  SURVEILLANT: 'surveillant',
  TEACHER: 'teacher',
};

const ALL = ['admin', 'censeur', 'surveillant', 'teacher'];
// Périmètre « vie scolaire / discipline » : direction + surveillant (jamais prof).
const DISCIPLINE = ['admin', 'censeur', 'surveillant'];

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
      { to: '/app/vie-scolaire', icon: 'monitor', label: ['Tableau Vie scolaire', 'School-life board', 'Panel de vida escolar'],
        roles: DISCIPLINE, mobilePrimary: true },
      { to: '/app/absences', icon: 'absences', label: ['Absences', 'Attendance', 'Ausencias'],
        roles: ALL, feature: 'hasAbsences' },
      { to: '/app/retards',  icon: 'timetable', label: ['Retards', 'Late arrivals', 'Retrasos'],
        roles: DISCIPLINE },
      { to: '/app/incidents', icon: 'history', label: ['Incidents', 'Incidents', 'Incidentes'],
        roles: DISCIPLINE },
      { to: '/app/sanctions', icon: 'conseil', label: ['Sanctions', 'Sanctions', 'Sanciones'],
        roles: DISCIPLINE },
      { to: '/app/convocations', icon: 'transcript', label: ['Convocations', 'Summons', 'Citaciones'],
        roles: DISCIPLINE },
      { to: '/app/sorties', icon: 'students', label: ['Autorisations de sortie', 'Exit permissions', 'Permisos de salida'],
        roles: DISCIPLINE },
      { to: '/app/conseil-discipline', icon: 'conseil', label: ['Conseil de discipline', 'Discipline board', 'Consejo de disciplina'],
        roles: DISCIPLINE },
      { to: '/app/monitor',  icon: 'monitor',  label: ['Surveillance profs', 'Teacher monitoring', 'Supervisión docentes'],
        roles: ['admin', 'censeur'], badge: true },
      { to: '/app/signalements', icon: 'history', label: ['Signalements', 'Reports', 'Reportes'],
        roles: ALL },
      { to: '/app/notifications', icon: 'monitor', label: ['Notifications', 'Notifications', 'Notificaciones'],
        roles: ALL },
    ],
  },
  {
    id: 'finances',
    label: ['Finances', 'Finance', 'Finanzas'],
    icon: 'fees',
    items: [
      { to: '/app/fees', icon: 'fees', label: ['Frais scolaires', 'School Fees', 'Tasas escolares'],
        roles: ['admin', 'censeur'], feature: 'hasFees' },
      // Catalogue des frais : désormais un onglet DANS « Frais scolaires » (près
      // des Grilles tarifaires), plus une entrée de menu autonome. Route
      // /app/frais-catalogue conservée (liens profonds).
      { to: '/app/budgets', icon: 'reports', label: ['Budgets', 'Budgets', 'Presupuestos'],
        roles: ['admin'], budgetAccess: true },
      { to: '/app/budget-global', icon: 'reports', label: ['Budget global & prévisions', 'Global budget & forecast', 'Presupuesto global'],
        roles: ['admin'], budgetAccess: true },
      { to: '/app/depenses', icon: 'fees', label: ['Dépenses', 'Expenses', 'Gastos'],
        roles: ['admin'], budgetAccess: true },
      // Gouvernance financière distante (H3-b) : décisions à approuver depuis le Cloud.
      { to: '/app/approbations', icon: 'conseil', label: ['Décisions à approuver', 'Decisions to approve', 'Decisiones por aprobar'],
        roles: ['admin', 'censeur'] },
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
      { to: '/app/rh', icon: 'teachers', label: ['Ressources Humaines', 'Human Resources', 'Recursos Humanos'],
        roles: ['admin'] },
      { to: '/app/immobilisations', icon: 'settings', label: ['Immobilisations', 'Fixed assets', 'Inmovilizado'],
        roles: ['admin'] },
      // Seed Data — visible UNIQUEMENT en développement (retiré du bundle en prod).
      ...(import.meta.env.DEV ? [{ to: '/app/seed-data', icon: 'settings', label: ['Données de démo (DEV)', 'Seed Data (DEV)', 'Datos demo (DEV)'], roles: ['admin'] }] : []),
    ],
  },
  {
    id: 'rapports',
    label: ['Rapports', 'Reports', 'Informes'],
    icon: 'reports',
    items: [
      { to: '/app/reports', icon: 'reports', label: ['Rapports', 'Reports', 'Informes'],
        roles: ['admin', 'censeur'], mobilePrimary: true },
      { to: '/app/groupe', icon: 'home', label: ['Tableau de bord du groupe', 'Group dashboard', 'Panel del grupo'],
        roles: ['admin'] },
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
export function getNavGroups(role, f = {}, permissions = null, gov = {}) {
  // Compte délégué : la navigation reflète EXACTEMENT ses capacités (les
  // permissions font autorité, le rôle de base n'entre plus en jeu).
  const delegated = permissions && permissions.length;
  // Pages ouvertes par les rôles de GOUVERNANCE (dérivées du catalogue, dates +
  // statut appliqués). Additif : passe outre `roles`/permissions pour ces pages.
  const govPages = effectivePages(role, catalogOrDefault(gov.catalog), gov.assignments || []);
  const visible = (it) => {
    if (govPages.has(it.to)) return true;
    return delegated ? isPathPermitted(it.to, permissions) : visibleForRole(it, role);
  };
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items
        .filter(visible)
        .map((it) => ({ ...it, locked: it.feature ? !f[it.feature] : false })),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Destinations primaires de la bottom-nav mobile (max 4) + entrée « Plus ».
 * On prend les items `mobilePrimary` visibles ; on complète si le rôle en a
 * moins de 4 (ex. teacher) avec ses premiers items disponibles.
 */
export function getMobilePrimary(role, f = {}, max = 4, permissions = null, gov = {}) {
  const groups = getNavGroups(role, f, permissions, gov);
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
