// BARÈME HORS BORNES (Bright Continent, 2026-11-04) — garde-fou de CODE sur les trois couches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('l’écran refuse un barème hors bornes avant d’écrire', () => {
  const ws = lire('../components/grades/PrimCompetenceWorkspace.jsx');
  assert.match(ws, /if \(!pointsMaxSain\(nouveau\)\) \{/);
  assert.match(ws, /compris entre 1 et \$\{PRIM_POINTS_MAX_LIMITE\}/);
  // le refus précède l'écriture : il est AVANT le calcul des notes qui dépasseraient
  assert.ok(ws.indexOf('if (!pointsMaxSain(nouveau))') < ws.indexOf('const trop = notesHorsBareme(porteurs, nouveau)'));
});

test('l’écriture refuse une ligne que la base refuserait', () => {
  const store = lire('./schoolStore.js');
  const i = store.indexOf('if (!pointsMaxSain(record.points_max))');
  assert.ok(i > 0);
  assert.ok(i < store.indexOf('await primNotesDB.put(record)', i - 200), 'le refus précède l’écriture locale et la mise en file');
  assert.match(store, /return \{ error: 'bareme_invalide' \};/);
});

test('une ligne déjà bloquée est réparée au rejeu, sans toucher à la note', () => {
  const sync = lire('../lib/sync.js');
  assert.match(sync, /repairPrimNotePayload\(it\.payload\)/);
  assert.match(sync, /attempts: 0, last_error: null, reparee_depuis_points_max/);
});
