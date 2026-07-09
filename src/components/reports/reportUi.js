// Libellés i18n + styles du module Reports (Signalements).
export const CATEGORY_LABELS = {
  academique:   ['Académique', 'Academic', 'Académico'],
  vie_scolaire: ['Vie scolaire', 'School life', 'Vida escolar'],
  rh:           ['Ressources humaines', 'HR', 'RRHH'],
  finances:     ['Finances', 'Finance', 'Finanzas'],
  maintenance:  ['Maintenance', 'Maintenance', 'Mantenimiento'],
  patrimoine:   ['Patrimoine', 'Assets', 'Patrimonio'],
  autre:        ['Autre', 'Other', 'Otro'],
};

export const SEVERITY_UI = {
  low:      { label: ['Faible', 'Low', 'Baja'],       color: 'bg-gray-100 text-gray-600' },
  normal:   { label: ['Moyenne', 'Medium', 'Media'],  color: 'bg-blue-100 text-blue-700' },
  high:     { label: ['Élevée', 'High', 'Alta'],      color: 'bg-amber-100 text-amber-700' },
  critical: { label: ['Critique', 'Critical', 'Crítica'], color: 'bg-rose-100 text-rose-700' },
};

export const STATUS_UI = {
  new:         { label: ['Nouveau', 'New', 'Nuevo'],              color: 'bg-gray-100 text-gray-600' },
  triaged:     { label: ['Qualifié', 'Triaged', 'Calificado'],    color: 'bg-indigo-100 text-indigo-700' },
  assigned:    { label: ['Affecté', 'Assigned', 'Asignado'],      color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: ['En cours', 'In progress', 'En curso'],  color: 'bg-amber-100 text-amber-700' },
  resolved:    { label: ['Résolu', 'Resolved', 'Resuelto'],       color: 'bg-emerald-100 text-emerald-700' },
  closed:      { label: ['Clôturé', 'Closed', 'Cerrado'],         color: 'bg-slate-200 text-slate-700' },
  rejected:    { label: ['Rejeté', 'Rejected', 'Rechazado'],      color: 'bg-rose-100 text-rose-600' },
};

// Libellés des actions d'historique.
export const HISTORY_ACTION_LABELS = {
  created:        ['Création', 'Created', 'Creación'],
  assigned:       ['Affectation', 'Assigned', 'Asignación'],
  status_changed: ['Changement de statut', 'Status change', 'Cambio de estado'],
  reassigned:     ['Réaffectation', 'Reassigned', 'Reasignación'],
  commented:      ['Commentaire', 'Comment', 'Comentario'],
};
