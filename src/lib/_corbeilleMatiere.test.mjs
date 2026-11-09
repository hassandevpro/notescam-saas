// SUPPRIMER UNE MATIÈRE, PUIS LA RESTAURER DEPUIS LA CORBEILLE : classe, barème, coefficient et notes reviennent.
//
// Deux volets, et ce que chacun prouve :
//   1. COMPORTEMENT RÉEL de `collectSubjectBundle` — la fonction qu'emploie `deleteSubject` pour capturer les
//      notes AVANT l'effacement en cascade. Si elle perdait une note (ABS, zéro), la corbeille ne pourrait
//      pas la rendre.
//   2. CONTRAT du chemin de restauration, vérifié sur le code (le store ne tourne pas hors navigateur :
//      IndexedDB + environnement Vite, comme pour les autres bancs de src/store). Ce volet NE prouve PAS
//      l'exécution de bout en bout ; il garde les maillons dont dépend la restauration.
//
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_corbeilleMatiere.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectSubjectBundle } from './studentBundle.js';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Enregistrements de notes tels que le store les garde (IndexedDB) : une ligne par (classe, élève, séquence).
const grades = [
  { key: 'cm1_a_1', class_id: 'cm1', student_id: 'a', sequence: 1, scores: { dictee: '30', physique: '40' } },
  { key: 'cm1_b_1', class_id: 'cm1', student_id: 'b', sequence: 1, scores: { dictee: 'ABS', physique: '0' } },
  { key: 'cm1_c_1', class_id: 'cm1', student_id: 'c', sequence: 1, scores: { dictee: '', physique: '50' } },
  { key: 'cm1_a_2', class_id: 'cm1', student_id: 'a', sequence: 2, scores: { dictee: 0 } },
  { key: 'cm1_a_1x', class_id: 'cm1', student_id: 'a', sequence: 1, scores: { __absences: 3 } },
];

test('1. la capture à la suppression garde ABS et zéro, et seulement ceux-là', () => {
  const { subjectGrades } = collectSubjectBundle('dictee', { grades });
  const valeurs = Object.fromEntries(subjectGrades.map((c) => [c.key, c.value]));
  assert.deepEqual(valeurs, { cm1_a_1: '30', cm1_b_1: 'ABS', cm1_a_2: 0 });
  assert.equal(subjectGrades.length, 3, 'la case vide de Chantal n’est pas une note');
});

test('1 bis. chaque note capturée porte de quoi la RÉINJECTER à la bonne place', () => {
  const { subjectGrades } = collectSubjectBundle('dictee', { grades });
  for (const c of subjectGrades) {
    assert.equal(c.subject_id, 'dictee');
    assert.ok(c.key && c.class_id === 'cm1' && c.student_id && Number.isFinite(c.sequence), `cellule incomplète : ${JSON.stringify(c)}`);
  }
});

test('1 ter. une autre matière n’est pas capturée', () => {
  const { subjectGrades } = collectSubjectBundle('physique', { grades });
  assert.deepEqual(subjectGrades.map((c) => c.student_id).sort(), ['a', 'b', 'c']);
  assert.equal(collectSubjectBundle('inconnue', { grades }).subjectGrades.length, 0);
});

// ── 2. CONTRAT DU CHEMIN DE RESTAURATION ────────────────────────────────────
const store = lire('../store/schoolStore.js');
const histo = lire('./historyService.js');
const editeur = lire('../components/grades/ClassSubjectsEditor.jsx');

test('2a. la suppression met à la corbeille la LIGNE ENTIÈRE (classe, barème, coefficient) et ses notes', () => {
  assert.ok(store.includes("await moveToTrash({ table: 'subjects', payload: snapshot, related: bundle });"),
    'la corbeille doit recevoir le snapshot complet de la matière et son bundle de notes');
  assert.ok(store.includes('const snapshot = state.subjects.find((s) => s.id === id);'));
});

test('2b. la restauration recrée la matière avec le MÊME identifiant puis réinjecte les notes', () => {
  assert.match(histo, /case 'subjects':\n\s+await store\.addSubject\(payload\);/);
  assert.ok(histo.includes('await store.restoreSubjectBundle?.(payload.id, related);'));
  // addSubject laisse le payload l'emporter : id, class_id, max, coef, position reviennent tels quels.
  assert.ok(store.includes('const record = { id: uuid(), school_id: schoolId, ...subjectData };'),
    'le payload (…subjectData) doit venir APRÈS l’id généré, pour que l’id d’origine l’emporte');
});

test('2c. la réinjection remet chaque note à sa place (clé, classe, élève, séquence, matière)', () => {
  assert.ok(store.includes('[subjectId]: cell.value'));
  assert.ok(store.includes('key: cell.key, class_id: cell.class_id, student_id: cell.student_id'));
  assert.ok(store.includes('sequence: cell.sequence, school_id: schoolId, scores: {}'));
});

test('2d. la suppression en attente est annulée AVANT la recréation (sinon elle réefface la ligne)', () => {
  assert.ok(histo.includes('await cancelQueuedDelete(table, payload?.id);'));
});

// ── PROTECTION DE LA SUPPRESSION D’UNE MATIÈRE NOTÉE ────────────────────────
test('3a. l’écran demande une confirmation et CHIFFRE les notes qui partiront', () => {
  assert.ok(editeur.includes('notesParMatiere[confirmId] > 0'));
  assert.ok(editeur.includes("collectSubjectBundle(sub.id, { grades }).subjectGrades.length"),
    'le nombre annoncé doit venir de la même fonction que la suppression');
  assert.ok(editeur.includes('restent récupérables dans la corbeille'));
});

test('3b. une matière NOTÉE ne se supprime pas tant qu’une séquence de la classe est verrouillée', () => {
  assert.ok(store.includes('if (snapshot && bundle.subjectGrades.length && isClassConfigFrozen(state, snapshot.class_id)) {'));
  assert.ok(store.includes("return { error: 'frozen', locked: true };"));
});

test('3c. le DELETE cloud en cascade est compensé : notes retirées en local, restaurables via le bundle', () => {
  assert.ok(store.includes('const bundle = collectSubjectBundle(id, { grades: allGrades });'));
});
