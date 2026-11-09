// CM1 « PAR MATIÈRES » (Dictée /40, Physique /50, Mathématiques /20) à travers le VRAI moteur de rapport
// (le même que le secondaire) : barème libre, conversion sur 20, moyenne pondérée, rang, ABS ≠ 0.
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_cm1Matieres.test.mjs
import { buildClassReport } from './classReportEngine.js';
import { isPass } from './gradeEntry.js';
import { modeDeClasse } from '../core/modeEvaluation.js';

let ko = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) ko += 1; };
const near = (a, b) => a != null && Math.abs(a - b) < 0.011;

const school = { bulletin_engine: 'officiel' };
const cls = { id: 'cm1', name: 'CM1 A', level: 'CM1', system: 'FR', grade_max: 20, bulletin_engine: 'classic' };
ok(modeDeClasse(school, cls) === 'matieres', 'CM1 réglée « Par matières » : mode matières (même en école officielle)');

const subjects = [
  { id: 'dictee', class_id: 'cm1', name: 'Dictée', max: 40, coef: 2 },
  { id: 'physique', class_id: 'cm1', name: 'Physique', max: 50, coef: 1 },
  { id: 'maths', class_id: 'cm1', name: 'Mathématiques', max: 20, coef: 3 },
];
const students = [
  { id: 'a', name: 'Abena' },     // 30/40, 40/50, 15/20
  { id: 'b', name: 'Biya' },      // ABS en Dictée, 0/50 (un vrai zéro), 10/20
  { id: 'c', name: 'Chantal' },   // 40/40, 50/50, 20/20
  { id: 'd', name: 'Dikoume' },   // rien du tout
];
const gradeMap = {
  'cm1_a_1': { dictee: '30', physique: '40', maths: '15' },
  'cm1_b_1': { dictee: 'ABS', physique: '0', maths: '10' },
  'cm1_c_1': { dictee: '40', physique: '50', maths: '20' },
};
const rep = buildClassReport({
  engine: 'classic', cls, students, subjects, period: { seqs: [1] }, gradeMap, sys: 'FR', gOpts: {}, scaleMax: 20, passThreshold: 10,
});
const avg = (id) => rep.rows.find((r) => r.student.id === id).avg;
// Abena : (30/40×20 ×2 + 40/50×20 ×1 + 15 ×3) ÷ 6 = (15×2 + 16 + 15×3) ÷ 6 = 91 ÷ 6 = 15,17
ok(near(avg('a'), 15.17), `moyenne pondérée sur 20 : Abena = ${avg('a')} (attendu 15,17)`);
ok(near(avg('c'), 20), `tout juste = 20 (${avg('c')})`);
// Biya : Dictée ABS → exclue ; Physique 0 COMPTE ; Maths 10 → (0×1 + 10×3) ÷ 4 = 7,5
ok(near(avg('b'), 7.5), `ABS exclu, vrai 0 compté : Biya = ${avg('b')} (attendu 7,5 — et non 5 qui compterait l’ABS comme 0)`);
ok(avg('d') === null, 'élève sans aucune note : pas de moyenne (jamais 0, jamais NaN)');

const rang = Object.fromEntries(rep.rows.map((r) => [r.student.id, r.rank?.rankN ?? r.rank ?? null]));
ok(rang.c === 1 && rang.a === 2 && rang.b === 3, `rangs : ${JSON.stringify(rang)}`);
ok(rang.d == null || rang.d === '—', 'l’élève sans note n’est pas classé');
// Moyenne de classe = moyenne des élèves NOTÉS seulement : (15,17 + 7,5 + 20) ÷ 3 = 14,22 ; l'effectif reste 4.
ok(near(rep.classStats.avg, 14.22), `moyenne de classe sur les 3 notés = ${rep.classStats.avg} (attendu 14,22)`);
ok(rep.classStats.total === 4 && rep.classStats.above === 2, `effectif 4, ${rep.classStats.above} au-dessus de 10 (attendu 2)`);
ok(near(rep.classStats.max, 20) && near(rep.classStats.min, 7.5), 'max / min de la classe');

// Saisie : seuil de réussite = max / 2, jamais 10 codé en dur
ok(isPass(20, 40) && !isPass(19.99, 40), 'Dictée /40 : réussite à 20 (max/2)');
ok(isPass(25, 50) && !isPass(24, 50), 'Physique /50 : réussite à 25');
ok(isPass(10, 20) && !isPass(9, 20), 'Maths /20 : réussite à 10');

// Les colonnes du rapport portent leur barème propre (le bulletin s’imprime « note / max »)
const col = (id) => rep.columns.find((c) => c.id === id);
ok(col('dictee').max === 40 && col('physique').max === 50 && col('maths').max === 20, 'chaque colonne garde son barème');
// Seuil par matière ramené au prorata
ok(rep.columnStats && Object.keys(rep.columnStats).length >= 3, 'statistiques par matière présentes');

process.exit(ko ? 1 : 0);
