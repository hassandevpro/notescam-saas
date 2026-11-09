import test from 'node:test';
import assert from 'node:assert/strict';
import { masquesCriteresPour, masquesDe, recopierMasqueEcole, planMigration, appliquerGeste } from './primCriteresMasques.js';
import { criteresForCompetence, niveauPointsTotal } from './primEngine.js';

const referentiel = {
  criteres: [{ id: 'oral', nom: 'Oral' }, { id: 'ecrit', nom: 'Écrit' }],
  baremeCriteres: ['1a', '1b', '2a'].flatMap((c) => [
    { niveau_id: 'ce2', competence_id: c, critere_id: 'oral', points_max: 10, ordre: 1, aptitude: 'apte' },
    { niveau_id: 'ce2', competence_id: c, critere_id: 'ecrit', points_max: 20, ordre: 2, aptitude: 'apte' },
  ]),
};
const ids = (m, comp) => criteresForCompetence(referentiel, 'ce2', comp, 'apte', m).map((c) => c.id);
const COMPS = ['1a', '1b', '2a'];

test('classe jamais touchée : la liste de l’école s’applique, comme avant', () => {
  const m = masquesCriteresPour(['oral'], {}, 'cl1');
  for (const c of COMPS) assert.deepEqual(ids(m, c), ['ecrit']);
});
test('une liste (forme historique) marche toujours', () => {
  assert.deepEqual(ids(['oral'], '1a'), ['ecrit']);
  assert.deepEqual(ids([], '1a'), ['oral', 'ecrit']);
  assert.deepEqual(ids(undefined, '1a'), ['oral', 'ecrit']);
});
test('B-test : masquer Oral pour 1A SEULEMENT — il reste visible pour 1B et 2A', () => {
  const etat = appliquerGeste(undefined, [], COMPS, { competenceId: '1a', critereId: 'oral', masque: true });
  const m = masquesCriteresPour([], { cl1: etat }, 'cl1');
  assert.deepEqual(ids(m, '1a'), ['ecrit']);
  assert.deepEqual(ids(m, '1b'), ['oral', 'ecrit']);
  assert.deepEqual(ids(m, '2a'), ['oral', 'ecrit']);
});
test('un autre classe garde son propre masque', () => {
  const etat = appliquerGeste(undefined, [], COMPS, { competenceId: '1a', critereId: 'oral', masque: true });
  const m = masquesCriteresPour([], { cl1: etat }, 'cl2');
  assert.deepEqual(ids(m, '1a'), ['oral', 'ecrit']);
});
test('première modification d’une classe : la liste de l’école est recopiée PUIS affinée', () => {
  // l’école masquait Oral partout ; on le ré-affiche sur 1B seule
  const etat = appliquerGeste(undefined, ['oral'], COMPS, { competenceId: '1b', critereId: 'oral', masque: false });
  const m = masquesCriteresPour(['oral'], { cl1: etat }, 'cl1');
  assert.deepEqual(ids(m, '1a'), ['ecrit']);
  assert.deepEqual(ids(m, '1b'), ['oral', 'ecrit']);
  assert.deepEqual(ids(m, '2a'), ['ecrit']);
});
test('« appliquer à toutes les compétences »', () => {
  const etat = appliquerGeste(undefined, [], COMPS, { competenceId: '1a', critereId: 'oral', masque: true, partout: true });
  const m = masquesCriteresPour([], { cl1: etat }, 'cl1');
  for (const c of COMPS) assert.deepEqual(ids(m, c), ['ecrit']);
});
test('tout ré-afficher : la classe reste initialisée (la liste de l’école ne revient pas)', () => {
  let etat = appliquerGeste(undefined, ['oral'], COMPS, { competenceId: '1a', critereId: 'oral', masque: false, partout: true });
  assert.equal(etat.init, true);
  const m = masquesCriteresPour(['oral'], { cl1: etat }, 'cl1');
  for (const c of COMPS) assert.deepEqual(ids(m, c), ['oral', 'ecrit']);
});
test('le critère masqué sort du dénominateur de CETTE compétence seulement', () => {
  const etat = appliquerGeste(undefined, [], COMPS, { competenceId: '1a', critereId: 'oral', masque: true });
  const m = masquesCriteresPour([], { cl1: etat }, 'cl1');
  const comps = COMPS.map((id) => ({ id }));
  assert.equal(niveauPointsTotal(referentiel, 'ce2', comps, 'apte', m), 20 + 30 + 30);
  assert.equal(niveauPointsTotal(referentiel, 'ce2', comps, 'apte', []), 90);
});
test('migration : recopie à l’identique, idempotente, classes déjà initialisées sautées', () => {
  const plan = planMigration({ ecole: ['oral', 'pratique'], classes: [{ id: 'a' }, { id: 'b' }], competenceIds: COMPS });
  assert.deepEqual(plan.aInitialiser, ['a', 'b']);
  assert.equal(plan.lignes.length, 2 * 2 * 3);
  // équivalence : ce que la classe affichait avant == ce qu’elle affiche après
  const parClasse = { a: { init: true, parCompetence: {} } };
  for (const l of plan.lignes.filter((x) => x.class_id === 'a')) (parClasse.a.parCompetence[l.competence_id] ||= []).push(l.critere_id);
  const avant = masquesCriteresPour(['oral', 'pratique'], {}, 'a');
  const apres = masquesCriteresPour(['oral', 'pratique'], parClasse, 'a');
  for (const c of COMPS) assert.deepEqual(ids(apres, c), ids(avant, c));
  // rejouée : plus rien à faire
  const dejaLignes = new Set(plan.lignes.map((l) => `${l.class_id}|${l.competence_id}|${l.critere_id}`));
  const rejoue = planMigration({ ecole: ['oral', 'pratique'], classes: [{ id: 'a' }, { id: 'b' }], competenceIds: COMPS, dejaInit: new Set(['a', 'b']), dejaLignes });
  assert.deepEqual(rejoue, { aInitialiser: [], lignes: [] });
});
test('école sans masque : la migration initialise sans écrire de ligne', () => {
  const plan = planMigration({ ecole: [], classes: [{ id: 'a' }], competenceIds: COMPS });
  assert.deepEqual(plan, { aInitialiser: ['a'], lignes: [] });
});
test('recopierMasqueEcole / masquesDe', () => {
  assert.equal(recopierMasqueEcole(['oral'], COMPS).lignes.length, 3);
  assert.deepEqual(masquesDe(() => ['x'], 'c'), ['x']);
  assert.deepEqual(masquesDe(null, 'c'), []);
});
