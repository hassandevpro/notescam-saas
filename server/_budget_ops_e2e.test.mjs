// Recette H3b-5 — DRY-RUN + scénario BOUT EN BOUT de la gouvernance budgétaire distante.
//
// Vérifie la chaîne complète telle qu'elle tourne en production : le Cloud émet des
// INTENTIONS (répliquées ici comme domain_events replicated_from='cloud') → le LAN les
// draine, VÉRIFIE et APPLIQUE (H3b-3) → émet des CONFIRMATIONS (repoussées au Cloud).
// Couvre : (1) DRY-RUN sans le moindre effet de bord ; (2) cycle de vie complet
// create→allocate→activate→revise→reallocate ; (3) audit reconstructible ; (4) reprise
// idempotente ; (5) FIDÉLITÉ du dry-run sur un rejet de plafond (R-cap).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-e2e-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { applyPendingBudgetOps, dryRunBudgetOperation } = await import('./governanceApply.js');

let pass = 0; let fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// ── Seed : école distante + budget annuel racine (dépendance FK des lignes) ──
const REMOTE_POLICY = JSON.stringify({ finance: { execution: 'lan', governance: 'cloud' } });
db.prepare('INSERT INTO schools (id, name, deployment_policy) VALUES (?,?,?)').run('sch1', 'École', REMOTE_POLICY);
db.prepare("INSERT INTO budgets (id, school_id, academic_year, label, status, tier, envelope_amount) VALUES ('B','sch1','2025-2026','Annuel','active','annual',100000)").run();
db.prepare("INSERT INTO budget_periods (id, school_id, academic_year, name, start_date, end_date) VALUES ('per1','sch1','2025-2026','Année','2025-09-01','2026-08-31')").run();
db.prepare('INSERT INTO governance_roles (id, school_id, code, name, rank, scope, permissions, active) VALUES (?,?,?,?,?,?,?,1)')
  .run('r_f', 'sch1', 'fondatrice', 'Fondatrice', 100, 'complex', JSON.stringify(['budget.prepare', 'budget.approve', 'budget.annual.revise.request', 'budget.annual.revise', 'budget.reallocate.request', 'budget.reallocate.decide']));
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run('userF', 'f@x.cm', 'x', 'Fondatrice');
db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active, remote_access_allowed) VALUES (?,?,?,?,1,1)').run('su_f', 'sch1', 'userF', 'censeur');
db.prepare('INSERT INTO user_governance_roles (id, school_id, user_id, role) VALUES (?,?,?,?)').run('ug_f', 'sch1', 'userF', 'fondatrice');

let seq = 0;
function emit({ op, target, aggId, expectedVersion = null, data = {}, corr = null, id }) {
  const eid = id || `e${++seq}`;
  const payload = JSON.stringify({ op, target, aggregate_id: aggId, expected_version: expectedVersion, data, correlation_id: corr || aggId });
  db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, correlation_id, occurred_at, replicated_from)
              VALUES (?,?,?,?,?,?,?,?,?, 'cloud')`)
    .run(eid, 'sch1', 'budget', aggId, 'BudgetOperationRequested', payload, 'userF', corr || aggId, new Date().toISOString());
  return eid;
}
const line = (id) => db.prepare('SELECT * FROM budget_chapters WHERE id = ?').get(id);
const budget = (id) => db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
const nApplied = () => db.prepare('SELECT COUNT(*) n FROM applied_budget_ops').get().n;
const nConfirm = () => db.prepare("SELECT COUNT(*) n FROM domain_events WHERE event_type = 'BudgetOperationApplied' AND replicated_from IS NULL").get().n;

// ── Émission du cycle de vie complet (ordre causal d'arrivée) ────────────────
emit({ op: 'create', target: 'line', aggId: 'L1', data: { budget_id: 'B', label: 'Ligne 1', scope: 'complex', planned_amount: 500, kind: 'depense' } });
emit({ op: 'allocate', target: 'allocation', aggId: 'L1', expectedVersion: 1, data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } });
emit({ op: 'activate', target: 'line', aggId: 'L1', expectedVersion: 1 });
emit({ op: 'create', target: 'line', aggId: 'L2', data: { budget_id: 'B', label: 'Ligne 2', scope: 'complex', planned_amount: 500, kind: 'depense' } });
emit({ op: 'allocate', target: 'allocation', aggId: 'L2', expectedVersion: 1, data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } });
emit({ op: 'activate', target: 'line', aggId: 'L2', expectedVersion: 1 });
emit({ op: 'revise', target: 'budget', aggId: 'B', expectedVersion: 1, data: { new_amount: 120000, reason: 'Ajustement' } });
emit({ op: 'reallocate', target: 'line', aggId: 'L1', data: { source_chapter_id: 'L1', dest_chapter_id: 'L2', amount: 200, reason: 'Rééquilibrage' } });

// ── 1) DRY-RUN de la file : PRÉVOIT sans AUCUN effet de bord ─────────────────
const plan = applyPendingBudgetOps({ dryRun: true });
ok(plan.processed === 8, '1) dry-run : 8 intentions évaluées', plan.processed);
ok(plan.wouldApply >= 3, '1) dry-run : créations + révision prévues « apply »', plan);
ok(plan.plan.find((x) => x.op === 'create' && x.aggregate_id === 'L1')?.outcome === 'apply', '1) dry-run : create L1 → apply', plan.plan.find((x) => x.op === 'create'));
ok(plan.plan.find((x) => x.op === 'activate' && x.aggregate_id === 'L1')?.outcome === 'defer', '1) dry-run : activate L1 → defer (create pas encore appliqué)', plan.plan.find((x) => x.op === 'activate'));
// ZÉRO effet de bord : rien n'a été créé/inscrit/confirmé.
ok(!line('L1') && !line('L2'), '1) dry-run : aucune ligne matérialisée', { L1: line('L1'), L2: line('L2') });
ok(nApplied() === 0, '1) dry-run : aucune intention inscrite (applied_budget_ops vide)', nApplied());
ok(nConfirm() === 0, '1) dry-run : aucune confirmation émise', nConfirm());
ok(budget('B').envelope_amount === 100000, '1) dry-run : enveloppe inchangée (révision non persistée)', budget('B').envelope_amount);

// ── 2) APPLICATION RÉELLE bout en bout (un passage, ordre causal préservé) ────
const r = applyPendingBudgetOps();
ok(r.applied === 8 && r.deferred === 0, '2) drain réel : 8 appliquées, 0 différée', r);
ok(line('L1')?.status === 'active' && line('L2')?.status === 'active', '2) L1 & L2 activées', { L1: line('L1')?.status, L2: line('L2')?.status });
ok(budget('B').envelope_amount === 120000, '2) enveloppe annuelle révisée (120000)', budget('B').envelope_amount);
ok(line('L1').planned_amount === 300 && line('L2').planned_amount === 700, '2) réallocation appliquée (500→300 / 500→700)', { L1: line('L1').planned_amount, L2: line('L2').planned_amount });

// ── 3) AUDIT reconstructible : confirmations + registre d'idempotence complets ─
ok(nApplied() === 8, '3) 8 intentions inscrites (applied_budget_ops)', nApplied());
ok(db.prepare("SELECT COUNT(*) n FROM applied_budget_ops WHERE result = 'applied'").get().n === 8, '3) toutes « applied »');
ok(nConfirm() === 8, '3) 8 confirmations BudgetOperationApplied (repoussables au Cloud)', nConfirm());
ok(db.prepare("SELECT COUNT(*) n FROM budget_revisions WHERE status='applied'").get().n === 1
  && db.prepare("SELECT COUNT(*) n FROM budget_line_reallocations WHERE status='applied'").get().n === 1, '3) traces RPC révision + réallocation présentes');

// ── 4) REPRISE idempotente : re-drainer ne réapplique RIEN ───────────────────
const vL1 = line('L1').version; const vL2 = line('L2').version;
const r2 = applyPendingBudgetOps();
ok(r2.applied === 0 && r2.processed === 0, '4) reprise : file vide, 0 réappliquée', r2);
ok(line('L1').version === vL1 && line('L2').version === vL2, '4) reprise : versions stables', { L1: line('L1').version, L2: line('L2').version });
ok(nConfirm() === 8, '4) reprise : aucune confirmation dupliquée', nConfirm());
ok(applyPendingBudgetOps({ dryRun: true }).processed === 0, '4) dry-run post-achèvement : file vide', 0);

// ── 5) FIDÉLITÉ du dry-run sur un REJET de plafond (R-cap) ───────────────────
// Nouvelle ligne énorme : son activation dépasserait l'enveloppe (120000).
emit({ op: 'create', target: 'line', aggId: 'L3', data: { budget_id: 'B', label: 'Ligne 3', scope: 'complex', planned_amount: 200000, kind: 'depense' } });
emit({ op: 'allocate', target: 'allocation', aggId: 'L3', expectedVersion: 1, data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } });
applyPendingBudgetOps(); // matérialise L3 (draft) + allocation
const actId = emit({ op: 'activate', target: 'line', aggId: 'L3', expectedVersion: 1 });
const confBefore = nConfirm(); const appliedBefore = nApplied();
const dry = dryRunBudgetOperation(db.prepare('SELECT * FROM domain_events WHERE id = ?').get(actId));
ok(dry.outcome === 'reject' && dry.result === 'rejected_rule', '5) dry-run activation L3 → reject (plafond)', dry);
ok(line('L3').status === 'draft', '5) dry-run : L3 reste draft (aucune activation)', line('L3').status);
ok(nApplied() === appliedBefore, '5) dry-run : rien inscrit', { before: appliedBefore, after: nApplied() });
ok(nConfirm() === confBefore, '5) dry-run : aucune confirmation', { before: confBefore, after: nConfirm() });
// Le drain RÉEL produit LE MÊME verdict (fidélité).
applyPendingBudgetOps();
ok(line('L3').status === 'draft', '5) drain réel : activation L3 refusée (idem dry-run)', line('L3').status);
ok(db.prepare("SELECT result FROM applied_budget_ops WHERE event_id = ?").get(actId)?.result === 'rejected_rule', '5) drain réel : inscrit « rejected_rule »', db.prepare('SELECT result FROM applied_budget_ops WHERE event_id = ?').get(actId));

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
