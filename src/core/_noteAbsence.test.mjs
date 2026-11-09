import test from 'node:test';
import assert from 'node:assert/strict';
import { etatNote, valeurNumerique, etatMatiere, effectifCompose } from './noteAbsence.js';
import { calcFR } from './bulletinEngine.js';
import { buildRanks, clsStat } from './bulletinEngine.js';

test('trois états distincts, et un vrai 0 n’est pas une absence', () => {
  assert.equal(etatNote('14'), 'note'); assert.equal(etatNote('0'), 'note'); assert.equal(etatNote(0), 'note');
  assert.equal(etatNote('ABS'), 'abs'); assert.equal(etatNote('abs'), 'abs');
  for (const v of ['', null, undefined, '  ', 'x']) assert.equal(etatNote(v), 'vide');
  assert.equal(valeurNumerique('0'), 0);
  assert.equal(valeurNumerique('ABS'), null); assert.equal(valeurNumerique(''), null);
  assert.equal(valeurNumerique('12,5'), 12.5);
});

test('matière : ABS ou vide à l’impression, note dès qu’une séquence est notée', () => {
  const g = { 'c_e1_1': { m: 'ABS' }, 'c_e1_2': { m: '' }, 'c_e2_1': { m: 'ABS' }, 'c_e2_2': { m: '12' } };
  assert.equal(etatMatiere(g, 'c', 'e1', 'm', [1, 2]), 'abs');
  assert.equal(etatMatiere(g, 'c', 'e2', 'm', [1, 2]), 'note');
  assert.equal(etatMatiere(g, 'c', 'e3', 'm', [1, 2]), 'vide');
});

// Classe de 17 : 13 notés, 2 ABS, 2 pas saisis → effectif, moyenne, rangs.
const subs = [{ id: 'm', coef: 1, max: 20 }];
const notes = [14, 8, 12, 16, 10, 9, 18, 11, 13, 15, 7, 17, 12];
const studs = Array.from({ length: 17 }, (_, i) => ({ id: `e${i}`, name: `E${i}` }));
const gm = {};
studs.forEach((s, i) => {
  const v = i < 13 ? String(notes[i]) : i < 15 ? 'ABS' : '';
  gm[`c_${s.id}_1`] = { m: v };
});

test('classe de 17 dont 2 ABS : effectif, moyenne et réussite sur ceux qui ont composé', () => {
  const eff = effectifCompose(studs.map((s) => gm[`c_${s.id}_1`].m));
  assert.deepEqual(eff, { inscrits: 17, composes: 13, absents: 2, vides: 2 });
  const st = clsStat(studs, gm, 'c', [1], subs, 'FR');
  const somme = notes.reduce((a, b) => a + b, 0);
  assert.equal(st.avg, Math.round((somme / 13) * 100) / 100);   // sur 13, pas sur 17 (un 0 les tirerait vers le bas)
  assert.equal(st.above, notes.filter((n) => n >= 10).length);
  assert.equal(st.total, 17);                                  // l’effectif inscrit reste exposé à côté
});

test('rangs sans trou : les ABS et les vides n’en reçoivent pas et ne décalent personne', () => {
  const r = buildRanks(studs, gm, 'c', [1], subs, 'FR');
  const rangs = r.filter((s) => s.rankD !== '—').map((s) => parseInt(s.rankD)).sort((a, b) => a - b);
  assert.equal(rangs.length, 13);
  assert.equal(rangs[0], 1); assert.equal(rangs.at(-1) <= 13, true);
  for (const id of ['e13', 'e14', 'e15', 'e16']) assert.equal(r.find((s) => s.id === id).rankD, '—');
});

test('ABS dans 1 matière sur 3 : sortie des deux côtés de la moyenne, pas un zéro', () => {
  const s3 = [{ id: 'a', coef: 2, max: 20 }, { id: 'b', coef: 1, max: 20 }, { id: 'c', coef: 1, max: 20 }];
  assert.equal(calcFR({ a: '16', b: 'ABS', c: '12' }, s3), 14.67);  // (16×2 + 12×1) ÷ 3
  assert.equal(calcFR({ a: '16', b: '0', c: '12' }, s3), 11);        // un vrai 0 compte : (32+0+12) ÷ 4
});

test('élève ABS partout ou classe sans note : pas de moyenne, pas de division par zéro', () => {
  assert.equal(calcFR({ a: 'ABS', b: 'ABS', c: '' }, [{ id: 'a', coef: 1, max: 20 }, { id: 'b', coef: 1, max: 20 }, { id: 'c', coef: 1, max: 20 }]), null);
  const st = clsStat([{ id: 'z' }], { c_z_1: { m: 'ABS' } }, 'c', [1], subs, 'FR');
  assert.equal(st.avg, null); assert.equal(st.min, null);
});
