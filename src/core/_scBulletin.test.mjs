// Test de la logique du bulletin SECOND CYCLE groupé (assembleScBulletin).
// Exécution : node src/core/_scBulletin.test.mjs
import assert from 'node:assert';
import { assembleScBulletin, scDisciplineConseil } from './scEngine.js';
import { teacherByMatiere, teacherIndexById } from '../lib/teacherNames.js';

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('✅ ' + msg); pass++; };
const near = (a, b, msg) => ok(Math.abs(a - b) < 0.011, `${msg} (${a} ≈ ${b})`);

// Classe « Tle C » réduite : Groupe 1 (Maths 7, Physique 4) / Groupe 2 (Anglais 3, Philo 2).
const subjects = [
  { id: 'maths', name: 'Mathématiques', coef: 7, max: 20, sc_groupe: 'Groupe 1', sc_groupe_ordre: 1, charge_horaire: 7, position: 0 },
  { id: 'phys',  name: 'Physique',      coef: 4, max: 20, sc_groupe: 'Groupe 1', sc_groupe_ordre: 1, charge_horaire: 4, position: 1 },
  { id: 'ang',   name: 'Anglais',       coef: 3, max: 20, sc_groupe: 'Groupe 2', sc_groupe_ordre: 2, charge_horaire: 3, position: 2 },
  { id: 'philo', name: 'Philosophie',   coef: 2, max: 20, sc_groupe: 'Groupe 2', sc_groupe_ordre: 2, charge_horaire: 2, position: 3 },
];
const classId = 'c1', student = { id: 's1', name: 'Test Élève' };
const allGrades = {
  'c1_s1_1': { maths: '14', phys: '10', ang: '12', philo: '8'  },
  'c1_s1_2': { maths: '16', phys: '12', ang: '10', philo: '10' },
};
const seqs = [1, 2]; // Trimestre 1

const data = assembleScBulletin({ subjects, allGrades, classId, student, seqs, sys: 'FR', opts: { maxScale: 20 } });

ok(data.groups.length === 2, 'deux groupes');
const [g1, g2] = data.groups;
ok(g1.ordre === 1 && g2.ordre === 2, 'Groupe 1 avant Groupe 2');
ok(g1.rows.length === 2 && g2.rows.length === 2, 'matières réparties dans les bons groupes');

// Moyennes matière (fusion des 2 séquences) : Maths 15, Phys 11, Ang 11, Philo 9.
near(g1.rows[0].moyenne, 15, 'Maths = moyenne 15');
near(g1.rows[0].ponderee, 105, 'Maths M×coef = 15×7 = 105');

// Sous-totaux Groupe 1 : Σcoef 11, Σmx 149, moyenne 13.55.
near(g1.coefSum, 11, 'Groupe 1 Σcoef = 11');
near(g1.mxSum, 149, 'Groupe 1 Σ(M×coef) = 149');
near(g1.moyenne, 13.55, 'Groupe 1 moyenne = 13.55');
near(g1.chargeSum, 11, 'Groupe 1 Σ charge horaire = 11');

// Sous-totaux Groupe 2 : Σcoef 5, Σmx 51, moyenne 10.2.
near(g2.coefSum, 5, 'Groupe 2 Σcoef = 5');
near(g2.mxSum, 51, 'Groupe 2 Σ(M×coef) = 51');
near(g2.moyenne, 10.2, 'Groupe 2 moyenne = 10.2');

// Totaux & moyenne générale (cohérente avec le moteur classique).
near(data.coefSum, 16, 'Σcoef général = 16');
near(data.mxSum, 200, 'Σ(M×coef) général = 200');
near(data.moyenneGenerale, 12.5, 'moyenne générale = 12.5');

// Une matière non notée est exclue des sous-totaux.
const dataPartial = assembleScBulletin({
  subjects, classId, student,
  allGrades: { 'c1_s1_1': { maths: '12' }, 'c1_s1_2': { maths: '12' } },
  seqs, sys: 'FR', opts: { maxScale: 20 },
});
near(dataPartial.groups[0].coefSum, 7, 'matières non notées exclues (Σcoef = 7, Maths seul)');
near(dataPartial.groups[0].moyenne, 12, 'moyenne Groupe 1 = 12 (Maths seul)');

// ── Discipline + décision du conseil (lues depuis gradeMap, clés spéciales) ─────
const gradesDisc = {
  'c1_s1_1': { '__abs_nj__': '3', '__abs_j__': '2', '__conduite__': 'Bonne' },
  'c1_s1_2': {
    '__abs_nj__': '1', '__exclusions__': '2', '__felicitation__': 'true',
    '__th__': 'true', '__aver_travail__': '1', '__decision__': 'admis',
  },
};
const disc = scDisciplineConseil(gradesDisc, 'c1', 's1', [1, 2]);
ok(disc.absNJ === 4, 'absences non justifiées cumulées (3+1 = 4)');
ok(disc.absJ === 2, 'absences justifiées cumulées (2)');
ok(disc.conduite === 'Bonne', 'conduite (dernière renseignée)');
ok(disc.exclusions === 2, 'exclusions (2 jours)');
ok(disc.decision === 'Admis(e)', "décision conseil mappée ('admis' → Admis(e))");
ok(disc.mentions.includes('Félicitations') && disc.mentions.includes("Tableau d'honneur")
   && disc.mentions.some((m) => m.startsWith('Avertissement travail')),
   'mentions du conseil (Félicitations · Tableau d\'honneur · Avertissement travail)');

const discEmpty = scDisciplineConseil({}, 'c1', 's1', [1, 2]);
ok(discEmpty.absNJ === 0 && discEmpty.mentions.length === 0 && discEmpty.decision === '',
   'pas de données discipline → tout à zéro / vide');

// ── Nom de l'enseignant ─────────────────────────────────────────────────────────
const teachers = [{ id: 't1', name: 'M. KAMGA Paul' }, { id: 't2', name: 'Mme NANA Estelle' }];
const byId = teacherIndexById(teachers);
ok(byId.t1 === 'M. KAMGA Paul', 'index enseignant par id');

// SC : subject.teacher_id → nom injecté sur la ligne.
const subjectsT = subjects.map((s) =>
  s.id === 'maths' ? { ...s, teacher_id: 't1' } : s.id === 'phys' ? { ...s, teacher_id: 't2' } : s);
const dataT = assembleScBulletin({
  subjects: subjectsT, allGrades, classId, student, seqs, sys: 'FR',
  opts: { maxScale: 20 }, teachersById: byId,
});
const mathsRow = dataT.groups[0].rows.find((r) => r.id === 'maths');
const angRow = dataT.groups[1].rows.find((r) => r.id === 'ang');
ok(mathsRow.enseignant === 'M. KAMGA Paul', "SC : enseignant résolu (Maths → M. KAMGA Paul)");
ok(angRow.enseignant === '', 'SC : matière sans enseignant assigné → vide (fallback M/Mme à l\'affichage)');

// APC : correspondance par nom référentiel ↔ subjects de la classe.
const refMat = [{ id: 'francais', nom: 'Français' }, { id: 'maths', nom: 'Mathématiques' }];
const classSubs = [
  { name: 'Français', teacher_id: 't2', class_id: 'x' },
  { name: 'mathématiques', teacher_id: 't1', class_id: 'x' }, // casse/accent indifférents
];
const map = teacherByMatiere(refMat, classSubs, teachers);
ok(map.francais === 'Mme NANA Estelle' && map.maths === 'M. KAMGA Paul',
   'APC : matières du référentiel reliées aux enseignants par nom (insensible casse/accents)');

console.log(`\n✅ Tous les tests Bulletin SC passent (${pass}).`);
