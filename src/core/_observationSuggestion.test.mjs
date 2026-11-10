import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggererObservation, classerMatieres, matiereDe, enumerer, genreDe, aEcrire, indexerNotes, cotesDeLEleve,
} from './observationSuggestion.js';

const INTITULES = {
  '1A': 'Communiquer en français', '1B': 'Communicate in English', '1C': 'Communiquer dans une langue nationale',
  '2A': 'Utiliser les notions de base en mathématiques', '2B': 'Découvrir les sciences et la technologie',
  '3A': 'Pratiquer les valeurs sociales', '3B': 'Pratiquer les valeurs civiques', '4A': 'Développer son autonomie',
  '5A': 'Utiliser les concepts de base et les outils des TIC', '6A': 'Pratiquer une activité physique', '6B': 'Créer',
};
const rows = (cotes) => Object.entries(cotes).map(([code, cote]) => ({ code, intitule: INTITULES[code], cote }));
const tout = (cote) => rows(Object.fromEntries(Object.keys(INTITULES).map((k) => [k, cote])));
// L'exemple de la demande : français NA, anglais A, langue nationale A, maths NA, sciences NA, valeurs NA/NA,
// autonomie A+, TIC ECA, sport ECA, art A+.
const EXEMPLE = rows({ '1A': 'NA', '1B': 'A', '1C': 'A', '2A': 'NA', '2B': 'NA', '3A': 'NA', '3B': 'NA', '4A': 'A+', '5A': 'ECA', '6A': 'ECA', '6B': 'A+' });

test('l’exemple : points forts d’abord (3 au plus), puis les efforts (3 au plus)', () => {
  assert.equal(suggererObservation({ rows: EXEMPLE, sys: 'FR' }),
    'Progrès encourageants en autonomie et initiative, en activités artistiques et en anglais. '
    + 'Des efforts soutenus restent indispensables en français, en mathématiques et en sciences.');
});

test('l’exemple en anglais', () => {
  assert.equal(suggererObservation({ rows: EXEMPLE, sys: 'EN' }),
    'Encouraging progress in autonomy and initiative, artistic activities and English. '
    + 'Sustained effort remains essential in French, mathematics and science.');
});

test('élève tout en A+ : félicitations', () => {
  assert.equal(suggererObservation({ rows: tout('A+') }), 'Excellent travail, résultats très satisfaisants. Continuez ainsi.');
});
test('presque tout en A (un seul ECA sur onze) : félicitations aussi', () => {
  const c = Object.fromEntries(Object.keys(INTITULES).map((k) => [k, 'A'])); c['5A'] = 'ECA';
  assert.match(suggererObservation({ rows: rows(c) }), /^Excellent travail/);
});
test('élève tout en NA : ton encourageant mais exigeant', () => {
  assert.equal(suggererObservation({ rows: tout('NA') }),
    'Résultats insuffisants dans la plupart des domaines. Un travail régulier et un accompagnement à la maison sont nécessaires.');
  assert.match(suggererObservation({ rows: tout('NA'), sys: 'EN' }), /^Insufficient results/);
});
test('rien d’évalué : aucune suggestion inventée', () => {
  assert.equal(suggererObservation({ rows: rows({ '1A': null, '1B': '' }) }), '');
  assert.equal(suggererObservation({ rows: [] }), '');
  assert.equal(suggererObservation({}), '');
});
test('aucun point fort : les efforts, plus la régularité accordée au genre', () => {
  const r = rows({ '1A': 'NA', '1B': 'ECA', '2A': 'ECA', '2B': 'ECA', '4A': 'ECA' });
  assert.match(suggererObservation({ rows: r, genre: 'F' }), /Elle doit travailler avec plus de régularité\.$/);
  assert.match(suggererObservation({ rows: r, genre: 'M' }), /Il doit travailler/);
  assert.match(suggererObservation({ rows: r, genre: null }), /L’élève doit travailler/);
  assert.match(suggererObservation({ rows: r, genre: 'F', sys: 'EN' }), /She must work more regularly\.$/);
});
test('que des A et des ECA : les acquis à consolider, sans parler de faiblesse', () => {
  const t = suggererObservation({ rows: rows({ '1A': 'A', '1B': 'A', '1C': 'ECA', '2A': 'ECA', '2B': 'A' }) });
  assert.match(t, /^Progrès encourageants en français, en anglais et en sciences\./);
  assert.match(t, /Les acquis restent à consolider en langue nationale et en mathématiques\.$/);
});
test('jamais plus de trois matières par catégorie, jamais de doublon', () => {
  const c = classerMatieres(EXEMPLE);
  assert.equal(c.fortes.length, 3); assert.equal(c.faibles.length, 3);
  assert.equal(new Set(c.faibles).size, 3);
  // 3A et 3B sont UNE matière (« valeurs ») : elle compte une fois.
  assert.equal(c.nbFaibles, 4);
});
test('toujours 1 à 3 phrases', () => {
  for (const r of [EXEMPLE, rows({ '1A': 'A' }), rows({ '1A': 'NA', '1B': 'A', '2A': 'A' })]) {
    const n = (suggererObservation({ rows: r }).match(/\./g) || []).length;
    assert.ok(n >= 1 && n <= 3, `${n} phrases`);
  }
});
test('matière lue dans l’intitulé quand le code est inconnu ; TIC ne devient pas « sciences »', () => {
  assert.equal(matiereDe('X9', 'Les outils des TIC et technologies', 'FR'), 'TIC');
  assert.equal(matiereDe('X9', 'Éducation physique', 'FR'), 'sport');
  assert.equal(matiereDe('X9', 'Dessin et musique', 'EN'), 'artistic activities');
  assert.equal(matiereDe('X9', 'Hygiène', 'FR'), 'hygiène');
});
test('énumération : en X, en Y et en Z', () => {
  assert.equal(enumerer(['a']), 'en a');
  assert.equal(enumerer(['a', 'b']), 'en a et en b');
  assert.equal(enumerer(['a', 'b', 'c']), 'en a, en b et en c');
  assert.equal(enumerer(['a', 'b', 'c'], 'EN'), 'in a, b and c');
});
test('genre lu sur la fiche', () => {
  for (const g of ['F', 'Féminin', 'Feminin', 'féminin']) assert.equal(genreDe({ gender: g }), 'F');
  for (const g of ['M', 'Masculin', 'masculin']) assert.equal(genreDe({ gender: g }), 'M');
  assert.equal(genreDe({}), null); assert.equal(genreDe({ gender: '' }), null);
});

test('un texte saisi à la main n’est JAMAIS écrasé sans accord', () => {
  assert.equal(aEcrire('Travail sérieux, à encourager.', 'Excellent travail.'), null);
  assert.equal(aEcrire('Travail sérieux, à encourager.', 'Excellent travail.', { ecraser: true }), 'Excellent travail.');
  assert.equal(aEcrire('', 'Excellent travail.'), 'Excellent travail.');
  assert.equal(aEcrire('  ', 'Excellent travail.'), 'Excellent travail.');
  assert.equal(aEcrire('', ''), null, 'une suggestion vide n’écrit rien');
  assert.equal(aEcrire('Même texte', 'Même texte', { ecraser: true }), null, 'rien à réécrire');
});

test('cotes lues dans les notes saisies : Σ points / Σ barèmes, absence hors calcul, sans note = sans cote', () => {
  const notes = {
    a: { eleve_id: 'e1', competence_id: 'c1', critere_id: 'o', ua: 1, note: 3, points_max: 3 },
    b: { eleve_id: 'e1', competence_id: 'c1', critere_id: 'e', ua: 1, note: 5, points_max: 10 },
    c: { eleve_id: 'e1', competence_id: 'c1', critere_id: 'p', ua: 1, note: '', points_max: 5, statut: 'absent' },
    d: { eleve_id: 'e1', competence_id: 'c2', critere_id: 'o', ua: 2, note: 3, points_max: 3 },   // autre UA
    e: { eleve_id: 'e2', competence_id: 'c1', critere_id: 'o', ua: 1, note: 0, points_max: 3 },   // autre élève
  };
  const idx = indexerNotes(notes);
  const cote = (o, p) => ({ cote: (o / p) >= 0.9 ? 'A+' : (o / p) >= 0.5 ? 'ECA' : 'NA' });
  const comps = [{ id: 'c1', code: '1A', intitule: 'Français' }, { id: 'c2', code: '1B', intitule: 'Anglais' }];
  assert.deepEqual(cotesDeLEleve(idx, 'e1', 1, comps, cote).map((x) => x.cote), ['ECA', null]);   // 8/13
  assert.deepEqual(cotesDeLEleve(idx, 'e2', 1, comps, cote).map((x) => x.cote), ['NA', null]);    // un vrai zéro compte
});
