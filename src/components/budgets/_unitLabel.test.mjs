import test from 'node:test';
import assert from 'node:assert/strict';
import { unitDisplayName } from './budgetUi.js';

const t = (fr) => fr;   // les libellés FR suffisent au contrôle

test('deux unités homonymes produisent deux libellés différents', () => {
  const a = { id: '1', name: 'THE GENIUS INTERNATIONAL SCHOOL', section_key: 'maternelle' };
  const b = { id: '2', name: 'THE GENIUS INTERNATIONAL SCHOOL', section_key: 'primaire' };
  assert.notEqual(unitDisplayName(t, a), unitDisplayName(t, b));
  assert.equal(unitDisplayName(t, a), 'THE GENIUS INTERNATIONAL SCHOOL · Maternelle');
  assert.equal(unitDisplayName(t, b), 'THE GENIUS INTERNATIONAL SCHOOL · Primaire');
});

test('le nom qui contient déjà la section n’est pas répété', () => {
  assert.equal(unitDisplayName(t, { name: 'École Primaire Bonamoussadi', section_key: 'primaire' }), 'École Primaire Bonamoussadi');
});

test('sans nom : la section ; sans section : le nom ; sans unité : vide', () => {
  assert.equal(unitDisplayName(t, { section_key: 'primaire' }), 'Primaire');
  assert.equal(unitDisplayName(t, { name: 'Annexe' }), 'Annexe');
  assert.equal(unitDisplayName(t, null), '');
});

test('section inconnue : la clé brute, sans exception', () => {
  assert.equal(unitDisplayName(t, { name: 'X', section_key: 'inconnue' }), 'X · inconnue');
});
