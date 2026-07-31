// Test — Audit d'intégrité HIÉRARCHIQUE (server/syncVerify.js).
// Le Cloud est simulé par un miroir FIGÉ de l'état LAN. On vérifie :
//   • identique → ok, AUCUNE descente (scopesCompared = 0) ;
//   • une note modifiée dans UNE classe → seule grades diverge, descente LOCALISÉE
//     (classe/élève précis) et BORNÉE (pas de rescan des autres tables/classes) ;
//   • table non suivie (plain) divergente → signalée au niveau table.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-hverify-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const M = await import('./syncMerkle.js');
const { verifyIntegrity, VERIFY_TABLES } = await import('./syncVerify.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const nowIso = () => new Date().toISOString();

// ── Jeu local : 2 classes, 3 élèves, 4 notes ──────────────────────────────────
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'T');
for (const [id] of [['cA'], ['cB']]) db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run(id, 'sch1', id);
for (const [id, cl] of [['e1', 'cA'], ['e2', 'cA'], ['e3', 'cB']]) db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run(id, 'sch1', cl, id);
db.prepare('INSERT INTO subjects (id, school_id, class_id, name) VALUES (?,?,?,?)').run('m1', 'sch1', 'cA', 'Math');
let g = 0;
const addGrade = (cl, st, seq, val) => db.prepare('INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value, version, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
  .run('g' + (++g), 'sch1', cl, st, 'm1', seq, val, 1, nowIso());
addGrade('cA', 'e1', 1, '12'); addGrade('cA', 'e2', 1, '9'); addGrade('cB', 'e3', 1, '15'); addGrade('cB', 'e3', 2, '11');
M.backfillTable('grades');

// ── Miroir Cloud FIGÉ (snapshot profond de l'état courant) ────────────────────
function plainOf(table) {
  let rows = [];
  try { rows = db.prepare(`SELECT id, version FROM "${table}" ORDER BY id`).all(); } catch { rows = []; }
  return { checksum: md5(rows.map((r) => `${r.id}:${r.version == null ? '' : r.version}`).join(',')), count: rows.length };
}
function freezeCloud() {
  const merkle = {}, plain = {}, scopes = {};
  for (const t of VERIFY_TABLES) {
    const mk = M.isTracked(t) ? M.localTableChecksum(t) : null;
    if (mk) { merkle[t] = { checksum: mk.checksum, count: mk.count };
      scopes[t] = { class: M.localScope(t, 'class'), student: M.localScope(t, 'student'), seq: M.localScope(t, 'seq') };
    } else plain[t] = plainOf(t);
  }
  return { merkle, plain, scopes };
}
function edgeFrom(frozen) {
  return async (req) => {
    if (req.op === 'tablelevel') return { merkle: frozen.merkle, plain: frozen.plain };
    if (req.op === 'scope') {
      const s = frozen.scopes[req.table]?.[req.scope] || {};
      if (!req.keys) return { parts: s };
      const set = new Set(req.keys.map(String)); const parts = {};
      for (const k of Object.keys(s)) if (set.has(k)) parts[k] = s[k];
      return { parts };
    }
    return {};
  };
}

// ── A. Identique → 100 %, AUCUNE descente ─────────────────────────────────────
{
  const r = await verifyIntegrity({ edge: edgeFrom(freezeCloud()) });
  ok(r.ok === true, 'A: ok quand identique', { ok: r.ok, mm: r.mismatches });
  ok(r.summary.scopesCompared === 0, 'A: aucune descente (0 scope comparé)', r.summary);
  ok(r.tables.find((t) => t.table === 'grades').method === 'merkle', 'A: grades comparée en MERKLE', r.tables.find((t) => t.table === 'grades'));
  ok(r.tables.find((t) => t.table === 'classes').method === 'plain', 'A: classes comparée en PLAIN', r.tables.find((t) => t.table === 'classes'));
  // Rapport de synchro : les 11 métriques demandées + empreinte globale.
  const keys = r.dashboard.map((d) => d.key);
  ok(['classes', 'students', 'teachers', 'subjects', 'users', 'grades', 'bulletins', 'absences', 'budgets', 'expenses', 'payments'].every((k) => keys.includes(k)), 'A: rapport contient les 11 métriques', keys);
  ok(r.globalChecksum && r.globalChecksum.match === true, 'A: empreinte globale identique', r.globalChecksum);
}

// ── B. Une note de la classe cA modifiée → divergence LOCALISÉE + BORNÉE ───────
{
  const frozen = freezeCloud(); // Cloud figé AVANT la mutation locale
  const before = M.snapshotRows('grades', ['g1']);
  db.prepare('UPDATE grades SET value = ?, version = version + 1 WHERE id = ?').run('20', 'g1');
  M.maintainMerkle('grades', before, M.snapshotRows('grades', ['g1']));

  const r = await verifyIntegrity({ edge: edgeFrom(frozen) });
  ok(r.ok === false && r.mismatches.length === 1 && r.mismatches[0] === 'grades', 'B: SEULE grades diverge', r.mismatches);
  const d = r.divergences.find((x) => x.table === 'grades');
  ok(d && d.classes.length === 1 && d.classes[0].class_id === 'cA', 'B: descente localise la classe cA', d);
  ok(d.classes[0].students.includes('e1'), 'B: élève e1 localisé', d.classes[0]);
  ok(!d.classes.some((c) => c.class_id === 'cB'), 'B: classe cB (non divergente) JAMAIS descendue', d.classes);
  // Descente bornée : class(1) + seq(1) + students de la seule classe cA(1) = 3.
  ok(r.summary.scopesCompared === 3, 'B: descente bornée (3 scopes, pas de rescan global)', r.summary);
  ok(r.globalChecksum.match === false, 'B: empreinte globale différente', r.globalChecksum);
  ok(r.mismatchLabels.includes('Notes'), 'B: libellé lisible de la table divergente (Notes)', r.mismatchLabels);
}

// ── C. Table PLAIN divergente (petite table de config) → signalée au niveau table
{
  const frozen = freezeCloud();
  db.prepare("UPDATE subjects SET name = 'Maths', version = COALESCE(version,0)+1 WHERE id = 'm1'").run();
  const r = await verifyIntegrity({ edge: edgeFrom(frozen) });
  ok(r.mismatches.includes('subjects'), 'C: subjects (plain) divergente signalée', r.mismatches);
  ok(!r.divergences.some((d) => d.table === 'subjects'), 'C: pas de descente pour une table plain', r.divergences);
}

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
