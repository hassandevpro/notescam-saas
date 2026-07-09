// Générateur PUR de données de démonstration cohérentes (aucune I/O → testable).
// Retourne { records: {table:[rows]}, order: [tables], stats, demoSchoolIds }.
// Chaque enregistrement est lié aux autres (élève→classe→titulaire→matières→notes,
// dépense→budget, paiement→frais…). L'écriture réelle est faite par seedService.
import {
  makeRng, pick, int, fullName, UNITS, SUBJECTS_BY_UNIT, STAFF_ROSTER, SCENARIOS,
  REPORT_TITLES, REPORT_CATS,
} from './seedData.js';

function uidGen(rng) {
  const h = '0123456789abcdef';
  return () => {
    let s = '';
    for (let i = 0; i < 32; i++) s += h[Math.floor(rng() * 16)];
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
  };
}

export function generateSeed(scenarioKey = 'medium', { seed = 42, year = '2025-2026' } = {}) {
  const cfg = SCENARIOS[scenarioKey] || SCENARIOS.medium;
  const rng = makeRng(seed);
  const uid = uidGen(rng);
  const rec = {};
  const push = (t, row) => { (rec[t] || (rec[t] = [])).push(row); return row; };
  const nowIso = new Date().toISOString();
  const dateISO = (d) => d.toISOString().slice(0, 10);

  // — Établissement (complexe) + unités —
  const schoolId = uid();
  push('schools', {
    id: schoolId, name: `[DÉMO] Complexe scolaire ${scenarioKey}`, type: 'complexe',
    current_year: year, currency: 'XAF', country_system: 'cameroon_fr',
  });
  const units = UNITS.filter((u) => cfg.units.includes(u.key)).map((u) =>
    push('school_units', { id: uid(), school_id: schoolId, section_key: u.section_key, name: `[DÉMO] ${u.name}`, director: fullName(rng, 'F') }));
  const unitByKey = {};
  cfg.units.forEach((k, i) => { unitByKey[k] = units[i]; });

  // — Enseignants —
  const teachers = [];
  for (let i = 0; i < cfg.teachers; i++) {
    const g = rng() > 0.5 ? 'M' : 'F';
    teachers.push(push('teachers', { id: uid(), school_id: schoolId, name: fullName(rng, g) }));
  }
  const nextTeacher = (() => { let i = 0; return () => teachers[(i++) % teachers.length]; })();

  // — Personnel de direction/administratif + rôles de gouvernance —
  STAFF_ROSTER.forEach((r) => {
    const staffId = uid();
    push('staff', {
      id: staffId, school_id: schoolId, name: `[DÉMO] ${fullName(rng, r.gender)}`,
      gender: r.gender, department: r.department, fonction: r.fonction, status: 'active', active: 1,
      hire_date: '2020-09-01',
    });
    if (r.gov) {
      push('user_governance_roles', { id: uid(), school_id: schoolId, user_id: uid(), role: r.gov, sector: r.sector || null });
    }
  });

  // — Classes (par unité × niveau) + matières + élèves + notes —
  const students = [];
  cfg.units.forEach((ukey) => {
    const unit = unitByKey[ukey];
    const uDef = UNITS.find((u) => u.key === ukey);
    uDef.levels.forEach((level) => {
      for (let c = 0; c < cfg.classesPerLevel; c++) {
        const titulaire = nextTeacher();
        const classId = uid();
        push('classes', {
          id: classId, school_id: schoolId, name: level, level, section: uDef.section_key,
          system: 'FR', cycle: ukey, current_year: year, teacher_id: titulaire.id, unit_id: unit.id, max_students: 60,
        });
        // Matières de la classe (chaque matière a un enseignant existant).
        const subjects = SUBJECTS_BY_UNIT[ukey].map((sname) =>
          push('subjects', { id: uid(), school_id: schoolId, class_id: classId, name: sname, teacher_id: nextTeacher().id }));
        // Élèves de la classe.
        for (let s = 0; s < cfg.studentsPerClass; s++) {
          const g = rng() > 0.5 ? 'M' : 'F';
          const studentId = uid();
          const stu = push('students', {
            id: studentId, school_id: schoolId, class_id: classId, name: fullName(rng, g), gender: g,
            matricule: `D${int(rng, 10000, 99999)}`, statut: 'actif', statut_etablissement: rng() > 0.7 ? 'nouveau' : 'ancien',
            date_naissance: `20${int(rng, 10, 18)}-0${int(rng, 1, 9)}-1${int(rng, 0, 9)}`,
          });
          students.push({ ...stu, subjects });
          // Notes : une valeur par matière (séquence 1) — correspondent aux matières.
          subjects.forEach((sub) => {
            push('grades', { id: uid(), school_id: schoolId, class_id: classId, student_id: studentId, subject_id: sub.id, sequence: 1, value: String(int(rng, 6, 19)) });
          });
          // Quelques absences (≈15% des élèves).
          if (rng() < 0.15) push('student_absences', { id: uid(), school_id: schoolId, student_id: studentId });
        }
      }
    });
  });

  // — Catalogue de frais + frais par élève + paiements —
  const catalog = [
    { name: 'Frais d\'inscription', category: 'inscription', amount: 25000, mandatory: 1, optional: 0 },
    { name: 'Scolarité', category: 'scolarite', amount: 150000, mandatory: 1, optional: 0 },
    { name: 'APEE', category: 'apee', amount: 10000, mandatory: 1, optional: 0 },
    { name: 'Cantine', category: 'cantine', amount: 60000, mandatory: 0, optional: 1 },
    { name: 'Transport scolaire', category: 'transport', amount: 45000, mandatory: 0, optional: 1 },
    { name: 'Tenue scolaire', category: 'tenue', amount: 20000, mandatory: 0, optional: 1 },
  ].map((f) => push('fee_catalog', { id: uid(), school_id: schoolId, academic_year: year, active: 1, payment_type: 'unique', ...f }));
  const mandatory = catalog.filter((f) => f.mandatory);
  const optional = catalog.filter((f) => !f.mandatory);
  students.forEach((stu) => {
    const items = [...mandatory];
    if (rng() < 0.4) items.push(pick(rng, optional)); // certains prennent une option
    items.forEach((f) => {
      const itemId = uid();
      push('student_fee_items', {
        id: itemId, school_id: schoolId, student_id: stu.id, fee_catalog_id: f.id, academic_year: year,
        name: f.name, category: f.category, amount: f.amount, mandatory: f.mandatory, status: 'active',
      });
      // Paiement partiel/total correspondant au frais (rattaché).
      if (rng() < 0.7) {
        const amount = rng() < 0.5 ? f.amount : Math.round(f.amount / 2);
        push('fee_payments', { id: uid(), school_id: schoolId, student_id: stu.id, academic_year: year, amount, date: '2025-10-05', student_fee_item_id: itemId });
      }
    });
  });

  // — Budgets par secteur + chapitres + dépenses —
  cfg.units.forEach((ukey) => {
    const budgetId = uid();
    push('budgets', { id: budgetId, school_id: schoolId, academic_year: year, period_type: 'annuel', sector: ukey === 'college' ? 'college' : ukey, label: `Budget ${ukey}`, status: 'active' });
    const chapRecette = push('budget_chapters', { id: uid(), school_id: schoolId, budget_id: budgetId, label: 'Scolarités', kind: 'recette', planned_amount: 5000000, position: 0 });
    const chapSalaires = push('budget_chapters', { id: uid(), school_id: schoolId, budget_id: budgetId, label: 'Salaires', kind: 'depense', planned_amount: 3000000, position: 1 });
    const chapFourn = push('budget_chapters', { id: uid(), school_id: schoolId, budget_id: budgetId, label: 'Fournitures', kind: 'depense', planned_amount: 800000, position: 2 });
    void chapRecette;
    // Dépenses rattachées à des chapitres du budget.
    push('budget_expenses', { id: uid(), school_id: schoolId, budget_id: budgetId, budget_chapter_id: chapSalaires.id, category: 'RH', supplier: 'Personnel', amount: int(rng, 500000, 2500000), requester: 'RAF', status: 'approved', expense_date: '2025-10-10', sector: ukey });
    push('budget_expenses', { id: uid(), school_id: schoolId, budget_id: budgetId, budget_chapter_id: chapFourn.id, category: 'Fournitures', supplier: 'Librairie', amount: int(rng, 100000, 700000), requester: 'Caissier', status: 'paid', expense_date: '2025-10-12', sector: ukey });
  });

  // — RH : contrats / congés / présences pour le personnel —
  (rec.staff || []).forEach((st) => {
    push('hr_contracts', { id: uid(), school_id: schoolId, staff_id: st.id, type: pick(rng, ['cdi', 'cdd']), title: st.fonction, start_date: '2020-09-01', status: 'active' });
    if (rng() < 0.3) push('hr_leaves', { id: uid(), school_id: schoolId, staff_id: st.id, type: 'annuel', start_date: '2026-02-01', end_date: '2026-02-05', days: 5, status: 'approved' });
    push('hr_attendance', { id: uid(), school_id: schoolId, staff_id: st.id, att_date: '2026-01-10', status: pick(rng, ['present', 'present', 'retard']) });
  });

  // — Reports (signalements) + commentaires + historique —
  for (let i = 0; i < (scenarioKey === 'small' ? 3 : scenarioKey === 'medium' ? 6 : 10); i++) {
    const sigId = uid();
    const cat = pick(rng, REPORT_CATS);
    push('signalements', { id: sigId, school_id: schoolId, domain: cat, title: `[DÉMO] ${pick(rng, REPORT_TITLES)}`, description: 'Donnée de démonstration.', priority: pick(rng, ['low', 'normal', 'high', 'critical']), status: pick(rng, ['new', 'assigned', 'in_progress', 'resolved']), assigned_department: 'support', reporter_name: fullName(rng, 'M'), created_at: nowIso });
    push('signalement_history', { id: uid(), school_id: schoolId, signalement_id: sigId, action: 'created', to_status: 'new', at: nowIso });
    if (rng() < 0.5) push('signalement_comments', { id: uid(), school_id: schoolId, signalement_id: sigId, body: 'Prise en charge en cours.', author: fullName(rng, 'F') });
  }

  // — Notifications internes —
  for (let i = 0; i < 4; i++) {
    push('notifications', { id: uid(), school_id: schoolId, recipient_role: 'admin', type: 'demo', title: '[DÉMO] Notification de test', body: 'Données de démonstration.', read: 0 });
  }

  // Ordre d'insertion (respect des dépendances FK).
  const order = [
    'schools', 'school_units', 'teachers', 'staff', 'user_governance_roles',
    'classes', 'subjects', 'students', 'grades', 'student_absences',
    'fee_catalog', 'student_fee_items', 'fee_payments',
    'budgets', 'budget_chapters', 'budget_expenses',
    'hr_contracts', 'hr_leaves', 'hr_attendance',
    'signalements', 'signalement_history', 'signalement_comments', 'notifications',
  ].filter((t) => rec[t]?.length);

  const stats = {};
  for (const t of order) stats[t] = rec[t].length;

  return { records: rec, order, stats, demoSchoolIds: [schoolId], year };
}
