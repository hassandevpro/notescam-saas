// ════════════════════════════════════════════════════════════════════════════
// H7 — RECETTE GÉNÉRALE de l'architecture hybride sélective LAN/Cloud (§19).
//
// Scénario BOUT EN BOUT MULTI-MODULES sur UNE école en mode hybride réaliste :
//   { finance: { execution: lan, governance: cloud },  ← finance LAN-authoritative,
//     notes:   { execution: cloud },                    ← notes saisies en ligne → LAN,
//     default: { execution: hybrid } }
//
// Cloud SIMULÉ en mémoire + transport edge INJECTÉ (aucun réseau). Le Cloud n'émet que
// des INTENTIONS (domain_events) ; le LAN, SEULE autorité, les tire (H3-a), vérifie et
// applique (H3-b / H3b-budget), notifie (H5), confirme, puis repousse les confirmations.
//
// 7 VOLETS : (1) dry-run global sans effet ; (2) bout-en-bout finance ; (3) notes
// Cloud→LAN + finance LAN-authoritative ; (4) notifications sans doublon ; (5) sécurité
// (autre école / pas d'accès distant / permission / version / plafond) ; (6) idempotence
// + ordre causal + coupure/reprise réseau + re-drain ; (7) reconstruction d'audit.
// ════════════════════════════════════════════════════════════════════════════
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-recette-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { syncEventsOnce } = await import('./eventSync.js');
const { applyPendingBudgetOps, applyPendingDecisions, emitApprovalRequest, remoteFinanceGovernance } = await import('./governanceApply.js');
const { shouldPush, shouldPull } = await import('../src/lib/policyEngine.js');

let pass = 0; let fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const H = (t) => console.log(`\n──────── ${t} ────────`);

// ── Cloud SIMULÉ (journal append-only, seq à l'insertion) + transport injecté ──
const cloud = { events: [], seq: 0 };
function cloudInsert(ev) { if (cloud.events.some((e) => e.id === ev.id)) return false; cloud.seq += 1; cloud.events.push({ ...ev, seq: cloud.seq }); return true; }
const net = { pullDown: false, pushDown: false };
const edge = async (path, body) => {
  if (path === 'events-pull') {
    if (net.pullDown) throw new Error('events-pull: HTTP 503');
    const since = body.since != null && body.since !== '' ? Number(body.since) : 0;
    const evs = cloud.events.filter((e) => e.seq > since).sort((a, b) => a.seq - b.seq);
    let cursor = since || null; for (const e of evs) if (cursor == null || e.seq > cursor) cursor = e.seq;
    return { events: evs, cursor };
  }
  if (path === 'events-push') {
    if (net.pushDown) throw new Error('events-push: HTTP 503');
    let applied = 0; for (const ev of body.events || []) if (ev.school_id === 'sch1' && cloudInsert(ev)) applied++;
    return { applied };
  }
  throw new Error('path inattendu ' + path);
};

// Le Cloud émet une INTENTION d'opération budgétaire (comme submit_budget_operation).
let cseq = 0;
function cloudBudgetOp({ op, target, aggId, expectedVersion = null, data = {}, actor = 'userF', school = 'sch1', id }) {
  const eid = id || `cop${++cseq}`;
  cloudInsert({
    id: eid, school_id: school, aggregate_type: 'budget', aggregate_id: aggId,
    event_type: 'BudgetOperationRequested', actor_id: actor, correlation_id: aggId, occurred_at: new Date().toISOString(),
    payload: { op, target, aggregate_id: aggId, expected_version: expectedVersion, data, correlation_id: aggId },
  });
  return eid;
}
// Le Cloud émet une INTENTION de décision de dépense.
function cloudDecision({ expenseId, action = 'approve', expectedVersion = 1, actor = 'userF', school = 'sch1', id }) {
  const eid = id || `cdec${++cseq}`;
  cloudInsert({
    id: eid, school_id: school, aggregate_type: 'expense', aggregate_id: expenseId,
    event_type: action === 'approve' ? 'ExpenseApprovalGranted' : 'ExpenseApprovalRefused',
    actor_id: actor, occurred_at: new Date().toISOString(),
    payload: { expense_id: expenseId, decision: action, expected_version: expectedVersion },
  });
  return eid;
}

// ── SEED : école hybride + budget + gouvernance répliquée + décideurs ──
const POLICY = JSON.stringify({ finance: { execution: 'lan', governance: 'cloud' }, notes: { execution: 'cloud' }, default: { execution: 'hybrid' } });
db.prepare('INSERT INTO schools (id, name, deployment_policy) VALUES (?,?,?)').run('sch1', 'École pilote', POLICY);
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch2', 'Autre école');
db.prepare("INSERT INTO budgets (id, school_id, academic_year, label, status, tier, envelope_amount, version) VALUES ('B','sch1','2025-2026','Annuel','active','annual',100000,1)").run();
db.prepare("INSERT INTO budget_periods (id, school_id, academic_year, name, start_date, end_date) VALUES ('per1','sch1','2025-2026','Année','2025-09-01','2026-08-31')").run();
const seedRole = (code, rank, perms) => db.prepare('INSERT INTO governance_roles (id, school_id, code, name, rank, scope, permissions, active) VALUES (?,?,?,?,?,?,?,1)')
  .run(`r_${code}`, 'sch1', code, code, rank, 'complex', JSON.stringify(perms));
seedRole('fondatrice', 100, ['expense.approve', 'expense.reject', 'budget.prepare', 'budget.approve', 'budget.annual.revise.request', 'budget.annual.revise', 'budget.reallocate.request', 'budget.reallocate.decide']);
seedRole('raf', 80, ['expense.approve', 'expense.reject']); // AUCUN droit budgétaire
const seedUser = (uid, role, remote) => {
  db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run(uid, `${uid}@x.cm`, 'x', uid);
  db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active, remote_access_allowed) VALUES (?,?,?,?,1,?)').run(`su_${uid}`, 'sch1', uid, 'censeur', remote);
  db.prepare('INSERT INTO user_governance_roles (id, school_id, user_id, role) VALUES (?,?,?,?)').run(`ug_${uid}`, 'sch1', uid, role);
};
seedUser('userF', 'fondatrice', 1); // décideur distant, autorité suprême
seedUser('userR', 'raf', 1);        // accès distant MAIS aucun droit budgétaire
seedUser('userL', 'fondatrice', 0); // autorité suffisante MAIS pas d'accès distant (H4)
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run('userReq', 'req@x.cm', 'x', 'Demandeur');

// Raccourcis d'inspection.
const line = (id) => db.prepare('SELECT * FROM budget_chapters WHERE id = ?').get(id);
const budget = (id) => db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
const opResult = (eid) => db.prepare('SELECT result FROM applied_budget_ops WHERE event_id = ?').get(eid)?.result;
const decResult = (eid) => db.prepare('SELECT result FROM applied_decisions WHERE event_id = ?').get(eid)?.result;
const expStatus = (id) => db.prepare('SELECT status FROM budget_expenses WHERE id = ?').get(id)?.status;
const notifCount = (type, rid) => db.prepare('SELECT COUNT(*) n FROM notifications WHERE type = ? AND recipient_id = ?').get(type, rid).n;
const confirmsLocal = (type) => db.prepare('SELECT * FROM domain_events WHERE event_type = ? AND replicated_from IS NULL').all(type);
const cloudHas = (type) => cloud.events.filter((e) => e.event_type === type).length;

ok(remoteFinanceGovernance() === true, 'setup : mode gouvernance financière distante actif');

// ════════════════════════════════════════════════════════════════════════════
H('VOLET 3 — Politique par module : notes Cloud→LAN & finance LAN-authoritative');
// Notes (execution=cloud) : le Cloud fait autorité → PULL cloud→LAN, jamais de push.
for (const t of ['grades', 'apc_notes', 'mat_observations', 'prim_notes', 'student_absences']) {
  ok(shouldPull(POLICY, t) && !shouldPush(POLICY, t), `V3 notes : ${t} tiré du Cloud (pull), jamais poussé`);
}
// Finance opérationnelle : LAN-authoritative → NI pull NI push (le Cloud ne l'écrit jamais).
for (const t of ['budget_expenses', 'budget_unlock_requests', 'budget_reallocations']) {
  ok(!shouldPull(POLICY, t) && !shouldPush(POLICY, t), `V3 finance : ${t} JAMAIS répliqué (LAN autorité)`);
}
// Les FRAIS de scolarité sont un module DISTINCT (fees) : sans règle propre → default=hybrid.
ok(shouldPull(POLICY, 'fee_payments') && shouldPush(POLICY, 'fee_payments'), 'V3 : fees (module distinct) suit default=hybrid');
// Structure budgétaire : projetée en LECTURE vers le Cloud (push), jamais tirée (H4).
for (const t of ['budgets', 'budget_chapters', 'budget_periods']) {
  ok(shouldPush(POLICY, t) && !shouldPull(POLICY, t), `V3 structure : ${t} projeté lecture (push, jamais pull)`);
}

// ════════════════════════════════════════════════════════════════════════════
H('VOLET 1 — Dry-run GLOBAL : aucune écriture, aucun curseur avancé');
// Le Cloud a émis le cycle de vie complet d'un budget.
cloudBudgetOp({ op: 'create', target: 'line', aggId: 'L1', data: { budget_id: 'B', label: 'Ligne 1', scope: 'complex', planned_amount: 500, kind: 'depense' } });
cloudBudgetOp({ op: 'allocate', target: 'allocation', aggId: 'L1', expectedVersion: 1, data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } });
cloudBudgetOp({ op: 'activate', target: 'line', aggId: 'L1', expectedVersion: 1 });
cloudBudgetOp({ op: 'revise', target: 'budget', aggId: 'B', expectedVersion: 1, data: { new_amount: 120000, reason: 'Ajustement' } });

const dryPull = await syncEventsOnce({ edge, dryRun: true });
ok(dryPull.pullPlan.filter((x) => x.apply).length === 4, 'V1 : le sync dry-run PRÉVOIT de tirer 4 intentions', dryPull.pullPlan.length);
ok(db.prepare("SELECT COUNT(*) n FROM domain_events WHERE replicated_from='cloud'").get().n === 0, 'V1 : dry-run n’insère AUCUN événement local');
ok(!db.prepare("SELECT 1 FROM sync_cursor WHERE name='event_pull_seq'").get(), 'V1 : dry-run n’avance AUCUN curseur');
const dryDrain = applyPendingBudgetOps({ dryRun: true });
ok(dryDrain.processed === 0, 'V1 : drain dry-run — file locale encore vide (rien n’a été tiré)', dryDrain.processed);

// ════════════════════════════════════════════════════════════════════════════
H('VOLET 2 — Bout en bout finance : Cloud → réplication → LAN → confirmation');
const r1 = await syncEventsOnce({ edge }); // PULL réel des 4 intentions
ok(r1.applied === 4, 'V2 : 4 intentions tirées et matérialisées localement (replicated_from=cloud)', r1.applied);
const preview = applyPendingBudgetOps({ dryRun: true });
ok(preview.processed === 4 && !line('L1'), 'V2 : dry-run post-pull prévoit 4 sans matérialiser L1', { processed: preview.processed, L1: !!line('L1') });
const drain1 = applyPendingBudgetOps();
ok(drain1.applied === 4 && drain1.deferred === 0, 'V2 : drain réel — 4 appliquées, 0 différée (ordre causal préservé)', drain1);
ok(line('L1')?.status === 'active', 'V2 : L1 créée + allouée + activée', line('L1')?.status);
ok(budget('B').envelope_amount === 120000, 'V2 : enveloppe annuelle révisée (100000→120000)', budget('B').envelope_amount);

// Flux dépense : soumission LAN → demande d'approbation (moment 1) → décision Cloud → application LAN.
db.prepare('INSERT INTO budget_expenses (id, school_id, budget_id, amount, status, requester, expense_date, version, created_by) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('exp1', 'sch1', 'B', 20000, 'submitted', 'RAF', '2026-07-20', 1, 'userReq');
emitApprovalRequest(db.prepare('SELECT * FROM budget_expenses WHERE id = ?').get('exp1'));
const decId = cloudDecision({ expenseId: 'exp1', action: 'approve', expectedVersion: 1, actor: 'userF' });
await syncEventsOnce({ edge }); // pull la décision
const drainDec = applyPendingDecisions();
ok(drainDec.applied === 1 && expStatus('exp1') === 'approved', 'V2 : décision de dépense appliquée par le LAN (approved)', { r: drainDec, s: expStatus('exp1') });

// PUSH des confirmations vers le Cloud (invariant #6 : le Cloud ne voit « appliqué » qu’ici).
const rPush = await syncEventsOnce({ edge });
ok(cloudHas('BudgetOperationApplied') === 4, 'V2 : 4 confirmations budgétaires repoussées au Cloud', cloudHas('BudgetOperationApplied'));
ok(cloudHas('ExpenseApproved') === 1, 'V2 : confirmation ExpenseApproved repoussée au Cloud', cloudHas('ExpenseApproved'));
ok(rPush.pushError == null, 'V2 : push sans erreur');

// ════════════════════════════════════════════════════════════════════════════
H('VOLET 4 — Notifications (H5) sur les 3 moments, sans doublon');
ok(notifCount('approval_request', 'userF') === 1 && notifCount('approval_request', 'userR') === 1, 'V4 moment 1 : décideurs distants notifiés', { F: notifCount('approval_request', 'userF'), R: notifCount('approval_request', 'userR') });
ok(notifCount('approval_request', 'userL') === 0, 'V4 : financier local (sans accès distant) NON notifié');
ok(notifCount('expense_approved', 'userReq') === 1, 'V4 moment 2 : demandeur notifié « dépense approuvée »');
ok(notifCount('budget_op_applied', 'userF') === 4, 'V4 moment 3 : décideur notifié des 4 opérations appliquées', notifCount('budget_op_applied', 'userF'));
const notifTotalV4 = db.prepare('SELECT COUNT(*) n FROM notifications').get().n;

// ════════════════════════════════════════════════════════════════════════════
H('VOLET 5 — Sécurité : tous les chemins de REJET, sans mutation');
// (a) Autre école.
const eOther = cloudBudgetOp({ op: 'create', target: 'line', aggId: 'LX', school: 'sch2', data: { budget_id: 'B', label: 'X', scope: 'complex', planned_amount: 100, kind: 'depense' } });
// (b) Pas d'accès distant (userL, remote=0) — rôle pourtant suffisant.
const eNoRemote = cloudBudgetOp({ op: 'create', target: 'line', aggId: 'LN', actor: 'userL', data: { budget_id: 'B', label: 'N', scope: 'complex', planned_amount: 100, kind: 'depense' } });
// (c) Permission insuffisante (userR = raf, aucun droit budgétaire) sur une activation.
const ePerm = cloudBudgetOp({ op: 'activate', target: 'line', aggId: 'L1', actor: 'userR', expectedVersion: 2 });
// (d) Conflit de version : créer L2 (userF) puis l'activer avec une mauvaise version.
cloudBudgetOp({ op: 'create', target: 'line', aggId: 'L2', data: { budget_id: 'B', label: 'Ligne 2', scope: 'complex', planned_amount: 300, kind: 'depense' } });
await syncEventsOnce({ edge }); applyPendingBudgetOps(); // matérialise L2 (draft)
const eVer = cloudBudgetOp({ op: 'activate', target: 'line', aggId: 'L2', expectedVersion: 99 });
// (e) Dépassement de plafond : L3 énorme, ALLOUÉE (config complète) puis activation
//     refusée par le SEUL plafond annuel (> enveloppe 120000), pas par la config.
cloudBudgetOp({ op: 'create', target: 'line', aggId: 'L3', data: { budget_id: 'B', label: 'Ligne 3', scope: 'complex', planned_amount: 200000, kind: 'depense' } });
cloudBudgetOp({ op: 'allocate', target: 'allocation', aggId: 'L3', expectedVersion: 1, data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } });
await syncEventsOnce({ edge }); applyPendingBudgetOps(); // matérialise L3 (draft) + allocation
const eCap = cloudBudgetOp({ op: 'activate', target: 'line', aggId: 'L3', expectedVersion: 1 });

await syncEventsOnce({ edge }); applyPendingBudgetOps(); // draine tous les rejets

ok(opResult(eOther) === 'rejected_other_school', 'V5(a) autre école → rejected_other_school', opResult(eOther));
ok(!line('LX'), 'V5(a) aucune ligne matérialisée pour l’autre école');
ok(opResult(eNoRemote) === 'rejected_no_remote_access', 'V5(b) pas d’accès distant → rejected_no_remote_access (malgré rôle suffisant)', opResult(eNoRemote));
ok(!line('LN'), 'V5(b) aucune ligne créée sans accès distant');
ok(opResult(ePerm) === 'rejected_unauthorized', 'V5(c) permission insuffisante → rejected_unauthorized', opResult(ePerm));
ok(opResult(eVer) === 'rejected_version_conflict', 'V5(d) mauvaise version → rejected_version_conflict', opResult(eVer));
ok(line('L2').status === 'draft', 'V5(d) L2 reste draft (activation refusée)');
ok(opResult(eCap) === 'rejected_rule', 'V5(e) dépassement de plafond → rejected_rule', opResult(eCap));
ok(line('L3').status === 'draft', 'V5(e) L3 reste draft (activation refusée par le cap)');
ok(budget('B').envelope_amount === 120000, 'V5 : aucune mutation d’enveloppe due aux rejets');
// Chaque rejet a émis un événement de rejet (traçable) + notifié le décideur concerné.
ok(confirmsLocal('BudgetOperationRejected').length >= 4, 'V5 : événements BudgetOperationRejected émis (audit)', confirmsLocal('BudgetOperationRejected').length);
ok(notifCount('budget_op_rejected', 'userF') >= 2, 'V5 : décideur notifié des refus (version + plafond)', notifCount('budget_op_rejected', 'userF'));

// ════════════════════════════════════════════════════════════════════════════
H('VOLET 6 — Idempotence, ordre causal, coupure/reprise réseau, re-drain');
// Ordre causal : le Cloud émet ACTIVATE L4 AVANT create/allocate L4 (arrivée inversée).
const eAct4 = cloudBudgetOp({ op: 'activate', target: 'line', aggId: 'L4', expectedVersion: 1 });
const eCre4 = cloudBudgetOp({ op: 'create', target: 'line', aggId: 'L4', data: { budget_id: 'B', label: 'Ligne 4', scope: 'complex', planned_amount: 100, kind: 'depense' } });
cloudBudgetOp({ op: 'allocate', target: 'allocation', aggId: 'L4', expectedVersion: 1, data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } });
await syncEventsOnce({ edge });
const causal1 = applyPendingBudgetOps();
ok(causal1.deferred === 1, 'V6 ordre causal : activate arrivé avant create → DIFFÉRÉ (pas rejeté)', causal1);
ok(line('L4') && !opResult(eAct4), 'V6 : L4 créée, activate encore en attente (non inscrit)', { L4: !!line('L4'), act: opResult(eAct4) });
const causal2 = applyPendingBudgetOps();
ok(opResult(eAct4) === 'applied' && line('L4').status === 'active', 'V6 : au re-drain, l’activation différée s’applique', { r: opResult(eAct4), s: line('L4').status });

// Coupure réseau : PULL en panne pendant une nouvelle intention → rien ne bouge côté pull.
const eDown = cloudBudgetOp({ op: 'create', target: 'line', aggId: 'L5', data: { budget_id: 'B', label: 'Ligne 5', scope: 'complex', planned_amount: 100, kind: 'depense' } });
const pullSeqBefore = db.prepare("SELECT value FROM sync_cursor WHERE name='event_pull_seq'").get()?.value;
net.pullDown = true;
const cut = await syncEventsOnce({ edge });
net.pullDown = false;
ok(!!cut.pullError, 'V6 coupure : erreur de pull remontée', cut.pullError);
ok(!line('L5'), 'V6 coupure : L5 non tirée (intention restée au Cloud)');
ok(db.prepare("SELECT value FROM sync_cursor WHERE name='event_pull_seq'").get()?.value === pullSeqBefore, 'V6 coupure : curseur PULL figé');
// Reprise : le lien revient → l'intention est tirée et appliquée, sans perte.
await syncEventsOnce({ edge }); applyPendingBudgetOps();
ok(opResult(eDown) === 'applied' && line('L5'), 'V6 reprise : L5 tirée puis appliquée après retour réseau', { r: opResult(eDown), L5: !!line('L5') });

// Re-drain complet : idempotence globale — 0 ré-application, notifications stables.
const notifBefore = db.prepare('SELECT COUNT(*) n FROM notifications').get().n;
const vL4 = line('L4').version;
const again = applyPendingBudgetOps(); const againDec = applyPendingDecisions();
ok(again.applied === 0 && againDec.applied === 0, 'V6 re-drain : aucune ré-application', { again, againDec });
ok(line('L4').version === vL4, 'V6 re-drain : versions stables');
ok(db.prepare('SELECT COUNT(*) n FROM notifications').get().n === notifBefore, 'V6 re-drain : aucune notification dupliquée');
// Re-tirer TOUT le journal cloud ne duplique rien localement (ON CONFLICT id DO NOTHING).
const localBefore = db.prepare('SELECT COUNT(*) n FROM domain_events').get().n;
db.prepare("UPDATE sync_cursor SET value='0' WHERE name='event_pull_seq'").run();
const rewind = await syncEventsOnce({ edge });
ok(rewind.applied === 0 && db.prepare('SELECT COUNT(*) n FROM domain_events').get().n === localBefore, 'V6 : re-tirer tout le journal → 0 doublon', { applied: rewind.applied });

// ════════════════════════════════════════════════════════════════════════════
H('VOLET 7 — Reconstruction complète de l’audit (piste décisionnelle)');
// Toute opération INSCRITE « applied » possède une confirmation locale corrélée
// (intention → application → confirmation), et toute confirmation a une ligne d'audit.
const appliedOps = db.prepare("SELECT * FROM applied_budget_ops WHERE result = 'applied'").all();
const confApplied = confirmsLocal('BudgetOperationApplied');
let chainOK = true; let auditOK = true; let actorOK = true;
for (const c of confApplied) {
  const p = JSON.parse(c.payload);
  const intentId = p.operation_event_id;
  // 1) la confirmation référence une intention réellement tirée du Cloud ;
  const intent = db.prepare("SELECT * FROM domain_events WHERE id = ? AND replicated_from = 'cloud'").get(intentId);
  if (!intent) chainOK = false;
  // 2) l'intention a bien été inscrite « applied » (idempotence/reconstruction d'état) ;
  if (opResult(intentId) !== 'applied') chainOK = false;
  // 3) chaque confirmation a une ligne d'audit dérivée (piste inviolable) ;
  if (!db.prepare('SELECT 1 FROM audit_events WHERE event_id = ?').get(c.id)) auditOK = false;
  // 4) l'acteur (non-répudiation) est préservé de l'intention à la confirmation + applied_at.
  if (c.actor_id !== intent?.actor_id || !p.applied_at) actorOK = false;
}
ok(confApplied.length === appliedOps.length, 'V7 : 1 confirmation par opération appliquée (bijection)', { conf: confApplied.length, ops: appliedOps.length });
ok(chainOK, 'V7 : chaîne intention→application→confirmation reconstructible pour chaque opération');
ok(auditOK, 'V7 : chaque confirmation a sa ligne audit_events (piste d’audit)');
ok(actorOK, 'V7 : acteur (non-répudiation) + applied_at préservés de bout en bout');
// Reconstruction d'ÉTAT : les lignes actives rejouées depuis les confirmations = état réel.
const activeFromEvents = new Set();
for (const c of confApplied) { const p = JSON.parse(c.payload); if (p.op === 'activate') activeFromEvents.add(c.aggregate_id); }
const activeInDb = db.prepare("SELECT id FROM budget_chapters WHERE status = 'active'").all().map((r) => r.id).sort();
ok(JSON.stringify([...activeFromEvents].sort()) === JSON.stringify(activeInDb), 'V7 : lignes actives reconstruites depuis les événements == état en base', { events: [...activeFromEvents].sort(), db: activeInDb });
// Aucune application directe côté Cloud : le Cloud ne contient QUE des intentions +
// des confirmations LAN — jamais une mutation d'état écrite par lui-même.
const cloudMutations = cloud.events.filter((e) => !['BudgetOperationRequested', 'ExpenseApprovalGranted', 'ExpenseApprovalRefused', 'BudgetOperationApplied', 'BudgetOperationRejected', 'ExpenseApproved', 'ExpenseRejected', 'ExpenseDecisionRejected', 'ExpenseRemoteApprovalRequested'].includes(e.event_type));
ok(cloudMutations.length === 0, 'V7 : AUCUNE mutation d’état directe côté Cloud (intentions + confirmations seulement)', cloudMutations.map((e) => e.event_type));

console.log(`\n═══════════ ${fail === 0 ? '✅ RECETTE OK' : '❌ RECETTE ÉCHEC'} : ${pass} ok, ${fail} ko ═══════════`);
process.exit(fail ? 1 : 0);
