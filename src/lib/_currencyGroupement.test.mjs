// « 121098000 XAF » : le séparateur de milliers d'Intl (U+202F) est illisible dans
// plusieurs polices. Le montant doit se grouper avec une espace insécable ordinaire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, formatAmount } from './currency.js';

test('121 098 000 XAF : groupes séparés par U+00A0, symbole après une espace', () => {
  const s = formatMoney(121098000, 'XAF');
  assert.equal(s, '121 098 000 XAF');
  assert.ok(!s.includes(' '), 'plus aucune espace fine insécable');
});

test('petits montants et nombre seul', () => {
  assert.equal(formatAmount(250000, 'XAF'), '250 000');
  assert.equal(formatAmount(999, 'XAF'), '999');
  assert.equal(formatAmount(0, 'XAF'), '0');
});
