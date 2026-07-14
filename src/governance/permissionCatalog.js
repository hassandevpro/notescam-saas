// Métadonnées d'ÉDITION du catalogue de rôles (Phase 2). Listes libellées des
// permissions / workflows / dashboards / portées, consommées par l'éditeur de
// rôles. PUR (aucun rendu) → testable. Les CLÉS restent celles de GOV_PERM :
// l'éditeur ne fait que cocher/décocher, le moteur (governanceEngine) reste maître.

import { GOV_PERM as P } from './permissions.js';

// Permissions « de base » (consultation / préparation / soumission / demande).
export const PERMISSION_OPTIONS = [
  { key: P.VIEW,            label: ['Consulter la gouvernance', 'View governance', 'Ver gobernanza'] },
  { key: P.MANAGE,          label: ["Gérer l'organigramme", 'Manage org chart', 'Gestionar organigrama'] },
  { key: P.BUDGET_VIEW,     label: ['Consulter les budgets', 'View budgets', 'Ver presupuestos'] },
  { key: P.BUDGET_PREPARE,  label: ['Préparer un budget', 'Prepare a budget', 'Preparar presupuesto'] },
  { key: P.BUDGET_SUBMIT,   label: ['Soumettre un budget', 'Submit a budget', 'Enviar presupuesto'] },
  { key: P.EXPENSE_VIEW,    label: ['Consulter les dépenses', 'View expenses', 'Ver gastos'] },
  { key: P.EXPENSE_PREPARE, label: ['Créer une dépense', 'Create an expense', 'Crear gasto'] },
  { key: P.EXPENSE_SUBMIT,  label: ['Soumettre une dépense', 'Submit an expense', 'Enviar gasto'] },
  { key: P.UNLOCK_REQUEST,  label: ['Demander un déblocage', 'Request an unlock', 'Solicitar desbloqueo'] },
];

// Workflows de VALIDATION (approbation / clôture / décaissement / décision).
export const WORKFLOW_OPTIONS = [
  { key: P.BUDGET_VALIDATE_SECTOR,  label: ['Valider un budget (secteur)', 'Approve budget (sector)', 'Validar presupuesto (sector)'] },
  { key: P.BUDGET_VALIDATE_FINANCE, label: ['Valider un budget (finances)', 'Approve budget (finance)', 'Validar presupuesto (finanzas)'] },
  { key: P.BUDGET_APPROVE,          label: ['Approuver un budget', 'Approve a budget', 'Aprobar presupuesto'] },
  { key: P.BUDGET_CLOSE,            label: ['Clôturer un budget', 'Close a budget', 'Cerrar presupuesto'] },
  { key: P.BUDGET_REOPEN,           label: ['Rouvrir un budget', 'Reopen a budget', 'Reabrir presupuesto'] },
  { key: P.EXPENSE_APPROVE,         label: ['Approuver une dépense', 'Approve an expense', 'Aprobar gasto'] },
  { key: P.EXPENSE_REJECT,          label: ['Rejeter une dépense', 'Reject an expense', 'Rechazar gasto'] },
  { key: P.EXPENSE_PAY,             label: ['Décaisser (payer)', 'Disburse (pay)', 'Desembolsar (pagar)'] },
  { key: P.UNLOCK_DECIDE,           label: ['Décider un déblocage', 'Decide an unlock', 'Decidir desbloqueo'] },
];

// Dashboards associables à un rôle (ids consommés par les pages).
export const DASHBOARD_OPTIONS = [
  { key: 'group',         label: ['Tableau de bord du groupe', 'Group dashboard', 'Panel del grupo'] },
  { key: 'budget-global', label: ['Budget global & prévisions', 'Global budget', 'Presupuesto global'] },
];

export const SCOPE_OPTIONS = [
  { key: 'complex', label: ['Transverse (tout le complexe)', 'Complex-wide', 'Todo el complejo'] },
  { key: 'sector',  label: ['Secteur', 'Sector', 'Sector'] },
];

// Valide un brouillon de rôle (retourne un tableau de codes d'erreur, vide = OK).
// `existingCodes` : codes DÉJÀ pris dans l'école (hors le rôle en cours d'édition).
export function validateRoleDraft(draft = {}, { existingCodes = [] } = {}) {
  const errors = [];
  const code = String(draft.code || '').trim();
  const name = String(draft.name || '').trim();
  if (!/^[a-z][a-z0-9_]*$/.test(code)) errors.push('code');           // code machine : minuscules/chiffres/_
  if (!name) errors.push('name');
  if (!['complex', 'sector'].includes(draft.scope)) errors.push('scope');
  if (draft.scope === 'sector' && !String(draft.sector || '').trim()) errors.push('sector');
  if (code && existingCodes.includes(code)) errors.push('code_unique');
  return errors;
}
