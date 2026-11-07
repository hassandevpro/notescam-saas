// « LE LOGO CONTIENT DÉJÀ LE NOM » — réglage par école, rendu RÉEL de l'en-tête.
//
// Un logo carré qui porte le nom de l'école (Bright Continent) ne se distingue pas d'un blason : seule
// l'école le sait. Cochée, la case retire le nom écrit sous le logo et agrandit celui-ci ; l'adresse, le
// téléphone et l'année restent. Décochée (défaut), l'en-tête garde son nom.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_logoContientNom.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};

const SRC = new URL('../../', import.meta.url).href;
const { OfficialHeader } = await import(`${SRC}components/bulletins/bulletinOfficialParts.jsx`);

const ECOLE = {
  name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', address: '1234 Yaoundé', phone: '678341213',
  current_year: '2026-2027', logo_url: 'https://exemple.test/logo.png',
};
const rendre = (school, props = {}) =>
  renderToStaticMarkup(createElement(OfficialHeader, { school, sys: 'FR', title: 'BULLETIN', ...props }));

test('par défaut le nom de l’école est écrit sous le logo', () => {
  assert.match(rendre(ECOLE), /BRIGHT CONTINENT BILINGUAL SCHOOL/);
  assert.match(rendre(ECOLE, { dense: true }), /BRIGHT CONTINENT BILINGUAL SCHOOL/);
  assert.match(rendre(ECOLE, { vars: true }), /BRIGHT CONTINENT BILINGUAL SCHOOL/);
});

test('case cochée : plus de nom écrit, mais l’adresse, le téléphone et l’année restent', () => {
  for (const props of [{}, { dense: true }, { vars: true }]) {
    for (const coche of [true, 1]) {
      const html = rendre({ ...ECOLE, logo_contient_nom: coche }, props);
      assert.doesNotMatch(html, /BRIGHT CONTINENT BILINGUAL SCHOOL/, JSON.stringify(props));
      assert.match(html, /B\.P\. 1234 Yaoundé/);
      assert.match(html, /678341213/);
      assert.match(html, /2026-2027/);
    }
  }
});

test('case décochée (false, 0, absente) : le nom reste', () => {
  for (const v of [false, 0, undefined, null]) {
    assert.match(rendre({ ...ECOLE, logo_contient_nom: v }, { dense: true }), /BRIGHT CONTINENT BILINGUAL SCHOOL/);
  }
});

test('le logo est plus grand quand il porte le nom (une page, et primaire)', () => {
  assert.match(rendre(ECOLE, { dense: true }), /width:80px;height:80px/);
  assert.match(rendre({ ...ECOLE, logo_contient_nom: true }, { dense: true }), /width:88px;height:88px/);
  assert.match(rendre(ECOLE, { vars: true }), /width:calc\(var\(--nc-logo\) \* 1\.6\)/);
  assert.match(rendre({ ...ECOLE, logo_contient_nom: true }, { vars: true }), /width:calc\(var\(--nc-logo\) \* 1\.8\)/);
});
