// LA FEUILLE DE NOTES — logique pure : quelles matières sont des colonnes, comment se lit une saisie, et les
// colonnes calculées (Total, Moyenne /20, Rang, Cote) sur l'exemple de l'école : AKATEU MEGNE INDIRA FALIDA.
//
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs src/core/_grilleNoteUnique.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colonnesNoteUnique, lireSaisie, matriceCollee, calculerLigne, rangsDesMoyennes, compteurColonne, baremeColonne,
} from './grilleNoteUnique.js';
import { primNkey } from './primEngine.js';
import { PRIM_COTE_DEFAULT } from './primEngine.js';

const EX = [['1B', 28, 50], ['1C', 16, 20], ['2B', 31.5, 50], ['5A', 21, 30], ['6A', 18, 20], ['6B', 16.5, 20],
  ['DQ', 20.5, 40], ['EDT', 19, 30], ['PDE', 20, 30], ['CR', 13, 20], ['CG', 22.5, 40], ['PR2', 34.5, 50]];

test('exemple de l’école : total 260,5 / 400, moyenne 13,03 sur 20', () => {
  const l = calculerLigne(EX.map(([, note, bareme]) => ({ note, bareme })), PRIM_COTE_DEFAULT);
  assert.equal(l.total, 260.5);
  assert.equal(l.possible, 400);
  assert.equal(l.moyenne, 13.03);          // 260,5 ÷ (400 ÷ 20) = 13,025 → 13,03
  assert.equal(l.cote, 'ECA');             // 65 % : entre 50 et 70
});

test('une case vide ou une absence n’entre ni au total ni au barème', () => {
  const l = calculerLigne([{ note: 20, bareme: 40 }, { note: '', bareme: 30 }, { note: null, statut: 'absent', bareme: 50 }, { note: 15, bareme: 20 }], PRIM_COTE_DEFAULT);
  assert.equal(l.total, 35);
  assert.equal(l.possible, 60);
  assert.equal(l.moyenne, 11.67);
  assert.equal(calculerLigne([], PRIM_COTE_DEFAULT).moyenne, null);
  assert.equal(calculerLigne([{ note: '', bareme: 20 }], PRIM_COTE_DEFAULT).total, null);
});

test('tout A+ et toute zéro : la cote suit la moyenne', () => {
  assert.equal(calculerLigne([{ note: 40, bareme: 40 }, { note: 20, bareme: 20 }], PRIM_COTE_DEFAULT).cote, 'A+');
  assert.equal(calculerLigne([{ note: 0, bareme: 40 }], PRIM_COTE_DEFAULT).cote, 'NA');
});

test('lecture de la saisie : virgule, point, ABS, vide, hors barème', () => {
  assert.deepEqual(lireSaisie('28,5', 40), { type: 'note', valeur: '28.5' });
  assert.deepEqual(lireSaisie('28.5', 40), { type: 'note', valeur: '28.5' });
  assert.deepEqual(lireSaisie(' 0 ', 40), { type: 'note', valeur: '0' });
  assert.deepEqual(lireSaisie('abs', 40), { type: 'absent' });
  assert.deepEqual(lireSaisie('A', 40), { type: 'absent' });
  assert.deepEqual(lireSaisie('', 40), { type: 'vide' });
  assert.deepEqual(lireSaisie('41', 40), { type: 'erreur', message: 'max 40' });
  assert.deepEqual(lireSaisie('40', 40), { type: 'note', valeur: '40' });
  assert.equal(lireSaisie('abc', 40).type, 'erreur');
  assert.equal(lireSaisie('-3', 40).type, 'erreur');
});

test('coller depuis Excel : une matrice ; une cellule seule se tape normalement', () => {
  assert.deepEqual(matriceCollee('12\t14\n15,5\t8\n'), [['12', '14'], ['15,5', '8']]);
  assert.deepEqual(matriceCollee('12\n14\n9'), [['12'], ['14'], ['9']]);
  assert.equal(matriceCollee('12'), null);
});

test('rangs : ex æquo partagés, sans moyenne = pas de rang', () => {
  assert.deepEqual(rangsDesMoyennes({ a: 15, b: 15, c: 12, d: null }), { a: 1, b: 1, c: 3 });
});

test('compteur « 24/26 saisies » : l’absence déclarée est une case traitée', () => {
  assert.deepEqual(compteurColonne([{ note: 12 }, { note: '' }, { note: null, statut: 'absent' }, { note: 0 }]), { faites: 3, total: 4 });
});

// ── quelles matières sont des colonnes ──
const COMPETENCES = [{ id: 'dq', code: 'DQ', intitule: 'Dictée-Question' }, { id: 'cr', code: 'CR', intitule: 'Calcul rapide' },
  { id: '1a', code: '1A', intitule: 'Communiquer en français' }, { id: '4a', code: '4A', intitule: 'Autonomie' }];
const CRITERES = (id) => ({
  dq: [{ id: 'ecrit', nom: 'Écrit', points_max: 0 }, { id: 'oral', nom: 'Oral', points_max: 0 }],
  cr: [{ id: 'ecrit', nom: 'Écrit', points_max: 20 }, { id: 'oral', nom: 'Oral', points_max: 0 }],
  '1a': [{ id: 'oral', nom: 'Oral', points_max: 20 }, { id: 'ecrit', nom: 'Écrit', points_max: 30 }],
  '4a': [{ id: 'ecrit', nom: 'Écrit', points_max: 0 }, { id: 'oral', nom: 'Oral', points_max: 0 }],
}[id]);
const note = (eleve, comp, crit, ua, n, max) => ({ [primNkey(eleve, comp, crit, ua)]: { eleve_id: eleve, competence_id: comp, critere_id: crit, ua, note: n, points_max: max } });

test('une matière à un seul critère devient une colonne ; deux critères restent à la saisie actuelle', () => {
  const notes = { ...note('e1', 'dq', 'ecrit', 1, 20, 40) };
  const r = colonnesNoteUnique({ competences: COMPETENCES, criteresDe: CRITERES, notes, eleveIds: ['e1', 'e2'], ua: 1 });
  assert.deepEqual(r.colonnes.map((c) => [c.code, c.critereId, c.bareme]), [['DQ', 'ecrit', 40], ['CR', 'ecrit', 20]]);
  assert.deepEqual(r.multiples.map((c) => c.code), ['1A']);
  // 4A : aucun critère de barème > 0 → ni colonne ni « multiple » (la classe ne l'évalue pas)
});

test('le barème de la Dictée se retrouve à l’UA suivante, sans nouvelle note', () => {
  const notes = { ...note('e1', 'dq', 'ecrit', 1, 20, 40) };
  const r = colonnesNoteUnique({ competences: COMPETENCES, criteresDe: CRITERES, notes, eleveIds: ['e1', 'e2'], ua: 2 });
  assert.equal(r.colonnes.find((c) => c.code === 'DQ').bareme, 40);
  assert.equal(baremeColonne({ notesColonne: [], officiel: 0, parUA: { 1: 40, 5: 30 }, ua: 4 }), 30, 'l’UA la plus proche');
  assert.equal(baremeColonne({ notesColonne: [], officiel: 0, parUA: undefined, ua: 4 }), 0);
});

test('une compétence exclue (6A, sport inapte) reste à la saisie actuelle', () => {
  const r = colonnesNoteUnique({ competences: COMPETENCES, criteresDe: CRITERES, notes: {}, eleveIds: ['e1'], ua: 1, exclure: ['cr'] });
  assert.ok(r.multiples.some((c) => c.id === 'cr'));
  assert.ok(!r.colonnes.some((c) => c.id === 'cr'));
});
