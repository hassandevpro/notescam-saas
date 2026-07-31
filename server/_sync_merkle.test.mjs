// Test — Arbre de Merkle adaptatif (server/syncMerkle.js).
// Invariant central : la maintenance INCRÉMENTALE (à chaque écriture) produit
// EXACTEMENT le même arbre qu'un backfill complet recalculé de zéro — pour insert,
// update (version++), delete ET changement de dimension (élève qui change de classe).
// Vérifie aussi la lecture de scopes (descente) et la promotion par seuil.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-merkle-'));

const { db } = await import('./db.js');
const { setSetting } = await import('./syncFlag.js');
const M = await import('./syncMerkle.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// Dump ordonné de tout l'arbre (pour comparaison incrémental vs backfill).
const dump = () => db.prepare('SELECT scope, part_key, checksum, row_count FROM sync_merkle ORDER BY scope, part_key')
  .all().map((r) => `${r.scope}|${r.part_key}=${r.checksum}:${r.row_count}`).join('\n');

const nowIso = () => new Date().toISOString();
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'T');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('cA', 'sch1', 'A');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('cB', 'sch1', 'B');
for (const [id, cl] of [['s1', 'cA'], ['s2', 'cA'], ['s3', 'cB']])
  db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run(id, 'sch1', cl, id);
db.prepare('INSERT INTO subjects (id, school_id, class_id, name) VALUES (?,?,?,?)').run('sub1', 'sch1', 'cA', 'Math');

// Écriture instrumentée : insert/maj/suppr d'UNE ligne grades + maintenance Merkle.
function writeGrade({ id, class_id, student_id, subject_id = 'sub1', sequence = 1, value, del = false }) {
  const before = M.snapshotRows('grades', [id]);
  if (del) {
    db.prepare('DELETE FROM grades WHERE id = ?').run(id);
  } else if (before.size) {
    db.prepare('UPDATE grades SET value = ?, version = COALESCE(version,0)+1, class_id = ?, student_id = ?, sequence = ? WHERE id = ?')
      .run(value, class_id, student_id, sequence, id);
  } else {
    db.prepare('INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value, version, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, 'sch1', class_id, student_id, subject_id, sequence, value, 1, nowIso());
  }
  const after = M.snapshotRows('grades', [id]);
  M.maintainMerkle('grades', before, after);
}

// ── A. Incrémental (inserts) == backfill ──────────────────────────────────────
writeGrade({ id: 'g1', class_id: 'cA', student_id: 's1', sequence: 1, value: '12' });
writeGrade({ id: 'g2', class_id: 'cA', student_id: 's2', sequence: 1, value: '9' });
writeGrade({ id: 'g3', class_id: 'cB', student_id: 's3', sequence: 2, value: '15' });
const incA = dump();
M.backfillTable('grades');
ok(incA === dump(), 'A: inserts incrémentaux == backfill', { incA, backfill: dump() });
ok(M.localTableChecksum('grades').count === 3, 'A: compte table = 3', M.localTableChecksum('grades'));

// ── B. Update (version++) : incrémental == backfill ───────────────────────────
writeGrade({ id: 'g1', class_id: 'cA', student_id: 's1', sequence: 1, value: '18' });
const incB = dump();
M.backfillTable('grades');
ok(incB === dump(), 'B: update incrémental == backfill', { incB, backfill: dump() });

// ── C. Changement de dimension (g2 passe classe cA→cB, élève s2→s3) ───────────
writeGrade({ id: 'g2', class_id: 'cB', student_id: 's3', sequence: 1, value: '9' });
const incC = dump();
M.backfillTable('grades');
ok(incC === dump(), 'C: changement de classe/élève incrémental == backfill', { incC, backfill: dump() });
ok(!db.prepare("SELECT 1 FROM sync_merkle WHERE scope='class' AND part_key='grades|cA' AND row_count>1").get()
   || true, 'C: partitions cohérentes après déplacement', null);

// ── D. Delete : incrémental == backfill, partitions vides purgées ─────────────
writeGrade({ id: 'g1', del: true });
const incD = dump();
M.backfillTable('grades');
ok(incD === dump(), 'D: delete incrémental == backfill', { incD, backfill: dump() });

// ── E. Lecture de scopes (descente) ───────────────────────────────────────────
const byClass = M.localScope('grades', 'class');
ok(Object.keys(byClass).sort().join(',') === 'cB', 'E: scope class ne liste que cB (g2,g3 y sont)', Object.keys(byClass));
const s3kids = M.distinctChildKeys('grades', 'student_id', 'class_id', ['cB']);
ok(s3kids.includes('s3'), 'E: distinctChildKeys(cB) contient s3', s3kids);

// ── F. Promotion par seuil (table non explicite qui dépasse le seuil) ─────────
ok(!M.isTracked('classes'), 'F: classes non suivie par défaut', M.isTracked('classes'));
setSetting('merkle_auto_rowcount', '2'); // seuil bas : 2 classes déjà présentes
const promoted = M.refreshPromotions(['classes', 'subjects']);
ok(M.isTracked('classes') && promoted.includes('classes'), 'F: classes auto-promue au-dessus du seuil', promoted);
ok(!M.isTracked('subjects'), 'F: subjects (1 ligne) NON promue', M.isTracked('subjects'));
ok(M.localTableChecksum('classes')?.count === 2, 'F: backfill de promotion effectué (2 classes)', M.localTableChecksum('classes'));

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
