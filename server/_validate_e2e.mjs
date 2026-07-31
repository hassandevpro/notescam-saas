// server/_validate_e2e.mjs
// Harness de validation ÉCHELLE + PERFORMANCE + SCÉNARIOS (côté LAN, exécutable sans
// Postgres). Un PROFIL par exécution (env NC_STUDENTS) → l'orchestrateur le rejoue pour
// petite/moyenne/grande école. Émet un JSON `__RESULT__{...}` en dernière ligne.
//
// Mesure : import massif (débit), 1er backfill Merkle, coût de maintenance incrémentale,
// temps d'audit (identique vs 1 divergence), mémoire, nb de partitions (≈ « triggers »).
// Scénarios (si NC_SCENARIOS=1) : coupure réseau + reprise, conflit LWW, changement de
// classe, changement d'année, suppression, restauration → backfill → audit.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-e2e-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const STUDENTS = Number(process.env.NC_STUDENTS || 500);
const SUBJECTS = Number(process.env.NC_SUBJECTS || 8);
const SEQUENCES = Number(process.env.NC_SEQUENCES || 6);
const PER_CLASS = 40;
const RUN_SCEN = process.env.NC_SCENARIOS === '1';

const { db } = await import('./db.js');
const M = await import('./syncMerkle.js');
const { verifyIntegrity, VERIFY_TABLES } = await import('./syncVerify.js');
const { runQuery } = await import('./query.js');
const { syncOnce } = await import('./cloudSync.js');

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const nowIso = () => new Date().toISOString();
const ms = (t) => Math.round(t * 100) / 100;
const scen = []; // {name, ok, info}
const okScen = (name, cond, info) => scen.push({ name, ok: !!cond, info: info ?? null });

// ── Seed à l'échelle (années multiples via current_year) ──────────────────────
const CLASSES = Math.max(1, Math.ceil(STUDENTS / PER_CLASS));
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École échelle');
const classIds = [], studentIds = [], subjByClass = {};
for (let c = 0; c < CLASSES; c++) {
  const cid = 'c' + c;
  classIds.push(cid);
  db.prepare('INSERT INTO classes (id, school_id, name, current_year) VALUES (?,?,?,?)')
    .run(cid, 'sch1', 'Classe ' + c, c % 2 === 0 ? '2025-2026' : '2024-2025'); // 2 années scolaires
  subjByClass[cid] = [];
  for (let s = 0; s < SUBJECTS; s++) {
    const sid = `s_${c}_${s}`;
    subjByClass[cid].push(sid);
    db.prepare('INSERT INTO subjects (id, school_id, class_id, name) VALUES (?,?,?,?)').run(sid, 'sch1', cid, 'Mat' + s);
  }
}
for (let i = 0; i < STUDENTS; i++) {
  const id = 'st' + i, cid = classIds[i % CLASSES];
  studentIds.push({ id, cid });
  db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run(id, 'sch1', cid, 'Élève ' + i);
}

// ── Import massif de notes (bulk : pas de maintenance Merkle par ligne) ────────
M.setBulkMode(true);
const cpu0 = process.cpuUsage();
const t0 = performance.now();
let gradeCount = 0;
db.exec('BEGIN');
const insG = db.prepare('INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value, version, updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
for (const { id: st, cid } of studentIds) {
  for (const sub of subjByClass[cid]) {
    for (let q = 1; q <= SEQUENCES; q++) {
      insG.run('g_' + (gradeCount++), 'sch1', cid, st, sub, q, String(8 + (gradeCount % 12)), 1, nowIso());
    }
  }
}
db.exec('COMMIT');
const importMs = performance.now() - t0;
const cpuImport = process.cpuUsage(cpu0);
M.setBulkMode(false);

// ── 1er backfill Merkle (reconstruction complète) ─────────────────────────────
const tb = performance.now();
const bf = M.backfillTable('grades');
const backfillMs = performance.now() - tb;
const partitions = db.prepare('SELECT COUNT(*) c FROM sync_merkle').get().c;
const mem = process.memoryUsage();

// ── Coût de la maintenance incrémentale (200 mises à jour ciblées) ────────────
// Enveloppé dans UNE transaction : reflète la production (query.js écrit la donnée
// ET met à jour le Merkle dans la même tx → un seul fsync), pas un fsync par bump.
const K = Math.min(200, gradeCount);
const tu = performance.now();
db.exec('BEGIN');
for (let i = 0; i < K; i++) {
  const gid = 'g_' + (i * 7 % gradeCount);
  const before = M.snapshotRows('grades', [gid]);
  db.prepare('UPDATE grades SET value = ?, version = version + 1 WHERE id = ?').run(String(1 + i % 20), gid);
  M.maintainMerkle('grades', before, M.snapshotRows('grades', [gid]));
}
db.exec('COMMIT');
const incrPerOpMs = (performance.now() - tu) / K;
// Invariant : après ces maj incrémentales, l'arbre == un backfill recalculé.
const dumpBefore = db.prepare("SELECT part_key, checksum, row_count FROM sync_merkle WHERE part_key='grades' OR part_key LIKE 'grades|%' ORDER BY part_key").all().map((r) => `${r.part_key}=${r.checksum}:${r.row_count}`).join('|');
M.backfillTable('grades');
const dumpAfter = db.prepare("SELECT part_key, checksum, row_count FROM sync_merkle WHERE part_key='grades' OR part_key LIKE 'grades|%' ORDER BY part_key").all().map((r) => `${r.part_key}=${r.checksum}:${r.row_count}`).join('|');
okScen('incrémental ≡ backfill (à l\'échelle)', dumpBefore === dumpAfter);

// ── Miroir Cloud figé (snapshot profond) + audits chronométrés ────────────────
function plainOf(t) { let r = []; try { r = db.prepare(`SELECT id, version FROM "${t}" ORDER BY id`).all(); } catch { r = []; } return { checksum: md5(r.map((x) => `${x.id}:${x.version == null ? '' : x.version}`).join(',')), count: r.length }; }
function freeze() {
  const merkle = {}, plain = {}, scopes = {};
  for (const t of VERIFY_TABLES) {
    const mk = M.isTracked(t) ? M.localTableChecksum(t) : null;
    if (mk) { merkle[t] = { checksum: mk.checksum, count: mk.count }; scopes[t] = { class: M.localScope(t, 'class'), student: M.localScope(t, 'student'), seq: M.localScope(t, 'seq') }; }
    else plain[t] = plainOf(t);
  }
  return { merkle, plain, scopes };
}
const edgeFrom = (f) => async (req) => {
  if (req.op === 'tablelevel') return { merkle: f.merkle, plain: f.plain };
  if (req.op === 'scope') { const s = f.scopes[req.table]?.[req.scope] || {}; if (!req.keys) return { parts: s }; const set = new Set(req.keys.map(String)); const p = {}; for (const k of Object.keys(s)) if (set.has(k)) p[k] = s[k]; return { parts: p }; }
  return {};
};

const frozenIdent = freeze();
const ta = performance.now();
const auditIdent = await verifyIntegrity({ edge: edgeFrom(frozenIdent) });
const auditIdentMs = performance.now() - ta;
okScen('audit identique = 100 %', auditIdent.ok && auditIdent.summary.scopesCompared === 0, `scopes=${auditIdent.summary.scopesCompared}`);

// 1 note modifiée → descente localisée + bornée + chronométrée.
const frozen1 = freeze();
const gTarget = 'g_0';
const bt = M.snapshotRows('grades', [gTarget]);
db.prepare('UPDATE grades SET value = ?, version = version + 1 WHERE id = ?').run('99', gTarget);
M.maintainMerkle('grades', bt, M.snapshotRows('grades', [gTarget]));
const td = performance.now();
const audit1 = await verifyIntegrity({ edge: edgeFrom(frozen1) });
const audit1Ms = performance.now() - td;
okScen('audit 1 divergence : localisé + borné', !audit1.ok && audit1.mismatches.length === 1 && audit1.mismatches[0] === 'grades' && audit1.summary.scopesCompared <= 4, `scopes=${audit1.summary.scopesCompared}`);

// ── SCÉNARIOS de synchro (uniquement sur le profil « petite école ») ──────────
if (RUN_SCEN) {
  // Mock Cloud minimal (stateful) pour exercer push/pull/coupure/reprise/conflit.
  function makeCloud() {
    const store = {}; const tomb = []; let up = true; let tombCur = '';
    const edge = async (path, body) => {
      if (!up) throw Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' });
      if (path === 'sync-pull') {
        const since = body.since; const rows = {};
        for (const [t, m] of Object.entries(store)) rows[t] = [...m.values()].filter((r) => !since || String(r.updated_at || '') > String(since));
        let cur = since || '';
        for (const m of Object.values(store)) for (const r of m.values()) if (String(r.updated_at || '') > cur) cur = r.updated_at;
        return { rows, tombstones: tomb.filter((x) => !body.tomb_since || x.deleted_at > body.tomb_since), cursor: cur || null, tomb_cursor: tombCur || null };
      }
      if (path === 'sync-push') {
        for (const c of body.changes) { store[c.table] ??= new Map(); if (c.op === 'delete') { store[c.table].delete(c.row.id); tombCur = nowIso(); tomb.push({ tablename: c.table, row_id: c.row.id, deleted_at: tombCur }); } else store[c.table].set(c.row.id, c.row); }
        return { applied: body.changes.length };
      }
      throw new Error('path ' + path);
    };
    return { edge, store, setNet: (v) => (up = v), seed: (t, r) => (store[t] ??= new Map()).set(r.id, r) };
  }
  const cloud = makeCloud();

  // (a) LAN → Cloud : un changement local est poussé.
  runQuery({ table: 'grades', action: 'upsert', onConflict: 'id', values: { id: 'gPush', school_id: 'sch1', class_id: classIds[0], student_id: studentIds[0].id, subject_id: subjByClass[classIds[0]][0], sequence: SEQUENCES + 10, value: '13' } });
  await syncOnce({ edge: cloud.edge });
  okScen('LAN → Cloud (push)', cloud.store.grades?.get('gPush')?.value === '13');

  // (b) COUPURE réseau : le cycle échoue, le curseur N'AVANCE PAS.
  const curBefore = db.prepare("SELECT value FROM sync_cursor WHERE name='pull_at'").get()?.value || null;
  cloud.setNet(false);
  let threw = false; try { await syncOnce({ edge: cloud.edge }); } catch { threw = true; }
  const curAfter = db.prepare("SELECT value FROM sync_cursor WHERE name='pull_at'").get()?.value || null;
  okScen('coupure réseau : échec propre, curseur figé', threw && curBefore === curAfter);

  // (c) REPRISE : le réseau revient, une note distante est intégrée + Merkle maintenu.
  cloud.setNet(true);
  cloud.seed('grades', { id: 'gRemote', school_id: 'sch1', class_id: classIds[0], student_id: studentIds[0].id, subject_id: subjByClass[classIds[0]][0], sequence: SEQUENCES + 11, value: '17', updated_at: nowIso(), version: 1 });
  await syncOnce({ edge: cloud.edge });
  okScen('reprise après coupure : note distante intégrée', !!db.prepare("SELECT 1 FROM grades WHERE id='gRemote'").get());

  // (d) CONFLIT simultané (LWW) : distant plus récent gagne.
  const gid = 'g_1';
  db.prepare("UPDATE grades SET value='localOld', updated_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(gid);
  cloud.seed('grades', { ...db.prepare('SELECT * FROM grades WHERE id=?').get(gid), value: 'cloudNew', updated_at: '2030-01-01T00:00:00.000Z', version: 99 });
  db.prepare("DELETE FROM sync_cursor WHERE name='pull_at'").run(); // re-tirer
  await syncOnce({ edge: cloud.edge });
  okScen('conflit LWW : version distante récente gagne', db.prepare('SELECT value FROM grades WHERE id=?').get(gid)?.value === 'cloudNew');

  // (e) CHANGEMENT DE CLASSE : la note bouge de classe → Merkle cohérent (incr ≡ backfill).
  const gmove = 'g_2';
  const bmv = M.snapshotRows('grades', [gmove]);
  db.prepare('UPDATE grades SET class_id=?, version=version+1 WHERE id=?').run(classIds[1 % CLASSES], gmove);
  M.maintainMerkle('grades', bmv, M.snapshotRows('grades', [gmove]));
  const d1 = db.prepare("SELECT part_key,checksum,row_count FROM sync_merkle WHERE part_key LIKE 'grades|%' ORDER BY part_key").all().map((r) => `${r.part_key}=${r.checksum}:${r.row_count}`).join('|');
  M.backfillTable('grades');
  const d2 = db.prepare("SELECT part_key,checksum,row_count FROM sync_merkle WHERE part_key LIKE 'grades|%' ORDER BY part_key").all().map((r) => `${r.part_key}=${r.checksum}:${r.row_count}`).join('|');
  okScen('changement de classe : Merkle cohérent', d1 === d2);

  // (f) CHANGEMENT D'ANNÉE : muter current_year (table plain) ne casse pas l'audit.
  runQuery({ table: 'classes', action: 'update', values: { current_year: '2026-2027' }, filters: [{ col: 'id', op: 'eq', val: classIds[0] }] });
  const auY = await verifyIntegrity({ edge: edgeFrom(freeze()) });
  okScen('changement d\'année : audit cohérent', auY.ok);

  // (g) SUPPRESSION : delete local → partition Merkle mise à jour, plus de fantôme.
  const delId = 'g_3';
  runQuery({ table: 'grades', action: 'delete', filters: [{ col: 'id', op: 'eq', val: delId }] });
  const stillThere = !!db.prepare('SELECT 1 FROM grades WHERE id=?').get(delId);
  M.backfillTable('grades'); const dref = db.prepare("SELECT checksum FROM sync_merkle WHERE scope='table' AND part_key='grades'").get()?.checksum;
  const dlive = (() => { // recompute live table checksum for equality
    return M.localTableChecksum('grades')?.checksum;
  })();
  okScen('suppression : ligne retirée + Merkle à jour', !stillThere && dref === dlive);

  // (h) RESTAURATION : vider puis réinsérer + backfillAllTracked → audit identique.
  const snapshot = db.prepare('SELECT * FROM grades').all();
  db.exec('DELETE FROM grades');
  M.setBulkMode(true);
  db.exec('BEGIN');
  for (const r of snapshot) db.prepare('INSERT INTO grades (id,school_id,class_id,student_id,subject_id,sequence,value,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(r.id, r.school_id, r.class_id, r.student_id, r.subject_id, r.sequence, r.value, r.version, r.updated_at);
  db.exec('COMMIT');
  M.setBulkMode(false);
  M.backfillAllTracked();
  const auR = await verifyIntegrity({ edge: edgeFrom(freeze()) });
  okScen('restauration → backfill → audit identique', auR.ok);

  // (i) DOUBLE synchronisation : rejouer le cycle ne duplique rien (idempotence).
  const c0 = db.prepare('SELECT COUNT(*) n FROM grades').get().n;
  await syncOnce({ edge: cloud.edge });
  await syncOnce({ edge: cloud.edge });
  const c1 = db.prepare('SELECT COUNT(*) n FROM grades').get().n;
  okScen('double synchronisation : idempotente (aucun doublon)', c0 === c1, `${c0}→${c1}`);
}

const result = {
  profile: STUDENTS, students: STUDENTS, classes: CLASSES, grades: gradeCount,
  partitions,
  perf: {
    importMs: ms(importMs), importThroughput: Math.round(gradeCount / (importMs / 1000)),
    backfillMs: ms(backfillMs), backfillThroughput: Math.round(gradeCount / (backfillMs / 1000)),
    incrPerOpMs: ms(incrPerOpMs),
    auditIdentMs: ms(auditIdentMs), audit1Ms: ms(audit1Ms),
    rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576),
    cpuImportMs: Math.round((cpuImport.user + cpuImport.system) / 1000),
    partitionWrites: gradeCount * 4, // ≈ « triggers » exécutés (1 table + 3 dimensions par note)
  },
  scenarios: scen,
  scenariosOk: scen.every((s) => s.ok),
};
console.log(`Profil ${STUDENTS} élèves · ${gradeCount} notes · import ${ms(importMs)}ms (${result.perf.importThroughput}/s) · backfill ${ms(backfillMs)}ms · audit identique ${ms(auditIdentMs)}ms · audit 1-écart ${ms(audit1Ms)}ms · RSS ${result.perf.rssMB}MB`);
for (const s of scen) console.log(`  ${s.ok ? '✅' : '❌'} ${s.name}${s.info ? ' (' + s.info + ')' : ''}`);
console.log('__RESULT__' + JSON.stringify(result));
process.exit(result.scenariosOk ? 0 : 1);
