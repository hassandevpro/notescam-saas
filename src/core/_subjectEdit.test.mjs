import test from 'node:test';
import assert from 'node:assert/strict';
import { notesAuDessusDuBareme, baremeValide, deplacer } from './subjectEdit.js';

const gm = {
  'c1_a_1': { dictee: '35', physique: '10' },
  'c1_b_1': { dictee: 'ABS', physique: '0' },
  'c1_c_1': { dictee: '', physique: '49,5' },
  'c1_d_2': { dictee: '40' },
  'c2_x_1': { dictee: '99' },            // une AUTRE classe : ne compte pas
};

test('baisser Dictée /40 → /20 : les notes au-dessus sont comptées, ABS et vide ignorés', () => {
  assert.deepEqual(notesAuDessusDuBareme(gm, 'c1', 'dictee', 20), { nombre: 2, plusHaute: 40 });
});
test('un barème qui contient toutes les notes ne bloque rien', () => {
  assert.deepEqual(notesAuDessusDuBareme(gm, 'c1', 'dictee', 40), { nombre: 0, plusHaute: null });
});
test('virgule décimale lue, et un zéro n’est pas au-dessus de quoi que ce soit', () => {
  assert.deepEqual(notesAuDessusDuBareme(gm, 'c1', 'physique', 49), { nombre: 1, plusHaute: 49.5 });
  assert.equal(notesAuDessusDuBareme(gm, 'c1', 'physique', 1).nombre, 2);   // 10 et 49,5 dépassent 1 ; le 0 non
});
test('matière sans note : rien', () => {
  assert.deepEqual(notesAuDessusDuBareme(gm, 'c1', 'maths', 5), { nombre: 0, plusHaute: null });
  assert.deepEqual(notesAuDessusDuBareme(null, 'c1', 'dictee', 5), { nombre: 0, plusHaute: null });
});
test('barème libre : tout nombre > 0, pas 20 ni 100 imposés', () => {
  for (const v of [40, 50, 12.5, '30', 1]) assert.equal(baremeValide(v), true);
  for (const v of [0, -5, '', 'abc', null, undefined, NaN]) assert.equal(baremeValide(v), false);
});

const lignes = [
  { id: 'a', position: 0 }, { id: 'b', position: 1 }, { id: 'c', position: 2 },
];
test('descendre b : b et c échangent leurs positions, a ne bouge pas', () => {
  assert.deepEqual(deplacer(lignes, 'b', +1), [{ id: 'c', position: 1 }, { id: 'b', position: 2 }]);
});
test('monter b', () => {
  assert.deepEqual(deplacer(lignes, 'b', -1), [{ id: 'b', position: 0 }, { id: 'a', position: 1 }]);
});
test('au bord de la liste : rien à écrire', () => {
  assert.deepEqual(deplacer(lignes, 'a', -1), []);
  assert.deepEqual(deplacer(lignes, 'c', +1), []);
  assert.deepEqual(deplacer(lignes, 'inconnu', +1), []);
});
test('positions nulles ou en double (matières importées) : le geste agit quand même', () => {
  const sales = [{ id: 'a', position: null }, { id: 'b', position: null }, { id: 'c', position: 0 }];
  const ecrits = deplacer(sales, 'a', +1);
  assert.deepEqual(ecrits.map((e) => e.id).sort(), ['a', 'b', 'c']);
  const pos = Object.fromEntries(ecrits.map((e) => [e.id, e.position]));
  assert.ok(pos.b < pos.a, 'a est passée derrière b');
});
