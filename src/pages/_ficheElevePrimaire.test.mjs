// La fiche élève du PRIMAIRE affiche la moyenne de chaque UA, celle du bulletin et du PV.
//   node src/pages/_ficheElevePrimaire.test.mjs
// Défaut corrigé : la fiche ne lisait que gradeMap (secondaire) -> « N/A » pour tout élève du primaire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./StudentProfile.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('la moyenne du primaire vient du moteur de PV (comme bulletin et PV)', () => {
  assert.match(src, /usePvBuilder\(pvClasses\)/);
  assert.match(src, /resolveClassEngine\(school, cls\) === 'apc_primaire'/);
  assert.match(src, /pvForClass\(cls, `s\$\{ua\}`\)/);
});

test("huit UA, et l'en-tête (Moyenne/Mention) suit la dernière UA notée", () => {
  assert.match(src, /PRIM_UAS\s*=\s*\[1, 2, 3, 4, 5, 6, 7, 8\]/);
  assert.match(src, /lastAvg = isPrim \? \(lastPrim\?\.avg/);
  assert.match(src, /\{lastAvg\.toFixed\(2\)\}\/\{avgMax\}/, 'barème du primaire (/10), pas /20');
});

test('le tableau des séquences du secondaire est masqué au primaire', () => {
  assert.match(src, /\{!isPrim && subs\.length > 0 && \(/);
  assert.match(src, /\{!isPrim && seqAvgs\.some/);
});
