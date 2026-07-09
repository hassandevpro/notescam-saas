// Tests de COHÉRENCE du générateur de données de démo.
//   node src/lib/seed/_seedEngine.test.mjs
import { generateSeed } from './seedEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const idset = (arr) => new Set((arr || []).map((x) => x.id));

for (const scenario of ['small', 'medium', 'large']) {
  const { records: r, order, demoSchoolIds } = generateSeed(scenario, { seed: 7 });
  const classes = idset(r.classes), teachers = idset(r.teachers), students = idset(r.students);
  const subjects = idset(r.subjects), budgets = idset(r.budgets), staff = idset(r.staff);
  const sfi = idset(r.student_fee_items), catalog = idset(r.fee_catalog), sig = idset(r.signalements);
  const subjectClass = Object.fromEntries((r.subjects || []).map((s) => [s.id, s.class_id]));
  const chaptersByBudget = {};
  for (const c of r.budget_chapters || []) (chaptersByBudget[c.budget_id] || (chaptersByBudget[c.budget_id] = new Set())).add(c.id);

  console.log(`\n— Scénario ${scenario} —`);
  ok(demoSchoolIds.length === 1 && r.schools[0].name.startsWith('[DÉMO]'), 'école de démo préfixée [DÉMO]');

  // Cohérence structurelle.
  ok((r.students || []).every((s) => classes.has(s.class_id)), 'chaque élève appartient à une classe existante');
  ok((r.classes || []).every((c) => teachers.has(c.teacher_id)), 'chaque classe a un professeur principal (titulaire) existant');
  ok((r.subjects || []).every((s) => classes.has(s.class_id) && teachers.has(s.teacher_id)), 'chaque matière → classe + enseignant existants');
  ok((r.grades || []).every((g) => students.has(g.student_id) && subjects.has(g.subject_id) && subjectClass[g.subject_id] === g.class_id), 'notes → élève + matière de sa classe');
  ok((r.budget_expenses || []).every((e) => budgets.has(e.budget_id) && chaptersByBudget[e.budget_id]?.has(e.budget_chapter_id)), 'dépenses rattachées à un budget + chapitre du budget');
  ok((r.student_fee_items || []).every((i) => students.has(i.student_id) && catalog.has(i.fee_catalog_id)), 'frais élève → élève + article de catalogue');
  ok((r.fee_payments || []).every((p) => students.has(p.student_id) && (!p.student_fee_item_id || sfi.has(p.student_fee_item_id))), 'paiements → élève + frais scolaire');
  ok((r.hr_contracts || []).every((c) => staff.has(c.staff_id)), 'contrats RH → personnel existant');
  ok((r.signalement_history || []).every((h) => sig.has(h.signalement_id)), 'historique reports → signalement existant');
  ok((r.user_governance_roles || []).length >= 9, 'rôles de gouvernance générés (≥ 9)');

  // Volumétrie croissante.
  ok(r.students.length > 0 && r.grades.length >= r.students.length, 'notes ≥ élèves');
}

// Croissance small < medium < large.
const n = (s) => generateSeed(s, { seed: 1 }).records.students.length;
ok(n('small') < n('medium') && n('medium') < n('large'), 'volumétrie croissante small < medium < large');

console.log(failed ? '\n❌ Seed engine KO' : '\n✅ Seed engine OK');
process.exit(failed ? 1 : 0);
