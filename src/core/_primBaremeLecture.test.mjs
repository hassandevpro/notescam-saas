// Une colonne qui porte déjà un barème hors bornes (513) retombe sur le barème officiel : elle
// redevient saisissable sans que l'école ait à deviner quoi corriger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baremeEnVigueur } from './primColumnBareme.js';

test('un barème posé à 513 est ignoré : la colonne revient à l’officiel', () => {
  assert.equal(baremeEnVigueur([{ note: null, points_max: 513 }], 10, undefined), 10);
  assert.equal(baremeEnVigueur([{ note: 7, points_max: 513 }], 10, undefined), 10);
});

test('un barème d’école valide est conservé, jusqu’à 200 inclus', () => {
  assert.equal(baremeEnVigueur([{ note: 12, points_max: 20 }], 10, undefined), 20);
  assert.equal(baremeEnVigueur([{ note: 150, points_max: 200 }], 10, undefined), 200);
});

test('le barème en attente suffit quand aucune ligne n’en porte un valide', () => {
  assert.equal(baremeEnVigueur([{ note: null, points_max: 999 }], 10, 15), 15);
});
