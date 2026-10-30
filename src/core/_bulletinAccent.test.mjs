// La couleur d'accent d'un bulletin et ses variantes.
//
// L'enjeu n'est pas esthétique : une école choisit UNE couleur, et quatre
// teintes en sont déduites. Si la déduction est mauvaise, l'école imprime
// trois cents bulletins illisibles sans qu'aucun écran ne l'ait prévenue.
// Ces contrôles vérifient donc des CONTRASTES, pas des goûts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCENT_DEFAUT, parseHex, luminance, contraste,
  teintesBulletin, accentDeLEcole, teintesDeLEcole,
} from './bulletinAccent.js';

test('lecture d’un hex, dans ses deux écritures', () => {
  assert.deepEqual(parseHex('#047857'), [4, 120, 87]);
  assert.deepEqual(parseHex('047857'), [4, 120, 87]);
  assert.deepEqual(parseHex('#0A5'), [0, 170, 85]);
  assert.deepEqual(parseHex('  #047857  '), [4, 120, 87]);
});

test('ce qui n’est pas une couleur est refusé', () => {
  for (const v of [null, undefined, '', 'vert', '#12345', '#gggggg', 42, {}, '#1234567']) {
    assert.equal(parseHex(v), null, `${JSON.stringify(v)} ne doit pas passer`);
  }
});

test('la luminance encadre bien le noir et le blanc', () => {
  assert.equal(luminance([0, 0, 0]), 0);
  assert.equal(luminance([255, 255, 255]), 1);
  assert.equal(Math.round(contraste([0, 0, 0], [255, 255, 255])), 21);
});

// ── LE CŒUR : un bulletin lisible, quelle que soit la couleur choisie ──────
//
// On balaie des accents volontairement hostiles : très clairs (jaune, cyan),
// très sombres (noir), saturés (magenta), et le vert par défaut.
const ACCENTS = ['#047857', '#1e3a5f', '#b91c1c', '#f59e0b', '#fde047', '#00e5ff',
  '#111111', '#ff00ff', '#7c3aed', '#065f46'];

test('le texte des en-têtes se lit sur les fonds clairs — partout', () => {
  for (const a of ACCENTS) {
    const t = teintesBulletin(a);
    const texte = parseHex(t.texte);
    for (const fond of ['tint', 'tintFort']) {
      const c = contraste(texte, parseHex(t[fond]));
      // 4,5 est le seuil WCAG AA pour du texte normal. Un bulletin est lu par
      // des parents, parfois photocopié : on ne descend pas en dessous.
      assert.ok(c >= 4.5, `${a} : texte sur ${fond} = ${c.toFixed(2)} (< 4,5)`);
    }
  }
});

test('le texte du bandeau se lit sur l’accent plein — partout', () => {
  for (const a of ACCENTS) {
    const t = teintesBulletin(a);
    const c = contraste(parseHex(t.surAccent), parseHex(t.accent));
    assert.ok(c >= 4.5, `${a} : ${t.surAccent} sur ${t.accent} = ${c.toFixed(2)}`);
  }
});

test('un accent clair bascule le texte du bandeau en noir', () => {
  assert.equal(teintesBulletin('#fde047').surAccent, '#111111', 'jaune vif');
  assert.equal(teintesBulletin('#00e5ff').surAccent, '#111111', 'cyan');
  assert.equal(teintesBulletin('#047857').surAccent, '#ffffff', 'vert foncé');
  assert.equal(teintesBulletin('#111111').surAccent, '#ffffff', 'presque noir');
});

test('les fonds sont toujours CLAIRS, le texte toujours FONCÉ', () => {
  for (const a of ACCENTS) {
    const t = teintesBulletin(a);
    assert.ok(luminance(parseHex(t.tint)) > 0.55, `${a} : tint trop sombre`);
    assert.ok(luminance(parseHex(t.tintFort)) > 0.40, `${a} : tintFort trop sombre`);
    assert.ok(luminance(parseHex(t.texte)) < 0.35, `${a} : texte trop clair`);
    // `tintFort` doit être VISIBLEMENT plus soutenu que `tint`, sinon la ligne
    // TOTAL GÉNÉRAL ne se distingue pas des en-têtes.
    assert.ok(luminance(parseHex(t.tint)) > luminance(parseHex(t.tintFort)), `${a}`);
  }
});

test('toutes les teintes sortent en #rrggbb', () => {
  const t = teintesBulletin('#0A5');
  for (const [k, v] of Object.entries(t)) {
    assert.match(v, /^#[0-9a-f]{6}$/, `${k} = ${v}`);
  }
});

// ── Le repli : aucun bulletin ne refuse de s'imprimer ─────────────────────
test('une couleur absente ou invalide retombe sur le vert du carnet', () => {
  const defaut = teintesBulletin(ACCENT_DEFAUT);
  for (const v of [null, undefined, '', 'bleu', '#xyz']) {
    assert.deepEqual(teintesBulletin(v), defaut, `${JSON.stringify(v)}`);
  }
});

test('l’accent d’une école se lit sur ses paramètres, avec repli', () => {
  assert.equal(accentDeLEcole({ bulletin_accent: '#b91c1c' }), '#b91c1c');
  assert.equal(accentDeLEcole({ bulletin_accent: '  #b91c1c ' }), '#b91c1c');
  // Une école qui n'a rien choisi garde EXACTEMENT l'aspect d'avant.
  assert.equal(accentDeLEcole({}), ACCENT_DEFAUT);
  assert.equal(accentDeLEcole(null), ACCENT_DEFAUT);
  assert.equal(accentDeLEcole({ bulletin_accent: 'rouge' }), ACCENT_DEFAUT);
  assert.deepEqual(teintesDeLEcole(null), teintesBulletin(ACCENT_DEFAUT));
});

test('le défaut reproduit le carnet actuel, pour ne rien changer sans décision', () => {
  const t = teintesBulletin(ACCENT_DEFAUT);
  assert.equal(t.accent, '#047857', 'le vert du bandeau est conservé');
  assert.equal(t.surAccent, '#ffffff');
});
