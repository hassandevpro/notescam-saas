// Présentation partagée du module Dépenses (libellés i18n + styles de statut).
export const EXPENSE_STATUS_UI = {
  draft:     { label: ['Brouillon', 'Draft', 'Borrador'],   color: 'bg-gray-100 text-gray-600' },
  submitted: { label: ['Soumise', 'Submitted', 'Enviada'],  color: 'bg-amber-100 text-amber-700' },
  approved:  { label: ['Approuvée', 'Approved', 'Aprobada'], color: 'bg-blue-100 text-blue-700' },
  paid:      { label: ['Payée', 'Paid', 'Pagada'],           color: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: ['Rejetée', 'Rejected', 'Rechazada'],  color: 'bg-rose-100 text-rose-600' },
  cancelled: { label: ['Annulée', 'Cancelled', 'Anulada'],   color: 'bg-slate-200 text-slate-600' },
};

// Statuts d'une demande de déblocage.
export const UNLOCK_STATUS_UI = {
  pending:    { label: ['En attente', 'Pending', 'Pendiente'],           color: 'bg-amber-100 text-amber-700' },
  refused:    { label: ['Refusée', 'Refused', 'Rechazada'],              color: 'bg-rose-100 text-rose-600' },
  authorized: { label: ['Autorisée (except.)', 'Authorized (excep.)', 'Autorizada (excep.)'], color: 'bg-emerald-100 text-emerald-700' },
  increased:  { label: ['Budget augmenté', 'Budget increased', 'Presupuesto aumentado'], color: 'bg-blue-100 text-blue-700' },
};

// Libellé du bouton pour chaque transition de statut.
export const TRANSITION_LABEL = {
  submitted: ['Soumettre', 'Submit', 'Enviar'],
  approved:  ['Approuver', 'Approve', 'Aprobar'],
  paid:      ['Marquer payée', 'Mark paid', 'Marcar pagada'],
  rejected:  ['Rejeter', 'Reject', 'Rechazar'],
  draft:     ['Repasser en brouillon', 'Back to draft', 'Volver a borrador'],
};
