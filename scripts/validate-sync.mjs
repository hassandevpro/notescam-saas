// scripts/validate-sync.mjs
// ORCHESTRATEUR de validation pré-BUILD de la synchro/Merkle. Exécute :
//   1. la validation STATIQUE des migrations Postgres (idempotence + sûreté) ;
//   2. les suites de tests unitaires/comportement (Merkle, audit, sync LWW, reprise,
//      appairage, métriques) ;
//   3. le harness ÉCHELLE + PERFORMANCE + SCÉNARIOS pour petite/moyenne(/grande) école ;
//   4. rappelle le GATE Postgres (self-check à exécuter sur staging).
// Produit un RAPPORT (réussis / échoués / temps / recommandations) et sort en CODE ≠ 0
// si un test CRITIQUE échoue → le BUILD ne doit être lancé que si ce script passe.
//
// Usage : node scripts/validate-sync.mjs [--full]   (--full ⇒ profil grande école 50k)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const FULL = process.argv.includes('--full') || process.env.FULL_SCALE === '1';
const t0 = Date.now();
const results = []; // {section, name, critical, ok, ms, info}

function run(cmd, args, env = {}) {
  const t = Date.now();
  const r = spawnSync(NODE, args, { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, ms: Date.now() - t, out: (r.stdout || '') + (r.stderr || '') };
}
const record = (section, name, critical, res, info) => { results.push({ section, name, critical, ok: res.ok, ms: res.ms, info: info || null }); return res; };

// ── 1. Migrations (statique) ──────────────────────────────────────────────────
{
  const res = run('node', [join(ROOT, 'scripts/validate-migrations.mjs'), '--json']);
  let warns = 0; try { warns = (JSON.parse(res.out.trim().split('\n').pop()).warns || []).length; } catch { /* */ }
  record('Migrations Postgres (statique)', 'Idempotence, triggers non dupliqués, aucune donnée cassée', true, res, `${warns} avertissement(s)`);
}

// ── 2. Tests unitaires & comportement ─────────────────────────────────────────
const SUITES = [
  ['Merkle : incrémental ≡ backfill + promotion seuil', 'server/_sync_merkle.test.mjs', true],
  ['Audit hiérarchique : descente ciblée bornée', 'server/_sync_verify.test.mjs', true],
  ['Auto-réparation : corruption → détection → 100 %', 'server/_sync_repair.test.mjs', true],
  ['Garde de parité + sauvegarde d’urgence', 'server/_parity_gate.test.mjs', true],
  ['Sync LWW : conflit / pull / push / delete / anti-écho', 'server/_cloud_sync.test.mjs', true],
  ['Journal d’événements : coupure / reprise / idempotence', 'server/_event_sync.test.mjs', true],
  ['Appairage fail-safe + gate d’intégrité', 'server/_pairing.test.mjs', true],
  ['Fondations OTA + garde de parité mise à jour', 'server/_update_service.test.mjs', true],
  ['Métriques de santé (backlog / temps / bloquée)', 'server/_sync_metrics.test.mjs', false],
  ['Journal d’audit persistant', 'server/_sync_audit.test.mjs', false],
];
for (const [name, file, critical] of SUITES) {
  record('Tests unitaires & comportement', name, critical, run('node', [join(ROOT, file)]));
}

// ── 3. Échelle + performance + scénarios ──────────────────────────────────────
const PROFILES = [
  ['petite (~500 élèves)', { NC_STUDENTS: '500', NC_SCENARIOS: '1' }, true],
  ['moyenne (~5 000 élèves)', { NC_STUDENTS: '5000' }, true],
];
if (FULL) PROFILES.push(['grande (~50 000 élèves)', { NC_STUDENTS: '50000' }, true]);
const perf = [];
for (const [label, env, critical] of PROFILES) {
  const res = run('node', [join(ROOT, 'server/_validate_e2e.mjs')], env);
  let data = null;
  const m = res.out.match(/__RESULT__(\{.*\})/);
  if (m) { try { data = JSON.parse(m[1]); } catch { /* */ } }
  if (data) perf.push({ label, ...data });
  const scen = data ? `${data.scenarios.filter((s) => s.ok).length}/${data.scenarios.length} scénarios` : 'résultat illisible';
  record('Échelle & performance', `Profil ${label}`, critical, res, scen);
}

// ── Rapport ───────────────────────────────────────────────────────────────────
const crit = results.filter((r) => r.critical);
const critFail = crit.filter((r) => !r.ok);
const totalFail = results.filter((r) => !r.ok);
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const L = [];
L.push('');
L.push('════════════════════ RAPPORT DE VALIDATION SYNC / MERKLE ════════════════════');
L.push(`Durée totale : ${((Date.now() - t0) / 1000).toFixed(1)} s · ${new Date().toLocaleString('fr-FR')}`);
let section = '';
for (const r of results) {
  if (r.section !== section) { section = r.section; L.push(''); L.push(`── ${section} ──`); }
  const tag = r.critical ? '[CRITIQUE]' : '[INFO]    ';
  L.push(`  ${tag} ${pad(r.name, 58)} ${r.ok ? '✅ PASS' : '❌ FAIL'}  ${String(r.ms).padStart(6)}ms${r.info ? '  · ' + r.info : ''}`);
}
// Détail performance
if (perf.length) {
  L.push('');
  L.push('── Performance (par profil) ──');
  L.push('  ' + pad('Profil', 22) + pad('Notes', 10) + pad('Import', 16) + pad('Backfill', 12) + pad('Audit=', 9) + pad('Audit≠', 9) + pad('RSS', 7) + 'Partitions~triggers');
  for (const p of perf) {
    L.push('  ' + pad(p.label, 22) + pad(String(p.grades), 10)
      + pad(`${p.perf.importMs}ms(${p.perf.importThroughput}/s)`, 16)
      + pad(`${p.perf.backfillMs}ms`, 12) + pad(`${p.perf.auditIdentMs}ms`, 9) + pad(`${p.perf.audit1Ms}ms`, 9)
      + pad(`${p.perf.rssMB}MB`, 7) + `${p.partitions} / ~${p.perf.partitionWrites}`);
  }
  if (!FULL) L.push('  (profil « grande » (~50 000 él, millions de notes) : relancer avec --full)');
}
// Gate Postgres
L.push('');
L.push('── Parité Postgres (à exécuter sur STAGING) ──');
L.push('  [MANUEL] supabase_sync_merkle_selfcheck.sql — RAISE si la formule/objets divergent du LAN.');
L.push('           (Docker/psql indisponibles ici : ce gate ne peut pas tourner dans ce sandbox.)');

// Recommandations
const reco = [];
for (const p of perf) {
  if (p.perf.backfillThroughput && p.perf.backfillThroughput < 5000) reco.push(`Backfill ${p.label} lent (${p.perf.backfillThroughput}/s) — lancer les backfills en heure creuse.`);
  if (p.perf.audit1Ms > 500) reco.push(`Audit 1-écart ${p.label} = ${p.perf.audit1Ms}ms — surveiller si > 1s à plus grande échelle.`);
}
if (!FULL) reco.push('Valider une fois le profil « grande » avec --full sur une machine de recette avant la prod.');
reco.push('Exécuter supabase_sync_merkle_selfcheck.sql sur staging APRÈS les migrations (gate de parité Postgres).');
L.push('');
L.push('── Recommandations ──');
for (const r of reco) L.push('  • ' + r);

L.push('');
L.push(`Tests critiques : ${crit.length - critFail.length}/${crit.length} ✅   ·   Total échoués : ${totalFail.length}`);
L.push(critFail.length === 0
  ? '✅ TOUS LES TESTS CRITIQUES SONT VALIDÉS — BUILD AUTORISÉ.'
  : `❌ BUILD BLOQUÉ — ${critFail.length} test(s) critique(s) en échec : ${critFail.map((r) => r.name).join(' ; ')}`);
L.push('══════════════════════════════════════════════════════════════════════════════');

const report = L.join('\n');
console.log(report);
if (process.argv.includes('--json')) console.log('__REPORT_JSON__' + JSON.stringify({ ok: critFail.length === 0, results, perf }));
process.exit(critFail.length === 0 ? 0 : 1);
