// UNE OBSERVATION PAR UA — créneaux 11 à 18 de `student_absences`, hors de toute période.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  creneauObservationUA, lireObservationUA, observationPourBulletin, CLE_OBSERVATION, lotObservation,
} from './observationGlobale.js';

const gm = {
  c1_e1_1: { [CLE_OBSERVATION]: 'Observation du trimestre 1.' },
  c1_e1_11: { [CLE_OBSERVATION]: 'Observation de l’UA 1.' },
  c1_e2_1: { [CLE_OBSERVATION]: 'Trimestre seulement.' },
};

test('chaque UA 1 à 8 a son créneau, hors des séquences 1 à 6', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(creneauObservationUA), [11, 12, 13, 14, 15, 16, 17, 18]);
  for (let ua = 1; ua <= 8; ua += 1) assert.ok(creneauObservationUA(ua) > 6, 'ne doit jamais retomber sur une séquence');
  assert.equal(creneauObservationUA('3'), 13, 'une UA en chaîne vient d’un <select>');
});
test('hors UA 1 à 8 : aucun créneau, donc aucune écriture au hasard', () => {
  for (const v of [0, 9, -1, null, undefined, 'x']) assert.equal(creneauObservationUA(v), null);
});
test('la lecture propre à une UA ne lit QUE son créneau', () => {
  assert.equal(lireObservationUA(gm, 'c1', 'e1', 1), 'Observation de l’UA 1.');
  assert.equal(lireObservationUA(gm, 'c1', 'e1', 2), '', 'UA 2 : rien, le trimestre ne descend pas dans le formulaire');
  assert.equal(lireObservationUA(gm, 'c1', 'e1', 99), '');
});
test('bulletin d’UA : l’observation de l’UA, sinon celle du trimestre (carnets déjà saisis)', () => {
  assert.equal(observationPourBulletin(gm, 'c1', 'e1', { ua: 1, creneau: 1 }), 'Observation de l’UA 1.');
  assert.equal(observationPourBulletin(gm, 'c1', 'e2', { ua: 1, creneau: 1 }), 'Trimestre seulement.');
  assert.equal(observationPourBulletin(gm, 'c1', 'e1', { ua: 2, creneau: 1 }), 'Observation du trimestre 1.');
});
test('bulletin trimestriel : l’observation du trimestre, jamais celle d’une UA', () => {
  assert.equal(observationPourBulletin(gm, 'c1', 'e1', { creneau: 1 }), 'Observation du trimestre 1.');
});
test('rien de saisi : chaîne vide, jamais undefined', () => {
  assert.equal(observationPourBulletin(gm, 'c1', 'zz', { ua: 1, creneau: 1 }), '');
  assert.equal(observationPourBulletin({}, 'c1', 'e1', {}), '');
  assert.equal(observationPourBulletin(null, 'c1', 'e1', { ua: 1, creneau: 1 }), '');
});
test('l’écriture passe par la clé spéciale déjà synchronisée, sans colonne neuve', () => {
  assert.deepEqual(lotObservation('  Bien.  '), { [CLE_OBSERVATION]: 'Bien.' });
});
