import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBudget, topLines, flattenLines } from './budgetSummary.js';

const line = (id, label, ceiling, status, available = ceiling) =>
  ({ id, label, isLine: true, status, consumption: { ceiling, available } });
const tree = [
  { id: 'r1', label: 'PÔLE 1', isLine: false, children: [
    line('a', 'Salaires et Primes', 37048000, 'draft'),
    line('b', 'CNPS', 2800000, 'active', 2000000),
  ] },
  line('c', 'salaires', 39908000, 'draft'),
];

test('réparti, activé et dépensable sont trois chiffres distincts', () => {
  const s = summarizeBudget({ envelope: 50000000, tree });
  assert.equal(s.reparti, 79756000);
  assert.equal(s.activeAmount, 2800000);
  assert.equal(s.spendable, 2000000);
  assert.equal(s.activeCount, 1);
  assert.equal(s.lineCount, 3);
});

test('dépassement = réparti − enveloppe, jamais négatif', () => {
  assert.equal(summarizeBudget({ envelope: 50000000, tree }).overBy, 29756000);
  assert.equal(summarizeBudget({ envelope: 90000000, tree }).overBy, 0);
});

test("aucune ligne active : rien n'est dépensable, même avec une grosse enveloppe", () => {
  const s = summarizeBudget({ envelope: 121098000, tree: [line('x', 'L', 1000, 'draft')] });
  assert.equal(s.activeCount, 0);
  assert.equal(s.spendable, 0);
});

test('une ligne active en dépassement ne retranche rien aux autres', () => {
  const s = summarizeBudget({ envelope: 10, tree: [line('a', 'A', 100, 'active', -50), line('b', 'B', 100, 'active', 70)] });
  assert.equal(s.spendable, 70);
});

test('les lignes clôturées ne comptent pas comme activées', () => {
  const s = summarizeBudget({ envelope: 10, tree: [line('a', 'A', 100, 'closed', 0)] });
  assert.equal(s.activeAmount, 0);
});

test('topLines : les plus grosses d’abord, avec la rubrique parente', () => {
  const s = summarizeBudget({ envelope: 1, tree });
  const top = topLines(s, 2);
  assert.deepEqual(top.map((t) => t.id), ['c', 'a']);
  assert.equal(top[1].parentLabel, 'PÔLE 1');
});

test('flattenLines ignore les rubriques vides', () => {
  assert.deepEqual(flattenLines([{ id: 'r', label: 'R', isLine: false, children: [] }]), []);
});

test('entrées absentes : zéros, pas d’exception', () => {
  const s = summarizeBudget();
  assert.equal(s.reparti, 0); assert.equal(s.overBy, 0); assert.deepEqual(topLines(s), []);
});

import { barGeometry } from './budgetSummary.js';

test('barre : sous l’enveloppe, pas de dépassement, repère à 100 %', () => {
  const g = barGeometry(40, 100);
  assert.equal(g.fillPct, 40); assert.equal(g.overPct, 0); assert.equal(g.markerPct, 100); assert.equal(g.rate, 40);
});

test('barre : en dépassement, l’échelle s’étire et le repère recule', () => {
  const g = barGeometry(161006000, 121098000);
  assert.equal(Math.round(g.rate), 133);
  assert.equal(g.over, 39908000);
  assert.ok(Math.abs(g.fillPct + g.overPct - 100) < 1e-9);
  assert.ok(Math.abs(g.markerPct - g.fillPct) < 1e-9);   // le repère est à la fin de la part « dans l’enveloppe »
  assert.ok(g.overPct > 0 && g.markerPct < 100);
});

test('barre : valeurs nulles ou négatives sans exception', () => {
  assert.deepEqual(barGeometry(0, 0), { fillPct: 0, overPct: 0, markerPct: 100, rate: 0, over: 0 });
  assert.equal(barGeometry(-5, 100).fillPct, 0);
});
