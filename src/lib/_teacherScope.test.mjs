// Tests du périmètre « enseignant de matière » (module pur) :
//   node src/lib/_teacherScope.test.mjs
import { isSubjectScoped, mySubjects, myClassIds, mySubjectNames } from './teacherScope.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

const MODE1 = { grade_entry_mode: 'subject' };
const MODE2 = { grade_entry_mode: 'principal' };

// ── Qui est restreint ───────────────────────────────────────────────────────
ok(isSubjectScoped('teacher', MODE1), 'enseignant en Mode 1 → restreint');
ok(!isSubjectScoped('teacher', MODE2), 'enseignant en Mode 2 → vue complète (historique)');
ok(!isSubjectScoped('teacher', {}), 'réglage absent → Mode 2 par défaut');
ok(!isSubjectScoped('teacher', null), 'école non chargée → aucune restriction surprise');
for (const r of ['admin', 'censeur', 'surveillant']) {
  ok(!isSubjectScoped(r, MODE1), `${r} garde la vue complète même en Mode 1`);
}

// ── Mes matières ────────────────────────────────────────────────────────────
const subjects = [
  { id: 'm1', class_id: 'c1', name: 'Mathématiques', teacher_id: 'p1' },
  { id: 'm2', class_id: 'c1', name: 'Français',      teacher_id: 'p2' },
  { id: 'm3', class_id: 'c2', name: 'Mathematiques', teacher_id: 'p1' },
  { id: 'm4', class_id: 'c3', name: 'Histoire',      teacher_id: null },
];

eq(mySubjects(subjects, 'p1').length, 2, 'p1 assure deux matières, toutes classes confondues');
eq(mySubjects(subjects, 'p1', 'c1').length, 1, 'restreint à une classe');
eq(mySubjects(subjects, 'p1', 'c3').length, 0, 'classe où p1 n’enseigne pas');
// Un compte enseignant sans fiche rattachée n'a AUCUNE affectation : ne jamais
// lui ouvrir les matières non affectées (teacher_id null === teacherId null).
eq(mySubjects(subjects, null).length, 0, 'compte sans fiche enseignant → aucune matière');

const classIds = myClassIds(subjects, 'p1');
ok(classIds.has('c1') && classIds.has('c2'), 'les deux classes de p1 sont retenues');
ok(!classIds.has('c3'), 'une classe sans affectation reste hors périmètre');

// ── Rapprochement par nom (référentiel APC ↔ lignes `subjects`) ─────────────
const noms = mySubjectNames(subjects, 'p1', 'c1');
ok(noms.has('mathematiques'), 'accent et casse sont neutralisés — « Mathématiques » ↔ matiere.nom');
ok(!noms.has('francais'), 'la matière d’un collègue n’entre pas dans le périmètre');

console.log(failed ? '\n❌ échecs' : '\n✅ tout passe');
process.exit(failed ? 1 : 0);
