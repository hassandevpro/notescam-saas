// Petits helpers d'affichage partagés par les composants de frais.
import { FEE_STATUS, PAYMENT_MODES } from '../../lib/feeEngine';

export function fmt(n) {
  if (n == null || n === 0) return '0';
  return Number(n).toLocaleString('fr-FR');
}

// Statut global d'un élève → libellé court + pastille colorée.
export const STATUS_UI = {
  [FEE_STATUS.PAID]:       { icon: '✓',  label: ['À jour', 'Up to date', 'Al día'],          chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  [FEE_STATUS.UP_TO_DATE]: { icon: '✓',  label: ['À jour', 'Up to date', 'Al día'],          chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  [FEE_STATUS.DUE_SOON]:   { icon: '🟡', label: ['Échéance proche', 'Due soon', 'Próximo'],   chip: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
  [FEE_STATUS.LATE]:       { icon: '🔴', label: ['En retard', 'Overdue', 'Atrasado'],         chip: 'bg-red-100 text-red-600',         dot: 'bg-red-500' },
  [FEE_STATUS.NONE]:       { icon: '—',  label: ['Non défini', 'Not set', 'No definido'],     chip: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-300' },
};

// Statut d'une tranche → pastille + texte.
export const TRANCHE_UI = {
  covered:  { dot: 'bg-emerald-500', text: 'text-emerald-700', label: ['Payée', 'Paid', 'Pagada'] },
  partial:  { dot: 'bg-amber-400',   text: 'text-amber-700',   label: ['Partielle', 'Partial', 'Parcial'] },
  upcoming: { dot: 'bg-gray-300',    text: 'text-gray-500',    label: ['À venir', 'Upcoming', 'Próxima'] },
  overdue:  { dot: 'bg-red-500',     text: 'text-red-600',     label: ['En retard', 'Overdue', 'Atrasada'] },
};

export const MODE_LABEL = {
  [PAYMENT_MODES.COMPTANT]:  ['Comptant', 'Lump sum', 'Al contado'],
  [PAYMENT_MODES.ECHELONNE]: ['Échelonné', 'Installments', 'A plazos'],
  [PAYMENT_MODES.LIBRE]:     ['Libre', 'Free', 'Libre'],
};
