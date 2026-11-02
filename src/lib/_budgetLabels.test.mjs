import test from 'node:test';
import assert from 'node:assert/strict';
import { lineFullLabel } from './budgetLabels.js';
import { equalShares, copyAllocation } from './budgetLineView.js';

const byId = new Map([['p1', { id: 'p1', label: 'PÔLE 1 · SALAIRES' }], ['p2', { id: 'p2', label: 'PÔLE 2 · SALAIRES' }]]);

test('deux lignes homonymes de pôles différents ne sont plus indiscernables', () => {
  const a = lineFullLabel({ id: 'a', label: 'Salaires et Primes', parent_id: 'p1' }, byId);
  const b = lineFullLabel({ id: 'b', label: 'Salaires et Primes', parent_id: 'p2' }, byId);
  assert.notEqual(a, b);
  assert.equal(a, 'PÔLE 1 · SALAIRES › Salaires et Primes');
});

test('secteur : nommé s’il est seul, compté sinon, absent s’il n’y en a pas', () => {
  const l = { label: 'CNPS', parent_id: 'p1' };
  assert.equal(lineFullLabel(l, byId, { sectorNames: ['Collège'] }), 'PÔLE 1 · SALAIRES › CNPS · Collège');
  assert.equal(lineFullLabel(l, byId, { sectorNames: ['Maternelle', 'Primaire'] }), 'PÔLE 1 · SALAIRES › CNPS · 2 secteurs');
  assert.equal(lineFullLabel(l, byId, { sectorNames: [] }), 'PÔLE 1 · SALAIRES › CNPS');
});

test('ligne sans rubrique, rubrique inconnue ou ligne absente : jamais d’exception', () => {
  assert.equal(lineFullLabel({ label: 'Seule' }, byId), 'Seule');
  assert.equal(lineFullLabel({ label: 'X', parent_id: 'zz' }, byId), 'X');
  assert.equal(lineFullLabel(null, byId), '');
  assert.equal(lineFullLabel({ label: 'Y', parent_id: 'p1' }, undefined), 'Y');
});

test('partage égal : la somme fait toujours exactement 100', () => {
  for (const n of [1, 2, 3, 4, 6, 7, 9, 11]) {
    const s = equalShares(n);
    assert.equal(s.length, n);
    assert.equal(Math.round(s.reduce((a, b) => a + b, 0) * 100) / 100, 100, `n=${n}`);
  }
  assert.deepEqual(equalShares(3), [33.33, 33.33, 33.34]);
  assert.deepEqual(equalShares(2), [50, 50]);
  assert.deepEqual(equalShares(0), []);
});

test('copie : seulement ce qui existe dans la ligne cible ; secteurs réservés aux lignes par secteurs', () => {
  const src = {
    linePeriods: [{ budget_chapter_id: 'A', budget_period_id: 'p1', pct: 60 }, { budget_chapter_id: 'A', budget_period_id: 'pX', pct: 40 }, { budget_chapter_id: 'B', budget_period_id: 'p1', pct: 100 }],
    lineSectors: [{ budget_chapter_id: 'A', school_unit_id: 'u1', pct: 100 }],
  };
  const r = copyAllocation('A', src, { periodIds: ['p1', 'p2'], unitIds: ['u1'], isSectors: true });
  assert.deepEqual(r.periods, { p1: 60 });          // pX n'existe pas dans la cible
  assert.deepEqual(r.sectors, { u1: 100 });
  assert.deepEqual(copyAllocation('A', src, { periodIds: ['p1'], unitIds: ['u1'], isSectors: false }).sectors, {});
});
