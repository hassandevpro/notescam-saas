// Test de bout en bout du chemin d'écriture LAN pour l'import historique.
// Exerce runQuery() (server/query.js) exactement comme localClient l'appelle :
//   - upsert par LOT (tableau) de students (colonne `name`)
//   - upsert par LOT de grades SANS `id`, à clé composée
//     (class_id,student_id,subject_id,sequence) → id auto-généré + idempotence.
// Base jetable via NOTESCAM_DATA_DIR pour ne pas toucher server/data.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-lan-'));
process.env.NOTESCAM_DATA_DIR = dir;

const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (cond, label, got) => {
  if (cond) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const must = (op) => {
  const r = runQuery(op);
  if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`);
  return r;
};

// --- Données de base (FK) ---------------------------------------------
must({ table: 'schools', action: 'insert', values: { id: 'sch1', name: 'École Test' } });
must({ table: 'classes', action: 'insert',
  values: { id: 'cls1', school_id: 'sch1', name: '6e A', current_year: '2021-2022' } });
must({ table: 'subjects', action: 'insert', values: [
  { id: 'sub1', school_id: 'sch1', class_id: 'cls1', name: 'Maths' },
  { id: 'sub2', school_id: 'sch1', class_id: 'cls1', name: 'Français' },
] });

// --- Upsert par lot d'élèves (colonne `name`, comme l'import) ----------
must({ table: 'students', action: 'upsert', onConflict: 'id', values: [
  { id: 'stu1', school_id: 'sch1', class_id: 'cls1', name: 'Paul Mballa', gender: null, statut: null },
  { id: 'stu2', school_id: 'sch1', class_id: 'cls1', name: 'Aïcha Ndong', gender: null, statut: null },
] });
let students = must({ table: 'students', action: 'select', columns: '*', filters: [] }).data;
ok(students.length === 2, '2 élèves importés', students.length);
ok(students.find((s) => s.id === 'stu1')?.name === 'Paul Mballa',
  'colonne `name` renseignée (lue par la page Absences)', students.find((s) => s.id === 'stu1'));

// --- Upsert par lot de notes SANS id, à clé composée (gradeEntryToRows) -
const gradeRows = [
  { school_id: 'sch1', class_id: 'cls1', student_id: 'stu1', subject_id: 'sub1', sequence: 1, value: '15' },
  { school_id: 'sch1', class_id: 'cls1', student_id: 'stu1', subject_id: 'sub2', sequence: 1, value: '12' },
  { school_id: 'sch1', class_id: 'cls1', student_id: 'stu2', subject_id: 'sub1', sequence: 1, value: '08' },
];
must({ table: 'grades', action: 'upsert',
  onConflict: 'class_id,student_id,subject_id,sequence', values: gradeRows });
let grades = must({ table: 'grades', action: 'select', columns: '*', filters: [] }).data;
ok(grades.length === 3, '3 notes insérées (id auto-généré)', grades.length);
ok(grades.every((g) => g.id), 'chaque note a un id généré côté serveur', grades.map((g) => g.id));

// --- Idempotence : 2e passe identique + 1 valeur modifiée --------------
const gradeRows2 = gradeRows.map((g) =>
  g.subject_id === 'sub1' && g.student_id === 'stu1' ? { ...g, value: '18' } : g);
must({ table: 'grades', action: 'upsert',
  onConflict: 'class_id,student_id,subject_id,sequence', values: gradeRows2 });
grades = must({ table: 'grades', action: 'select', columns: '*', filters: [] }).data;
ok(grades.length === 3, '2e passe : aucune note dupliquée (upsert sur clé composée)', grades.length);
const paulMaths = grades.find((g) => g.student_id === 'stu1' && g.subject_id === 'sub1');
ok(paulMaths?.value === '18', '2e passe : note existante mise à jour (15 → 18)', paulMaths?.value);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
// Nettoyage best-effort : sous Windows le fichier WAL reste verrouillé tant que
// le handle SQLite est ouvert → on ignore une éventuelle EPERM (dossier temp).
try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(fail === 0 ? 0 : 1);
