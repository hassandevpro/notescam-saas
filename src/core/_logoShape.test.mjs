import test from 'node:test';
import assert from 'node:assert/strict';
import { logoShape, isBannerLogo, logoRatio, BANNER_RATIO } from './logoShape.js';

test('REPRODUCTION : la bannière de l’école hors connexion (≈ 850 × 215) est une bannière', () => {
  assert.equal(logoShape(850, 215), 'banner');
  assert.equal(isBannerLogo(850, 215), true);
  assert.ok(logoRatio(850, 215) > 3.9);
});

test('un blason, un médaillon ou un logo carré restent dans leur case', () => {
  for (const [w, h] of [[512, 512], [300, 280], [200, 260], [400, 300], [599, 300]]) {
    assert.equal(logoShape(w, h), 'square', `${w}×${h}`);
  }
});

test('la frontière est à 2 : exactement 2 est déjà une bannière', () => {
  assert.equal(BANNER_RATIO, 2);
  assert.equal(logoShape(200, 100), 'banner');
  assert.equal(logoShape(199, 100), 'square');
});

test('dimensions inconnues ou absurdes : on ne devine pas, on garde le comportement historique', () => {
  for (const [w, h] of [[0, 0], [100, 0], [0, 100], [NaN, 10], [undefined, undefined], [null, 5], [-4, 2]]) {
    assert.equal(logoShape(w, h), null, `${w}×${h}`);
    assert.equal(isBannerLogo(w, h), false);
  }
});

test('un logo très haut n’est jamais une bannière', () => {
  assert.equal(logoShape(100, 600), 'square');
});
