import test from 'node:test';
import assert from 'node:assert/strict';
import { moyennePointsSur20, cellulesDeMatiere, moyennePointsActive } from './primMoyennePoints.js';
import { generalAverage } from './primEngine.js';
import { computePrimClassStats } from './primClassStats.js';
import { buildPrimRanks } from './primEngine.js';

const cell = (achieved, possible) => ({ achieved, possible });

test('1. exemple de l’école : S = 90, T = 66 → 14,67', () => {
  const r = moyennePointsSur20([cell(30, 40), cell(14, 20), cell(22, 30)]);
  assert.equal(r.totalBareme, 90);
  assert.equal(r.totalObtenu, 66);
  assert.equal(r.moyenne, 14.67);
});

test('1 bis. cas BCBS : 190 / 280 → 13,57 (l’ancien bulletin disait 13,2)', () => {
  assert.equal(moyennePointsSur20([cell(190, 280)]).moyenne, 13.57);
});

test('2. barèmes mixtes 40/30/20/10/5 : tout juste → 20,00 ; tout à 0 → 0,00', () => {
  const bar = [40, 30, 20, 10, 5];
  assert.equal(moyennePointsSur20(bar.map((p) => cell(p, p))).moyenne, 20);
  assert.equal(moyennePointsSur20(bar.map((p) => cell(0, p))).moyenne, 0);
  // moitié partout → 10
  assert.equal(moyennePointsSur20(bar.map((p) => cell(p / 2, p))).moyenne, 10);
  // intermédiaire : 40→30, 30→15, 20→20, 10→5, 5→0 : T = 70, S = 105 → 13,3333
  assert.equal(moyennePointsSur20([cell(30, 40), cell(15, 30), cell(20, 20), cell(5, 10), cell(0, 5)]).moyenne, 13.33);
});

test('3. une matière non évaluée / masquée est exclue du numérateur ET du dénominateur', () => {
  const avec = moyennePointsSur20([cell(30, 40), cell(14, 20), cell(null, null)]);
  const sans = moyennePointsSur20([cell(30, 40), cell(14, 20)]);
  assert.equal(avec.moyenne, sans.moyenne);
  assert.equal(avec.totalBareme, 60);
  // une cellule sans barème n’entre pas non plus
  assert.equal(moyennePointsSur20([cell(30, 40), cell(5, 0), cell(undefined, 20)]).totalBareme, 40);
});

test('4. S = 0 : pas de division, null (jamais NaN ni Infinity)', () => {
  for (const liste of [[], null, undefined, [cell(null, null)], [cell(0, 0)], [cell(5, 0)]]) {
    const r = moyennePointsSur20(liste);
    assert.equal(r.moyenne, null);
    assert.ok(!Number.isNaN(r.totalObtenu) && Number.isFinite(r.totalBareme));
  }
});

test('5. arrondi au plus proche, 0,005 vers le haut, sans erreur de flottant', () => {
  // 135,65 × 20 ÷ 200 = 13,565 EXACTEMENT → 13,57 (le cas cité par l'école).
  assert.equal(moyennePointsSur20([cell(135.65, 200)]).moyenne, 13.57);
  // Le vrai piège des flottants : 1,005 × 100 vaut 100,49999999999999, donc la méthode
  // naïve rend 1 là où l'arrondi « half up » demande 1,01.
  assert.equal(Math.round(1.005 * 100) / 100, 1, 'la méthode naïve se trompe ici');
  assert.equal(moyennePointsSur20([cell(1.005, 20)]).moyenne, 1.01);
  // le cas d’en dessous reste en dessous : 13,5649… → 13,56
  assert.equal(moyennePointsSur20([cell(135.64, 200)]).moyenne, 13.56);
  // 14,665 → 14,67 ; 0,005 → 0,01
  assert.equal(moyennePointsSur20([cell(146.65, 200)]).moyenne, 14.67);
  assert.equal(moyennePointsSur20([cell(0.05, 200)]).moyenne, 0.01);
});

test('5 bis. aucun arrondi intermédiaire : des cellules à 2 décimales s’additionnent exactement', () => {
  const r = moyennePointsSur20([cell(0.1, 1), cell(0.2, 1), cell(0.3, 1)]);
  assert.equal(r.totalObtenu, 0.6);       // et non 0.6000000000000001
  assert.equal(r.totalBareme, 3);
  assert.equal(r.moyenne, 4);
});

test('6. le réglage décide : même élève, règle par défaut inchangée', () => {
  // Matière A : 5/10 (coef 1) ; matière B : 40/40 (coef 1).
  const parDefaut = generalAverage([{ moyenne: 10, coef: 1 }, { moyenne: 20, coef: 1 }]);
  const parPoints = moyennePointsSur20([cell(5, 10), cell(40, 40)]).moyenne;
  assert.equal(parDefaut, 15);            // moyenne des pourcentages
  assert.equal(parPoints, 18);            // 45 × 20 ÷ 50
  assert.notEqual(parDefaut, parPoints);
  assert.equal(moyennePointsActive({}), false);
  assert.equal(moyennePointsActive(null), false);
  assert.equal(moyennePointsActive({ prim_moyenne_points: 0 }), false);
  assert.equal(moyennePointsActive({ prim_moyenne_points: null }), false);
  assert.equal(moyennePointsActive({ prim_moyenne_points: 1 }), true);
  assert.equal(moyennePointsActive({ prim_moyenne_points: true }), true);
});

test('7. rang et stats de classe, classe de 6 élèves', () => {
  const classe = [
    { id: 'a', cells: [cell(38, 40), cell(18, 20), cell(28, 30)] },  // 84/90 → 18,67
    { id: 'b', cells: [cell(30, 40), cell(14, 20), cell(22, 30)] },  // 66/90 → 14,67
    { id: 'c', cells: [cell(20, 40), cell(10, 20), cell(15, 30)] },  // 45/90 → 10,00
    { id: 'd', cells: [cell(10, 40), cell(9, 20), cell(14, 30)] },   // 33/90 →  7,33
    { id: 'e', cells: [cell(30, 40), cell(14, 20), cell(22, 30)] },  // ex æquo avec b
    { id: 'f', cells: [] },                                          // rien de noté
  ];
  const avg = Object.fromEntries(classe.map((s) => [s.id, moyennePointsSur20(s.cells).moyenne]));
  assert.deepEqual(avg, { a: 18.67, b: 14.67, c: 10, d: 7.33, e: 14.67, f: null });
  const rangs = Object.fromEntries(buildPrimRanks(classe, avg).map((r) => [r.id, r.rang]));
  assert.deepEqual(rangs, { a: 1, b: 2, e: 2, c: 4, d: 5, f: '—' });
  const st = computePrimClassStats(Object.values(avg), 10);
  assert.equal(st.count, 5);
  assert.equal(st.max, 18.67);
  assert.equal(st.min, 7.33);
  assert.equal(st.reussis, 4);            // 10,00 = seuil : réussi
  assert.equal(st.echoues, 1);
  assert.equal(st.avg, 13.07);            // (18,67+14,67+10+7,33+14,67) ÷ 5
});

test('8. période : ΣT × 20 ÷ ΣS sur toutes les UA, pas une moyenne de moyennes par UA', () => {
  // UA1 : 10/10 ; UA2 : 0/40 → cumul 10/50 → 4,00. Moyenne des UA : (20 + 0) ÷ 2 = 10.
  const uas = [1, 2];
  const totaux = { 1: { achieved: 10, possible: 10 }, 2: { achieved: 0, possible: 40 } };
  const cellules = cellulesDeMatiere(uas, (ua) => totaux[ua]);
  assert.equal(moyennePointsSur20(cellules).moyenne, 4);
  const parUA = uas.map((ua) => moyennePointsSur20([totaux[ua]]).moyenne);
  assert.equal((parUA[0] + parUA[1]) / 2, 10, 'l’autre lecture donnerait 10 — d’où la question posée à l’école');
  // une UA non évaluée pour cette matière n’entre pas dans S
  assert.equal(cellulesDeMatiere([1, 2, 3], (ua) => (ua === 3 ? { achieved: null, possible: null } : totaux[ua])).length, 2);
});
