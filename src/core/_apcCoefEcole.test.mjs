// Le coefficient posé par l'école sur sa matière de classe l'emporte sur le national (APC).
//   node src/core/_apcCoefEcole.test.mjs
// Défaut corrigé : « Modifier la classe » écrit subjects.coef (SVTEEHB = 3 en 5ème) mais la saisie,
// le bulletin, le PV et le rapport lisaient apc_classe_matieres (2 national, 1 si non rattachée).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apcClasseMatieresEcole } from './refClassScope.js';
import { coefFor } from './apcEngine.js';

const referentiel = {
  matieres: [
    { id: 'svteehb', nom: 'SVTEEHB', coefficient: 2 },
    { id: 'histoire', nom: 'Histoire', coefficient: 2 },
    { id: 'geographie', nom: 'Géographie', coefficient: 2 },
  ],
  classeMatieres: [
    { classe_id: '5e', matiere_id: 'svteehb', coefficient: 2, ordre: 80 },
    { classe_id: '5e', matiere_id: 'histoire', coefficient: 2, ordre: 10 },
  ],
};

test("le coef de l'école remplace le national pour la classe", () => {
  const cm = apcClasseMatieresEcole(referentiel, '5e', [{ name: 'SVTEEHB', coef: 3 }]);
  assert.equal(coefFor(cm, '5e', referentiel.matieres[0]), 3);
});

test("une matière non rattachée au niveau reçoit quand même le coef de l'école (pas 1)", () => {
  const cm = apcClasseMatieresEcole(referentiel, '5e', [{ name: 'Géographie', coef: 3 }]);
  assert.equal(coefFor(cm, '5e', referentiel.matieres[2]), 3);
});

test("les autres classes et matières gardent le coef national", () => {
  const cm = apcClasseMatieresEcole(referentiel, '5e', [{ name: 'SVTEEHB', coef: 3 }]);
  assert.equal(coefFor(cm, '5e', referentiel.matieres[1]), 2);
  assert.equal(coefFor(cm, '6e', referentiel.matieres[0]), 2, 'coef global, autre niveau');
});

test('sans matière de classe ou coef invalide : la table nationale est rendue telle quelle', () => {
  assert.equal(apcClasseMatieresEcole(referentiel, '5e', []), referentiel.classeMatieres);
  assert.equal(apcClasseMatieresEcole(referentiel, '5e', [{ name: 'SVTEEHB', coef: 0 }]), referentiel.classeMatieres);
  assert.equal(apcClasseMatieresEcole(referentiel, '5e', [{ name: 'SVTEEHB', coef: 'x' }]), referentiel.classeMatieres);
});
