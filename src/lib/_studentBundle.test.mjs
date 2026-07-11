// Test unitaire pur du helper de corbeille élève (aucune dépendance IDB/réseau).
// Lancer : node src/lib/_studentBundle.test.mjs
import {
  collectStudentBundle, isEmptyBundle, splitScores, hasRealGrades, hasSpecialFields,
  collectSubjectBundle, collectClassBundle, isEmptyClassBundle,
} from './studentBundle.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

const grades = [
  { key: 'cls1_stu1_1', student_id: 'stu1', scores: { sub1: '15', __abs_j__: '2' } },
  { key: 'cls1_stu1_2', student_id: 'stu1', scores: { sub1: '12' } },
  { key: 'cls1_stu2_1', student_id: 'stu2', scores: { sub1: '9' } },
];
const fees     = [{ id: 'f1', student_id: 'stu1' }, { id: 'f2', student_id: 'stu2' }];
const payments = [{ id: 'p1', student_id: 'stu1' }];

// --- collectStudentBundle ---
const b = collectStudentBundle('stu1', { grades, fees, payments });
ok(b.grades.length === 2, 'collect: 2 records de notes pour stu1', b.grades.length);
ok(b.fees.length === 1 && b.fees[0].id === 'f1', 'collect: frais de stu1 uniquement', b.fees);
ok(b.payments.length === 1 && b.payments[0].id === 'p1', 'collect: paiement de stu1', b.payments);
ok(!b.grades.some((g) => g.student_id === 'stu2'), 'collect: exclut les données du témoin stu2');

// robustesse entrées vides / partielles
ok(collectStudentBundle('stu1', {}).grades.length === 0, 'collect: sources absentes → vide');
ok(collectStudentBundle('stu1', { grades: [null, undefined, ...grades] }).grades.length === 2, 'collect: ignore les lignes nulles');

// --- isEmptyBundle ---
ok(isEmptyBundle(collectStudentBundle('stuX', { grades, fees, payments })) === true, 'isEmptyBundle: vrai pour élève inconnu');
ok(isEmptyBundle(null) === true, 'isEmptyBundle: vrai pour null');
ok(isEmptyBundle(b) === false, 'isEmptyBundle: faux pour bundle peuplé');

// --- splitScores / détecteurs (notes vs absences fusionnées) ---
const sc = { sub1: '15', sub2: 'ABS', __abs_j__: '2', __conduite__: 'Bonne' };
const { grades: real, special } = splitScores(sc);
ok(Object.keys(real).length === 2 && real.sub1 === '15', 'split: extrait les notes réelles', real);
ok(Object.keys(special).length === 2 && special.__conduite__ === 'Bonne', 'split: extrait les champs spéciaux', special);
ok(hasRealGrades(sc) && hasSpecialFields(sc), 'détecte notes + champs spéciaux');
ok(hasRealGrades({ __abs_j__: '1' }) === false, 'pas de note réelle si uniquement absences');
ok(hasSpecialFields({ sub1: '10' }) === false, 'pas de champ spécial si uniquement notes');

// --- collectSubjectBundle (C1 : cascade suppression matière) ---
const sg = collectSubjectBundle('sub1', { grades });
ok(sg.subjectGrades.length === 3, 'subjectBundle: 3 cellules pour sub1', sg.subjectGrades.length);
ok(sg.subjectGrades.every((c) => c.value !== undefined && c.subject_id === 'sub1'), 'subjectBundle: cellules valuées + subject_id', sg.subjectGrades);
ok(collectSubjectBundle('subX', { grades }).subjectGrades.length === 0, 'subjectBundle: matière sans notes → vide');
ok(collectSubjectBundle('sub1', {}).subjectGrades.length === 0, 'subjectBundle: sources absentes → vide');
// ignore les cellules vides / absentes
const gradesGap = [{ key: 'k', class_id: 'c', student_id: 's', sequence: 1, scores: { sub1: '', sub2: '10' } }];
ok(collectSubjectBundle('sub1', { grades: gradesGap }).subjectGrades.length === 0, 'subjectBundle: ignore cellule vide');

// --- collectClassBundle (C1 : cascade suppression classe) ---
const subjectsAll = [
  { id: 'sub1', class_id: 'cls1' }, { id: 'sub2', class_id: 'cls1' }, { id: 'subZ', class_id: 'cls2' },
];
const studentsAll = [
  { id: 'stu1', class_id: 'cls1' }, { id: 'stu2', class_id: 'cls1' }, { id: 'stuZ', class_id: 'cls2' },
];
const gradesAll = [
  { key: 'cls1_stu1_1', class_id: 'cls1', student_id: 'stu1', scores: { sub1: '15' } },
  { key: 'cls2_stuZ_1', class_id: 'cls2', student_id: 'stuZ', scores: { subZ: '8' } },
];
const feesAll     = [{ id: 'f1', student_id: 'stu1' }, { id: 'fZ', student_id: 'stuZ' }];
const paymentsAll = [{ id: 'p1', student_id: 'stu2' }, { id: 'pZ', student_id: 'stuZ' }];

const cb = collectClassBundle('cls1', { subjects: subjectsAll, students: studentsAll, grades: gradesAll, fees: feesAll, payments: paymentsAll });
ok(cb.subjects.length === 2, 'classBundle: 2 matières de cls1', cb.subjects.length);
ok(cb.students.length === 2, 'classBundle: 2 élèves de cls1', cb.students.length);
ok(cb.grades.length === 1 && cb.grades[0].class_id === 'cls1', 'classBundle: notes de cls1 uniquement', cb.grades);
ok(cb.fees.length === 1 && cb.fees[0].id === 'f1', 'classBundle: frais des élèves de cls1 (via student_id)', cb.fees);
ok(cb.payments.length === 1 && cb.payments[0].id === 'p1', 'classBundle: paiements des élèves de cls1', cb.payments);
ok(!cb.subjects.some((s) => s.class_id === 'cls2') && !cb.grades.some((g) => g.class_id === 'cls2'), 'classBundle: exclut totalement cls2 (témoin)');

// --- isEmptyClassBundle ---
ok(isEmptyClassBundle(collectClassBundle('clsX', { subjects: subjectsAll, students: studentsAll })) === true, 'isEmptyClassBundle: vrai pour classe inconnue');
ok(isEmptyClassBundle(null) === true, 'isEmptyClassBundle: vrai pour null');
ok(isEmptyClassBundle(cb) === false, 'isEmptyClassBundle: faux pour bundle peuplé');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
