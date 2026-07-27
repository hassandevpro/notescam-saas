// Test bout-en-bout — H3b-3 : application des OPÉRATIONS BUDGÉTAIRES distantes.
//
// Le LAN est l'UNIQUE autorité : re-vérif école + accès distant + permission +
// version + plafonds (via budgetGuard, JAMAIS de rawUpsert) + idempotence + ordre
// causal, puis application par le CHEMIN GUARDÉ (runOpsGuarded) ou par les RPC
// tracées (révision/réallocation). Base jetable (NOTESCAM_DATA_DIR).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-budops-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { verifyRemoteBudgetOperation, applyPendingBudgetOps, remoteFinanceGovernance } = await import('./governanceApply.js');

let pass = 0; let fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// ── Seed : école en mode gouvernance distante + budgets + périodes + rôles + users ──
const REMOTE_POLICY = JSON.stringify({ finance: { execution: 'lan', governance: 'cloud' } });
db.prepare('INSERT INTO schools (id, name, deployment_policy) VALUES (?,?,?)').run('sch1', 'École', REMOTE_POLICY);
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch2', 'Autre école');
db.prepare("INSERT INTO budgets (id, school_id, academic_year, label, status, tier, envelope_amount) VALUES ('bud1','sch1','2025-2026','Budget annuel','active','annual',100000)").run();
db.prepare("INSERT INTO budgets (id, school_id, academic_year, label, status, tier, envelope_amount) VALUES ('bud2','sch1','2026-2027','Budget bis','active','annual',50000)").run();
db.prepare("INSERT INTO budget_periods (id, school_id, academic_year, name, start_date, end_date) VALUES ('per1','sch1','2025-2026','Année','2025-09-01','2026-08-31')").run();

const seedRole = (code, rank, perms) => db.prepare(
  'INSERT INTO governance_roles (id, school_id, code, name, rank, scope, permissions, active) VALUES (?,?,?,?,?,?,?,1)',
).run(`r_${code}`, 'sch1', code, code, rank, 'complex', JSON.stringify(perms));
// fondatrice = autorité complète (prépare, approuve/active, révise, réalloue).
seedRole('fondatrice', 100, ['budget.prepare', 'budget.approve', 'budget.annual.revise.request', 'budget.annual.revise', 'budget.reallocate.request', 'budget.reallocate.decide']);
// preparer = peut préparer une ligne, mais PAS l'activer/réviser/réallouer.
seedRole('preparer', 60, ['budget.prepare']);

const seedUser = (uid, roleCode, remote = 1) => {
  db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)').run(uid, `${uid}@x.cm`, 'x', uid);
  db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active, remote_access_allowed) VALUES (?,?,?,?,1,?)').run(`su_${uid}`, 'sch1', uid, 'censeur', remote);
  db.prepare('INSERT INTO user_governance_roles (id, school_id, user_id, role) VALUES (?,?,?,?)').run(`ug_${uid}`, 'sch1', uid, roleCode);
};
seedUser('userF', 'fondatrice', 1);   // autorité + accès distant
seedUser('userP', 'preparer', 1);     // prépare seulement + accès distant
seedUser('userL', 'fondatrice', 0);   // autorité MAIS sans accès distant

let opSeq = 0;
function seedOp({ op, target, aggId, expectedVersion = null, actorId = 'userF', school = 'sch1', data = {}, corr = null, id }) {
  const eid = id || `op${++opSeq}`;
  const payload = JSON.stringify({ op, target, aggregate_id: aggId, expected_version: expectedVersion, data, correlation_id: corr || aggId });
  db.prepare(`INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, correlation_id, occurred_at, replicated_from)
              VALUES (?,?,?,?,?,?,?,?,?, 'cloud')`)
    .run(eid, school, 'budget', aggId, 'BudgetOperationRequested', payload, actorId, corr || aggId, new Date().toISOString());
  return db.prepare('SELECT * FROM domain_events WHERE id = ?').get(eid);
}
const apply = (ev) => verifyRemoteBudgetOperation(ev);
const chapter = (id) => db.prepare('SELECT * FROM budget_chapters WHERE id = ?').get(id);
const budget = (id) => db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
const vOf = (table, id) => db.prepare(`SELECT version FROM ${table} WHERE id = ?`).get(id)?.version;
const opResult = (eid) => db.prepare('SELECT result FROM applied_budget_ops WHERE event_id = ?').get(eid)?.result;
const confirms = (aggId, type) => db.prepare("SELECT COUNT(*) n FROM domain_events WHERE aggregate_id = ? AND event_type = ? AND replicated_from IS NULL").get(aggId, type).n;

ok(remoteFinanceGovernance() === true, '0) mode gouvernance distante actif');

// ── 1) CRÉATION d'un budget (enveloppe) à distance ────────────────────────────
const c1 = apply(seedOp({ op: 'create', target: 'budget', aggId: 'B_new', data: { academic_year: '2027-2028', label: 'Nouveau budget', tier: 'annual', envelope_amount: 5000, status: 'draft' } }));
ok(c1.applied === true, '1) création budget appliquée', c1);
ok(budget('B_new')?.envelope_amount === 5000, '1) budget matérialisé avec l’id autoritaire (I5)', budget('B_new'));
ok(confirms('B_new', 'BudgetOperationApplied') === 1, '1) confirmation BudgetOperationApplied émise (invariant #6)');

// ── 2) CRÉATION d'une ligne + IDEMPOTENCE (rejeu du même event) ───────────────
const e2 = seedOp({ op: 'create', target: 'line', aggId: 'L_create', data: { budget_id: 'bud1', label: 'Fournitures', scope: 'complex', planned_amount: 200, kind: 'depense' } });
ok(apply(e2).applied === true, '2) création ligne appliquée');
ok(chapter('L_create')?.status === 'draft', '2) ligne créée en draft', chapter('L_create')?.status);
const dup2 = apply(db.prepare('SELECT * FROM domain_events WHERE id = ?').get(e2.id));
ok(dup2.skip && dup2.reason === 'already_applied', '2) rejeu = no-op idempotent (already_applied)', dup2);
ok(db.prepare("SELECT COUNT(*) n FROM budget_chapters WHERE id = 'L_create'").get().n === 1, '2) une seule ligne (pas de double création)');
ok(confirms('L_create', 'BudgetOperationApplied') === 1, '2) une seule confirmation malgré le rejeu');

// ── 3) MODIFICATION + CONFLIT DE VERSION ─────────────────────────────────────
apply(seedOp({ op: 'create', target: 'line', aggId: 'L_mod', data: { budget_id: 'bud1', label: 'Ancien', scope: 'complex', planned_amount: 100, kind: 'depense' } }));
const vmod = vOf('budget_chapters', 'L_mod');
ok(apply(seedOp({ op: 'modify', target: 'line', aggId: 'L_mod', expectedVersion: vmod, data: { label: 'Nouveau' } })).applied === true, '3) modification appliquée (version exacte)');
ok(chapter('L_mod')?.label === 'Nouveau', '3) libellé modifié', chapter('L_mod')?.label);
const c3 = apply(seedOp({ op: 'modify', target: 'line', aggId: 'L_mod', expectedVersion: vmod, data: { label: 'Écrasé' } })); // version PÉRIMÉE
ok(c3.result === 'rejected_version_conflict', '3) version périmée → rejected_version_conflict', c3);
ok(chapter('L_mod')?.label === 'Nouveau', '3) modification périmée SANS effet (libellé inchangé)', chapter('L_mod')?.label);

// ── 4) ACCÈS DISTANT ABSENT (userL : autorité mais remote=0) ─────────────────
const c4 = apply(seedOp({ op: 'create', target: 'line', aggId: 'L_norem', actorId: 'userL', data: { budget_id: 'bud1', label: 'X', scope: 'complex', planned_amount: 50, kind: 'depense' } }));
ok(c4.result === 'rejected_no_remote_access', '4) sans accès distant → rejected_no_remote_access', c4);
ok(!chapter('L_norem'), '4) aucune ligne créée', chapter('L_norem'));

// ── 5) AUTRE ÉCOLE ────────────────────────────────────────────────────────────
const c5 = apply(seedOp({ op: 'create', target: 'line', aggId: 'L_other', school: 'sch2', data: { budget_id: 'bud1', label: 'X', scope: 'complex', planned_amount: 50 } }));
ok(c5.result === 'rejected_other_school', '5) autre école → rejected_other_school', c5);

// ── 6) NON AUTORISÉ (userP prépare mais ne peut ACTIVER) ─────────────────────
apply(seedOp({ op: 'create', target: 'line', aggId: 'L_unauth', data: { budget_id: 'bud1', label: 'U', scope: 'complex', planned_amount: 100, kind: 'depense' } }));
apply(seedOp({ op: 'allocate', target: 'allocation', aggId: 'L_unauth', expectedVersion: vOf('budget_chapters', 'L_unauth'), data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } }));
const c6 = apply(seedOp({ op: 'activate', target: 'line', aggId: 'L_unauth', actorId: 'userP', expectedVersion: vOf('budget_chapters', 'L_unauth') }));
ok(c6.result === 'rejected_unauthorized', '6) activation par « preparer » → rejected_unauthorized', c6);
ok(chapter('L_unauth')?.status === 'draft', '6) ligne reste draft (non activée)', chapter('L_unauth')?.status);

// ── 7) ALLOCATION puis ACTIVATION valide (chemin guardé complet) ─────────────
apply(seedOp({ op: 'create', target: 'line', aggId: 'L_ok', data: { budget_id: 'bud1', label: 'OK', scope: 'complex', planned_amount: 500, kind: 'depense' } }));
const a7 = apply(seedOp({ op: 'allocate', target: 'allocation', aggId: 'L_ok', expectedVersion: vOf('budget_chapters', 'L_ok'), data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } }));
ok(a7.applied === true, '7) allocation période appliquée');
ok(db.prepare("SELECT COUNT(*) n FROM budget_line_periods WHERE budget_chapter_id = 'L_ok'").get().n === 1, '7) allocation persistée');
const a7b = apply(seedOp({ op: 'activate', target: 'line', aggId: 'L_ok', expectedVersion: vOf('budget_chapters', 'L_ok') }));
ok(a7b.applied === true, '7) activation appliquée (config complète + cap OK)');
ok(chapter('L_ok')?.status === 'active', '7) ligne active', chapter('L_ok')?.status);

// ── 8) ACTIVATION refusée par le PLAFOND ANNUEL (R-cap re-vérifié au LAN) ─────
apply(seedOp({ op: 'create', target: 'line', aggId: 'L_big', data: { budget_id: 'bud1', label: 'Grosse', scope: 'complex', planned_amount: 99999, kind: 'depense' } }));
apply(seedOp({ op: 'allocate', target: 'allocation', aggId: 'L_big', expectedVersion: vOf('budget_chapters', 'L_big'), data: { periods: [{ budget_period_id: 'per1', pct: 100 }] } }));
const c8 = apply(seedOp({ op: 'activate', target: 'line', aggId: 'L_big', expectedVersion: vOf('budget_chapters', 'L_big') }));
ok(c8.result === 'rejected_rule', '8) activation dépassant l’enveloppe → rejected_rule (cap re-vérifié)', c8);
ok(chapter('L_big')?.status === 'draft', '8) ligne reste draft (cap ferme non contourné)', chapter('L_big')?.status);
ok(confirms('L_big', 'BudgetOperationRejected') === 1, '8) BudgetOperationRejected émis (motif journalisé)');

// ── 9) RÉVISION via RPC tracée (jamais un upsert — R-rpc) ────────────────────
const c9 = apply(seedOp({ op: 'revise', target: 'budget', aggId: 'bud2', expectedVersion: vOf('budgets', 'bud2'), data: { new_amount: 60000, reason: 'Ajustement annuel' } }));
ok(c9.applied === true, '9) révision appliquée', c9);
ok(budget('bud2')?.envelope_amount === 60000, '9) enveloppe annuelle révisée (60000)', budget('bud2')?.envelope_amount);
ok(db.prepare("SELECT COUNT(*) n FROM budget_revisions WHERE annual_budget_id = 'bud2' AND status = 'applied'").get().n === 1, '9) trace budget_revisions « applied » (chemin RPC, pas upsert)');

// ── 10) RÉALLOCATION via RPC tracée entre deux lignes sœurs ──────────────────
db.prepare("INSERT INTO budget_chapters (id, school_id, budget_id, label, scope, planned_amount, status, version) VALUES ('L_src','sch1','bud1','Source','complex',1000,'active',1)").run();
db.prepare("INSERT INTO budget_chapters (id, school_id, budget_id, label, scope, planned_amount, status, version) VALUES ('L_dst','sch1','bud1','Dest','complex',1000,'active',1)").run();
const c10 = apply(seedOp({ op: 'reallocate', target: 'line', aggId: 'L_src', expectedVersion: vOf('budget_chapters', 'L_src'), data: { source_chapter_id: 'L_src', dest_chapter_id: 'L_dst', amount: 300, reason: 'Rééquilibrage' } }));
ok(c10.applied === true, '10) réallocation appliquée', c10);
ok(chapter('L_src')?.planned_amount === 700 && chapter('L_dst')?.planned_amount === 1300, '10) montants transférés (1000→700 / 1000→1300)', { src: chapter('L_src')?.planned_amount, dst: chapter('L_dst')?.planned_amount });
ok(db.prepare("SELECT COUNT(*) n FROM budget_line_reallocations WHERE status = 'applied'").get().n === 1, '10) trace budget_line_reallocations « applied » (chemin RPC)');

// ── 11) ORDRE CAUSAL : modify AVANT create → DIFFÉRÉ, puis appliqué ──────────
// Le modify (rowid antérieur) arrive avant le create : au 1er passage il est
// différé (agrégat absent) ; le create s'applique ; au 2e passage le modify passe.
seedOp({ op: 'modify', target: 'line', aggId: 'L_seq', expectedVersion: 1, data: { label: 'Renommée' }, id: 'seq_mod' });
seedOp({ op: 'create', target: 'line', aggId: 'L_seq', data: { budget_id: 'bud1', label: 'Initiale', scope: 'complex', planned_amount: 100, kind: 'depense' }, id: 'seq_new' });
const pass1 = applyPendingBudgetOps();
ok(pass1.deferred >= 1, '11) 1er passage : modify différé (dépendance absente)', pass1);
ok(chapter('L_seq')?.label === 'Initiale', '11) create appliqué au 1er passage, modify pas encore', chapter('L_seq')?.label);
ok(!opResult('seq_mod'), '11) modify différé N’EST PAS inscrit (sera réessayé)', opResult('seq_mod'));
const pass2 = applyPendingBudgetOps();
ok(pass2.applied >= 1 && chapter('L_seq')?.label === 'Renommée', '11) 2e passage : modify appliqué (ordre causal respecté)', { r: pass2, label: chapter('L_seq')?.label });

// ── 12) GATE : hors mode distant, l'applicateur est INERTE ────────────────────
db.prepare("UPDATE schools SET deployment_policy = NULL WHERE id = 'sch1'").run();
seedOp({ op: 'create', target: 'line', aggId: 'L_gate', data: { budget_id: 'bud1', label: 'G', scope: 'complex', planned_amount: 10 } });
const g = applyPendingBudgetOps();
ok(g.applied === 0 && g.processed === 0, '12) gate OFF → applicateur inerte (0 traité)', g);
ok(!chapter('L_gate'), '12) aucune ligne créée hors mode distant', chapter('L_gate'));
db.prepare("UPDATE schools SET deployment_policy = ? WHERE id = 'sch1'").run(REMOTE_POLICY);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
