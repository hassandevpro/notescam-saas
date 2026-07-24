// Présentation partagée du module Budgets (libellés i18n + styles de statut).
// Séparé du moteur pur (lib/budgetEngine.js) : ici uniquement de l'affichage.

// (E7) PERIOD_TYPE_LABELS + TIER_LABELS + periodLabel() retirés : libellés du modèle
// period_type/tier legacy, plus aucun importeur (remplacés par le modèle v3 :
// périodes budgétaires dédiées + SCOPE_UI/ANNUAL_STATUS_UI).

// Libellés i18n (fr, en, es) — à passer à t(...triple).
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

// Libellé i18n d'une section pédagogique (school_units.section_key).
export const UNIT_SECTION_LABELS = {
  maternelle:    ['Maternelle', 'Kindergarten', 'Preescolar'],
  primaire:      ['Primaire', 'Primary', 'Primaria'],
  premier_cycle: ['Premier cycle', 'Middle school', 'Primer ciclo'],
  second_cycle:  ['Second cycle', 'High school', 'Segundo ciclo'],
  autre:         ['Autre', 'Other', 'Otro'],
};

// Statut : libellé + classes de badge.
export const STATUS_UI = {
  draft:  { label: ['Brouillon', 'Draft', 'Borrador'],  color: 'bg-gray-100 text-gray-600' },
  active: { label: ['Actif', 'Active', 'Activo'],        color: 'bg-emerald-100 text-emerald-700' },
  closed: { label: ['Clôturé', 'Closed', 'Cerrado'],     color: 'bg-slate-200 text-slate-700' },
};

// Portée d'une LIGNE budgétaire (modèle CIBLE v3).
export const SCOPE_UI = {
  complex: { label: ['Tout le complexe', 'Whole complex', 'Todo el complejo'], color: 'bg-indigo-50 text-indigo-700' },
  sectors: { label: ['Secteurs choisis', 'Selected sectors', 'Sectores elegidos'], color: 'bg-violet-50 text-violet-700' },
};

// Statut DÉRIVÉ du budget annuel (calculé depuis ses lignes — budgetLinesEngine).
export const ANNUAL_STATUS_UI = {
  draft:   { label: ['Brouillon', 'Draft', 'Borrador'], color: 'bg-gray-100 text-gray-600' },
  partial: { label: ['Partiellement actif', 'Partially active', 'Parcialmente activo'], color: 'bg-amber-100 text-amber-700' },
  active:  { label: ['Actif', 'Active', 'Activo'], color: 'bg-emerald-100 text-emerald-700' },
  closed:  { label: ['Clôturé', 'Closed', 'Cerrado'], color: 'bg-slate-200 text-slate-700' },
};

// Libellé i18n des codes d'anomalie de configuration d'une ligne (budgetLinesEngine).
export const LINE_ERROR_LABELS = {
  amount_missing:        ['Montant annuel non défini', 'Annual amount not set', 'Monto anual sin definir'],
  period_alloc_missing:  ['Aucune répartition par période', 'No period breakdown', 'Sin reparto por período'],
  period_pct_not_100:    ['Σ % des périodes ≠ 100', 'Periods Σ% ≠ 100', 'Σ% períodos ≠ 100'],
  period_pct_negative:   ['Pourcentage de période négatif', 'Negative period %', '% de período negativo'],
  sector_alloc_missing:  ['Aucun secteur choisi', 'No sector selected', 'Sin sector elegido'],
  sector_pct_not_100:    ['Σ % des secteurs ≠ 100', 'Sectors Σ% ≠ 100', 'Σ% sectores ≠ 100'],
  sector_pct_negative:   ['Pourcentage de secteur négatif', 'Negative sector %', '% de sector negativo'],
  sector_alloc_on_complex: ['Secteurs sur une ligne « tout le complexe »', 'Sectors on a complex-wide line', 'Sectores en línea global'],
  annual_cap_exceeded:   ['Dépasse le budget annuel', 'Exceeds annual budget', 'Supera el presupuesto anual'],
};
