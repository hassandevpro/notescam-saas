// TABLEAU D'HONNEUR : LE BON ÉLÈVE, POUR LA BONNE PÉRIODE, AU BON SEUIL ?
//
// Chaque test vise une façon concrète de se tromper : seuil lu en % au lieu de /20,
// ancien modèle cassé par la conversion, seuil /20 appliqué tel quel à une classe /100,
// période d'un moteur prise pour celle d'un autre, élève sanctionné gardé malgré l'option,
// élève sous le seuil imprimé (le PDF « par classe » listait un 9,56/20 « Insuffisant »).
import {
  validerSeuil, lireReglagesHonneur, serialiserOptions, normaliserModele, seuilDuModele,
  seuilAuBareme, versSur20, niveauAtteint, SEUIL_DEFAUT,
} from './honorSettings.js';
import { periodePourClasse, libellePeriode } from './honorPeriod.js';
import { applyTemplate } from '../lib/honorRollEngine.js';

let fails = 0;
const ok = (c, m, got) => { if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m, got !== undefined ? JSON.stringify(got) : ''); } };

console.log('Seuil');
ok(validerSeuil('12,5').valeur === 12.5, 'virgule décimale acceptée');
ok(validerSeuil(14.256).valeur === 14.26, 'deux décimales');
ok(!validerSeuil(21).ok && !validerSeuil(-1).ok && !validerSeuil('abc').ok, 'hors 0–20 ou non numérique : refusé');
ok(lireReglagesHonneur({}).minAvg === SEUIL_DEFAUT && SEUIL_DEFAUT === 12, 'école sans réglage : 12/20');
ok(lireReglagesHonneur({ honor_min_avg: 14 }).minAvg === 14, 'seuil de l’école lu');
const r0 = lireReglagesHonneur({ honor_options: '{"levels":{"fel":{"on":true,"min":16}},"excludeSanctioned":true,"lang":"bilingue"}' });
ok(r0.levels.fel.on && r0.levels.fel.min === 16 && !r0.levels.enc.on && r0.excludeSanctioned && r0.lang === 'bilingue', 'options JSON lues', r0);
ok(lireReglagesHonneur({ honor_options: 'pas du json' }).lang === 'auto', 'options illisibles : valeurs par défaut, pas de plantage');
ok(JSON.parse(serialiserOptions(r0)).levels.fel.min === 16, 'aller-retour des options');

console.log('Anciens modèles en %');
const ancien = { filters: { minAvgPct: 80, gender: 'F' } };
const n = normaliserModele(ancien);
ok(n.filters.minAvg20 === 16 && n.filters.minAvgPct === undefined && n.filters.gender === 'F', '80 % → 16/20, autres filtres gardés', n.filters);
ok(ancien.filters.minAvgPct === 80, 'le modèle stocké n’est pas modifié');
ok(normaliserModele({ filters: { minAvgPct: 70 } }).filters.minAvg20 === 14, '70 % → 14/20');
ok(seuilDuModele({ filters: {} }, { minAvg: 12 }) === 12, 'modèle sans seuil : celui de l’école');
ok(seuilDuModele({ filters: { minAvg20: 15 } }, { minAvg: 12 }) === 15, 'seuil du modèle prioritaire');

console.log('Barèmes');
ok(seuilAuBareme(12, 100) === 60 && seuilAuBareme(12, 20) === 12 && seuilAuBareme(12, 10) === 6, '12/20 = 60/100 = 6/10');
ok(versSur20(75, 100) === 15, '75/100 = 15/20');

console.log('Niveaux');
const lv = { levels: { enc: { on: true, min: 14 }, fel: { on: true, min: 16 } } };
ok(niveauAtteint(11.99, 12, lv) === null, 'sous le seuil : aucun niveau');
ok(niveauAtteint(12, 12, lv) === 'th' && niveauAtteint(14, 12, lv) === 'enc' && niveauAtteint(17, 12, lv) === 'fel', '12 → TH, 14 → Encouragements, 17 → Félicitations');
ok(niveauAtteint(17, 12, { levels: { enc: { on: false, min: 14 }, fel: { on: false, min: 16 } } }) === 'th', 'un seul niveau actif : toujours TH');

console.log('Périodes par moteur');
ok(JSON.stringify(periodePourClasse('term_2', { engine: 'classic' }).period.seqs) === '[3,4]', 'classique : T2 = S3 + S4');
ok(periodePourClasse('seq_5', { engine: 'classic' }).period.seqs[0] === 5, 'classique : séquence 5');
ok(periodePourClasse('seq_1', { engine: 'apc' }).raison === 'apc_sequence', 'collège APC : pas de séquence, signalé');
ok(periodePourClasse('term_1', { engine: 'apc' }).period?.value === 'term_1', 'collège APC : trimestre du référentiel');
ok(periodePourClasse('seq_1', { engine: 'apc_primaire' }).raison === 'primaire_trimestres', 'primaire en trimestres : pas de séquence');
ok(periodePourClasse('seq_3', { engine: 'apc_primaire', primSeqMode: true }).period.uas[0] === 3, 'primaire en séquences : séquence 3 = UA 3');
ok(periodePourClasse('term_2', { engine: 'apc_primaire' }).period.seqs[0] === 2, 'primaire : trimestre 2');
ok(periodePourClasse('annual', { engine: 'maternelle' }).period === null, 'maternelle : jamais');
ok(libellePeriode('seq_1') === '1ère séquence' && libellePeriode('seq_1', 'en') === '1st Sequence' && libellePeriode('term_2', 'en') === '2nd Term', 'libellés FR / EN');

console.log('Moteur complet (classique)');
const school = { id: 'e1', current_year: '2026-2027' };
const classes = [{ id: 'c1', name: '4e A', level: '4e', cycle: 'college', system: 'FR' },
  { id: 'c2', name: 'Form 2', level: 'Form 2', cycle: 'college', system: 'EN' }];
const subjects = [{ id: 'm1', class_id: 'c1', name: 'Maths', coef: 1, max: 20 }, { id: 'm2', class_id: 'c2', name: 'Maths', coef: 1, max: 100 }];
const students = [
  { id: 'a', class_id: 'c1', name: 'AWA' }, { id: 'b', class_id: 'c1', name: 'BELLO' }, { id: 'c', class_id: 'c1', name: 'CYRILLE' },
  { id: 'x', class_id: 'c2', name: 'XAVIER' }, { id: 'y', class_id: 'c2', name: 'YANNICK' },
];
const gradeMap = {
  c1_a_1: { m1: '15' }, c1_a_2: { m1: '9' },     // S1 15 · T1 12
  c1_b_1: { m1: '11' }, c1_b_2: { m1: '17' },    // S1 11 · T1 14
  c1_c_1: { m1: '9.56' }, c1_c_2: { m1: '9' },
  c2_x_1: { m2: '65' }, c2_y_1: { m2: '55' },    // EN /100 : 65 ≥ 60, 55 < 60
};
const reportCtx = { school, schoolUnits: [], students, subjects, gradeMap };
const data = (periodKey, extra = {}) => ({ school, classes, subjects, students, gradeMap, reportCtx, periodKey, ...extra });
const noms = (groups) => groups.flatMap((g) => g.rows.map((r) => r.name)).sort().join(',');
const tpl = { scope: 'school', sort: 'score', limit: null, filters: {} };

ok(noms(applyTemplate(tpl, data('seq_1'))) === 'AWA,XAVIER', 'S1, seuil 12 : AWA (15) et XAVIER (65/100) ; BELLO (11), YANNICK (55/100) écartés',
  noms(applyTemplate(tpl, data('seq_1'))));
ok(noms(applyTemplate(tpl, data('term_1'))) === 'AWA,BELLO,XAVIER', 'T1 (moyenne S1+S2) : AWA 12, BELLO 14', noms(applyTemplate(tpl, data('term_1'))));
ok(!noms(applyTemplate(tpl, data('term_1'))).includes('CYRILLE'), 'un élève à 9,28/20 n’est plus imprimé');
ok(noms(applyTemplate({ ...tpl, filters: { minAvgPct: 70 } }, data('term_1'))) === 'BELLO', 'ancien modèle « ≥ 70 % » = 14/20 : BELLO seul');
const lvl = applyTemplate(tpl, data('term_1', { school: { ...school, honor_options: '{"levels":{"enc":{"on":true,"min":14}}}' } })).flatMap((g) => g.rows);
ok(lvl.find((r) => r.name === 'BELLO').honorLevel === 'enc' && lvl.find((r) => r.name === 'AWA').honorLevel === 'th', 'niveaux posés : BELLO Encouragements, AWA TH');

const sanc = { byStudent: { b: { 2: { blameConduite: 1 } } } };
ok(noms(applyTemplate(tpl, data('term_1', { vsAgg: sanc }))).includes('BELLO'), 'option désactivée (défaut) : le sanctionné reste');
ok(!noms(applyTemplate(tpl, data('term_1', { vsAgg: sanc, school: { ...school, honor_options: '{"excludeSanctioned":true}' } }))).includes('BELLO'),
  'option activée : élève blâmé écarté');

if (fails) { console.error(`\n${fails} échec(s)`); process.exit(1); }
console.log('\nOK');
