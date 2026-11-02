import test from 'node:test';
import assert from 'node:assert/strict';
import { indexAllocations } from './budgetLinesEngine.js';
import {
  lineState, countByState, blockerGroups, computeSteps, filterTree, hasActiveFilters, planBulkActivation,
} from './budgetLineView.js';

const node = (id, label, ceiling, status = 'draft') => ({ id, label, isLine: true, status, consumption: { ceiling, available: ceiling } });
const rub = (id, label, children) => ({ id, label, isLine: false, children });

test('état d’une ligne : active/clôturée priment, un brouillon est prêt ou à compléter', () => {
  assert.equal(lineState('active', ['x']), 'active');
  assert.equal(lineState('closed'), 'closed');
  assert.equal(lineState('draft', []), 'ready');
  assert.equal(lineState('draft', ['amount_missing']), 'todo');
});

test('le total « à compléter » compte des LIGNES distinctes, pas des motifs', () => {
  const lines = [node('a', 'A', 1), node('b', 'B', 1), node('c', 'C', 1), node('d', 'D', 1, 'active')];
  const errs = { a: ['sector_alloc_missing', 'amount_missing'], b: ['sector_alloc_missing'], c: [], d: [] };
  const { groups, todoCount } = blockerGroups(lines, (l) => errs[l.id]);
  assert.equal(todoCount, 2);                       // a et b, pas 3
  assert.equal(groups.find((g) => g.code === 'sector_alloc_missing').count, 2);
  assert.equal(groups.find((g) => g.code === 'amount_missing').count, 1);
  assert.equal(groups.reduce((s, g) => s + g.count, 0), 3);   // somme des motifs ≠ nombre de lignes
  const c = countByState(lines, (l) => errs[l.id]);
  assert.deepEqual([c.all, c.todo, c.ready, c.active], [4, 2, 1, 1]);
});

test('parcours : la première étape non terminée est « en cours »', () => {
  const st = (o) => computeSteps(o).map((s) => s.state).join(',');
  assert.equal(st({}), 'current,todo,todo,todo,todo');
  assert.equal(st({ periodCount: 3, lineCount: 65, todoCount: 24, readyCount: 41 }), 'done,done,current,todo,todo');
  assert.equal(st({ periodCount: 3, lineCount: 65, todoCount: 0, readyCount: 65 }), 'done,done,done,current,todo');
  assert.equal(st({ periodCount: 3, lineCount: 65, todoCount: 0, readyCount: 0, activeCount: 65 }), 'done,done,done,done,done');
});

const tree = [
  rub('r1', 'PÔLE 1 · SALAIRES', [node('a', 'Salaires et Primes', 37048000), node('b', 'CNPS et impôts', 2800000)]),
  rub('r2', 'PÔLE 2 · TENUES', [node('c', 'Tenues scolaires des élèves', 5000000, 'active'), node('d', 'Tenues du personnel', 90000)]),
];
const noErr = () => [];

test('recherche insensible à la casse et aux accents', () => {
  const r = filterTree(tree, { query: 'cnps' }, noErr);
  assert.deepEqual(r.map((x) => x.id), ['r1']);
  assert.deepEqual(r[0].children.map((x) => x.id), ['b']);
  assert.equal(filterTree(tree, { query: 'POLE 2' }, noErr)[0].children.length, 2);   // libellé de rubrique : tout est gardé
  assert.equal(filterTree(tree, { query: 'élèves' }, noErr)[0].children[0].id, 'c');
});

test('filtre par état et par motif ; rubrique vide masquée', () => {
  const errs = { a: ['sector_alloc_missing'], b: [], c: [], d: ['amount_missing'] };
  const e = (l) => errs[l.id];
  assert.deepEqual(filterTree(tree, { state: 'todo' }, e).flatMap((r) => r.children.map((c) => c.id)), ['a', 'd']);
  assert.deepEqual(filterTree(tree, { state: 'active' }, e).map((r) => r.id), ['r2']);
  assert.deepEqual(filterTree(tree, { blocker: 'amount_missing' }, e).flatMap((r) => r.children.map((c) => c.id)), ['d']);
});

test('tri par montant, sans modifier l’arbre d’origine', () => {
  const before = JSON.stringify(tree);
  const r = filterTree(tree, { sort: 'amountAsc' }, noErr);
  assert.deepEqual(r[0].children.map((x) => x.id), ['b', 'a']);
  assert.deepEqual(filterTree(tree, { sort: 'amountDesc' }, noErr)[1].children.map((x) => x.id), ['c', 'd']);
  assert.equal(JSON.stringify(tree), before);
});

test('hasActiveFilters', () => {
  assert.equal(hasActiveFilters({}), false);
  assert.equal(hasActiveFilters({ query: ' x ' }), true);
  assert.equal(hasActiveFilters({ state: 'todo' }), true);
  assert.equal(hasActiveFilters({ query: '   ' }), false);
});

// ── Activation en lot, avec le vrai moteur ───────────────────────────────────
const L = (id, amount, extra = {}) => ({ id, label: id, scope: 'complex', status: 'draft', planned_amount: amount, ...extra });
const withPeriods = (...ids) => indexAllocations(ids.map((id) => ({ budget_chapter_id: id, budget_period_id: 'p1', pct: 100 })), []);

test('le plafond annuel est cumulatif : on retient les lignes tant que ça tient', () => {
  const chapters = [L('a', 60), L('b', 30), L('c', 30)];
  const plan = planBulkActivation({ candidates: chapters, annual: { envelope_amount: 100 }, chapters, idx: withPeriods('a', 'b', 'c') });
  assert.deepEqual(plan.accepted.map((l) => l.id), ['a', 'b']);   // 60 + 30 = 90 ≤ 100 ; c ferait 120
  assert.deepEqual(plan.excluded.map((l) => l.id), ['c']);
  assert.ok(plan.excluded[0].errs.includes('annual_cap_exceeded'));
  assert.equal(plan.total, 90);
  assert.equal(plan.remaining, 10);
});

test('les lignes déjà actives réduisent la marge', () => {
  const chapters = [L('act', 80, { status: 'active' }), L('a', 30)];
  const plan = planBulkActivation({ candidates: [chapters[1]], annual: { envelope_amount: 100 }, chapters, idx: withPeriods('a') });
  assert.equal(plan.accepted.length, 0);
  assert.equal(plan.alreadyActive, 80);
});

test('une ligne sans répartition est exclue avec son motif', () => {
  const chapters = [L('a', 10)];
  const plan = planBulkActivation({ candidates: chapters, annual: { envelope_amount: 100 }, chapters, idx: indexAllocations([], []) });
  assert.equal(plan.accepted.length, 0);
  assert.ok(plan.excluded[0].errs.includes('period_alloc_missing'));
});
