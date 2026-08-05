// Tests du vocabulaire d'événements finance (pur).
//   node src/domains/finance/_events.test.mjs
import {
  AGGREGATE, EVT, EXPENSE_EVT_BY_STATUS, UNLOCK_EVT_BY_DECISION,
  REVISION_EVT_BY_DECISION, REALLOCATION_EVT_BY_DECISION,
  expenseEventType, unlockEventType,
  BUDGET_OP, BUDGET_OP_TARGET, BUDGET_OP_EVT_BY_RESULT,
  budgetOpEventType, isBudgetOp, isBudgetOpTarget,
  BUDGET_OP_PERMISSION, budgetOpPermission,
} from './events.js';
import { EXPENSE_STATUSES, UNLOCK_STATUSES } from '../../lib/expenseEngine.js';
import { GOV_PERM } from '../../governance/permissions.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── Chaque statut de dépense a un type d'événement (sauf aucun manquant) ───────
for (const s of EXPENSE_STATUSES) {
  ok(typeof EXPENSE_EVT_BY_STATUS[s] === 'string', `statut dépense « ${s} » → événement`);
}
ok(expenseEventType('approved') === EVT.EXPENSE_APPROVED, 'approved → ExpenseApproved');
ok(expenseEventType('inconnu') === EVT.EXPENSE_DRAFTED, 'statut inconnu → fallback Drafted');

// ── Chaque décision de déblocage NON « pending » a un type ────────────────────
for (const d of UNLOCK_STATUSES.filter((s) => s !== 'pending')) {
  ok(typeof UNLOCK_EVT_BY_DECISION[d] === 'string', `décision déblocage « ${d} » → événement`);
}
ok(unlockEventType('authorized') === EVT.UNLOCK_AUTHORIZED, 'authorized → BudgetUnlockAuthorized');
ok(unlockEventType('pending') === null, 'pending → pas d’événement (null)');

// ── Décisions d'opérations tracées (applied/approved/rejected/refused) ────────
ok(REVISION_EVT_BY_DECISION.applied === EVT.REVISION_APPLIED, 'révision applied → Applied');
ok(REVISION_EVT_BY_DECISION.rejected === EVT.REVISION_REJECTED, 'révision rejected → Rejected');
ok(REALLOCATION_EVT_BY_DECISION.approved === EVT.REALLOCATION_APPLIED, 'réalloc approved → Applied');
ok(REALLOCATION_EVT_BY_DECISION.refused === EVT.REALLOCATION_REJECTED, 'réalloc refused → Rejected');

// ── H3b-budget : vocabulaire des opérations budgétaires distantes (inerte) ────
ok(EVT.BUDGET_OP_REQUESTED === 'BudgetOperationRequested', 'intention → BudgetOperationRequested');
ok(budgetOpEventType('applied') === EVT.BUDGET_OP_APPLIED, 'verdict applied → BudgetOperationApplied');
ok(budgetOpEventType('rejected') === EVT.BUDGET_OP_REJECTED, 'verdict rejected → BudgetOperationRejected');
ok(budgetOpEventType('inconnu') === null, 'verdict inconnu → null (pas de confirmation implicite)');
ok(Object.keys(BUDGET_OP_EVT_BY_RESULT).length === 2, 'exactement 2 verdicts (applied/rejected)');
for (const op of ['create', 'modify', 'allocate', 'activate', 'revise', 'reallocate']) {
  ok(isBudgetOp(op), `op « ${op} » reconnue`);
}
ok(!isBudgetOp('delete'), 'op inconnue « delete » rejetée (pas de suppression distante)');
ok(Object.values(BUDGET_OP).length === 6, '6 types d’opération budgétaire');
for (const t of ['budget', 'line', 'allocation']) {
  ok(isBudgetOpTarget(t), `cible « ${t} » reconnue`);
}
ok(!isBudgetOpTarget('expense'), 'cible « expense » rejetée (dépense hors canal budget)');
ok(BUDGET_OP.REVISE === 'revise' && BUDGET_OP.REALLOCATE === 'reallocate', 'révision/réalloc = op tracées (RPC, R-rpc)');

// ── H3b-2 : mapping op → permission BUDGET_* (filtre amont Cloud) ──────────────
// Chaque op a une permission ET cette permission existe dans le vrai catalogue.
const govPerms = new Set(Object.values(GOV_PERM));
for (const op of Object.values(BUDGET_OP)) {
  const perm = budgetOpPermission(op);
  ok(typeof perm === 'string' && govPerms.has(perm), `op « ${op} » → permission « ${perm} » (catalogue GOV_PERM)`);
}
ok(budgetOpPermission('activate') === GOV_PERM.BUDGET_APPROVE, 'activate → budget.approve (approbation finale)');
ok(budgetOpPermission('create') === GOV_PERM.BUDGET_PREPARE, 'create → budget.prepare');
ok(budgetOpPermission('revise') === GOV_PERM.ANNUAL_REVISE_REQUEST, 'revise → budget.annual.revise.request');
ok(budgetOpPermission('inconnu') === null, 'op inconnue → aucune permission (null, refus)');
ok(Object.keys(BUDGET_OP_PERMISSION).length === 6, 'les 6 op ont une permission mappée');

// ── Tous les types sont au passé et distincts ─────────────────────────────────
const all = Object.values(EVT);
ok(new Set(all).size === all.length, 'types d’événements tous distincts');
ok(all.every((t) => /[a-z]ed$|Applied$|Requested$|Submitted$|Approved$|Rejected$|Cancelled$|Deleted$|Drafted$|Paid$|Authorized$|Increased$|Refused$/.test(t)), 'tous au passé');
ok(Object.values(AGGREGATE).length === 10, '10 agrégats finance (6 dépenses/budget + 4 recettes/caisse)');
// Les RECETTES doivent avoir leur vocabulaire : sans lui, encaisser, annuler un
// encaissement ou changer un tarif ne laisserait aucune trace d'audit serveur.
ok(new Set(Object.values(AGGREGATE)).size === Object.values(AGGREGATE).length, 'agrégats tous distincts');
for (const agg of ['fee_payment', 'student_fee', 'class_fee_grid']) {
  ok(Object.values(AGGREGATE).includes(agg), `agrégat recette « ${agg} » présent`);
}
ok(Object.values(AGGREGATE).includes('cash_session'), 'agrégat « cash_session » présent (arrêté de caisse)');
for (const evt of ['FeePaymentRecorded', 'FeePaymentReversed', 'StudentFeeAmountChanged', 'ClassFeeGridChanged',
                   'CashSessionDeclared', 'CashSessionValidated']) {
  ok(all.includes(evt), `événement recette « ${evt} » présent`);
}

console.log(failed ? '\n❌ Finance events ÉCHEC' : '\n✅ Finance events OK');
process.exit(failed ? 1 : 0);
