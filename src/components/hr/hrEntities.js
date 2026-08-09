// Description DÉCLARATIVE des entités RH : champs + colonnes de tableau + options.
// Un modal et un tableau GÉNÉRIQUES (schema-driven) évitent 5 UIs dupliquées.
// Libellés en triplets i18n (fr, en, es) -> résolus par t(...triplet).
import {
  HR_CONTRACT_TYPES, HR_CONTRACT_STATUSES, HR_LEAVE_TYPES, HR_LEAVE_STATUSES,
  HR_ATTENDANCE_STATUSES, HR_CAREER_TYPES, HR_EVAL_STATUSES, HR_PAYROLL_STATUSES,
} from '../../lib/hrEngine';

// Libellés des valeurs d'énumération.
export const OPTION_LABELS = {
  // contrats
  cdi: ['CDI', 'Permanent', 'Indefinido'], cdd: ['CDD', 'Fixed-term', 'Temporal'],
  stage: ['Stage', 'Internship', 'Prácticas'], vacation: ['Vacation', 'Hourly', 'Por horas'],
  prestation: ['Prestation', 'Service', 'Prestación'],
  active: ['Actif', 'Active', 'Activo'], suspended: ['Suspendu', 'Suspended', 'Suspendido'],
  ended: ['Terminé', 'Ended', 'Terminado'],
  // congés
  annuel: ['Annuel', 'Annual', 'Anual'], maladie: ['Maladie', 'Sick', 'Enfermedad'],
  maternite: ['Maternité', 'Maternity', 'Maternidad'], paternite: ['Paternité', 'Paternity', 'Paternidad'],
  exceptionnel: ['Exceptionnel', 'Special', 'Especial'], sans_solde: ['Sans solde', 'Unpaid', 'Sin sueldo'],
  pending: ['En attente', 'Pending', 'Pendiente'], approved: ['Approuvé', 'Approved', 'Aprobado'],
  refused: ['Refusé', 'Refused', 'Rechazado'],
  // présences
  present: ['Présent', 'Present', 'Presente'], absent: ['Absent', 'Absent', 'Ausente'],
  retard: ['Retard', 'Late', 'Retraso'], conge: ['Congé', 'On leave', 'De permiso'],
  mission: ['Mission', 'On mission', 'En misión'],
  // carrière
  recrutement: ['Recrutement', 'Hiring', 'Contratación'], promotion: ['Promotion', 'Promotion', 'Ascenso'],
  mutation: ['Mutation', 'Transfer', 'Traslado'], formation: ['Formation', 'Training', 'Formación'],
  sanction: ['Sanction', 'Sanction', 'Sanción'], distinction: ['Distinction', 'Award', 'Distinción'],
  changement_poste: ['Changement de poste', 'Role change', 'Cambio de puesto'], autre: ['Autre', 'Other', 'Otro'],
  // évaluations
  draft: ['Brouillon', 'Draft', 'Borrador'], final: ['Finale', 'Final', 'Final'],
  // paie
  paid: ['Payé', 'Paid', 'Pagado'],
};

const opts = (values) => values.map((v) => ({ value: v, label: OPTION_LABELS[v] || [v] }));

// Ordre des onglets = ordre demandé.
export const HR_TABS = [
  {
    key: 'contracts', label: ['Contrats', 'Contracts', 'Contratos'],
    fields: [
      { key: 'type', label: ['Type', 'Type', 'Tipo'], type: 'select', options: opts(HR_CONTRACT_TYPES) },
      { key: 'title', label: ['Poste', 'Position', 'Puesto'], type: 'text' },
      { key: 'reference', label: ['Référence', 'Reference', 'Referencia'], type: 'text' },
      { key: 'start_date', label: ['Début', 'Start', 'Inicio'], type: 'date' },
      { key: 'end_date', label: ['Fin', 'End', 'Fin'], type: 'date' },
      { key: 'salary', label: ['Salaire de référence (indicatif)', 'Reference salary (info)', 'Salario de referencia'], type: 'number' },
      { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(HR_CONTRACT_STATUSES) },
      { key: 'document', label: ['Document (lien)', 'Document (link)', 'Documento (enlace)'], type: 'text' },
      { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'textarea' },
    ],
    columns: ['type', 'title', 'start_date', 'end_date', 'status'],
  },
  {
    key: 'leaves', label: ['Congés', 'Leaves', 'Permisos'],
    fields: [
      { key: 'type', label: ['Type', 'Type', 'Tipo'], type: 'select', options: opts(HR_LEAVE_TYPES) },
      { key: 'start_date', label: ['Début', 'Start', 'Inicio'], type: 'date' },
      { key: 'end_date', label: ['Fin', 'End', 'Fin'], type: 'date' },
      { key: 'days', label: ['Jours', 'Days', 'Días'], type: 'number' },
      { key: 'reason', label: ['Motif', 'Reason', 'Motivo'], type: 'text' },
      { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(HR_LEAVE_STATUSES) },
      { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'textarea' },
    ],
    columns: ['type', 'start_date', 'end_date', 'days', 'status'],
  },
  {
    key: 'evaluations', label: ['Évaluations', 'Evaluations', 'Evaluaciones'],
    fields: [
      { key: 'eval_date', label: ['Date', 'Date', 'Fecha'], type: 'date' },
      { key: 'period', label: ['Période', 'Period', 'Período'], type: 'text' },
      { key: 'evaluator', label: ['Évaluateur', 'Evaluator', 'Evaluador'], type: 'text' },
      { key: 'score', label: ['Note /20', 'Score /20', 'Nota /20'], type: 'number' },
      { key: 'rating', label: ['Appréciation', 'Rating', 'Valoración'], type: 'text' },
      { key: 'strengths', label: ['Points forts', 'Strengths', 'Fortalezas'], type: 'textarea' },
      { key: 'improvements', label: ['Axes d’amélioration', 'Areas to improve', 'Áreas de mejora'], type: 'textarea' },
      { key: 'comments', label: ['Commentaires', 'Comments', 'Comentarios'], type: 'textarea' },
      { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(HR_EVAL_STATUSES) },
    ],
    columns: ['eval_date', 'period', 'evaluator', 'score', 'status'],
  },
  {
    key: 'attendance', label: ['Présences', 'Attendance', 'Asistencia'],
    fields: [
      { key: 'att_date', label: ['Date', 'Date', 'Fecha'], type: 'date' },
      { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(HR_ATTENDANCE_STATUSES) },
      { key: 'check_in', label: ['Arrivée', 'Check-in', 'Entrada'], type: 'time' },
      { key: 'check_out', label: ['Départ', 'Check-out', 'Salida'], type: 'time' },
      { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'text' },
    ],
    columns: ['att_date', 'status', 'check_in', 'check_out'],
  },
  {
    key: 'career', label: ['Historique professionnel', 'Career history', 'Historial profesional'],
    fields: [
      { key: 'event_date', label: ['Date', 'Date', 'Fecha'], type: 'date' },
      { key: 'type', label: ['Type', 'Type', 'Tipo'], type: 'select', options: opts(HR_CAREER_TYPES) },
      { key: 'title', label: ['Intitulé', 'Title', 'Título'], type: 'text' },
      { key: 'description', label: ['Description', 'Description', 'Descripción'], type: 'textarea' },
    ],
    columns: ['event_date', 'type', 'title'],
  },
  {
    key: 'payroll', label: ['Paie', 'Payroll', 'Nómina'],
    fields: [
      { key: 'period', label: ['Période', 'Period', 'Período'], type: 'month' },
      { key: 'base_salary', label: ['Salaire de base', 'Base salary', 'Salario base'], type: 'number' },
      { key: 'bonuses', label: ['Primes', 'Bonuses', 'Primas'], type: 'number' },
      { key: 'deductions', label: ['Retenues', 'Deductions', 'Retenciones'], type: 'number' },
      { key: 'net_salary', label: ['Net (calculé)', 'Net (computed)', 'Neto (calculado)'], type: 'number', readOnly: true },
      { key: 'status', label: ['Statut', 'Status', 'Estado'], type: 'select', options: opts(HR_PAYROLL_STATUSES) },
      { key: 'paid_date', label: ['Date de paiement', 'Payment date', 'Fecha de pago'], type: 'date' },
      { key: 'notes', label: ['Notes', 'Notes', 'Notas'], type: 'textarea' },
    ],
    columns: ['period', 'base_salary', 'net_salary', 'status', 'paid_date'],
  },
];

export const HR_TAB_BY_KEY = Object.fromEntries(HR_TABS.map((tb) => [tb.key, tb]));

// Types de champs numériques / dates -> pour sanitisation à l'enregistrement.
export function sanitizeRecord(fields, values) {
  const out = {};
  for (const f of fields) {
    if (f.readOnly) continue;                              // calculé côté page, jamais saisi
    let v = values[f.key];
    if (v === '' || v === undefined) v = null;            // '' -> null (Postgres date/int)
    else if (f.type === 'number' && v !== null) v = Number(v);
    out[f.key] = v;
  }
  return out;
}
