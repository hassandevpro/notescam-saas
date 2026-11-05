import test from 'node:test';
import assert from 'node:assert/strict';
import { computePrimClassStats } from './primClassStats.js';

test('réussis, échoués, plus grande, plus petite, moyenne générale', () => {
  const s = computePrimClassStats([14, 9.5, 10, 6, 18], 10);
  assert.equal(s.count, 5);
  assert.equal(s.reussis, 3);            // 14, 10, 18 (10 = seuil : réussi)
  assert.equal(s.echoues, 2);            // 9.5, 6
  assert.equal(s.max, 18);
  assert.equal(s.min, 6);
  assert.equal(s.avg, 11.5);             // 57.5 / 5
  assert.equal(s.rate, 60);
});

test('réussis + échoués = effectif noté, toujours', () => {
  for (const liste of [[1], [10], [3, 17], [5, 5, 5, 15], [0, 20, 10, 9.99]]) {
    const s = computePrimClassStats(liste, 10);
    assert.equal(s.reussis + s.echoues, s.count);
    assert.equal(s.count, liste.length);
  }
});

test('un élève sans moyenne n’est ni réussi ni échoué : il n’est pas compté', () => {
  const s = computePrimClassStats([12, null, undefined, NaN, 8], 10);
  assert.equal(s.count, 2);
  assert.equal(s.reussis, 1);
  assert.equal(s.echoues, 1);
});

test('la moyenne est arrondie à deux décimales', () => {
  assert.equal(computePrimClassStats([10, 10, 11], 10).avg, 10.33);
});

test('aucune moyenne : pas de statistiques (jamais zéro inventé)', () => {
  assert.equal(computePrimClassStats([], 10), null);
  assert.equal(computePrimClassStats([null, undefined], 10), null);
  assert.equal(computePrimClassStats(undefined, 10), null);
});

test('le seuil de réussite est un paramètre : /20 → 10, /10 → 5', () => {
  assert.equal(computePrimClassStats([6, 4], 5).reussis, 1);
  assert.equal(computePrimClassStats([6, 4], 10).reussis, 0);
});
