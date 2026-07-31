// Test bout-en-bout — H3-b : application des décisions distantes (LAN autorité).
//
// Base jetable (NOTESCAM_DATA_DIR). Vérifie : approbation valide, refus valide,
// décision dupliquée, mauvaise version, autre école, décision non autorisée
// (plafond), double réception après reconnexion, confirmation locale (origine
// locale → poussée par H3-a), reprise sans double application, blocage de
// l'approbation LOCALE en mode distant, et gate (inerte hors mode distant).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-gov-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { verifyRemoteDecision, applyPendingDecisions, remoteFinanceGovernance } = await import('./governanceApply.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// ── Seed : école en mode gouvernance distante + catalogue + décideurs + dépenses ──
const REMOTE_POLICY = JSON.stringify({ finance: { execution: 'lan', governance: 'cloud' } });
db.prepare('INSERT INTO schools (id, name, deployment_policy) VALUES (?,?,?)').run('sch1', 'École', REMOTE_POLICY);
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch2', 'Autre école'); // pour le cas « autre école »
db.prepare("INSERT INTO budgets (id, school_id, academic_year, label, status, tier, envelope_amount) VALUES ('bud1','sch1','2025-2026','Budget','active','annual',100000000)").run();

// Catalogue de rôles (permissions en JSON TEXT). fondatrice = suprême (rang 100).
const seedRole = (code, rank, perms) => db.prepare(
  'INSERT INTO governance_roles (id, school_id, code, name, rank, scope, permissions, active) VALUES (?,?,?,?,?,?,?,1)',
).run(`r_${code}`, 'sch1', code, code, rank, 'complex', JSON.stringify(perms));
seedRole('fondatrice', 100, ['expense.approve', 'expense.reject']);
seedRole('raf', 80, ['expense.approve', 'expense.reject']);

// Décideurs : userF (fondatrice, accès distant), userR (raf, accès distant),
// userL (fondatrice mais SANS accès distant → « financier local » H4). base non-admin.
const seedUser = (uid, roleCode, remote = 1) => {
  db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run(uid, `${uid}@x.cm`, 'x', uid);
  db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active, remote_access_allowed) VALUES (?,?,?,?,1,?)')
    .run(`su_${uid}`, 'sch1', uid, 'censeur', remote);
  db.prepare('INSERT INTO user_governance_roles (id, school_id, user_id, role) VALUES (?,?,?,?)').run(`ug_${uid}`, 'sch1', uid, roleCode);
};
seedUser('userF', 'fondatrice', 1);
seedUser('userR', 'raf', 1);
seedUser('userL', 'fondatrice', 0); // rôle suffisant MAIS pas d'accès distant

let expSeq = 0;
function seedExpense(status = 'submitted', amount = 450000, version = 1) {
  const id = `exp${++expSeq}`;
  db.prepare(`INSERT INTO budget_expenses (id, school_id, budget_id, amount, status, requester, expense_date, version)
              VALUES (?,?,?,?,?,?,?,?)`).run(id, 'sch1', 'bud1', amount, status, 'RAF', '2026-07-20', version);
  return id;
}
// Fabrique un événement de décision COMME S'IL ÉTAIT TIRÉ DU CLOUD (replicated_from='cloud').
let decSeq = 0;
function seedDecision({ expenseId, action = 'approve', expectedVersion = 1, actorId = 'userF', school = 'sch1', id }) {
  const eid = id || `dec${++decSeq}`;
  const type = action === 'approve' ? 'ExpenseApprovalGranted' : 'ExpenseApprovalRefused';
  db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, occurred_at, replicated_from)
              VALUES (?,?,?,?,?,?,?,?, 'cloud')`)
    .run(eid, school, 'expense', expenseId, type,
      JSON.stringify({ expense_id: expenseId, decision: action, expected_version: expectedVersion }),
      actorId, new Date().toISOString());
  return eid;
}
const statusOf = (id) => db.prepare('SELECT status FROM budget_expenses WHERE id = ?').get(id)?.status;
const versionOf = (id) => db.prepare('SELECT version FROM budget_expenses WHERE id = ?').get(id)?.version;
const confirmations = (expId, type) => db.prepare(
  "SELECT * FROM domain_events WHERE aggregate_id = ? AND event_type = ? AND replicated_from IS NULL").all(expId, type);
const decisionResult = (eid) => db.prepare('SELECT result FROM applied_decisions WHERE event_id = ?').get(eid)?.result;

ok(remoteFinanceGovernance() === true, 'mode gouvernance distante actif (policy finance.governance=cloud)');

// ── 1) APPROBATION VALIDE ─────────────────────────────────────────────────────
const e1 = seedExpense(); const d1 = seedDecision({ expenseId: e1, action: 'approve', expectedVersion: 1, actorId: 'userF' });
const r1 = applyPendingDecisions();
ok(r1.applied === 1, '1) approbation : 1 décision appliquée', r1);
ok(statusOf(e1) === 'approved', '1) dépense passée à approved', statusOf(e1));
ok(versionOf(e1) === 2, '1) version incrémentée (1→2)', versionOf(e1));
ok(decisionResult(d1) === 'applied', '1) décision inscrite « applied » (idempotence)');
ok(confirmations(e1, 'ExpenseApproved').length === 1, '1) CONFIRMATION ExpenseApproved émise (origine locale → poussée par H3-a)');

// ── 2) REFUS VALIDE ───────────────────────────────────────────────────────────
const e2 = seedExpense(); seedDecision({ expenseId: e2, action: 'refuse', expectedVersion: 1, actorId: 'userF' });
applyPendingDecisions();
ok(statusOf(e2) === 'rejected', '2) refus : dépense passée à rejected', statusOf(e2));
ok(confirmations(e2, 'ExpenseRejected').length === 1, '2) CONFIRMATION ExpenseRejected émise');

// ── 3) DÉCISION DUPLIQUÉE (même id ré-appliqué) ──────────────────────────────
const vBefore = versionOf(e1);
verifyRemoteDecision(db.prepare('SELECT * FROM domain_events WHERE id = ?').get(d1)); // rejoue d1
ok(versionOf(e1) === vBefore, '3) décision dupliquée : AUCUNE ré-application (version stable)', versionOf(e1));

// ── 4) MAUVAISE VERSION ───────────────────────────────────────────────────────
const e4 = seedExpense('submitted', 450000, 1);
const d4 = seedDecision({ expenseId: e4, action: 'approve', expectedVersion: 5, actorId: 'userF' });
applyPendingDecisions();
ok(statusOf(e4) === 'submitted', '4) mauvaise version : dépense INCHANGÉE (submitted)', statusOf(e4));
ok(decisionResult(d4) === 'rejected_version_conflict', '4) décision inscrite « rejected_version_conflict »', decisionResult(d4));
ok(confirmations(e4, 'ExpenseDecisionRejected').length === 1, '4) événement ExpenseDecisionRejected émis');

// ── 5) DÉCISION D'UNE AUTRE ÉCOLE ─────────────────────────────────────────────
const e5 = seedExpense();
const d5 = seedDecision({ expenseId: e5, action: 'approve', expectedVersion: 1, actorId: 'userF', school: 'sch2' });
applyPendingDecisions();
ok(statusOf(e5) === 'submitted', '5) autre école : dépense INCHANGÉE', statusOf(e5));
ok(decisionResult(d5) === 'rejected_other_school', '5) décision inscrite « rejected_other_school »', decisionResult(d5));

// ── 6) DÉCISION NON AUTORISÉE (plafond : RAF ne peut approuver 450 000) ───────
const e6 = seedExpense('submitted', 450000, 1);
const d6 = seedDecision({ expenseId: e6, action: 'approve', expectedVersion: 1, actorId: 'userR' });
applyPendingDecisions();
ok(statusOf(e6) === 'submitted', '6) non autorisé : dépense INCHANGÉE', statusOf(e6));
ok(decisionResult(d6) === 'rejected_unauthorized', '6) décision inscrite « rejected_unauthorized »', decisionResult(d6));

// ── 6bis) H4 — FINANCIER LOCAL SANS ACCÈS DISTANT : décision refusée ─────────
// userL a le rôle fondatrice (autorité suffisante) MAIS remote_access_allowed=0.
const e6b = seedExpense('submitted', 450000, 1);
const d6b = seedDecision({ expenseId: e6b, action: 'approve', expectedVersion: 1, actorId: 'userL' });
applyPendingDecisions();
ok(statusOf(e6b) === 'submitted', '6bis) sans accès distant : dépense INCHANGÉE (malgré rôle suffisant)', statusOf(e6b));
ok(decisionResult(d6b) === 'rejected_no_remote_access', '6bis) décision inscrite « rejected_no_remote_access » (séparation droit financier / accès distant)', decisionResult(d6b));

// ── 7) REÇUE DEUX FOIS APRÈS RECONNEXION (ré-insertion idempotente du même id) ──
db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, occurred_at, replicated_from)
            VALUES (?,?,?,?,?,?,?,?, 'cloud') ON CONFLICT(id) DO NOTHING`)
  .run(d1, 'sch1', 'expense', e1, 'ExpenseApprovalGranted', JSON.stringify({ expense_id: e1, decision: 'approve', expected_version: 1 }), 'userF', new Date().toISOString());
const vBeforeReconn = versionOf(e1);
const r7 = applyPendingDecisions();
ok(versionOf(e1) === vBeforeReconn, '7) reçue 2× après reconnexion : pas de double application', versionOf(e1));
ok(r7.applied === 0, '7) rien de neuf appliqué au 2e passage', r7);

// ── 8) REPRISE APRÈS RÉSEAU INTERROMPU : plusieurs passages, aucune dérive ────
const before = { e1: versionOf(e1), e2v: versionOf(e2) };
applyPendingDecisions(); applyPendingDecisions(); applyPendingDecisions();
ok(versionOf(e1) === before.e1 && versionOf(e2) === before.e2v, '8) reprise : versions stables après plusieurs cycles', { e1: versionOf(e1), e2: versionOf(e2) });
const dupConfirm = db.prepare("SELECT COUNT(*) n FROM domain_events WHERE aggregate_id = ? AND event_type = 'ExpenseApproved'").get(e1).n;
ok(dupConfirm === 1, '8) reprise : une seule confirmation (pas de doublon d’événement)', dupConfirm);

// ── 9) AUCUNE APPLICATION DIRECTE : approbation LOCALE bloquée en mode distant ──
const e9 = seedExpense();
const localApprove = runQuery({ table: 'budget_expenses', action: 'upsert', onConflict: 'id',
  values: { id: e9, school_id: 'sch1', budget_id: 'bud1', amount: 450000, status: 'approved' } }, { userId: 'userF' });
ok(!!localApprove.error && /distante/i.test(localApprove.error.message), '9) approbation LOCALE refusée (réservée à la gouvernance distante)', localApprove.error);
ok(statusOf(e9) === 'submitted', '9) dépense reste submitted (non approuvée localement)', statusOf(e9));

// ── 10) GATE : hors mode distant, l'applicateur est INERTE ────────────────────
db.prepare("UPDATE schools SET deployment_policy = NULL WHERE id = 'sch1'").run();
const e10 = seedExpense(); const d10 = seedDecision({ expenseId: e10, action: 'approve', expectedVersion: 1, actorId: 'userF' });
const r10 = applyPendingDecisions();
ok(r10.applied === 0 && r10.processed === 0, '10) gate : mode distant OFF → applicateur inerte', r10);
ok(statusOf(e10) === 'submitted', '10) gate : dépense non touchée hors mode distant', statusOf(e10));
db.prepare("UPDATE schools SET deployment_policy = ? WHERE id = 'sch1'").run(REMOTE_POLICY); // restore

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
