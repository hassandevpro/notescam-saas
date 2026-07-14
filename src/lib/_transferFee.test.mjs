// Tests du recalcul des frais au transfert (computeTransferFeePatch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTransferFeePatch } from './feeEngine.js';

const grid = (o) => ({ class_id: 'c', academic_year: '2026', amount_comptant: 0, amount_echelonne: 0, tranches: [], ...o });

test('mode libre → aucun recalcul, patch null (rien à rattacher)', () => {
  const fee = { payment_mode: 'libre', frais_annuels: 50000, frais_payes: 20000, adjustments: [] };
  const r = computeTransferFeePatch({ fee, newGrid: grid({ amount_comptant: 90000 }), oldGrid: grid({ amount_comptant: 50000 }) });
  assert.equal(r.recalculated, false);
  assert.equal(r.patch, null);
});

test('mode libre → rattache seulement assignment_id si fourni', () => {
  const fee = { payment_mode: null, assignment_id: 'old', adjustments: [] };
  const r = computeTransferFeePatch({ fee, newGrid: grid(), assignmentId: 'new' });
  assert.equal(r.recalculated, false);
  assert.deepEqual(r.patch, { assignment_id: 'new' });
});

test('comptant : tarif identique ancienne/nouvelle → pas de recalcul', () => {
  const fee = { payment_mode: 'comptant', frais_annuels: 50000, adjustments: [{ mode: 'amount', value: 5000 }] };
  const r = computeTransferFeePatch({
    fee, newGrid: grid({ amount_comptant: 50000 }), oldGrid: grid({ amount_comptant: 50000 }), assignmentId: 'a1',
  });
  assert.equal(r.recalculated, false);
  assert.deepEqual(r.patch, { assignment_id: 'a1' }); // fixe conservée (pas recalculé)
});

test('comptant : nouveau tarif → total mis à jour, remise % reportée, montant fixe retirée', () => {
  const fee = {
    payment_mode: 'comptant', frais_annuels: 50000, frais_payes: 20000,
    adjustments: [{ id: 'p', mode: 'percent', value: 10 }, { id: 'f', mode: 'amount', value: 5000 }],
    assignment_id: 'old',
  };
  const r = computeTransferFeePatch({
    fee, newGrid: grid({ amount_comptant: 90000, tranches: [{ due_date: '2026-10-01' }] }),
    oldGrid: grid({ amount_comptant: 50000 }), assignmentId: 'new',
  });
  assert.equal(r.recalculated, true);
  assert.equal(r.patch.frais_annuels, 90000);
  assert.equal(r.patch.assignment_id, 'new');
  // seule la remise % est reportée
  assert.deepEqual(r.patch.adjustments, [{ id: 'p', mode: 'percent', value: 10 }]);
  // frais_payes JAMAIS dans le patch (préservé)
  assert.equal('frais_payes' in r.patch, false);
  // tranche comptant unique reprend l'échéance de la nouvelle grille
  assert.deepEqual(r.patch.tranches, [{ id: 'comptant', label: 'Paiement comptant', amount: 90000, due_date: '2026-10-01' }]);
});

test('echelonne : reprend les tranches de la nouvelle grille (instantané profond)', () => {
  const newTranches = [{ id: 't1', label: 'T1', amount: 30000, due_date: '2026-10-01' }, { id: 't2', label: 'T2', amount: 30000, due_date: '2027-01-01' }];
  const fee = { payment_mode: 'echelonne', frais_annuels: 40000, adjustments: [] };
  const r = computeTransferFeePatch({
    fee, newGrid: grid({ amount_echelonne: 60000, tranches: newTranches }),
    oldGrid: grid({ amount_echelonne: 40000 }), assignmentId: 'new',
  });
  assert.equal(r.recalculated, true);
  assert.equal(r.patch.frais_annuels, 60000);
  assert.deepEqual(r.patch.tranches, newTranches);
  assert.notEqual(r.patch.tranches, newTranches); // copie, pas la même référence
});
