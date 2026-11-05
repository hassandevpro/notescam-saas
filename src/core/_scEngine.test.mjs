// Test du cœur pur du second cycle : coef par (série,classe) distinct, groupement,
// matières optionnelles, + résolution du moteur par classe. Aucune dépendance.
import { matieresForSerieClasse, groupSubtotals, subjectsFromReferentiel, vieScolaireAutoConduite, assembleScBulletin } from './scEngine.js';
import { resolveClassEngine, isFirstCycle, isSecondCycle, secondCycleClasseSlug } from './engineResolver.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const referentiel = {
  groupes: [{ id: 'g1', nom: 'Groupe 1', ordre: 1 }, { id: 'g2', nom: 'Groupe 2', ordre: 2 }],
  matieres: [
    { id: 'mathematiques', nom: 'Mathématiques', ordre: 1 },
    { id: 'physique', nom: 'Physique', ordre: 2 },
    { id: 'eps', nom: 'EPS', ordre: 9 },
  ],
  serieMatieres: [
    // Mathématiques : coef différent selon (série, classe)
    { serie_id: 'c', classe_id: '2nde', matiere_id: 'mathematiques', groupe_id: 'g1', coefficient: 5, charge_horaire: 6, actif: true },
    { serie_id: 'c', classe_id: 'tle',  matiere_id: 'mathematiques', groupe_id: 'g1', coefficient: 7, charge_horaire: 8, actif: true },
    { serie_id: 'd', classe_id: 'tle',  matiere_id: 'mathematiques', groupe_id: 'g1', coefficient: 4, actif: true },
    { serie_id: 'c', classe_id: 'tle',  matiere_id: 'physique',      groupe_id: 'g1', coefficient: 4, actif: true },
    { serie_id: 'c', classe_id: 'tle',  matiere_id: 'eps',           groupe_id: 'g2', coefficient: 1, actif: true },
    { serie_id: 'c', classe_id: 'tle',  matiere_id: 'physique',      groupe_id: 'g1', coefficient: 9, actif: false }, // inactif → ignoré (doublon)
  ],
};

// 1) Coefficient par (série, classe) distinct.
const tleC = matieresForSerieClasse(referentiel, { serieId: 'c', classeId: 'tle' });
ok(tleC.find((m) => m.matiere_id === 'mathematiques').coefficient === 7, 'Maths Tle C = coef 7');
ok(matieresForSerieClasse(referentiel, { serieId: 'c', classeId: '2nde' }).find((m) => m.matiere_id === 'mathematiques').coefficient === 5, 'Maths 2nde C = coef 5');
ok(matieresForSerieClasse(referentiel, { serieId: 'd', classeId: 'tle' }).find((m) => m.matiere_id === 'mathematiques').coefficient === 4, 'Maths Tle D = coef 4');

// 2) Tri par groupe puis matière ; matière inactive ignorée.
ok(tleC.length === 3, 'Tle C = 3 matières (l\'inactive exclue)');
ok(tleC[0].groupe_id === 'g1' && tleC[tleC.length - 1].groupe_id === 'g2', 'Groupe 1 avant Groupe 2');
ok(tleC.find((m) => m.matiere_id === 'physique').coefficient === 4, 'la ligne active prime (physique=4)');

// 3) Charge horaire portée par (série, classe).
ok(tleC.find((m) => m.matiere_id === 'mathematiques').charge_horaire === 8, 'charge horaire Maths Tle C = 8');

// 4) Sous-totaux par groupe (avec moyennes simulées).
const withAvg = tleC.map((m) => ({ ...m, moyenne: m.matiere_id === 'mathematiques' ? 12 : m.matiere_id === 'physique' ? 8 : 15 }));
const groups = groupSubtotals(withAvg);
ok(groups[0].groupe_id === 'g1', 'sous-totaux : Groupe 1 en tête');
// G1 : Maths(12×7) + Physique(8×4) = 84+32=116 / (7+4)=11 → 10.55
ok(groups[0].moyenne === 10.55, 'moyenne Groupe 1 = 10.55');
ok(groups[1].moyenne === 15, 'moyenne Groupe 2 (EPS) = 15');

// 5) Génération des subjects.
let n = 0;
const subs = subjectsFromReferentiel(tleC, { schoolId: 'S', classId: 'K', gradeMax: 20, makeId: () => `id${++n}` });
ok(subs.length === 3 && subs[0].coef === 7 && subs[0].sc_groupe === 'Groupe 1', 'subjects générés (coef + groupe)');
ok(subs.every((s) => s.max === 20 && s.school_id === 'S' && s.class_id === 'K'), 'subjects portent school/class/max');

// 6) Résolution du moteur par classe.
const school = (e) => ({ bulletin_engine: e });
ok(resolveClassEngine(school('minesec'), { level: '6e', name: '6e A' }) === 'apc', '6e + minesec → apc');
ok(resolveClassEngine(school('minesec'), { level: 'Tle', name: 'Terminale C', serie: 'c' }) === 'sc', 'Tle + minesec → sc');
ok(resolveClassEngine(school('apc_minesec'), { level: 'Tle', name: 'Terminale C' }) === 'classic', 'Tle + apc_minesec seul → classic');
ok(resolveClassEngine(school('classic'), { level: '6e' }) === 'classic', 'classic → classic partout');
ok(isFirstCycle('6e') && !isSecondCycle('6e'), '6e = premier cycle');
ok(isSecondCycle('', 'Terminale C') && !isFirstCycle('', 'Terminale C'), 'Terminale = second cycle');
ok(secondCycleClasseSlug('', 'Première D') === '1ere', 'Première → 1ere');

// 7) Agrégation Vie scolaire → compteurs de conduite du bulletin.
const vsRows = [
  { class_id: 'K', student_id: 'E1', sequence_order: 3, action_type: 'avertissement_ecrit' },
  { class_id: 'K', student_id: 'E1', sequence_order: 3, action_type: 'avertissement_oral' },
  { class_id: 'K', student_id: 'E1', sequence_order: 4, action_type: 'blame' },
  { class_id: 'K', student_id: 'E1', sequence_order: 3, action_type: 'exclusion_temporaire', duration_days: 2 },
  { class_id: 'K', student_id: 'E1', sequence_order: 3, action_type: 'exclusion_definitive' }, // pas de durée → 1 j par défaut
  { class_id: 'K', student_id: 'E1', sequence_order: 3, action_type: 'retenue' }, // non mappé
  { class_id: 'K', student_id: 'E2', sequence_order: 3, action_type: 'blame' }, // autre élève, ignoré
  { class_id: 'K', student_id: 'E1', sequence_order: 5, action_type: 'blame' }, // hors séquences demandées, ignoré
];
const vsAuto = vieScolaireAutoConduite(vsRows, 'K', 'E1', [3, 4]);
ok(vsAuto.averConduiteAuto === 2, 'aver_conduite auto = 2 (oral + écrit)');
ok(vsAuto.blameConduiteAuto === 1, 'blame_conduite auto = 1 (blâme seq 4 uniquement)');
ok(vsAuto.exclusionsAuto === 3, 'exclusions auto = 3 j (2 + défaut 1)');
const vsEmpty = vieScolaireAutoConduite([], 'K', 'E1', [1, 2]);
ok(vsEmpty.averConduiteAuto === 0 && vsEmpty.blameConduiteAuto === 0 && vsEmpty.exclusionsAuto === 0, 'aucune sanction → tout à zéro');

// ── Bulletin ANGLOPHONE d'une classe /20 (FORM1) : moteur /100, document /20 ──
{
  const subjects = [
    { id: 'a', name: 'English Language', coef: 4, max: 20 },
    { id: 'b', name: 'Biology', coef: 2, max: 20 },
    { id: 'c', name: 'Physical Education', coef: 2, max: 20 },
  ];
  const allGrades = { F1_s1_1: { a: '17', b: '16', c: '18' } };
  const data = assembleScBulletin({
    subjects, allGrades, classId: 'F1', student: { id: 's1' }, seqs: [1], sys: 'EN',
    generalRank: '19ème',
    classStats: { avg: 75.64, min: 46.09, max: 96, count: 41, rate: 98 },
    subjectRanks: { a: { s1: '23e' }, c: { s1: '1er' } },
  });
  const rows = data.groups.flatMap((g) => g.rows);
  ok(rows.find((r) => r.id === 'a').appreciation.startsWith('A1'), '17/20 → A1 (et non F9 — Fail)');
  ok(rows.find((r) => r.id === 'c').appreciation.startsWith('A1'), '18/20 → A1');
  ok(Math.abs(data.moyenneGenerale - 17) < 0.01, `moyenne générale ramenée à /20 (obtenu ${data.moyenneGenerale})`);
  ok(data.appreciation.startsWith('A1'), 'mention générale lue sur le pourcentage');
  ok(data.classStats.avg === 15.13 && data.classStats.min === 9.22 && data.classStats.max === 19.2, `profil de classe /100 → /20 (${JSON.stringify(data.classStats)})`);
  ok(data.generalRank === '19th' && rows.find((r) => r.id === 'a').rang === '23rd' && rows.find((r) => r.id === 'c').rang === '1st', 'rangs en anglais');
  const fr = assembleScBulletin({ subjects, allGrades, classId: 'F1', student: { id: 's1' }, seqs: [1], sys: 'FR', generalRank: '19ème' });
  ok(fr.generalRank === '19ème', 'FR : le rang reste en français');
}

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests SC passent');
process.exit(failed ? 1 : 0);
