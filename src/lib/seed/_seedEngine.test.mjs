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
  ok(!r.schools, 'aucune école créée (données sous l’école courante)');
  ok((r.school_units || []).length >= 1 && r.school_units.every((u) => u.school_id === demoSchoolIds[0]), 'unités rattachées à l’école courante');
  ok((r.students || []).every((s) => s.school_id === demoSchoolIds[0]), 'tous les enregistrements sous le même school_id');

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

  // — Budget CIBLE V3 (plus de budgets « à plat ») —
  const anns = (r.budgets || []).filter((b) => b.tier === 'annual');
  ok(anns.length === 1, 'un SEUL budget annuel (v3), plus de budget par secteur');
  ok((r.budgets || []).every((b) => !b.period_type && !b.sector), 'aucun budget legacy (period_type/sector)');
  ok((r.budget_periods || []).length === 3 && r.budget_periods.every((p) => p.end_date > p.start_date), 'périodes budgétaires dédiées (3, dates valides)');
  const lines = (r.budget_chapters || []).filter((c) => c.scope);
  ok(lines.length >= 2 && lines.every((l) => l.scope === 'complex' || l.scope === 'sectors'), 'lignes avec portée (complex/sectors)');
  const perByLine = {}; for (const a of r.budget_line_periods || []) perByLine[a.budget_chapter_id] = (perByLine[a.budget_chapter_id] || 0) + a.pct;
  ok(lines.every((l) => Math.abs((perByLine[l.id] || 0) - 100) <= 0.01), 'Σ % périodes = 100 par ligne');
  const secByLine = {}; for (const a of r.budget_line_sectors || []) secByLine[a.budget_chapter_id] = (secByLine[a.budget_chapter_id] || 0) + a.pct;
  ok(lines.filter((l) => l.scope === 'sectors').every((l) => Math.abs((secByLine[l.id] || 0) - 100) <= 0.01), 'Σ % secteurs = 100 par ligne sectorielle');
  const lineScope = Object.fromEntries((r.budget_chapters || []).map((c) => [c.id, c.scope]));
  ok((r.budget_expenses || []).every((e) => e.budget_period_id && e.expense_date && lineScope[e.budget_chapter_id]), 'dépenses v3 : ligne + période + date');
  ok((r.budget_expenses || []).every((e) => lineScope[e.budget_chapter_id] !== 'complex' || !e.school_unit_id), 'dépense sur ligne complexe = imputation globale (aucun secteur)');

  // Volumétrie croissante.
  ok(r.students.length > 0 && r.grades.length >= r.students.length, 'notes ≥ élèves');
}

// Croissance small < medium < large.
const n = (s) => generateSeed(s, { seed: 1 }).records.students.length;
ok(n('small') < n('medium') && n('medium') < n('large'), 'volumétrie croissante small < medium < large');

console.log(failed ? '\n❌ Seed engine KO' : '\n✅ Seed engine OK');
process.exit(failed ? 1 : 0);
