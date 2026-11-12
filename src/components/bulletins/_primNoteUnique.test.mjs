// BULLETIN PRIMAIRE À NOTE UNIQUE — rendu du composant réel.
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_primNoteUnique.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../../', import.meta.url).href;
const { default: NU } = await import(`${SRC}components/bulletins/BulletinPrimNoteUnique.jsx`);
const N = await import(`${SRC}core/primNoteUnique.js`);
const { PRIM_COTE_DEFAULT } = await import(`${SRC}core/primEngine.js`);
const { teintesDeLEcole } = await import(`${SRC}core/bulletinAccent.js`);
const { moyennePointsActive } = await import(`${SRC}core/primMoyennePoints.js`);

const school = { id: 's', name: 'ÉCOLE TEST', country_code: 'cameroon', current_year: '2026-2027' };
const MODELE = [['Communicate in English', 28, 50], ['Langue nationale', 16, 20], ['Sciences et technologies', 31.5, 50], ['TIC', 21, 30], ['EPS', 18, 20], ['Arts', 16.5, 20], ['Dictée', 20.5, 40], ['Étude de texte', 19, 30], ['Production d’écrits', 20, 30], ['Calcul rapide', 13, 20], ['Connaissances générales', 22.5, 40], ['Problème', 34.5, 50]];
const lignes = N.lignesNoteUnique(MODELE.map(([intitule, a, p]) => ({ intitule, cells: [{ achieved: a, possible: p }] })), PRIM_COTE_DEFAULT);
const rendu = (extra = {}) => renderToStaticMarkup(createElement(NU, {
  school, cls: { name: 'CM2' }, student: { id: 'e', name: 'N’GUESSAN Ève', matricule: 'M1', gender: 'F' }, sys: 'FR', effectif: 26,
  titulaire: 'M. ONANA', title: 'BULLETIN DE LA SÉQUENCE 1 / PROGRESS REPORT CARD', lignes, totaux: N.totauxNoteUnique(lignes),
  coteGenerale: 'ECA', coteBareme: PRIM_COTE_DEFAULT, rank: 19, mentions: { avertissement: 'non', tableauHonneur: 'non', encouragement: 'non', felicitation: 'non' },
  statsClasse: { premier: 17.74, dernier: 11.79, generale: 15.25, reussis: 25, echoues: 0, reussite: 100 },
  repartition: [{ label: '[10-11.99]', n: 1 }], repartitionTotal: 25, ...extra,
}));

test('colonnes du modèle, et rien de l’ancien bulletin', () => {
  const h = rendu();
  for (const col of ['MATIÈRE', 'Note', 'Barème', 'N/20', 'COTE', 'Min–Max', 'Appréc. / Visa']) assert.ok(h.includes(col), col);
  assert.doesNotMatch(h, />Coef<|M×coef|Écrit|Compétences?</);
  assert.equal((h.match(/<th /g) || []).filter(Boolean).length >= 7, true);
});

test('lignes : 12 matières, N/20, cote, plage Min–Max, appréciation ; TOTAL et MOYENNE', () => {
  const h = rendu();
  for (const [nom] of MODELE) assert.ok(h.includes(nom), nom);
  assert.match(h, /10–13\.99/); assert.match(h, /14–17\.99/); assert.match(h, /18–20/);
  assert.match(h, /Très bien acquis/); assert.match(h, /En cours d’acquisition/);
  assert.match(h, /260\.5/); assert.match(h, />400</);
  assert.match(h, /MOYENNE<\/?[^>]*> ?: |MOYENNE : 13\.03 \/ 20/);
  assert.ok(h.includes('13.03'));
  assert.ok(!h.includes('13.55'), 'jamais la moyenne des moyennes');
});

test('pied du primaire : total obtenu, rang, distinctions, stats de performance, répartition, signatures', () => {
  const h = rendu();
  for (const m of ['Total obtenu', '260.5 / 400', 'Rang', '19e / 26', 'Avertissement', 'Tableau d’honneur', 'Encouragement', 'Félicitations',
    'Stats de performance', 'Moy. premier', '17.74', 'Moy. dernier', 'Moyenne de la classe', 'Autres statistiques', 'Intervalle de moyenne',
    'Visa du Parent / Tuteur', 'Le Chef d’établissement']) assert.ok(h.includes(m), m);
});

test('titre : celui de la période, sans « Trimestre » codé en dur ; pas de sous-totaux de groupes', () => {
  const h = rendu();
  assert.ok(h.includes('BULLETIN DE LA SÉQUENCE 1 / PROGRESS REPORT CARD'));
  assert.doesNotMatch(h, /Trimestre|1\) COMMUNIQUER|Total:|Moy:/);
});

test('la couleur du cycle primaire est suivie (et seulement elle)', () => {
  const vert = rendu();
  const rouge = rendu({ school: { ...school, bulletin_accent: '#b91c1c' } });
  assert.ok(vert.includes(teintesDeLEcole(school).accent));
  assert.ok(rouge.includes(teintesDeLEcole({ bulletin_accent: '#b91c1c' }).accent));
  assert.ok(!rouge.includes('#047857'), 'plus de vert par défaut quand l’école a choisi le rouge');
  // la couleur du SECONDAIRE ne touche pas ce bulletin
  assert.equal(rendu({ school: { ...school, bulletin_accent_sec: '#047857' } }), vert);
  // les cotes gardent leurs couleurs fixes
  assert.ok(rouge.includes('#f59e0b') && rouge.includes('#10b981') && rouge.includes('#059669'));
});

test('cas limites : élève sans photo, nom très long, école sans logo ni cachet, matière non notée, aucune matière', () => {
  assert.ok(rendu({ student: { id: 'e', name: 'NGUEMA ONDOA Marie-Claire Françoise Éléonore de la Rédemption Mballa Essomba', gender: 'F' } }).includes('Mballa Essomba'));
  assert.ok(rendu({ school: { ...school, logo_url: null, stamp_url: null, signature_url: null } }).includes('MATIÈRE'));
  const l = N.lignesNoteUnique([{ intitule: 'Chinois', cells: [], bareme: 20 }], PRIM_COTE_DEFAULT);
  const h = rendu({ lignes: l, totaux: N.totauxNoteUnique(l) });
  assert.ok(h.includes('Chinois') && h.includes('—'));
  assert.ok(rendu({ lignes: [], totaux: {} }).includes('Aucune matière'));
});

test('anglais : libellés de la langue de l’école', () => {
  const h = rendu({ sys: 'EN', title: 'SEQUENCE 1 PROGRESS REPORT CARD' });
  for (const m of ['SUBJECT', 'Mark', 'Out of', 'GRADE', 'AVERAGE', 'Very well acquired'.slice(0, 0)]) assert.ok(h.includes(m), m);
});

test('règle « points » : imposée à la classe au format note unique, sinon réglage de l’école', () => {
  assert.equal(moyennePointsActive({}, { bulletin_format: 'note_unique' }), true);
  assert.equal(moyennePointsActive({}, {}), false);
  assert.equal(moyennePointsActive({ prim_moyenne_points: 1 }, {}), true);
  assert.equal(moyennePointsActive({}), false);
});
