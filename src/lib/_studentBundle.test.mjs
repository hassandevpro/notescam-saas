// Test unitaire pur du helper de corbeille élève (aucune dépendance IDB/réseau).
// Lancer : node src/lib/_studentBundle.test.mjs
import {
  collectStudentBundle, isEmptyBundle, splitScores, hasRealGrades, hasSpecialFields,
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

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
