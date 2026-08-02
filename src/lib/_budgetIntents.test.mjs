// Tests du module PUR de lecture des intentions budgétaires distantes.
//   node src/lib/_budgetIntents.test.mjs
import assert from 'node:assert/strict';
import {
  budgetOperationOutcome, budgetOperationStatus, visibleIntents, INTENT_NOTICE_MS,
} from './budgetIntents.js';

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
}

const T0 = '2026-08-02T10:00:00.000Z';
const T1 = '2026-08-02T10:05:00.000Z';
const NOW = Date.parse('2026-08-02T10:06:00.000Z');

// Le journal arrive trié par seq DESC (le plus récent d'abord), payload tantôt
// objet (PostgREST/jsonb) tantôt texte (SQLite/LAN) : les deux doivent marcher.
const requested = (corr, at = T0) => ({ id: `req-${corr}`, event_type: 'BudgetOperationRequested', occurred_at: at, payload: { correlation_id: corr, op: 'allocate', target: 'line' } });
const applied   = (corr, at = T1) => ({ id: `ok-${corr}`,  event_type: 'BudgetOperationApplied',   occurred_at: at, payload: JSON.stringify({ correlation_id: corr }) });
const rejected  = (corr, at = T1) => ({ id: `ko-${corr}`,  event_type: 'BudgetOperationRejected',  occurred_at: at, payload: { correlation_id: corr } });

// ── budgetOperationOutcome ──────────────────────────────────────────────────
test('demande seule → en attente, sans verdict', () => {
  const o = budgetOperationOutcome([requested('c1')], 'c1');
  assert.equal(o.status, 'pending');
  assert.equal(o.resolvedAt, null);
});

test('appliquée → l’horodatage est celui du VERDICT, pas de la demande', () => {
  const o = budgetOperationOutcome([applied('c1'), requested('c1')], 'c1');
  assert.equal(o.status, 'applied');
  assert.equal(o.resolvedAt, T1);
});

test('rejetée → statut + horodatage du refus', () => {
  const o = budgetOperationOutcome([rejected('c1'), requested('c1')], 'c1');
  assert.equal(o.status, 'rejected');
  assert.equal(o.resolvedAt, T1);
});

test('appliquée l’emporte sur rejetée (invariant #6 inchangé)', () => {
  const evs = [applied('c1', T1), rejected('c1', T0), requested('c1')];
  assert.equal(budgetOperationOutcome(evs, 'c1').status, 'applied');
});

test('les corrélations ne se contaminent pas', () => {
  const evs = [rejected('c2'), requested('c2'), requested('c1')];
  assert.equal(budgetOperationStatus(evs, 'c1'), 'pending');
  assert.equal(budgetOperationStatus(evs, 'c2'), 'rejected');
});

test('payload illisible → ne lève pas, reste en attente', () => {
  const evs = [{ event_type: 'BudgetOperationApplied', payload: '{ pas du json' }, requested('c1')];
  assert.equal(budgetOperationStatus(evs, 'c1'), 'pending');
});

test('journal vide ou nul → en attente, jamais d’exception', () => {
  assert.equal(budgetOperationStatus([], 'c1'), 'pending');
  assert.equal(budgetOperationStatus(null, 'c1'), 'pending');
});

test('budgetOperationStatus reste l’ancien contrat (chaîne seule)', () => {
  assert.equal(typeof budgetOperationStatus([applied('c1'), requested('c1')], 'c1'), 'string');
});

// ── visibleIntents ──────────────────────────────────────────────────────────
const pending  = { id: 1, status: 'pending', resolvedAt: null };
const freshKo  = { id: 2, status: 'rejected', resolvedAt: T1 };
const oldKo    = { id: 3, status: 'rejected', resolvedAt: '2026-07-10T08:00:00.000Z' };
const freshOk  = { id: 4, status: 'applied',  resolvedAt: T1 };

test('une demande en attente ne disparaît JAMAIS toute seule', () => {
  const far = NOW + 365 * 24 * 3600 * 1000;
  assert.deepEqual(visibleIntents([pending], far).map((i) => i.id), [1]);
});

test('un verdict récent est annoncé', () => {
  assert.deepEqual(visibleIntents([freshKo, freshOk], NOW).map((i) => i.id), [2, 4]);
});

test('un verdict ancien s’efface (le cas « Rejetée » qui restait à l’écran)', () => {
  assert.deepEqual(visibleIntents([oldKo], NOW), []);
});

test('la bascule se fait exactement au délai de grâce', () => {
  const at = Date.parse(T1);
  assert.equal(visibleIntents([freshKo], at + INTENT_NOTICE_MS - 1).length, 1);
  assert.equal(visibleIntents([freshKo], at + INTENT_NOTICE_MS).length, 0);
});

test('verdict sans horodatage exploitable → déjà vu, rien à annoncer', () => {
  assert.equal(visibleIntents([{ status: 'rejected', resolvedAt: null }], NOW).length, 0);
  assert.equal(visibleIntents([{ status: 'applied', resolvedAt: 'pas une date' }], NOW).length, 0);
});

test('entrées nulles et liste absente → tolérées', () => {
  assert.deepEqual(visibleIntents([null, undefined, pending], NOW).map((i) => i.id), [1]);
  assert.deepEqual(visibleIntents(null, NOW), []);
});

test('l’ordre d’origine du journal est conservé', () => {
  assert.deepEqual(visibleIntents([freshKo, pending, freshOk], NOW).map((i) => i.id), [2, 1, 4]);
});

console.log(passed === 15 ? '\n✅ Tous les tests passent' : `\n⚠️ ${passed}/15`);
