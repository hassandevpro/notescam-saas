// Test H5 — NOTIFICATIONS HYBRIDES : `notify()` câblé sur les 3 moments de la
// gouvernance financière distante, canal interne (table `notifications` synchronisée
// → sync_outbox), externe en file (notification_outbox), best-effort et offline.
//
// Vérifie : (1) demande d'approbation → décideurs DISTANTS notifiés (pas les locaux) ;
// (2) décision de dépense appliquée → DEMANDEUR notifié (approuvée/refusée) ;
// (3) opération budgétaire appliquée/refusée → DÉCIDEUR notifié ; canal externe mis en
// file ; réplication (sync_outbox) ; best-effort (ne casse jamais l'application, ne lève
// jamais) ; idempotence (pas de doublon au re-drain) ; gate (aucune notif hors mode).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-h5-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { notify, remoteDeciders } = await import('./notify.js');
const { emitApprovalRequest, applyPendingDecisions, applyPendingBudgetOps } = await import('./governanceApply.js');

let pass = 0; let fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// ── Seed : école en mode gouvernance distante + budget + décideurs + demandeur ──
const REMOTE_POLICY = JSON.stringify({ finance: { execution: 'lan', governance: 'cloud' } });
db.prepare('INSERT INTO schools (id, name, deployment_policy) VALUES (?,?,?)').run('sch1', 'École', REMOTE_POLICY);
db.prepare("INSERT INTO budgets (id, school_id, academic_year, label, status, tier, envelope_amount) VALUES ('B','sch1','2025-2026','Annuel','active','annual',100000)").run();
db.prepare('INSERT INTO governance_roles (id, school_id, code, name, rank, scope, permissions, active) VALUES (?,?,?,?,?,?,?,1)')
  .run('r_f', 'sch1', 'fondatrice', 'Fondatrice', 100, 'complex',
    JSON.stringify(['expense.approve', 'expense.reject', 'budget.prepare', 'budget.approve', 'budget.annual.revise', 'budget.reallocate.decide']));
const seedUser = (uid, role, remote) => {
  db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run(uid, `${uid}@x.cm`, 'x', uid);
  db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active, remote_access_allowed) VALUES (?,?,?,?,1,?)').run(`su_${uid}`, 'sch1', uid, 'censeur', remote);
  db.prepare('INSERT INTO user_governance_roles (id, school_id, user_id, role) VALUES (?,?,?,?)').run(`ug_${uid}`, 'sch1', uid, role);
};
seedUser('userF', 'fondatrice', 1); // décideur DISTANT
seedUser('userR', 'fondatrice', 1); // décideur DISTANT
seedUser('userL', 'fondatrice', 0); // financier LOCAL (pas d'accès distant)
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run('userReq', 'req@x.cm', 'x', 'Demandeur'); // RAF demandeur

const notifs = (where = '', ...args) => db.prepare(`SELECT * FROM notifications ${where}`).all(...args);
const notifCount = (type, recipient) => db.prepare('SELECT COUNT(*) n FROM notifications WHERE type = ? AND recipient_id = ?').get(type, recipient).n;
const outboxFor = (rowId) => db.prepare("SELECT COUNT(*) n FROM sync_outbox WHERE tablename = 'notifications' AND row_id = ?").get(rowId).n;

// ── 0) remoteDeciders = comptes à accès distant (exclut le financier local) ──
const deciders = remoteDeciders('sch1').map((d) => d.id).sort();
ok(JSON.stringify(deciders) === JSON.stringify(['userF', 'userR']), '0) décideurs distants = {userF,userR} (userL exclu, pas d’accès distant)', deciders);

// ── 1) MOMENT 1 — demande d'approbation → décideurs DISTANTS notifiés ──
const exp = { id: 'exp1', school_id: 'sch1', budget_id: 'B', budget_chapter_id: null, amount: 45000, requester: 'RAF', expense_date: '2026-07-20', notes: 'Fournitures', version: 1, created_by: 'userReq' };
db.prepare('INSERT INTO budget_expenses (id, school_id, budget_id, amount, status, requester, expense_date, version, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('exp1', 'sch1', 'B', 45000, 'submitted', 'RAF', '2026-07-20', 1, 'userReq');
emitApprovalRequest(exp);
ok(notifCount('approval_request', 'userF') === 1 && notifCount('approval_request', 'userR') === 1, '1) les 2 décideurs distants notifiés (approval_request)', notifs("WHERE type='approval_request'"));
ok(notifCount('approval_request', 'userL') === 0, '1) le financier LOCAL n’est PAS notifié (H4)', notifCount('approval_request', 'userL'));
const req1 = notifs("WHERE type='approval_request'")[0];
ok(outboxFor(req1.id) === 1, '1) notification empilée dans sync_outbox (remontée Cloud)', outboxFor(req1.id));
ok(req1.read === 0 && /45000/.test(req1.body), '1) notif non lue + corps mentionne le montant', req1);

// ── 2) MOMENT 2 — décision de dépense appliquée → DEMANDEUR notifié ──
db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, occurred_at, replicated_from)
            VALUES ('dec1','sch1','expense','exp1','ExpenseApprovalGranted',?, 'userF', ?, 'cloud')`)
  .run(JSON.stringify({ expense_id: 'exp1', decision: 'approve', expected_version: 1 }), new Date().toISOString());
const r2 = applyPendingDecisions();
ok(r2.applied === 1, '2) décision appliquée (LAN autorité)', r2);
ok(notifCount('expense_approved', 'userReq') === 1, '2) le DEMANDEUR (userReq) notifié « dépense approuvée »', notifCount('expense_approved', 'userReq'));
ok(notifCount('expense_approved', 'userF') === 0, '2) le décideur n’est pas notifié à la place du demandeur', notifCount('expense_approved', 'userF'));

// Refus → demandeur notifié « refusée ».
db.prepare('INSERT INTO budget_expenses (id, school_id, budget_id, amount, status, requester, version, created_by) VALUES (?,?,?,?,?,?,?,?)')
  .run('exp2', 'sch1', 'B', 30000, 'submitted', 'RAF', 1, 'userReq');
db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, occurred_at, replicated_from)
            VALUES ('dec2','sch1','expense','exp2','ExpenseApprovalRefused',?, 'userF', ?, 'cloud')`)
  .run(JSON.stringify({ expense_id: 'exp2', decision: 'refuse', expected_version: 1 }), new Date().toISOString());
applyPendingDecisions();
ok(notifCount('expense_rejected', 'userReq') === 1, '2) refus → demandeur notifié « dépense refusée »', notifCount('expense_rejected', 'userReq'));

// ── 3) MOMENT 3 — opération budgétaire distante → DÉCIDEUR notifié ──
let seq = 0;
function emitOp({ op, target, aggId, expectedVersion = null, data = {}, actor = 'userF' }) {
  const eid = `op${++seq}`;
  const payload = JSON.stringify({ op, target, aggregate_id: aggId, expected_version: expectedVersion, data, correlation_id: aggId });
  db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, correlation_id, occurred_at, replicated_from)
              VALUES (?,?,?,?, 'BudgetOperationRequested', ?, ?, ?, ?, 'cloud')`)
    .run(eid, 'sch1', 'budget', aggId, payload, actor, aggId, new Date().toISOString());
  return eid;
}
emitOp({ op: 'create', target: 'line', aggId: 'L1', data: { budget_id: 'B', label: 'Ligne 1', scope: 'complex', planned_amount: 500, kind: 'depense' } });
applyPendingBudgetOps();
ok(notifCount('budget_op_applied', 'userF') === 1, '3) création de ligne appliquée → DÉCIDEUR notifié « appliquée »', notifCount('budget_op_applied', 'userF'));

// Rejet (conflit de version) → décideur notifié « refusée ».
emitOp({ op: 'activate', target: 'line', aggId: 'L1', expectedVersion: 99 });
applyPendingBudgetOps();
ok(notifCount('budget_op_rejected', 'userF') === 1, '3) opération refusée (version) → DÉCIDEUR notifié « refusée »', notifCount('budget_op_rejected', 'userF'));

// ── 4) IDEMPOTENCE : re-drainer ne re-notifie RIEN ──
const before = db.prepare('SELECT COUNT(*) n FROM notifications').get().n;
applyPendingDecisions(); applyPendingBudgetOps();
ok(db.prepare('SELECT COUNT(*) n FROM notifications').get().n === before, '4) re-drain : aucune notification dupliquée', db.prepare('SELECT COUNT(*) n FROM notifications').get().n - before);

// ── 5) CANAL EXTERNE mis en FILE (pending), jamais envoyé ici ──
notify({ schoolId: 'sch1', recipients: [{ id: 'userF', email: 'f@x.cm' }], type: 'info', title: 'Test', body: 'x', channels: ['internal', 'email'] });
const q = db.prepare("SELECT * FROM notification_outbox WHERE channel = 'email' AND status = 'pending'").all();
ok(q.length === 1 && q[0].address === 'f@x.cm', '5) canal email MIS EN FILE (pending), pas envoyé', q);

// ── 6) BEST-EFFORT : notify ne lève jamais + n'écrit rien si invalide ──
let threw = false;
try {
  ok(JSON.stringify(notify({ schoolId: 'sch1', title: '' })) === '[]', '6) notify sans titre → [] (aucune écriture)');
  ok(JSON.stringify(notify({ schoolId: null, title: 'x' })) === '[]', '6) notify sans école → []');
  notify({ schoolId: 'sch1', recipients: [{ id: 'zz' }], title: 'ok', channels: ['bidon'] }); // canal inconnu filtré
} catch { threw = true; }
ok(!threw, '6) notify ne lève JAMAIS (best-effort)');

// ── 7) GATE : hors mode distant, le drain est inerte → aucune notif nouvelle ──
db.prepare("UPDATE schools SET deployment_policy = NULL WHERE id = 'sch1'").run();
const nBefore = db.prepare('SELECT COUNT(*) n FROM notifications').get().n;
db.prepare('INSERT INTO budget_expenses (id, school_id, budget_id, amount, status, version, created_by) VALUES (?,?,?,?,?,?,?)')
  .run('exp9', 'sch1', 'B', 10000, 'submitted', 1, 'userReq');
db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, occurred_at, replicated_from)
            VALUES ('dec9','sch1','expense','exp9','ExpenseApprovalGranted',?, 'userF', ?, 'cloud')`)
  .run(JSON.stringify({ expense_id: 'exp9', decision: 'approve', expected_version: 1 }), new Date().toISOString());
applyPendingDecisions(); applyPendingBudgetOps();
ok(db.prepare('SELECT COUNT(*) n FROM notifications').get().n === nBefore, '7) gate OFF : drain inerte → aucune notification émise', db.prepare('SELECT COUNT(*) n FROM notifications').get().n - nBefore);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
