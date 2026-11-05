// LE MASQUAGE D'UN CRITÈRE A-T-IL LA PORTÉE EXACTE DU GESTE ?
//
// Deux demandes successives de l'école, le même jour :
//   1. « quand j'enlève les critères, ça ne doit pas le faire pour toutes les classes » ;
//   2. « lorsqu'on masque un critère à une compétence, ça masque pour toute la classe ».
//
// La portée juste est donc (classe, compétence, critère). Ce banc la tient par les deux
// bouts : rien de plus large (les autres classes, les autres compétences), rien de plus
// étroit (un masque d'école déjà posé vaut toujours partout), et AUCUNE note touchée.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criteresMasquesPourClasse, resolveurCriteresMasques, notesDuCritere,
} from './primCriteresClasse.js';
import { criteresForCompetence } from './primEngine.js';

const CE1 = { '1a': ['pratique'] };

test('REPRODUCTION 1 : retirer « Pratique » en CE1 ne le retire PAS en CM2', () => {
  const parClasse = { ce1: CE1 };
  assert.deepEqual(criteresMasquesPourClasse([], parClasse, 'ce1', '1a'), ['pratique']);
  assert.deepEqual(criteresMasquesPourClasse([], parClasse, 'cm2', '1a'), []);
});

test('REPRODUCTION 2 : retirer « Pratique » en 1A ne le retire PAS en 5A, même classe', () => {
  const parClasse = { ce1: CE1 };
  assert.deepEqual(criteresMasquesPourClasse([], parClasse, 'ce1', '1a'), ['pratique']);
  assert.deepEqual(criteresMasquesPourClasse([], parClasse, 'ce1', '5a'), []);
  // Et sans compétence du tout : on ne masque que ce que l'école a demandé à l'échelle école.
  assert.deepEqual(criteresMasquesPourClasse([], parClasse, 'ce1'), []);
});

test('un masque d’école déjà posé continue de valoir pour toutes les classes ET compétences', () => {
  const ecole = ['oral'];
  assert.deepEqual(criteresMasquesPourClasse(ecole, { ce1: CE1 }, 'cm2', '1a'), ['oral']);
  assert.deepEqual(criteresMasquesPourClasse(ecole, { ce1: CE1 }, 'ce1', '5a'), ['oral']);
  assert.deepEqual(criteresMasquesPourClasse(ecole, { ce1: CE1 }, 'ce1', '1a').sort(), ['oral', 'pratique']);
});

test('union sans doublon', () => {
  assert.deepEqual(
    criteresMasquesPourClasse(['oral'], { c: { '1a': ['oral', 'ecrit'] } }, 'c', '1a').sort(),
    ['ecrit', 'oral'],
  );
});

test('sans masque propre : la MÊME liste (référence stable pour les mémoïsations)', () => {
  const ecole = ['oral'];
  assert.equal(criteresMasquesPourClasse(ecole, {}, 'ce1', '1a'), ecole);
  assert.equal(criteresMasquesPourClasse(ecole, { ce1: { '1a': [] } }, 'ce1', '1a'), ecole);
  assert.equal(criteresMasquesPourClasse(ecole, undefined, 'ce1', '1a'), ecole);
});

test('entrées absentes : jamais d’exception, rien n’est masqué', () => {
  assert.deepEqual(criteresMasquesPourClasse(undefined, undefined, undefined, undefined), []);
  assert.deepEqual(criteresMasquesPourClasse(null, { a: { '1a': ['x'] } }, null, '1a'), []);
  assert.deepEqual(criteresMasquesPourClasse([], { a: 'pas-une-carte' }, 'a', '1a'), []);
  assert.deepEqual(criteresMasquesPourClasse([], { a: { '1a': 'pas-un-tableau' } }, 'a', '1a'), []);
});

// ── LE RÉSOLVEUR, celui que reçoivent le bulletin, le PV et le rapport ──────
test('le résolveur rend la bonne liste pour CHAQUE compétence', () => {
  const r = resolveurCriteresMasques(['oral'], { ce1: { '1a': ['pratique'], '5a': ['savoir_etre'] } }, 'ce1');
  assert.deepEqual(r('1a').sort(), ['oral', 'pratique']);
  assert.deepEqual(r('5a').sort(), ['oral', 'savoir_etre']);
  assert.deepEqual(r('2b'), ['oral']);
  assert.equal(r('1a'), r('1a'), 'mémoïsé : la même référence au deuxième appel');
  assert.equal(r.estResolveurDeMasques, true);
});

// ── DE BOUT EN BOUT AVEC LE MOTEUR ─────────────────────────────────────────
const referentiel = {
  competences: [
    { id: '1a', code: '1A', intitule: 'Lire', ordre: 1 },
    { id: '5a', code: '5A', intitule: 'TIC', ordre: 2 },
  ],
  niveauCompetences: [
    { niveau_id: 'ce1', competence_id: '1a' }, { niveau_id: 'cm2', competence_id: '1a' },
    { niveau_id: 'ce1', competence_id: '5a' }, { niveau_id: 'cm2', competence_id: '5a' },
  ],
  criteres: [
    { id: 'oral', nom: 'Oral', ordre: 1 }, { id: 'ecrit', nom: 'Écrit', ordre: 2 },
    { id: 'pratique', nom: 'Pratique', ordre: 3 }, { id: 'savoir_etre', nom: 'Savoir-être', ordre: 4 },
  ],
  baremeCriteres: ['ce1', 'cm2'].flatMap((n) => ['1a', '5a'].flatMap((c) =>
    ['oral', 'ecrit', 'pratique', 'savoir_etre'].map((cr) => ({
      niveau_id: n, competence_id: c, critere_id: cr, aptitude: 'apte', points_max: 10,
    })))),
};

test('le moteur : CE1/1A perd « Pratique », CE1/5A et CM2/1A la gardent', () => {
  const parClasse = { 'classe-ce1': { '1a': ['pratique'] } };
  const ids = (niveau, classId, compId) => criteresForCompetence(
    referentiel, niveau, compId, 'apte',
    criteresMasquesPourClasse([], parClasse, classId, compId),
  ).map((c) => c.id);
  assert.ok(!ids('ce1', 'classe-ce1', '1a').includes('pratique'), 'CE1/1A doit perdre Pratique');
  assert.ok(ids('ce1', 'classe-ce1', '5a').includes('pratique'), 'CE1/5A doit la garder');
  assert.ok(ids('cm2', 'classe-cm2', '1a').includes('pratique'), 'CM2/1A doit la garder');
});

test('le moteur accepte le RÉSOLVEUR et retient la compétence qu’il calcule', () => {
  const r = resolveurCriteresMasques([], { 'classe-ce1': { '1a': ['pratique'] } }, 'classe-ce1');
  const ids = (compId) => criteresForCompetence(referentiel, 'ce1', compId, 'apte', r).map((c) => c.id);
  assert.ok(!ids('1a').includes('pratique'));
  assert.ok(ids('5a').includes('pratique'));
  // Une LISTE reste acceptée : tous les appelants d'avant marchent sans changement.
  assert.ok(!criteresForCompetence(referentiel, 'ce1', '1a', 'apte', ['oral']).some((c) => c.id === 'oral'));
});

test('le barème suit : les points du critère masqué quittent CETTE compétence seulement', () => {
  const r = resolveurCriteresMasques([], { c: { '1a': ['pratique'] } }, 'c');
  const total = (compId) => criteresForCompetence(referentiel, 'ce1', compId, 'apte', r)
    .reduce((s, x) => s + x.points_max, 0);
  assert.equal(total('1a'), 30, '1A : quatre critères à 10, moins Pratique');
  assert.equal(total('5a'), 40, '5A : les quatre, intacts');
});

// ── MASQUER NE TOUCHE AUCUNE NOTE ──────────────────────────────────────────
test('masquer puis démasquer : les notes sont les mêmes, au compte près', () => {
  const notes = {
    'e1|1a|pratique|1': { eleve_id: 'e1', competence_id: '1a', critere_id: 'pratique', note: 8 },
    'e2|1a|pratique|1': { eleve_id: 'e2', competence_id: '1a', critere_id: 'pratique', note: 9 },
    'e1|5a|pratique|1': { eleve_id: 'e1', competence_id: '5a', critere_id: 'pratique', note: 7 },
    'e9|1a|pratique|1': { eleve_id: 'e9', competence_id: '1a', critere_id: 'pratique', note: 10 },
  };
  const maClasse = ['e1', 'e2'];
  // Le compte annoncé avant le geste : CETTE classe, CETTE compétence. Ni l'élève d'une
  // autre classe (e9), ni la même colonne d'une autre compétence (5A).
  assert.equal(notesDuCritere(notes, maClasse, '1a', 'pratique'), 2);
  assert.equal(notesDuCritere(notes, maClasse, '5a', 'pratique'), 1);
  assert.equal(notesDuCritere(notes, maClasse, '1a', 'oral'), 0);

  // Le masque est une liste de clés : il ne peut rien retirer de `notes`.
  const avant = JSON.stringify(notes);
  const masque = criteresMasquesPourClasse([], { c: { '1a': ['pratique'] } }, 'c', '1a');
  assert.deepEqual(masque, ['pratique']);
  const apres = criteresMasquesPourClasse([], { c: {} }, 'c', '1a');
  assert.deepEqual(apres, []);
  assert.equal(JSON.stringify(notes), avant, 'aucune note n’a bougé');
  assert.equal(notesDuCritere(notes, maClasse, '1a', 'pratique'), 2, 'et elles sont toujours là');
});

test('le compte ignore les cases vides et les absences (elles ne sont pas des notes)', () => {
  const notes = {
    a: { eleve_id: 'e1', competence_id: '1a', critere_id: 'oral', note: null, statut: 'absent' },
    b: { eleve_id: 'e1', competence_id: '1a', critere_id: 'oral', note: '' },
    c: { eleve_id: 'e2', competence_id: '1a', critere_id: 'oral', note: 0 },
  };
  assert.equal(notesDuCritere(notes, ['e1', 'e2'], '1a', 'oral'), 1, 'un zéro EST une note');
  assert.equal(notesDuCritere(notes, new Set(['e1']), '1a', 'oral'), 0);
  assert.equal(notesDuCritere(null, ['e1'], '1a', 'oral'), 0);
});
