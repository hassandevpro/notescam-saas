// Tests du vocabulaire d'événements finance (pur).
//   node src/domains/finance/_events.test.mjs
import {
  AGGREGATE, EVT, EXPENSE_EVT_BY_STATUS, UNLOCK_EVT_BY_DECISION,
  REVISION_EVT_BY_DECISION, REALLOCATION_EVT_BY_DECISION,
  expenseEventType, unlockEventType,
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

// ── Tous les types sont au passé et distincts ─────────────────────────────────
const all = Object.values(EVT);
ok(new Set(all).size === all.length, 'types d’événements tous distincts');
ok(all.every((t) => /[a-z]ed$|Applied$|Requested$|Submitted$|Approved$|Rejected$|Cancelled$|Deleted$|Drafted$|Paid$|Authorized$|Increased$|Refused$/.test(t)), 'tous au passé');
ok(Object.values(AGGREGATE).length === 5, '5 agrégats finance');

console.log(failed ? '\n❌ Finance events ÉCHEC' : '\n✅ Finance events OK');
process.exit(failed ? 1 : 0);
