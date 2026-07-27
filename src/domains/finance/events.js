// Vocabulaire des DOMAIN EVENTS de la finance (PUR, testable en Node).
//
// H2 — la finance (Budget V3 + Dépenses) ÉMET désormais des événements décrivant
// ses faits accomplis, en OBSERVATION : le chemin d'écriture reste INCHANGÉ, les
// événements sont émis À CÔTÉ (best-effort). Ces types constituent le vocabulaire
// que H3 (approbation distante) et H3b (opérations budgétaires distantes)
// transformeront en COMMANDES vérifiables.
//
// Convention kernel : nom au passé « AggregatePastParticiple ».

export const AGGREGATE = Object.freeze({
  EXPENSE: 'expense',
  UNLOCK: 'budget_unlock',
  BUDGET_REVISION: 'budget_revision',
  BUDGET_REALLOCATION: 'budget_reallocation',
  BUDGET_LINE: 'budget_line',
});

export const EVT = Object.freeze({
  // ── Cycle de vie d'une dépense (cible du canal H3) ──────────────────────────
  EXPENSE_DRAFTED:   'ExpenseDrafted',
  EXPENSE_SUBMITTED: 'ExpenseSubmitted',
  EXPENSE_APPROVED:  'ExpenseApproved',
  EXPENSE_REJECTED:  'ExpenseRejected',
  EXPENSE_PAID:      'ExpensePaid',
  EXPENSE_CANCELLED: 'ExpenseCancelled',
  EXPENSE_DELETED:   'ExpenseDeleted',
  // ── Déblocage de ligne épuisée ──────────────────────────────────────────────
  UNLOCK_REQUESTED:  'BudgetUnlockRequested',
  UNLOCK_REFUSED:    'BudgetUnlockRefused',
  UNLOCK_AUTHORIZED: 'BudgetUnlockAuthorized',
  UNLOCK_INCREASED:  'BudgetUnlockIncreased',
  // ── Opérations budgétaires tracées (cible du canal H3b) ─────────────────────
  REVISION_REQUESTED:     'BudgetRevisionRequested',
  REVISION_APPLIED:       'BudgetRevisionApplied',
  REVISION_REJECTED:      'BudgetRevisionRejected',
  REALLOCATION_REQUESTED: 'BudgetReallocationRequested',
  REALLOCATION_APPLIED:   'BudgetReallocationApplied',
  REALLOCATION_REJECTED:  'BudgetReallocationRejected',
  // ── Gouvernance distante d'une dépense (H3-b) ───────────────────────────────
  REMOTE_APPROVAL_REQUESTED: 'ExpenseRemoteApprovalRequested', // LAN→Cloud : demande minimale
  APPROVAL_GRANTED:          'ExpenseApprovalGranted',          // Cloud→LAN : décision (approuver)
  APPROVAL_REFUSED:          'ExpenseApprovalRefused',          // Cloud→LAN : décision (refuser)
  DECISION_REJECTED:         'ExpenseDecisionRejected',         // LAN→Cloud : décision NON appliquée (conflit/permission)
});

// Événement de décision distante (Cloud→LAN) → action à appliquer côté LAN.
export const DECISION_EVENT_ACTION = Object.freeze({
  [EVT.APPROVAL_GRANTED]: 'approve',
  [EVT.APPROVAL_REFUSED]: 'refuse',
});

// Dépense : statut résultant → type d'événement.
export const EXPENSE_EVT_BY_STATUS = Object.freeze({
  draft:     EVT.EXPENSE_DRAFTED,
  submitted: EVT.EXPENSE_SUBMITTED,
  approved:  EVT.EXPENSE_APPROVED,
  rejected:  EVT.EXPENSE_REJECTED,
  paid:      EVT.EXPENSE_PAID,
  cancelled: EVT.EXPENSE_CANCELLED,
});

// Déblocage : décision → type d'événement.
export const UNLOCK_EVT_BY_DECISION = Object.freeze({
  refused:    EVT.UNLOCK_REFUSED,
  authorized: EVT.UNLOCK_AUTHORIZED,
  increased:  EVT.UNLOCK_INCREASED,
});

// Opération tracée (révision/réallocation) : décision → type d'événement.
export const REVISION_EVT_BY_DECISION = Object.freeze({
  applied:  EVT.REVISION_APPLIED,
  approved: EVT.REVISION_APPLIED,
  rejected: EVT.REVISION_REJECTED,
  refused:  EVT.REVISION_REJECTED,
});
export const REALLOCATION_EVT_BY_DECISION = Object.freeze({
  applied:  EVT.REALLOCATION_APPLIED,
  approved: EVT.REALLOCATION_APPLIED,
  rejected: EVT.REALLOCATION_REJECTED,
  refused:  EVT.REALLOCATION_REJECTED,
});

// Helper de mapping sûr (renvoie un fallback si le statut/décision est inconnu).
export function expenseEventType(status) {
  return EXPENSE_EVT_BY_STATUS[status] || EVT.EXPENSE_DRAFTED;
}
export function unlockEventType(decision) {
  return UNLOCK_EVT_BY_DECISION[decision] || null;
}
