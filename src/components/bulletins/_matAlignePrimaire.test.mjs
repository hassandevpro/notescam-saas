// LE BULLETIN DE MATERNELLE PARLE LA MÊME LANGUE VISUELLE QUE CELUI DU PRIMAIRE.
//
// On rend les composants RÉELS (react-dom/server) et on vérifie ce qui fait « un même bulletin » : même feuille à
// densité mesurée (donc une page A4), même palette (fondamentalTheme), aucune couleur ni forme propre à la
// maternelle, aucune case de moyenne/rang qui n'existe pas en maternelle, aucun domaine perdu.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_matAlignePrimaire.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../../', import.meta.url).href;
const { default: Mat } = await import(`${SRC}components/bulletins/BulletinMatOfficial.jsx`);
const { default: Prim } = await import(`${SRC}components/bulletins/BulletinPrimAnnualUA.jsx`);
const theme = await import(`${SRC}components/bulletins/fondamentalTheme.js`);

const school = { id: 's', name: 'ÉCOLE TEST', country_code: 'cameroon', current_year: '2026-2027' };
const student = { id: 'e', name: 'N’GUESSAN Ève-Marie', matricule: 'M-1' };
const rows = Array.from({ length: 24 }, (_, i) => ({
  code: `D${i + 1}`, intitule: `Domaine ${i + 1} éveil`, parUa: { 1: 'A', 2: 'ECA', 3: 'NA' }, niveau: 'ECA', observation: i === 3 ? 'Très attentif' : '',
}));
const mat = (extra = {}) => renderToStaticMarkup(createElement(Mat, { school, student, classLabel: 'PS', effectif: 20, title: 'BULLETIN', uas: [1, 2, 3], rows, ...extra }));

test('même feuille que le primaire : densité mesurée, donc une page', () => {
  const h = mat();
  assert.match(h, /nc-densite/);
  assert.match(h, /var\(--nc-body\)/);
  assert.doesNotMatch(h, /font-size:\s*10pt/, 'aucune taille de police figée sur la feuille');
});

test('la palette est celle du primaire, rien de propre à la maternelle', () => {
  const h = mat();
  assert.ok(h.includes(theme.FOND_TH_BG) && h.includes(theme.FOND_ACCENT));
  for (const ancien of ['#7c3aed', '#f3e8ff', '#6d28d9']) assert.ok(!h.includes(ancien), `plus de ${ancien}`);
  assert.doesNotMatch(h, /border-radius:6px[;"]/, 'plus de coins arrondis propres à la maternelle');
  assert.doesNotMatch(h, /[\u{1F300}-\u{1FAFF}☹☺]/u, 'plus d’émojis ni de pictogrammes de domaine');
});

test('aucune colonne ni case de moyenne, de rang ou de note chiffrée', () => {
  const h = mat();
  assert.doesNotMatch(h, /Moyenne|Rang|Average|Rank/);
});

test('tous les domaines configurés s’impriment, dans l’ordre', () => {
  const h = mat();
  for (let i = 1; i <= 24; i++) assert.ok(h.includes(`Domaine ${i} éveil`), `domaine ${i}`);
  assert.ok(h.indexOf('Domaine 2 éveil') < h.indexOf('Domaine 10 éveil'));
});

test('légende des cotes, dans la langue de la classe', () => {
  assert.match(mat(), /Légende/);
  assert.match(mat({ sys: 'EN' }), /Key/);
});

test('accents et apostrophes dans le nom de l’élève sont conservés', () => {
  assert.ok(mat().includes('N’GUESSAN Ève-Marie'));
});

test('le primaire et la maternelle partagent le même gabarit d’en-tête', () => {
  const prim = renderToStaticMarkup(createElement(Prim, { school, sys: 'FR', title: 'BULLETIN', student, classLabel: 'CE1', effectif: 20, competenceRows: [] }));
  const entete = (h) => (h.match(/RÉPUBLIQUE DU CAMEROUN/) || [])[0];
  assert.equal(entete(mat()), entete(prim));
  assert.ok(prim.includes(theme.FOND_ACCENT) && prim.includes(theme.FOND_TH_BG), 'le primaire lit lui aussi la palette commune');
});
