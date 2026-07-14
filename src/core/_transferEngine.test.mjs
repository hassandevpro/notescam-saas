// Tests du moteur de transfert (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTransferType, defaultMotif, buildTransfer, TRANSFER_TYPES, CLOTURE_MOTIFS,
} from './transferEngine.js';

const c = (o) => ({ id: 'c', name: 'X', section: 's', unit_id: null, level: '6e', ...o });

test('resolveTransferType: même unité + même niveau = administratif', () => {
  assert.equal(resolveTransferType(c({ id: 'a', level: '6e' }), c({ id: 'b', level: '6e' })), TRANSFER_TYPES.ADMIN);
});

test('resolveTransferType: niveau différent = changement_niveau', () => {
  assert.equal(resolveTransferType(c({ level: '6e' }), c({ level: '5e' })), TRANSFER_TYPES.NIVEAU);
});

test('resolveTransferType: unité différente = changement_etablissement (prioritaire sur le niveau)', () => {
  assert.equal(
    resolveTransferType(c({ unit_id: 'u1', level: '6e' }), c({ unit_id: 'u2', level: '5e' })),
    TRANSFER_TYPES.ETAB,
  );
});

test('defaultMotif mappe le type', () => {
  assert.equal(defaultMotif(TRANSFER_TYPES.NIVEAU), CLOTURE_MOTIFS.niveau);
  assert.equal(defaultMotif(TRANSFER_TYPES.ETAB), CLOTURE_MOTIFS.etablissement);
  assert.equal(defaultMotif(TRANSFER_TYPES.ADMIN), CLOTURE_MOTIFS.administratif);
});

test('buildTransfer: 1re affectation (pas de current) → newRow type initial, pas de closedRow', () => {
  const { closedRow, newRow, noop } = buildTransfer({
    current: null, newClass: c({ id: 'c6a', name: '6e A', unit_id: 'u1' }),
    student: { id: 's1' }, schoolId: 'sch', newId: 'n1', at: '2026-01-01T00:00:00Z',
  });
  assert.equal(noop, false);
  assert.equal(closedRow, null);
  assert.equal(newRow.type_transfert, TRANSFER_TYPES.INITIAL);
  assert.equal(newRow.class_id, 'c6a');
  assert.equal(newRow.school_unit_id, 'u1');
  assert.equal(newRow.date_fin, null);
  assert.equal(newRow.student_id, 's1');
});

test('buildTransfer: transfert ferme le current et ouvre le nouveau', () => {
  const current = {
    id: 'a1', student_id: 's1', school_id: 'sch', class_id: 'c6a',
    section: 'college', school_unit_id: 'u1', date_debut: '2026-01-01T00:00:00Z', date_fin: null,
  };
  const { closedRow, newRow, noop, type } = buildTransfer({
    current, newClass: c({ id: 'c5a', name: '5e A', unit_id: 'u1', level: '5e' }),
    student: { id: 's1' }, schoolId: 'sch', type: TRANSFER_TYPES.NIVEAU,
    motif: CLOTURE_MOTIFS.redoublement, commentaire: 'redouble',
    newId: 'n2', at: '2026-09-01T00:00:00Z',
  });
  assert.equal(noop, false);
  assert.equal(type, TRANSFER_TYPES.NIVEAU);
  // ancienne affectation fermée, jamais supprimée
  assert.equal(closedRow.id, 'a1');
  assert.equal(closedRow.date_fin, '2026-09-01T00:00:00Z');
  assert.equal(closedRow.motif_cloture, CLOTURE_MOTIFS.redoublement);
  // nouvelle affectation
  assert.equal(newRow.class_id, 'c5a');
  assert.equal(newRow.type_transfert, TRANSFER_TYPES.NIVEAU);
  assert.equal(newRow.commentaire, 'redouble');
  assert.equal(newRow.date_fin, null);
  assert.notEqual(newRow.id, closedRow.id);
});

test('buildTransfer: cible = classe déjà en cours → noop', () => {
  const current = { id: 'a1', student_id: 's1', class_id: 'c6a', date_fin: null };
  const { noop, closedRow, newRow } = buildTransfer({
    current, newClass: c({ id: 'c6a' }), student: { id: 's1' }, newId: 'n3',
  });
  assert.equal(noop, true);
  assert.equal(closedRow, null);
  assert.equal(newRow, null);
});

test('buildTransfer: motif par défaut si non fourni', () => {
  const current = { id: 'a1', student_id: 's1', class_id: 'c6a', date_fin: null, school_unit_id: 'u1' };
  const { closedRow } = buildTransfer({
    current, newClass: c({ id: 'c6b', unit_id: 'u2' }), student: { id: 's1' },
    type: TRANSFER_TYPES.ETAB, newId: 'n4',
  });
  assert.equal(closedRow.motif_cloture, CLOTURE_MOTIFS.etablissement);
});
