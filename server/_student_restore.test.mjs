// Prouve la cause racine du bug de corbeille (suppression d'élève → cascade qui
// efface notes/absences/frais/paiements) ET valide la restauration par bundle :
// ré-upsert de l'élève + de toutes ses lignes liées → tout revient à l'identique.
// C'est exactement le chemin DB exécuté par schoolStore.restoreStudentBundle
// (LAN via query.js ; structurellement identique au cloud Supabase).
//
// Lancer : node server/_student_restore.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-restore-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
const eq = (col, val) => ({ col, op: 'eq', val });
const countWhere = (table, filters) => must({ table, action: 'select', columns: '*', filters }).data.length;
const one = (table, filters) => must({ table, action: 'select', columns: '*', single: true, maybeSingle: true, filters }).data;

// --- Setup : école / classe / matière / 2 élèves ---
must({ table: 'schools',  action: 'insert', values: { id: 'sch1', name: 'École' } });
must({ table: 'classes',  action: 'upsert', onConflict: 'id', values: { id: 'cls1', school_id: 'sch1', name: '6e', level: '6e', system: 'FR', current_year: '2025-2026' } });
must({ table: 'subjects', action: 'upsert', onConflict: 'id', values: { id: 'sub1', school_id: 'sch1', class_id: 'cls1', name: 'Maths', coef: 4, max: 20 } });
must({ table: 'students', action: 'upsert', onConflict: 'id', values: { id: 'stu1', school_id: 'sch1', class_id: 'cls1', name: 'AKA Jean', matricule: 'M001' } });
must({ table: 'students', action: 'upsert', onConflict: 'id', values: { id: 'stu2', school_id: 'sch1', class_id: 'cls1', name: 'BEKA Paul', matricule: 'M002' } }); // témoin

// notes / absences / frais / paiements pour stu1
must({ table: 'grades',          action: 'upsert', onConflict: 'class_id,student_id,subject_id,sequence', values: { id: 'grd1', school_id: 'sch1', class_id: 'cls1', student_id: 'stu1', subject_id: 'sub1', sequence: 1, value: '15' } });
must({ table: 'student_absences', action: 'upsert', onConflict: 'student_id,sequence', values: { id: 'abs1', school_id: 'sch1', class_id: 'cls1', student_id: 'stu1', sequence: 1, abs_j: 2, abs_nj: 1, conduite: 'Bonne' } });
must({ table: 'student_fees',    action: 'upsert', onConflict: 'student_id,academic_year', values: { id: 'fee1', school_id: 'sch1', student_id: 'stu1', academic_year: '2025-2026', frais_annuels: 100000, frais_payes: 40000 } });
must({ table: 'fee_payments',    action: 'insert', values: { id: 'pay1', school_id: 'sch1', student_id: 'stu1', academic_year: '2025-2026', amount: 40000, date: '2025-10-01' } });
// note du témoin stu2 (ne doit jamais être touchée)
must({ table: 'grades', action: 'upsert', onConflict: 'class_id,student_id,subject_id,sequence', values: { id: 'grd2', school_id: 'sch1', class_id: 'cls1', student_id: 'stu2', subject_id: 'sub1', sequence: 1, value: '12' } });

ok(countWhere('grades', [eq('student_id', 'stu1')]) === 1, 'avant : note de stu1 présente');
ok(countWhere('student_fees', [eq('student_id', 'stu1')]) === 1, 'avant : frais de stu1 présents');
ok(countWhere('fee_payments', [eq('student_id', 'stu1')]) === 1, 'avant : paiement de stu1 présent');
ok(countWhere('student_absences', [eq('student_id', 'stu1')]) === 1, 'avant : absences de stu1 présentes');

// --- Capture du bundle (= deleteStudent AVANT la suppression) ---
const bundle = {
  student:  one('students', [eq('id', 'stu1')]),
  grades:   must({ table: 'grades',           action: 'select', columns: '*', filters: [eq('student_id', 'stu1')] }).data,
  absences: must({ table: 'student_absences', action: 'select', columns: '*', filters: [eq('student_id', 'stu1')] }).data,
  fees:     must({ table: 'student_fees',     action: 'select', columns: '*', filters: [eq('student_id', 'stu1')] }).data,
  payments: must({ table: 'fee_payments',     action: 'select', columns: '*', filters: [eq('student_id', 'stu1')] }).data,
};

// --- Suppression physique → cascade (le bug) ---
must({ table: 'students', action: 'delete', filters: [eq('id', 'stu1')] });

ok(countWhere('grades', [eq('student_id', 'stu1')]) === 0, 'cascade : notes de stu1 effacées par la suppression');
ok(countWhere('student_fees', [eq('student_id', 'stu1')]) === 0, 'cascade : frais de stu1 effacés');
ok(countWhere('fee_payments', [eq('student_id', 'stu1')]) === 0, 'cascade : paiements de stu1 effacés');
ok(countWhere('student_absences', [eq('student_id', 'stu1')]) === 0, 'cascade : absences de stu1 effacées');
ok(countWhere('grades', [eq('student_id', 'stu2')]) === 1, 'témoin : note de stu2 intacte malgré la suppression de stu1');

// --- Restauration du bundle (= restoreStudentBundle) ---
must({ table: 'students', action: 'upsert', onConflict: 'id', values: bundle.student });
for (const g of bundle.grades)   must({ table: 'grades',           action: 'upsert', onConflict: 'class_id,student_id,subject_id,sequence', values: g });
for (const a of bundle.absences) must({ table: 'student_absences', action: 'upsert', onConflict: 'student_id,sequence', values: a });
for (const f of bundle.fees)     must({ table: 'student_fees',     action: 'upsert', onConflict: 'student_id,academic_year', values: f });
for (const p of bundle.payments) must({ table: 'fee_payments',     action: 'insert', values: p });

// --- Tout est revenu, à l'identique ---
ok(countWhere('grades', [eq('student_id', 'stu1')]) === 1, 'restore : note de stu1 revenue');
const fee = one('student_fees', [eq('student_id', 'stu1')]);
ok(fee && fee.frais_payes === 40000, 'restore : frais payés intacts (40000)', fee && fee.frais_payes);
const pay = one('fee_payments', [eq('student_id', 'stu1')]);
ok(pay && pay.amount === 40000, 'restore : paiement intact (40000)', pay && pay.amount);
const abs = one('student_absences', [eq('student_id', 'stu1')]);
ok(abs && abs.abs_j === 2 && abs.conduite === 'Bonne', 'restore : absences + conduite intactes', abs);
const stu = one('students', [eq('id', 'stu1')]);
ok(stu && stu.matricule === 'M001' && stu.class_id === 'cls1', 'restore : élève rattaché à sa classe', stu);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé sous Windows */ }
process.exit(fail === 0 ? 0 : 1);
