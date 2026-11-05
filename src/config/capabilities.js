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
    // Registre des services : l'entrée EXISTE au menu (navigation.js, rôles
    // admin/censeur) mais n'était pas DÉLÉGABLE — absente de ce catalogue, aucun
    // compte à capacités ne pouvait la porter, pas même le profil RAF (= toutes
    // les Finances). Le RAF ne la voyait donc pas, là où un compte NON délégué
    // (la caisse, rôle censeur) la voit par son rôle de base.
    { to: '/app/cantine', label: ['Registre des services', 'Service register', 'Registro de servicios'] },
    { to: '/app/budgets', label: ['Budgets', 'Budgets', 'Presupuestos'] },
    { to: '/app/budget-global', label: ['Budget global & prévisions', 'Global budget', 'Global'] },
    { to: '/app/depenses', label: ['Dépenses', 'Expenses', 'Gastos'] },
    { to: '/app/caisse', label: ['Journal de caisse', 'Cash book', 'Libro de caja'] },
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
    { to: '/app/synchronisation', label: ['Synchronisation', 'Synchronization', 'Sincronización'] },
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

// CAPACITÉS IMPLICITES — réparation des comptes DÉJÀ créés.
//
// Une page absente du catalogue ne pouvait figurer dans AUCUNE liste enregistrée :
// la case n'existait pas à l'écran. Pour ces pages-là, une liste qui ne les
// mentionne pas ne veut donc pas dire « refusé » — elle veut dire « jamais
// proposé ». Les ajouter au catalogue (ci-dessus) ne suffit pas : cela ne touche
// que les comptes à venir, et obligerait l'école à rouvrir chaque compte pour
// cocher une case. D'où cette table : la page est ouverte au compte qui porte
// déjà une page de la MÊME FAMILLE.
//
// `/app/cantine` (Registre des services) est le suivi mois par mois d'un service
// facturé : même argent, mêmes élèves, mêmes montants que « Frais scolaires » et
// le catalogue des frais (c'est la famille FEE_PAGES de core/strictMatrix.js). Un
// compte qui tient les frais ne découvre donc rien ici. À l'inverse, porter un
// BUDGET (/app/budgets, /app/depenses) n'ouvre pas le registre : un chef de
// secteur n'a pas à voir qui paie sa cantine.
//
// Ce n'est pas une porte dérobée dans une école DURCIE : `strictAllowsPage` est
// évaluée AVANT (navigation comme ProtectedRoute) et exige une autorité
// financière que cette table ne donne pas.
const CAPS_IMPLICITES = {
  '/app/cantine': ['/app/fees', '/app/frais-catalogue'],
};

function capaciteImplicite(pathname, permissions) {
  for (const [page, sources] of Object.entries(CAPS_IMPLICITES)) {
    if (pathname !== page && !pathname.startsWith(page + '/')) continue;
    return sources.some((s) => permissions.includes(s));
  }
  return false;
}

// Un chemin est-il autorisé par une liste de permissions ? (gère /app/x/:id)
export function isPathPermitted(pathname, permissions) {
  if (!permissions || !permissions.length) return true;              // pas de restriction
  if (ALWAYS_ALLOWED.includes(pathname)) return true;                // accueil/profil/aide (exact)
  // Préfixe uniquement pour les permissions réelles (gère /app/students/:id).
  if (permissions.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
  return capaciteImplicite(pathname, permissions);
}

// Première page autorisée (cible de repli à la connexion).
export function firstPermitted(permissions) {
  return (permissions && permissions[0]) || '/app';
}

// Le compte DÉLÉGUÉ porte-t-il explicitement cette capacité ? Sert aux pages qui
// distinguent consultation et ÉCRITURE (inscrire un élève, gérer les enseignants) :
// la page accordée EST le droit d'y travailler, sinon on n'aurait donné qu'une
// vitrine. Renvoie false pour un compte non délégué — son rôle décide, comme avant.
export function hasCapability(permissions, path) {
  return Array.isArray(permissions) && permissions.includes(path);
}

// L'école a-t-elle activé la DÉLÉGATION AVANCÉE (schools.advanced_delegation) ?
// Tolère les trois formes rencontrées : booléen Postgres (cloud), entier 0/1
// (SQLite en édition LAN, qui n'a pas de type booléen) et son rendu texte.
export function isAdvancedDelegation(school) {
  const v = school?.advanced_delegation;
  return v === true || v === 1 || v === '1';
}
