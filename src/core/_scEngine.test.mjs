// Test du cœur pur du second cycle : coef par (série,classe) distinct, groupement,
// matières optionnelles, + résolution du moteur par classe. Aucune dépendance.
import { matieresForSerieClasse, groupSubtotals, subjectsFromReferentiel } from './scEngine.js';
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

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests SC passent');
process.exit(failed ? 1 : 0);
