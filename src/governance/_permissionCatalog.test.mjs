// Tests de validation du brouillon de rôle (éditeur de catalogue, Phase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoleDraft, PERMISSION_OPTIONS, WORKFLOW_OPTIONS } from './permissionCatalog.js';

test('code machine : minuscules/chiffres/_ commençant par une lettre', () => {
  assert.deepEqual(validateRoleDraft({ code: 'econome', name: 'Économe', scope: 'complex' }), []);
  assert.ok(validateRoleDraft({ code: 'Éco nome', name: 'x', scope: 'complex' }).includes('code'));
  assert.ok(validateRoleDraft({ code: '2roles', name: 'x', scope: 'complex' }).includes('code'));
  assert.ok(validateRoleDraft({ code: '', name: 'x', scope: 'complex' }).includes('code'));
});

test('nom requis', () => {
  assert.ok(validateRoleDraft({ code: 'econome', name: '', scope: 'complex' }).includes('name'));
});

test('secteur requis si portée = sector', () => {
  assert.ok(validateRoleDraft({ code: 'chef', name: 'Chef', scope: 'sector' }).includes('sector'));
  assert.deepEqual(validateRoleDraft({ code: 'chef', name: 'Chef', scope: 'sector', sector: 'primaire' }), []);
});

test('portée invalide rejetée', () => {
  assert.ok(validateRoleDraft({ code: 'x', name: 'X', scope: 'bogus' }).includes('scope'));
});

test('unicité du code par école', () => {
  const e = validateRoleDraft({ code: 'raf', name: 'RAF bis', scope: 'complex' }, { existingCodes: ['raf', 'caissier'] });
  assert.ok(e.includes('code_unique'));
  assert.deepEqual(validateRoleDraft({ code: 'raf', name: 'RAF', scope: 'complex' }, { existingCodes: ['caissier'] }), []);
});

test('les options couvrent des clés distinctes', () => {
  const keys = [...PERMISSION_OPTIONS, ...WORKFLOW_OPTIONS].map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length, 'aucune clé en double entre permissions et workflows');
});
