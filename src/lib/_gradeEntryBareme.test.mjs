import test from 'node:test';
import assert from 'node:assert/strict';
import { isPass, gradeColor, validateGrade, observationFor } from './gradeEntry.js';

test('réussite = moitié du barème, quel que soit le barème', () => {
  for (const n of [9, 9.99]) assert.equal(isPass(n, 20), false);
  for (const n of [10, 11, 20]) assert.equal(isPass(n, 20), true);
  assert.equal(isPass(0, 20), false);
  assert.equal(isPass(19.99, 40), false); assert.equal(isPass(20, 40), true);   // /40
  assert.equal(isPass(4.5, 10), false);   assert.equal(isPass(5, 10), true);     // /10
  assert.equal(isPass(49, 100), false);   assert.equal(isPass(50, 100), true);   // /100
  assert.equal(isPass('abc', 20), false); assert.equal(isPass(12, 0), false);
});

test('la couleur ne dépend plus du système : 14/20 est vert en EN comme en FR', () => {
  assert.match(gradeColor('14', 20, 'EN'), /emerald/);
  assert.match(gradeColor('14', 20, 'FR'), /emerald/);
  assert.match(gradeColor('8', 20, 'EN'), /red/);
  assert.match(gradeColor('14', 100, 'EN'), /red/);   // barème resté à 100 : c'est CE barème qui est faux
});

test('saisie : 0 et 20 acceptés, 21 refusé sur /20', () => {
  assert.equal(validateGrade('0', 20), '0');
  assert.equal(validateGrade('20', 20), '20');
  assert.equal(validateGrade('21', 20), null);
  assert.equal(validateGrade('21', 100), '21');
});

test('observation anglophone : 14/20 n’est plus « Fail » dès que le barème est 20', () => {
  assert.notEqual(observationFor('14', 20, 'EN', null, 100).text, 'Fail');
  assert.equal(observationFor('14', 100, 'EN', null, 100).text, 'Fail'); // ancien symptôme, barème à 100
  assert.equal(observationFor('17', 20, 'EN', null, 100).text, observationFor('85', 100, 'EN', null, 100).text);
});
