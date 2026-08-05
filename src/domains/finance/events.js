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
  BUDGET: 'budget',                       // enveloppe budgétaire (cible du canal H3b-budget)
  BUDGET_REVISION: 'budget_revision',
  BUDGET_REALLOCATION: 'budget_reallocation',
  BUDGET_LINE: 'budget_line',
  // ── RECETTES (encaissement des frais scolaires) ─────────────────────────────
  FEE_PAYMENT: 'fee_payment',             // un versement encaissé (ou sa contre-passation)
  STUDENT_FEE: 'student_fee',             // le DÛ d'un élève
  FEE_GRID:    'class_fee_grid',          // le tarif d'une classe
  CASH_SESSION: 'cash_session',           // arrêté de caisse (espèces ↔ écritures)
});

export const EVT = Object.freeze({
  // ── RECETTES : tout mouvement d'argent ENTRANT est tracé ────────────────────
  // Ces quatre faits couvrent les gestes par lesquels on peut détourner une
  // recette : encaisser, annuler un encaissement, changer le dû d'un élève,
  // changer le tarif d'une classe. Aucun n'était journalisé avant.
  FEE_PAYMENT_RECORDED: 'FeePaymentRecorded',
  FEE_PAYMENT_REVERSED: 'FeePaymentReversed',  // contre-passation (jamais une suppression)
  STUDENT_FEE_CHANGED:  'StudentFeeAmountChanged',
  FEE_GRID_CHANGED:     'ClassFeeGridChanged',
  // Arrêté de caisse : la seule prise possible sur la recette JAMAIS SAISIE.
  CASH_SESSION_DECLARED:  'CashSessionDeclared',
  CASH_SESSION_VALIDATED: 'CashSessionValidated',
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
  // ── Gouvernance budgétaire distante (H3b-budget) ────────────────────────────
  BUDGET_OP_REQUESTED:       'BudgetOperationRequested',        // Cloud→LAN : intention (op minimale, id d'agrégat autoritaire)
  BUDGET_OP_APPLIED:         'BudgetOperationApplied',          // LAN→Cloud : confirmation (estampillé applied_at LAN)
  BUDGET_OP_REJECTED:        'BudgetOperationRejected',         // LAN→Cloud : refus (cap/version/permission/ordre)
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

// ── H3b-budget : opérations budgétaires distantes (INERTE — vocabulaire seul) ──
// Une opération distante est une INTENTION (BudgetOperationRequested) émise par le
// Cloud ; le LAN reste SEULE autorité d'application (budgetGuard / RPC tracées de
// Budget V3) et renvoie un verdict (Applied | Rejected). Aucun upsert direct côté
// Cloud. Ce bloc ne fait que NOMMER le vocabulaire ; le routage vers les guards/RPC
// et l'application vérifiée sont livrés en H3b-3.

// Type d'opération demandé (op_type du payload d'intention).
export const BUDGET_OP = Object.freeze({
  CREATE:     'create',      // créer un budget (enveloppe) ou une ligne — la cible distingue
  MODIFY:     'modify',      // modifier structure/ligne (upsert guardé)
  ALLOCATE:   'allocate',    // définir les allocations par période et/ou par secteur d'une ligne
  ACTIVATE:   'activate',    // activer une ligne (cap annuel RE-VÉRIFIÉ à l'application — R-cap)
  REVISE:     'revise',      // réviser l'enveloppe → RPC tracée (jamais un upsert — R-rpc)
  REALLOCATE: 'reallocate',  // réallouer entre lignes → RPC tracée (jamais un upsert — R-rpc)
});

// Cible de l'opération : un seul type de commande couvre enveloppe / ligne / allocation.
export const BUDGET_OP_TARGET = Object.freeze({
  BUDGET:     'budget',      // enveloppe (table budgets)
  LINE:       'line',        // ligne budgétaire (budget_chapters, scope défini)
  ALLOCATION: 'allocation',  // allocations période/secteur (budget_line_periods / budget_line_sectors)
});

// Verdict d'application LAN → type d'événement de confirmation. Invariant #6 : le
// Cloud n'affiche « appliqué » QUE sur BUDGET_OP_APPLIED renvoyé par le LAN.
export const BUDGET_OP_EVT_BY_RESULT = Object.freeze({
  applied:  EVT.BUDGET_OP_APPLIED,
  rejected: EVT.BUDGET_OP_REJECTED,
});

export function budgetOpEventType(result) {
  return BUDGET_OP_EVT_BY_RESULT[result] || null;
}
export function isBudgetOp(op) {
  return Object.values(BUDGET_OP).includes(op);
}
export function isBudgetOpTarget(target) {
  return Object.values(BUDGET_OP_TARGET).includes(target);
}

// Mapping op → permission BUDGET_* requise comme PREMIÈRE LIGNE de filtre côté
// Cloud (RPC submit_budget_operation / can_operate_budget). Le LAN ré-impose
// AUTORITAIREMENT permission + périmètre école + version + cap annuel +
// idempotence + cohérence à l'application (H3b-3) ; ce mapping n'est qu'un filtre
// amont. IMPÉRATIF : garder synchronisé avec supabase_budget_operations.sql.
export const BUDGET_OP_PERMISSION = Object.freeze({
  create:     'budget.prepare',                 // rédiger un budget / une ligne en préparation
  modify:     'budget.prepare',                 // modifier la structure en préparation
  allocate:   'budget.prepare',                 // définir les allocations période/secteur
  activate:   'budget.approve',                 // activation = approbation finale → actif
  revise:     'budget.annual.revise.request',   // proposer une révision d'enveloppe annuelle
  reallocate: 'budget.reallocate.request',      // proposer un transfert entre enveloppes
});
export function budgetOpPermission(op) {
  return BUDGET_OP_PERMISSION[op] || null;
}
