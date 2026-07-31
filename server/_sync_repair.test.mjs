// Test — AUTO-RÉPARATION ciblée Cloud ↔ LAN (server/syncRepair.js).
// Cloud simulé par un store AUTORITAIRE vivant (calcule ses propres checksums Merkle/md5,
// applique les push, répond au fetch de partition). On CORROMPT le LAN de 3 façons
// (ligne manquante, ligne en trop, version divergente), puis on vérifie que
// l'auto-réparation converge à 100 %, en ne touchant QUE les partitions concernées.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-repair-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const M = await import('./syncMerkle.js');
const { verifyIntegrity, VERIFY_TABLES } = await import('./syncVerify.js');
const { syncOnce } = await import('./cloudSync.js');
const { autoRepair } = await import('./syncRepair.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const nowIso = () => new Date().toISOString();

// ── Seed LAN : 2 classes, 3 élèves, notes ─────────────────────────────────────
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'T');
for (const c of ['cA', 'cB']) db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run(c, 'sch1', c);
for (const [id, cl] of [['e1', 'cA'], ['e2', 'cA'], ['e3', 'cB']]) db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run(id, 'sch1', cl, id);
db.prepare('INSERT INTO subjects (id, school_id, class_id, name) VALUES (?,?,?,?)').run('m1', 'sch1', 'cA', 'Math');
let g = 0;
const addGrade = (cl, st, seq, val) => db.prepare('INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value, version, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('g' + (++g), 'sch1', cl, st, 'm1', seq, val, 1, '2025-01-01T00:00:00.000Z');
addGrade('cA', 'e1', 1, '12'); addGrade('cA', 'e1', 2, '14'); addGrade('cA', 'e2', 1, '9'); addGrade('cB', 'e3', 1, '15');
M.backfillTable('grades');

// ── Cloud AUTORITAIRE vivant (copie initiale du LAN) ──────────────────────────
function makeCloud() {
  const store = {};
  for (const t of VERIFY_TABLES) { store[t] = new Map(); try { for (const r of db.prepare(`SELECT * FROM "${t}"`).all()) store[t].set(String(r.id), { ...r }); } catch { /* */ } }
  let netUp = true;
  const leafT = (t, r) => M.leaf(t, r.id, r.version);
  const tablelevel = (tables) => {
    const merkle = {}, plain = {};
    for (const t of tables) {
      const rows = [...store[t].values()];
      if (M.isTracked(t) && rows.length) { let s = 0n; for (const r of rows) s = (s + leafT(t, r)) % M.P; merkle[t] = { checksum: s.toString(), count: rows.length }; }
      else { const a = rows.map((r) => `${r.id}:${r.version == null ? '' : r.version}`).sort(); plain[t] = { checksum: md5(a.join(',')), count: rows.length }; }
    }
    return { merkle, plain };
  };
  const scope = (table, sc) => {
    const dim = sc === 'class' ? 'class_id' : sc === 'student' ? 'student_id' : 'sequence';
    const sums = new Map(), counts = new Map();
    for (const r of store[table].values()) { const v = r[dim]; if (v == null || v === '') continue; const k = String(v); sums.set(k, ((sums.get(k) || 0n) + leafT(table, r)) % M.P); counts.set(k, (counts.get(k) || 0) + 1); }
    const parts = {}; for (const [k, s] of sums) parts[k] = { checksum: s.toString(), count: counts.get(k) };
    return { parts };
  };
  const netErr = () => Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' });
  const verifyEdge = async (req) => {
    if (!netUp) throw netErr();
    if (req.op === 'tablelevel') return tablelevel(req.tables || VERIFY_TABLES);
    if (req.op === 'scope') { const s = scope(req.table, req.scope); if (!req.keys) return s; const set = new Set(req.keys.map(String)); const p = {}; for (const k of Object.keys(s.parts)) if (set.has(k)) p[k] = s.parts[k]; return { parts: p }; }
    return {};
  };
  const tomb = new Map(); // `${table}|${id}` -> deleted_at
  const delCloud = (table, id, at) => { store[table].delete(String(id)); tomb.set(`${table}|${id}`, at); };
  const repairEdge = async ({ table, by, keys }) => {
    if (!netUp) throw netErr();
    if (by === 'tombstones') {
      const set = new Set((keys || []).map(String)); const out = [];
      for (const id of set) { const k = `${table}|${id}`; if (tomb.has(k)) out.push({ row_id: id, deleted_at: tomb.get(k) }); }
      return { tombstones: out };
    }
    const rows = [...store[table].values()];
    if (by === 'all') return { rows };
    const col = by === 'student' ? 'student_id' : by === 'class' ? 'class_id' : 'id';
    const set = new Set((keys || []).map(String));
    return { rows: rows.filter((r) => set.has(String(r[col]))) };
  };
  const syncEdge = async (path, body) => {
    if (!netUp) throw netErr();
    if (path === 'sync-pull') {
      const since = body.since; const rows = {}; let cur = since || '';
      for (const t of Object.keys(store)) { rows[t] = [...store[t].values()].filter((r) => !since || String(r.updated_at || '') > String(since)); for (const r of store[t].values()) if (String(r.updated_at || '') > cur) cur = r.updated_at; }
      return { rows, tombstones: [], cursor: cur || null, tomb_cursor: null };
    }
    if (path === 'sync-push') { for (const c of body.changes) { if (c.op === 'delete') store[c.table].delete(String(c.row.id)); else store[c.table].set(String(c.row.id), { ...c.row }); } return { applied: body.changes.length }; }
    throw new Error('path ' + path);
  };
  return { store, verifyEdge, repairEdge, syncEdge, delCloud, setNet: (v) => (netUp = v) };
}
const cloud = makeCloud();
const deps = {
  verify: () => verifyIntegrity({ promote: false, edge: cloud.verifyEdge }),
  sync: () => syncOnce({ edge: cloud.syncEdge }),
  repairEdge: cloud.repairEdge,
};

// ── Sanity : au départ, tout est identique ────────────────────────────────────
ok((await deps.verify()).ok === true, 'départ : Cloud = LAN', null);

// ── CORRUPTION 1 : note manquante en LAN (présente au Cloud) ───────────────────
db.prepare("DELETE FROM grades WHERE id='g1'").run();
M.backfillTable('grades'); // simule un état LAN corrompu (partition recalculée sans g1)
{
  const before = await deps.verify();
  ok(before.ok === false && before.mismatches.includes('grades'), 'C1 détecté : grades diverge', before.mismatches);
  const r = await autoRepair(deps);
  ok(r.ok === true, 'C1 réparé : parité 100 %', { ok: r.ok, mm: r.report.mismatches });
  ok(!!db.prepare("SELECT 1 FROM grades WHERE id='g1'").get(), 'C1 : note manquante restaurée depuis le Cloud', null);
  ok(r.repaired.every((x) => x.table === 'grades'), 'C1 : SEULE grades réparée (rien d\'autre touché)', r.repaired.map((x) => x.table));
}

// ── CORRUPTION 2 : note EN TROP en LAN (absente au Cloud) ─────────────────────
db.prepare("INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value, version, updated_at) VALUES ('gX','sch1','cB','e3','m1',9,'20',1,?)").run(nowIso());
{
  const b = M.snapshotRows('grades', ['gX']); M.maintainMerkle('grades', new Map(), b); // maj Merkle incrémentale
  const before = await deps.verify();
  ok(before.ok === false, 'C2 détecté : note locale en trop', before.mismatches);
  const r = await autoRepair(deps);
  ok(r.ok === true, 'C2 réparé : parité 100 %', r.report.mismatches);
  ok(cloud.store.grades.has('gX'), 'C2 : note locale poussée au Cloud (pas supprimée)', null);
}

// ── CORRUPTION 3 : version divergente (Cloud plus récent gagne en LWW) ─────────
cloud.store.grades.set('g3', { ...cloud.store.grades.get('g3'), value: 'cloud-new', version: 50, updated_at: '2030-01-01T00:00:00.000Z' });
{
  const before = await deps.verify();
  ok(before.ok === false, 'C3 détecté : version divergente', before.mismatches);
  const r = await autoRepair(deps);
  ok(r.ok === true, 'C3 réparé : parité 100 %', r.report.mismatches);
  ok(db.prepare("SELECT value FROM grades WHERE id='g3'").get()?.value === 'cloud-new', 'C3 : LWW → valeur Cloud récente adoptée en LAN', db.prepare("SELECT value FROM grades WHERE id='g3'").get()?.value);
}

// ── Bornage : une divergence d'UNE classe ne descend pas dans l'autre ─────────
db.prepare("UPDATE grades SET value='zz', version=version+1 WHERE id='g4'").run(); // g4 = classe cB
{
  const b = M.snapshotRows('grades', ['g4']); // maj Merkle
  db.prepare("UPDATE grades SET version=version WHERE id='g4'").run();
  M.backfillTable('grades');
  const r = await autoRepair(deps);
  ok(r.ok === true, 'bornage : convergence après divergence classe cB', r.report.mismatches);
  ok(r.rounds <= 3, 'bornage : convergence en ≤ 3 passes', r.rounds);
}

// ── CORRUPTION 4 (M1) : le Cloud a SUPPRIMÉ une note → l'auto-réparation la SUPPRIME
//    en LAN au lieu de la ressusciter ────────────────────────────────────────────
cloud.delCloud('grades', 'g4', '2030-06-01T00:00:00.000Z'); // supprimée au Cloud (tombstone récent) ; LAN a encore g4 (2025)
{
  const before = await deps.verify();
  ok(before.ok === false, 'C4 détecté : g4 supprimée au Cloud, encore présente en LAN', before.mismatches);
  const r = await autoRepair(deps);
  ok(r.ok === true, 'C4 réparé : parité 100 %', r.report.mismatches);
  ok(!db.prepare("SELECT 1 FROM grades WHERE id='g4'").get(), 'C4 (M1) : note SUPPRIMÉE localement (PAS ressuscitée)', db.prepare("SELECT 1 FROM grades WHERE id='g4'").get());
  ok(!cloud.store.grades.has('g4'), 'C4 (M1) : toujours absente au Cloud (jamais re-poussée)', cloud.store.grades.has('g4'));
  ok(r.repaired.some((x) => x.deleted > 0), 'C4 (M1) : la réparation comptabilise une suppression', r.repaired);
}

// ── CORRUPTION 5 (M1, sens inverse) : re-création locale POSTÉRIEURE à une vieille
//    suppression Cloud → la ligne est CONSERVÉE + poussée (LWW : local récent gagne) ─
cloud.delCloud('grades', 'g3', '2020-01-01T00:00:00.000Z'); // suppression Cloud ANCIENNE
{
  const bt = M.snapshotRows('grades', ['g3']); // AVANT la modif locale
  db.prepare("UPDATE grades SET value='relocal', updated_at='2031-01-01T00:00:00.000Z', version=version+1 WHERE id='g3'").run(); // modif locale récente
  M.maintainMerkle('grades', bt, M.snapshotRows('grades', ['g3']));
  const r = await autoRepair(deps);
  ok(r.ok === true, 'C5 réparé : parité 100 %', r.report.mismatches);
  ok(db.prepare("SELECT 1 FROM grades WHERE id='g3'").get() && cloud.store.grades.has('g3'), 'C5 (M1) : modif locale postérieure CONSERVÉE + repoussée (pas supprimée)', null);
}

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
