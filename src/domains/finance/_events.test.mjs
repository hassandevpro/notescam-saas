// Tests du vocabulaire d'événements finance (pur).
//   node src/domains/finance/_events.test.mjs
import {
  AGGREGATE, EVT, EXPENSE_EVT_BY_STATUS, UNLOCK_EVT_BY_DECISION,
  REVISION_EVT_BY_DECISION, REALLOCATION_EVT_BY_DECISION,
  expenseEventType, unlockEventType,
  BUDGET_OP, BUDGET_OP_TARGET, BUDGET_OP_EVT_BY_RESULT,
  budgetOpEventType, isBudgetOp, isBudgetOpTarget,
} from './events.js';
import { EXPENSE_STATUSES, UNLOCK_STATUSES } from '../../lib/expenseEngine.js';

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

// ── Tous les types sont au passé et distincts ─────────────────────────────────
const all = Object.values(EVT);
ok(new Set(all).size === all.length, 'types d’événements tous distincts');
ok(all.every((t) => /[a-z]ed$|Applied$|Requested$|Submitted$|Approved$|Rejected$|Cancelled$|Deleted$|Drafted$|Paid$|Authorized$|Increased$|Refused$/.test(t)), 'tous au passé');
ok(Object.values(AGGREGATE).length === 6, '6 agrégats finance');

console.log(failed ? '\n❌ Finance events ÉCHEC' : '\n✅ Finance events OK');
process.exit(failed ? 1 : 0);
