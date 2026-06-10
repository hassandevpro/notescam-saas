// Test du cœur pur de l'import (validation + transformation + idempotence).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateBundle, buildImportRecords } from './dataImportCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundle = JSON.parse(readFileSync(join(__dirname, '../../examples/import-bundle.example.json'), 'utf8'));
const SCHOOL = 'school-1';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// 1) Validation
const v = validateBundle(bundle);
ok(v.ok, `validation OK (${v.errors.length} erreurs)`);
ok(v.stats.years === 2, `2 années détectées (${v.stats.years})`);
ok(v.stats.classes === 2, `2 classes (${v.stats.classes})`);
ok(v.stats.students === 3, `3 inscriptions élèves (${v.stats.students})`);
ok(v.stats.grades === 6, `6 notes (${v.stats.grades})`);
ok(v.stats.teachers === 2, `2 enseignants (${v.stats.teachers})`);

// 2) Transformation (base vide)
const { out, reused } = buildImportRecords(bundle, SCHOOL, {});
ok(out.classes.length === 2, `2 classes créées (${out.classes.length})`);
ok(out.subjects.length === 4, `4 matières créées (2/classe) (${out.subjects.length})`);
ok(out.students.length === 3, `3 lignes élèves — Paul compte 2× (2 années) (${out.students.length})`);
ok(out.teachers.length === 2, `2 enseignants créés (${out.teachers.length})`);
ok(out.payments.length === 2, `2 versements (${out.payments.length})`);

// grades : 1 enregistrement par (classe,élève,séquence). Paul 6eA a séq 1 et 2 → 2 records.
const paul6e = out.students.find((s) => s.matricule === 'M-2019-001' && out.classes.find((c) => c.id === s.class_id)?.current_year === '2019-2020');
const paulRecs = out.grades.filter((g) => g.student_id === paul6e.id);
ok(paulRecs.length === 2, `Paul (6e A) : 2 enregistrements de notes — séq 1 & 2 (${paulRecs.length})`);
const seq1 = paulRecs.find((g) => g.sequence === 1);
ok(Object.keys(seq1.scores).length === 2, `séq 1 de Paul : 2 matières notées (${Object.keys(seq1.scores).length})`);
ok(Object.values(seq1.scores).every((v) => typeof v === 'string'), 'valeurs de notes stockées en string');

// FK : tout subject_id des scores doit pointer une matière créée de la MÊME classe
const subjById = new Map(out.subjects.map((s) => [s.id, s]));
const fkOk = out.grades.every((g) => Object.keys(g.scores).every((sid) => subjById.get(sid)?.class_id === g.class_id));
ok(fkOk, 'toutes les notes pointent une matière de leur propre classe (FK cohérente)');

// frais calculés depuis payments si frais_payes absent (Paul 6e : 25000+25000)
const paulFee = out.fees.find((f) => f.student_id === paul6e.id);
ok(paulFee.frais_payes === 50000, `frais_payes déduits des versements (${paulFee.frais_payes})`);

// gender normalisé
ok(out.students.every((s) => ['Masculin', 'Feminin', null].includes(s.gender)), 'genres normalisés');

// 3) Idempotence : 2e passe en réinjectant ce qui vient d'être créé.
//    Entités à PK (classes/subjects/students/teachers) → réutilisées, 0 création.
//    Versements (pas de clé naturelle en base) → dédoublonnés, 0 doublon.
//    grades/fees sont ré-émis mais écrasent par clé/id (sûrs, pas de doublon).
const existing = { classes: out.classes, subjects: out.subjects, students: out.students, fees: out.fees, teachers: out.teachers, payments: out.payments };
const second = buildImportRecords(bundle, SCHOOL, existing);
ok(second.out.classes.length === 0, `2e passe : 0 classe recréée (${second.out.classes.length})`);
ok(second.out.subjects.length === 0, `2e passe : 0 matière recréée (${second.out.subjects.length})`);
ok(second.out.students.length === 0, `2e passe : 0 élève recréé (${second.out.students.length})`);
ok(second.out.teachers.length === 0, `2e passe : 0 enseignant recréé (${second.out.teachers.length})`);
ok(second.out.payments.length === 0, `2e passe : 0 versement dupliqué (${second.out.payments.length})`);
ok(second.reused.classes === 2 && second.reused.students === 3, `réutilisation: ${second.reused.classes} classes, ${second.reused.students} élèves`);

console.log(failed ? '\n=== ÉCHEC ===' : '\n=== OK ===');
process.exit(failed ? 1 : 0);
