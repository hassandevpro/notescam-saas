import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsMaxSain, repairPrimNotePayload, PRIM_POINTS_MAX_LIMITE } from './primBareme.js';

test('la borne est celle de la base : 1 à 200', () => {
  assert.equal(PRIM_POINTS_MAX_LIMITE, 200);
  for (const ok of [1, 10, 20, 50, 100, 200, '20', 0.5]) assert.equal(pointsMaxSain(ok), true, String(ok));
  for (const ko of [0, -1, 201, 513, 1000, NaN, 'abc', Infinity]) assert.equal(pointsMaxSain(ko), false, String(ko));
});

test('null et undefined = barème officiel du référentiel : valides', () => {
  assert.equal(pointsMaxSain(null), true);
  assert.equal(pointsMaxSain(undefined), true);
});

test('REPRODUCTION : la ligne bloquée de Bright Continent (points_max 513)', () => {
  const bloquee = {
    id: '141cacce-181c-41a3-af23-ef53b130a86f', competence_id: '5a', critere_id: 'pratique', ua: 2,
    note: null, statut: null, points_max: 513, nkey: 'eleve_5a_pratique_2',
  };
  const r = repairPrimNotePayload(bloquee);
  assert.equal(r.points_max, null);
  assert.equal(pointsMaxSain(r.points_max), true);
  // Rien d'autre ne bouge : identité, note, clé.
  assert.deepEqual({ ...r, points_max: 513 }, bloquee);
});

test('la réparation ne touche jamais à la NOTE', () => {
  const r = repairPrimNotePayload({ note: 7.5, points_max: 513, statut: null });
  assert.equal(r.note, 7.5);
  assert.equal(r.points_max, null);
});

test('une charge saine ou étrangère n’est pas réécrite', () => {
  assert.equal(repairPrimNotePayload({ note: 8, points_max: 10 }), null);
  assert.equal(repairPrimNotePayload({ note: 8, points_max: null }), null);
  assert.equal(repairPrimNotePayload(null), null);
  assert.equal(repairPrimNotePayload('x'), null);
});

test('aucune mutation de l’original', () => {
  const o = { note: 5, points_max: 999 };
  repairPrimNotePayload(o);
  assert.equal(o.points_max, 999);
});
