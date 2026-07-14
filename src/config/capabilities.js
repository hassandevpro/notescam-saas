// CAPACITÉS d'un compte délégué = ensemble de PAGES autorisées (clé = route).
// « Ce que la personne peut faire » se choisit à la création du compte.
//
// Modèle : un compte délégué porte `permissions` = liste de chemins autorisés.
//   • permissions null/absent  -> compte historique : accès par RÔLE (inchangé) ;
//   • permissions = [chemins]   -> accès EXACTEMENT à ces pages (le rôle de base
//     censeur/surveillant ne sert plus que de conteneur pour l'auth).
// Enforcement : navigation (Sidebar) + ProtectedRoute. Toujours autorisés :
// accueil, profil, aide.

export const ALWAYS_ALLOWED = ['/app', '/app/profile', '/app/aide'];

// Catalogue groupé par module (label i18n + capacités).
export const CAP_GROUPS = [
  { module: ['Scolarité', 'Academics', 'Escolaridad'], caps: [
    { to: '/app/classes', label: ['Classes', 'Classes', 'Clases'] },
    { to: '/app/students', label: ['Élèves', 'Students', 'Alumnos'] },
    { to: '/app/timetable', label: ['Emploi du temps', 'Timetable', 'Horario'] },
  ] },
  { module: ['Évaluations', 'Assessment', 'Evaluación'], caps: [
    { to: '/app/grades', label: ['Notes', 'Grades', 'Notas'] },
    { to: '/app/bulletins', label: ['Bulletins', 'Report cards', 'Boletines'] },
    { to: '/app/releves', label: ['Documents / relevés', 'Documents', 'Documentos'] },
    { to: '/app/conseil', label: ['Conseil de classe', 'Class council', 'Junta'] },
    { to: '/app/palmares', label: ["Tableaux d'honneur", 'Honour rolls', 'Cuadros'] },
  ] },
  { module: ['Vie scolaire', 'School life', 'Vida escolar'], caps: [
    { to: '/app/vie-scolaire', label: ['Tableau vie scolaire', 'School-life board', 'Panel'] },
    { to: '/app/absences', label: ['Absences', 'Attendance', 'Ausencias'] },
    { to: '/app/retards', label: ['Retards', 'Late arrivals', 'Retrasos'] },
    { to: '/app/incidents', label: ['Incidents', 'Incidents', 'Incidentes'] },
    { to: '/app/sanctions', label: ['Sanctions', 'Sanctions', 'Sanciones'] },
    { to: '/app/convocations', label: ['Convocations', 'Summons', 'Citaciones'] },
    { to: '/app/sorties', label: ['Autorisations de sortie', 'Exit permissions', 'Permisos'] },
    { to: '/app/conseil-discipline', label: ['Conseil de discipline', 'Discipline board', 'Consejo'] },
  ] },
  { module: ['Finances', 'Finance', 'Finanzas'], caps: [
    { to: '/app/fees', label: ['Frais scolaires', 'School fees', 'Tasas'] },
    { to: '/app/frais-catalogue', label: ['Catalogue des frais', 'Fee catalog', 'Catálogo'] },
    { to: '/app/budgets', label: ['Budgets', 'Budgets', 'Presupuestos'] },
    { to: '/app/budget-global', label: ['Budget global & prévisions', 'Global budget', 'Global'] },
    { to: '/app/depenses', label: ['Dépenses', 'Expenses', 'Gastos'] },
  ] },
  { module: ['Personnel & RH', 'Staff & HR', 'Personal y RRHH'], caps: [
    { to: '/app/teachers', label: ['Enseignants', 'Teachers', 'Profesores'] },
    { to: '/app/personnel', label: ['Personnel & rôles', 'Staff & roles', 'Personal'] },
    { to: '/app/rh', label: ['Ressources Humaines', 'HR', 'RRHH'] },
  ] },
  { module: ['Patrimoine & signalements', 'Assets & reports', 'Patrimonio'], caps: [
    { to: '/app/immobilisations', label: ['Immobilisations', 'Fixed assets', 'Inmovilizado'] },
    { to: '/app/signalements', label: ['Signalements', 'Reports', 'Reportes'] },
    { to: '/app/notifications', label: ['Notifications', 'Notifications', 'Notificaciones'] },
  ] },
  { module: ['Analyses & pilotage', 'Analytics', 'Análisis'], caps: [
    { to: '/app/reports', label: ['Rapports', 'Reports', 'Informes'] },
    { to: '/app/groupe', label: ['Tableau de bord du groupe', 'Group dashboard', 'Panel grupo'] },
    { to: '/app/monitor', label: ['Surveillance profs', 'Teacher monitoring', 'Supervisión'] },
    { to: '/app/historique', label: ['Historique / audit', 'History / audit', 'Historial'] },
  ] },
  { module: ['Administration', 'Administration', 'Administración'], caps: [
    { to: '/app/year', label: ['Année scolaire', 'School year', 'Año escolar'] },
    { to: '/app/settings', label: ['Paramètres', 'Settings', 'Ajustes'] },
  ] },
];

export const ALL_CAPS = CAP_GROUPS.flatMap((g) => g.caps.map((c) => c.to));
const capsIn = (...groupNames) => CAP_GROUPS.filter((g) => groupNames.includes(g.module[0])).flatMap((g) => g.caps.map((c) => c.to));

// PROFILS (presets) : rôle de base (auth) + capacités par défaut, ÉDITABLES.
export const ACCESS_PRESETS = [
  { key: 'censeur', role: 'censeur', label: ['Censeur (pédagogie + frais)', 'Dean', 'Jefe de estudios'],
    caps: [...capsIn('Scolarité', 'Évaluations'), '/app/fees', '/app/conseil'] },
  { key: 'surveillant', role: 'surveillant', label: ['Surveillant (discipline)', 'Supervisor', 'Jefe de disciplina'],
    caps: [...capsIn('Vie scolaire'), '/app/students'] },
  { key: 'comptable', role: 'censeur', label: ['Comptable / caissier', 'Accountant / cashier', 'Contable'],
    caps: ['/app/fees', '/app/frais-catalogue'] },
  { key: 'raf', role: 'censeur', label: ['RAF (finances)', 'Finance manager', 'Responsable financiero'],
    caps: capsIn('Finances') },
  { key: 'secretaire', role: 'censeur', label: ['Secrétaire', 'Secretary', 'Secretaria'],
    caps: ['/app/students', '/app/classes', '/app/releves'] },
  { key: 'rh', role: 'censeur', label: ['Responsable RH', 'HR manager', 'Responsable RRHH'],
    caps: capsIn('Personnel & RH') },
  { key: 'informatique', role: 'censeur', label: ['Responsable informatique', 'IT manager', 'Informática'],
    caps: ['/app/immobilisations', '/app/signalements', '/app/notifications'] },
  { key: 'directeur_unite', role: 'censeur', label: ["Directeur d'unité", 'Unit director', 'Director de unidad'],
    caps: [...capsIn('Scolarité', 'Évaluations', 'Vie scolaire')] },
  { key: 'direction_generale', role: 'censeur', label: ['Direction générale (lecture)', 'General direction', 'Dirección general'],
    caps: [...capsIn('Finances', 'Analyses & pilotage'), '/app/rh'] },
  { key: 'personnalise', role: 'censeur', label: ['Personnalisé…', 'Custom…', 'Personalizado…'], caps: [] },
];

export function presetByKey(key) { return ACCESS_PRESETS.find((p) => p.key === key) || ACCESS_PRESETS[0]; }

// Un chemin est-il autorisé par une liste de permissions ? (gère /app/x/:id)
export function isPathPermitted(pathname, permissions) {
  if (!permissions || !permissions.length) return true;              // pas de restriction
  if (ALWAYS_ALLOWED.includes(pathname)) return true;                // accueil/profil/aide (exact)
  // Préfixe uniquement pour les permissions réelles (gère /app/students/:id).
  return permissions.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Première page autorisée (cible de repli à la connexion).
export function firstPermitted(permissions) {
  return (permissions && permissions[0]) || '/app';
}
