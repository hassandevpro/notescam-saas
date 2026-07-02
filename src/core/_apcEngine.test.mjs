// Test du cœur pur du moteur APC : héritage séquence→trimestre, moyenne matière,
// moyenne générale, classement. Aucune dépendance (pas de store/réseau/React).
import {
  competencesFor, sequencesOfTrimestre, trimestreOfSequence,
  matiereAverage, weightedMatiere, generalAverage, matiereRows,
  apcCote, coefFor, buildApcRanks,
} from './apcEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// Référentiel minimal : 6e, T1, Français = 2 compétences ; Maths T1 = 1 ;
// + une compétence T2/Français qui ne doit JAMAIS apparaître en T1.
const competences = [
  { id: 'c1', cycle_id: 'premier_cycle', classe_id: '6e', trimestre_id: 't1', matiere_id: 'francais', ordre: 2, intitule: 'B', actif: true },
  { id: 'c2', cycle_id: 'premier_cycle', classe_id: '6e', trimestre_id: 't1', matiere_id: 'francais', ordre: 1, intitule: 'A', actif: true },
  { id: 'c3', cycle_id: 'premier_cycle', classe_id: '6e', trimestre_id: 't1', matiere_id: 'mathematiques', ordre: 1, intitule: 'M', actif: true },
  { id: 'c4', cycle_id: 'premier_cycle', classe_id: '6e', trimestre_id: 't2', matiere_id: 'francais', ordre: 1, intitule: 'T2', actif: true },
  { id: 'c5', cycle_id: 'premier_cycle', classe_id: '6e', trimestre_id: 't1', matiere_id: 'francais', ordre: 3, intitule: 'OFF', actif: false },
];
const matieres = [
  { id: 'francais', nom: 'Français', coefficient: 4 },
  { id: 'mathematiques', nom: 'Mathématiques', coefficient: 2 },
];

// 1) competencesFor : filtre classe/trimestre/matière + tri par ordre + actif only.
const fr6T1 = competencesFor(competences, { classeId: '6e', trimestreId: 't1', matiereId: 'francais' });
ok(fr6T1.length === 2, 'Français 6e T1 = 2 compétences actives (l\'inactive exclue)');
ok(fr6T1[0].id === 'c2' && fr6T1[1].id === 'c1', 'compétences triées par ordre (1 puis 2)');
ok(competencesFor(competences, { classeId: '6e', trimestreId: 't1', matiereId: 'francais' })
   .every((c) => c.trimestre_id === 't1'), 'aucune compétence T2 ne fuit en T1');
ok(competencesFor(competences, { classeId: '5e', trimestreId: 't1', matiereId: 'francais' }).length === 0,
   'la compétence 6e n\'apparaît pas en 5e');

// 2) Héritage séquence ⇄ trimestre.
ok(trimestreOfSequence([], 's1') === 't1', 's1 → t1 (repli constante)');
ok(trimestreOfSequence([], 's4') === 't2', 's4 → t2');
ok(trimestreOfSequence([], 2) === 't1', 'numéro 2 → t1');
ok(sequencesOfTrimestre([], 't1').map((s) => s.numero).join(',') === '1,2', 't1 hérité par séquences 1 et 2');
ok(sequencesOfTrimestre([], 't3').map((s) => s.numero).join(',') === '5,6', 't3 hérité par séquences 5 et 6');

// 3) Moyenne matière = moyenne (pondérée coef compétence) des compétences notées.
ok(matiereAverage({ c1: 12, c2: 16 }, fr6T1) === 14, 'moyenne Français = (12+16)/2 = 14');
ok(matiereAverage({ c2: 16 }, fr6T1) === 16, 'compétence non notée ignorée');
ok(matiereAverage({}, fr6T1) === null, 'aucune note → null');
// coefficient de compétence respecté
const weighted = [
  { id: 'x', matiere_id: 'francais', ordre: 1, coefficient: 3, actif: true },
  { id: 'y', matiere_id: 'francais', ordre: 2, coefficient: 1, actif: true },
];
ok(matiereAverage({ x: 16, y: 8 }, weighted) === 14, 'coef compétence : (16*3+8*1)/4 = 14');

// 4) Moyenne pondérée matière + moyenne générale (à partir des moyennes matières).
ok(weightedMatiere(14, 4) === 56, 'pondérée = 14 × coef 4 = 56');
ok(weightedMatiere(null, 4) === null, 'pondérée d\'une matière non notée = null');
const rows = matiereRows(competences, matieres, { c1: 12, c2: 16, c3: 10 }, { classeId: '6e', trimestreId: 't1' });
ok(rows.find((r) => r.matiere.id === 'francais').moyenne === 14, 'matiereRows : Français = 14');
ok(rows.find((r) => r.matiere.id === 'mathematiques').moyenne === 10, 'matiereRows : Maths = 10');
// moyenne générale = (14*4 + 10*2) / (4+2) = 76/6 = 12.67
ok(generalAverage(rows) === 12.67, 'moyenne générale pondérée matières = 12.67');
ok(generalAverage([{ moyenne: null, coef: 4 }, { moyenne: 10, coef: 2 }]) === 10, 'matière non notée exclue de la générale');

// 5) Cote officielle (CTBA…CNA).
ok(apcCote(18).code === 'CTBA', '18 → CTBA');
ok(apcCote(15).code === 'CBA', '15 → CBA');
ok(apcCote(13).code === 'CA', '13 → CA');
ok(apcCote(11).code === 'CMA', '11 → CMA');
ok(apcCote(7).code === 'CNA', '7 → CNA');
ok(apcCote(null).code === '—', 'null → —');

// 5b) Coefficient par (classe, matière) : table prioritaire, sinon repli matière.
const cm = [{ classe_id: '6e', matiere_id: 'francais', coefficient: 6 }];
ok(coefFor(cm, '6e', { id: 'francais', coefficient: 4 }) === 6, 'coef classe (6) prime sur global (4)');
ok(coefFor(cm, '4e', { id: 'francais', coefficient: 4 }) === 4, 'repli coef global si pas de ligne classe');
ok(coefFor([], '6e', { id: 'maths' }) === 1, 'repli 1 si aucun coef');

// 6) Classement : ex æquo partagent le rang ; exclus → '—'.
const ranks = buildApcRanks(
  [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  { a: 15, b: 15, c: 12, d: null },
  { d: true },
);
const byId = Object.fromEntries(ranks.map((r) => [r.id, r.rang]));
ok(byId.a === 1 && byId.b === 1, 'ex æquo a & b = rang 1');
ok(byId.c === 3, 'le suivant saute au rang 3');
ok(byId.d === '—', 'élève exclu → —');

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests APC passent');
process.exit(failed ? 1 : 0);
