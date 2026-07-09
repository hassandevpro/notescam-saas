// Présentation partagée du module Budgets (libellés i18n + styles de statut).
// Séparé du moteur pur (lib/budgetEngine.js) : ici uniquement de l'affichage.

// Libellés i18n (fr, en, es) — à passer à t(...triple).
export const PERIOD_TYPE_LABELS = {
  annuel:      ['Annuel', 'Annual', 'Anual'],
  trimestriel: ['Trimestriel', 'Quarterly', 'Trimestral'],
  mensuel:     ['Mensuel', 'Monthly', 'Mensual'],
};

export const SECTOR_LABELS = {
  general:        ['Général', 'General', 'General'],
  maternelle:     ['Maternelle', 'Kindergarten', 'Preescolar'],
  primaire:       ['Primaire', 'Primary', 'Primaria'],
  college:        ['Collège', 'Middle school', 'Secundaria'],
  lycee:          ['Lycée', 'High school', 'Bachillerato'],
  administration: ['Administration', 'Administration', 'Administración'],
  transport:      ['Transport', 'Transport', 'Transporte'],
  maintenance:    ['Maintenance', 'Maintenance', 'Mantenimiento'],
  informatique:   ['Informatique', 'IT', 'Informática'],
  cantine:        ['Cantine', 'Canteen', 'Comedor'],
  internat:       ['Internat', 'Boarding', 'Internado'],
};

export const KIND_LABELS = {
  recette: ['Recette', 'Revenue', 'Ingreso'],
  depense: ['Dépense', 'Expense', 'Gasto'],
};

// Statut : libellé + classes de badge.
export const STATUS_UI = {
  draft:  { label: ['Brouillon', 'Draft', 'Borrador'],  color: 'bg-gray-100 text-gray-600' },
  active: { label: ['Actif', 'Active', 'Activo'],        color: 'bg-emerald-100 text-emerald-700' },
  closed: { label: ['Clôturé', 'Closed', 'Cerrado'],     color: 'bg-slate-200 text-slate-700' },
};

// Libellé complet de période, ex. « Trimestriel · T2 » / « Mensuel · Mois 09 ».
export function periodLabel(t, budget) {
  const base = t(...(PERIOD_TYPE_LABELS[budget?.period_type] || PERIOD_TYPE_LABELS.annuel));
  if (budget?.period_type === 'trimestriel' && budget?.period_ref) {
    return `${base} · ${t('T', 'Q', 'T')}${budget.period_ref}`;
  }
  if (budget?.period_type === 'mensuel' && budget?.period_ref) {
    return `${base} · ${t('Mois', 'Month', 'Mes')} ${String(budget.period_ref).padStart(2, '0')}`;
  }
  return base;
}
