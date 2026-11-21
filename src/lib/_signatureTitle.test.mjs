import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titreSignatureDirection as T, parSection } from './signatureTitle.js';

test('parSection : seul un drapeau explicite le déclenche', () => {
  assert.equal(parSection({}), false); assert.equal(parSection(null), false);
  assert.equal(parSection({ director_per_section: 0 }), false);
  for (const v of [1, true, '1']) assert.equal(parSection({ director_per_section: v }), true);
});
test('titre : chef d’établissement par défaut, directeur si par section', () => {
  assert.equal(T({}, 'FR'), "Le Chef d'établissement");
  assert.equal(T({}, 'FR', { bilingue: true }), "Chef d'établissement / Head of School");
  assert.equal(T({}, 'EN'), 'Head of School');
  assert.equal(T({ director_per_section: 1 }, 'FR'), 'Le Directeur / La Directrice');
  assert.equal(T({ director_per_section: 1 }, 'FR', { bilingue: true }), 'Le Directeur / La Directrice');
});
