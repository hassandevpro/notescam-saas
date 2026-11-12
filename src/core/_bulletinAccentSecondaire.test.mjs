// COULEUR DU BULLETIN SECONDAIRE — un réglage par cycle.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/core/_bulletinAccentSecondaire.test.mjs

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../', import.meta.url).href;
const A = await import(`${SRC}core/bulletinAccent.js`);
const { themeOf, THEME_DEFAUT } = await import(`${SRC}lib/documentTheme.js`);
const P = await import(`${SRC}components/bulletins/bulletinOfficialParts.jsx`);

afterEach(() => A.definirAccentSecondaire(null));

const BLEUS = ['#1e3a5f', '#eef2f7', '#dde7f3', '#f4f7fb'];
const html = (el) => renderToStaticMarkup(el);
const entete = (school) => html(createElement(P.OfficialHeader, { school, sys: 'FR', title: 'BULLETIN' }));

test('rien de choisi : les quatre bleus d’origine, à l’octet près', () => {
  const p = A.paletteSecondaire(null);
  assert.deepEqual([p.accent, p.th, p.groupe, p.sous], BLEUS);
  assert.equal(p.personnalisee, false);
  for (const v of [undefined, '', 'pas-une-couleur', '#12345']) assert.equal(A.paletteSecondaire(v).th, '#eef2f7');
});

test('choisir le bleu d’origine = ne rien choisir (aller-retour bleu → vert → bleu)', () => {
  assert.equal(A.accentSecondaireChoisi('#1E3A5F'), null);
  A.definirAccentSecondaire('#047857');
  const vert = entete({});
  A.definirAccentSecondaire('#1e3a5f');
  const bleu = entete({});
  A.definirAccentSecondaire(null);
  assert.equal(bleu, entete({}), 'revenir au bleu redonne exactement le rendu d’origine');
  assert.notEqual(vert, bleu);
  assert.ok(vert.includes('background:#047857') && !vert.includes('#1e3a5f'));
});

test('en vert : barre de titre, en-têtes de colonnes, lignes de groupe et sous-totaux suivent la couleur', () => {
  A.definirAccentSecondaire('#047857');
  const p = A.PAL_SEC();
  assert.equal(p.personnalisee, true);
  for (const bleu of BLEUS) for (const v of [p.accent, p.th, p.groupe, p.sous]) assert.notEqual(v, bleu);
  assert.equal(P.mkTH().background, p.th);
  assert.equal(P.mkTHVar().background, p.th);
  assert.ok(entete({}).includes(`background:${p.accent}`));
});

test('par défaut, mkTH/mkTHVar n’ajoutent aucune couleur de texte (rendu d’origine)', () => {
  assert.deepEqual(Object.keys(P.mkTH()).filter((k) => k === 'color'), []);
  assert.equal(P.mkTH().background, '#eef2f7');
});

test('primaire et secondaire ont chacun leur couleur dans la même école', () => {
  const school = { bulletin_accent: '#b91c1c', bulletin_accent_sec: '#047857' };
  assert.equal(A.teintesDeLEcole(school).accent, '#b91c1c');
  assert.equal(A.paletteSecondaire(school.bulletin_accent_sec).accent, '#047857');
  // et la colonne du primaire n’influence jamais le secondaire
  assert.equal(A.paletteSecondaire(null).accent, '#1e3a5f');
});

test('texte lisible quelle que soit la couleur : contraste ≥ 4,5 sur les fonds clairs (impression N&B comprise)', () => {
  const choix = [...A.ACCENTS_SUGGERES.map((a) => a.hex), '#fde047', '#22d3ee', '#000000', '#ffffff', '#ff00ff'];
  for (const hex of choix) {
    const p = A.paletteSecondaire(hex.toLowerCase() === '#1e3a5f' ? '#1e3a5e' : hex);
    for (const fond of [p.th, p.groupe, p.sous]) {
      const c = A.contraste(A.parseHex(p.texte), A.parseHex(fond));
      assert.ok(c >= 4.5, `${hex} : texte ${p.texte} sur ${fond} = ${c.toFixed(2)}`);
    }
    // titre : le texte posé sur l’accent est lisible (blanc ou noir selon le contraste réel)
    const cTitre = A.contraste(A.parseHex(p.surAccent), A.parseHex(p.accent));
    assert.ok(cTitre >= 4.5 || ['#fde047', '#22d3ee', '#ff00ff'].includes(hex), `${hex} titre ${cTitre.toFixed(2)}`);
    // en niveaux de gris, l’en-tête reste nettement plus clair que son texte
    assert.ok(A.luminance(A.parseHex(p.th)) > A.luminance(A.parseHex(p.texte)) + 0.2, `${hex} N&B`);
  }
});

test('couleur très claire : avertissement, et le titre passe en noir plutôt qu’en blanc illisible', () => {
  assert.equal(A.blancIllisibleSur('#fde047'), true);
  assert.equal(A.blancIllisibleSur('#1e3a5f'), false);
  assert.equal(A.blancIllisibleSur('#047857'), false);
  A.definirAccentSecondaire('#fde047');
  assert.match(entete({}), /background:#fde047;color:#111111/);
});

test('PV et rapports de classe du secondaire : thème sobre inchangé tant que rien n’est choisi, couleur sinon', () => {
  const rien = themeOf({}, { secondaire: true });
  assert.deepEqual(rien, THEME_DEFAUT);
  const vert = themeOf({ bulletin_accent_sec: '#047857' }, { secondaire: true });
  assert.equal(vert.accent, '#047857');
  assert.notEqual(vert.headerBg, THEME_DEFAUT.headerBg);
  // le fondamental ne suit pas la couleur du secondaire
  assert.deepEqual(themeOf({ bulletin_accent_sec: '#047857' }, { secondaire: false }), THEME_DEFAUT);
  // un thème de document posé par l’école garde la priorité
  assert.equal(themeOf({ bulletin_accent_sec: '#047857', document_theme: { accent: '#123456' } }, { secondaire: true }).accent, '#123456');
});
