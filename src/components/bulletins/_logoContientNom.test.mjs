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
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};

const SRC = new URL('../../', import.meta.url).href;
const { OfficialHeader, OfficialIdentityBand } = await import(`${SRC}components/bulletins/bulletinOfficialParts.jsx`);

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

test('paysage du primaire : logo plus grand que le plancher, même quand la densité est au minimum', () => {
  assert.match(rendre(ECOLE, { vars: true, grand: true }), /width:max\(calc\(var\(--nc-logo\) \* 1\.8\), 88px\)/);
  assert.match(rendre({ ...ECOLE, logo_contient_nom: true }, { vars: true, grand: true }), /width:max\(calc\(var\(--nc-logo\) \* 1\.8\), 96px\)/);
});

test('paysage du primaire : photo de l’élève plus grande, dans les deux variantes du bandeau', () => {
  const eleve = { name: 'ELEVE TEST', photo_url: 'https://exemple.test/p.jpg' };
  const bande = (grand) => renderToStaticMarkup(createElement(OfficialIdentityBand, { student: eleve, classLabel: 'CM1', sys: 'FR', vars: true, grand }));
  const carnet = (grand) => renderToStaticMarkup(createElement(OfficialIdentityBand, { student: eleve, classLabel: 'CM1', sys: 'FR', vars: true, variant: 'carnet', grand }));
  assert.match(bande(false), /width:46px;height:56px/);
  assert.match(bande(true), /width:60px;height:76px/);
  assert.match(carnet(false), /width:46\.4\d*px;height:58px/);
  assert.match(carnet(true), /width:60\.8\d*px;height:76px/);
});

test('le filigrane s’imprime aussi sur le bulletin officiel du primaire', () => {
  const page = readFileSync(new URL('../../pages/Bulletins.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(page, /\(showApcOfficial \|\| showScOfficial \|\| showPrimOfficial \|\|[^)]*\) && school\?\.logo_url/);
  assert.match(page, /paysage=\{primOrientation === 'landscape'\}/);
});

test('le logo est plus grand quand il porte le nom (une page, et primaire)', () => {
  assert.match(rendre(ECOLE, { dense: true }), /width:80px;height:80px/);
  assert.match(rendre({ ...ECOLE, logo_contient_nom: true }, { dense: true }), /width:88px;height:88px/);
  assert.match(rendre(ECOLE, { vars: true }), /width:calc\(var\(--nc-logo\) \* 1\.6\)/);
  assert.match(rendre({ ...ECOLE, logo_contient_nom: true }, { vars: true }), /width:calc\(var\(--nc-logo\) \* 1\.8\)/);
});
