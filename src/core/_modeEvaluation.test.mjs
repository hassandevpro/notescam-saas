import test from 'node:test';
import assert from 'node:assert/strict';
import { modeDeClasse, modeChange, garde } from './modeEvaluation.js';
import { classeADesNotes } from '../lib/classeANotes.js';

const ecoleOfficielle = { bulletin_engine: 'officiel' };
const ecoleClassique = { bulletin_engine: 'classic' };
const cm1 = { id: 'cm1', name: 'CM1 A', level: 'CM1', bulletin_engine: null };

test('le mode se lit sur le moteur résolu : compétences par défaut en école officielle', () => {
  assert.equal(modeDeClasse(ecoleOfficielle, cm1), 'competences');
  assert.equal(modeDeClasse(ecoleOfficielle, { ...cm1, bulletin_engine: 'classic' }), 'matieres');
  assert.equal(modeDeClasse(ecoleClassique, cm1), 'matieres');
});

test('changer le réglage sans changer le mode effectif n’est PAS un changement', () => {
  assert.equal(modeChange(ecoleClassique, cm1, 'classic'), false);        // null → classic dans une école classique
  assert.equal(modeChange(ecoleOfficielle, cm1, null), false);
  assert.equal(modeChange(ecoleOfficielle, { ...cm1, bulletin_engine: 'classic' }, 'classic'), false);
});

test('compétences → matières est un changement de mode', () => {
  assert.equal(modeChange(ecoleOfficielle, cm1, 'classic'), true);
  assert.equal(modeChange(ecoleOfficielle, { ...cm1, bulletin_engine: 'classic' }, 'officiel'), true);
});

test('garde : bloqué si des notes existent, ou si on ne peut pas le savoir', () => {
  assert.deepEqual(garde({ change: true, aDesNotes: true }), { bloque: true, raison: 'notes' });
  assert.deepEqual(garde({ change: true, aDesNotes: null }), { bloque: true, raison: 'inverifiable' });
  assert.deepEqual(garde({ change: true, aDesNotes: false }), { bloque: false, raison: null });
  assert.deepEqual(garde({ change: false, aDesNotes: true }), { bloque: false, raison: null });
});

// Faux client : une table → lignes ; reproduit eq / neq / gt / in / limit comme l'adaptateur LAN.
function faux(tables, { erreur = null } = {}) {
  return { from(t) {
    let rows = [...(tables[t] || [])];
    const q = {
      select: () => q,
      eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q; },
      neq: (c, v) => { rows = rows.filter((r) => r[c] != null && r[c] !== v); return q; },
      gt: (c, v) => { rows = rows.filter((r) => r[c] != null && r[c] > v); return q; },
      in: (c, vs) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
      limit: async (n) => (erreur === t ? { data: null, error: { message: 'refus' } } : { data: rows.slice(0, n), error: null }),
    };
    return q;
  } };
}

test('classe sans aucune note : false', async () => {
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: faux({}) }), false);
});
test('notes de matières (grades) : true', async () => {
  const c = faux({ grades: [{ id: 'g', class_id: 'c', value: '14' }] });
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: c }), true);
});
test('une case VIDE de grades n’est pas une note', async () => {
  const c = faux({ grades: [{ id: 'g', class_id: 'c', value: '' }, { id: 'h', class_id: 'c', value: null }] });
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: c }), false);
});
test('ABS et zéro SONT des notes saisies', async () => {
  assert.equal(await classeADesNotes({ classId: 'c', client: faux({ grades: [{ id: 'g', class_id: 'c', value: 'ABS' }] }) }), true);
  assert.equal(await classeADesNotes({ classId: 'c', client: faux({ grades: [{ id: 'g', class_id: 'c', value: '0' }] }) }), true);
});
test('notes de compétences (prim_notes) : true ; un barème sans note : false', async () => {
  const avecNote = faux({ prim_notes: [{ id: 'p', eleve_id: 'e1', note: 0 }] });
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: avecNote }), true);
  const bareme = faux({ prim_notes: [{ id: 'p', eleve_id: 'e1', note: null, points_max: 10 }] });
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: bareme }), false);
});
test('les notes d’UNE AUTRE classe ne comptent pas', async () => {
  const c = faux({ grades: [{ id: 'g', class_id: 'autre', value: '15' }], prim_notes: [{ id: 'p', eleve_id: 'eX', note: 12 }] });
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: c }), false);
});
test('lecture refusée : null (jamais « pas de notes »)', async () => {
  const c = faux({}, { erreur: 'prim_notes' });
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: c }), null);
});
test('une note trouvée l’emporte sur une lecture refusée ailleurs', async () => {
  const c = faux({ grades: [{ id: 'g', class_id: 'c', value: '9' }] }, { erreur: 'prim_notes' });
  assert.equal(await classeADesNotes({ classId: 'c', studentIds: ['e1'], client: c }), true);
});
