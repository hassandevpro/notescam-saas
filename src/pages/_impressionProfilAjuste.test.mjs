// L'ajustement à l'impression lit le profil de page AU MOMENT d'imprimer.
//   node src/pages/_impressionProfilAjuste.test.mjs
//
// Défaut corrigé (2026-11-07) : l'écouteur `beforeprint`, posé une fois au montage,
// capturait `profilPage` (« bulletin » = portrait). En paysage, la hauteur visée était
// celle d'une page portrait : aucun resserrement, deux pages. Le banc
// `scripts/bulletin-prim-visual.mjs paysage ajuste-portrait` reproduit le défaut ;
// `paysage` seul prouve la correction. Ce test garde la cause à l'œil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./Bulletins.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('le gestionnaire beforeprint lit le profil via une ref, pas via la valeur du montage', () => {
  assert.match(src, /const profilRef = useRef\(profilPage\);\s*profilRef\.current = profilPage;/,
    'une ref tenue à jour à chaque rendu');
  assert.match(src, /ajusterDensite\(SEL_DENSITE, profilRef\.current\)/);
  assert.match(src, /fitLiveSheets\(SEL_AUTRES, profilRef\.current\)/);
});

test('plus aucun ajustement ne capture profilPage dans un effet à dépendances vides', () => {
  assert.ok(!/ajusterDensite\(SEL_DENSITE, profilPage\)/.test(src), 'ajusterDensite ne doit plus recevoir profilPage directement');
  assert.ok(!/fitLiveSheets\(SEL_AUTRES, profilPage\)/.test(src), 'fitLiveSheets non plus');
});

test('la ref est déclarée APRÈS profilPage et AVANT l\'effet qui l\'utilise', () => {
  const iProfil = src.indexOf('const profilPage = isMat');
  const iRef = src.indexOf('const profilRef = useRef(profilPage)');
  const iEffet = src.indexOf("window.addEventListener('beforeprint', avant)");
  assert.ok(iProfil > 0 && iRef > iProfil && iEffet > iRef, 'ordre de déclaration : profilPage, profilRef, écouteur');
});
