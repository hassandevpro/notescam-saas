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

// IMPORTANT : les données sont générées SOUS L'ÉCOLE COURANTE (`schoolId` fourni
// par l'appelant). On ne crée PAS de nouvelle école : un school_id inconnu serait
// rejeté par le scoping (RLS cloud / tenant LAN), et rien ne s'insérerait. Les
// unités pédagogiques (Maternelle/Primaire/Collège/Lycée) matérialisent le complexe.
export function generateSeed(scenarioKey = 'medium', { seed = 42, year = '2025-2026', schoolId } = {}) {
  const cfg = SCENARIOS[scenarioKey] || SCENARIOS.medium;
  const rng = makeRng(seed);
  const uid = uidGen(rng);
  const rec = {};
  const push = (t, row) => { (rec[t] || (rec[t] = [])).push(row); return row; };
  const nowIso = new Date().toISOString();
  if (!schoolId) schoolId = uid(); // repli (tests) ; en prod l'appelant fournit l'école courante

  // — Unités pédagogiques du complexe (école courante) —
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

  // — Budget V3 : annuel global du complexe → périodes → rubriques/lignes →
  //   allocations (période % + secteur %) → dépenses. Un SEUL budget annuel (plus
  //   de budgets « à plat » par secteur). Lignes en BROUILLON + dépenses brouillon :
  //   données valides sous l'enforcement (une ligne s'active manuellement depuis
  //   Budgets ; l'imputation d'une dépense dérive sa période de sa date). —
  const y1 = String(year).split('-')[0] || '2025';
  const y2 = String(Number(y1) + 1);
  const annualId = uid();
  push('budgets', { id: annualId, school_id: schoolId, academic_year: year, tier: 'annual', envelope_amount: 20000000, label: `[DÉMO] Budget ${year}`, status: 'active' });

  // Périodes budgétaires configurées une fois pour l'année (3 trimestres disjoints).
  const periods = [
    ['Premier trimestre', `${y1}-09-01`, `${y1}-12-20`],
    ['Deuxième trimestre', `${y2}-01-05`, `${y2}-03-31`],
    ['Troisième trimestre', `${y2}-04-06`, `${y2}-06-30`],
  ].map(([name, start, end], i) => push('budget_periods', { id: uid(), school_id: schoolId, academic_year: year, name: `[DÉMO] ${name}`, start_date: start, end_date: end, position: i + 1 }));

  // Recette (chapitre kind=recette, hors ligne) — pour la synthèse « recettes prévues ».
  push('budget_chapters', { id: uid(), school_id: schoolId, budget_id: annualId, label: '[DÉMO] Scolarités', kind: 'recette', planned_amount: 15000000, position: 0 });

  // Rubrique Fonctionnement → 1 ligne COMPLEXE (Salaires) + 1 ligne SECTORIELLE (Fournitures).
  const rubFonc = push('budget_chapters', { id: uid(), school_id: schoolId, budget_id: annualId, label: '[DÉMO] Fonctionnement', kind: 'depense', position: 1 });
  const ligneSal = push('budget_chapters', { id: uid(), school_id: schoolId, budget_id: annualId, parent_id: rubFonc.id, label: 'Salaires', kind: 'depense', scope: 'complex', status: 'draft', planned_amount: 6000000, position: 0 });
  const ligneFour = push('budget_chapters', { id: uid(), school_id: schoolId, budget_id: annualId, parent_id: rubFonc.id, label: 'Fournitures', kind: 'depense', scope: 'sectors', status: 'draft', planned_amount: 3000000, position: 1 });

  // Répartition TEMPORELLE (Σ = 100) — mêmes périodes pour toutes les lignes.
  const pctP = [40, 30, 30];
  [ligneSal, ligneFour].forEach((ln) => periods.forEach((p, i) =>
    push('budget_line_periods', { id: uid(), school_id: schoolId, budget_chapter_id: ln.id, budget_period_id: p.id, pct: pctP[i] })));

  // Répartition SECTORIELLE (Σ = 100) — ligne Fournitures répartie sur les unités du complexe.
  const nU = units.length || 1;
  units.forEach((u, i) => {
    const base = Math.floor(100 / nU);
    const pct = i === nU - 1 ? 100 - base * (nU - 1) : base; // la dernière unité absorbe le reste → Σ = 100
    push('budget_line_sectors', { id: uid(), school_id: schoolId, budget_chapter_id: ligneFour.id, school_unit_id: u.id, pct });
  });

  // Dépenses de démonstration (brouillons) — datées dans le 1er trimestre (période
  // dérivée automatiquement de la date). Salaires = ligne complexe → global (aucun
  // secteur) ; Fournitures = ligne sectorielle → un secteur concerné.
  push('budget_expenses', { id: uid(), school_id: schoolId, budget_id: annualId, budget_chapter_id: ligneSal.id, budget_period_id: periods[0].id, school_unit_id: null, category: 'RH', subcategory: 'Salaires', supplier: 'Personnel', amount: int(rng, 300000, 1500000), requester: 'RAF', status: 'draft', expense_date: `${y1}-10-10` });
  if (units.length) push('budget_expenses', { id: uid(), school_id: schoolId, budget_id: annualId, budget_chapter_id: ligneFour.id, budget_period_id: periods[0].id, school_unit_id: units[0].id, category: 'Fournitures', supplier: 'Librairie', amount: int(rng, 50000, 200000), requester: 'Caissier', status: 'draft', expense_date: `${y1}-10-12` });

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
    'school_units', 'teachers', 'staff', 'user_governance_roles',
    'classes', 'subjects', 'students', 'grades', 'student_absences',
    'fee_catalog', 'student_fee_items', 'fee_payments',
    // Budget V3 : périodes + annuel avant chapitres, allocations avant dépenses (FK).
    'budget_periods', 'budgets', 'budget_chapters', 'budget_line_periods', 'budget_line_sectors', 'budget_expenses',
    'hr_contracts', 'hr_leaves', 'hr_attendance',
    'signalements', 'signalement_history', 'signalement_comments', 'notifications',
  ].filter((t) => rec[t]?.length);

  const stats = {};
  for (const t of order) stats[t] = rec[t].length;

  return { records: rec, order, stats, demoSchoolIds: [schoolId], year };
}
