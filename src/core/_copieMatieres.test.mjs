import test from 'node:test';
import assert from 'node:assert/strict';
import { planCopie, cleNom } from './copieMatieres.js';

const cm1 = [
  { id: 's1', name: 'Dictée', coef: 2, max: 40, position: 0, teacher_id: 'prof1' },
  { id: 's2', name: 'Physique', coef: 1, max: 50, position: 1 },
  { id: 's3', name: 'Mathématiques', coef: 3, max: 20, position: 2 },
];

test('CM1 → CM2 vide : tout est copié, barèmes et coefficients conservés, positions 0..n-1', () => {
  const { aCreer, sautees } = planCopie(cm1, []);
  assert.deepEqual(aCreer.map((x) => [x.name, x.coef, x.max, x.position]),
    [['Dictée', 2, 40, 0], ['Physique', 1, 50, 1], ['Mathématiques', 3, 20, 2]]);
  assert.deepEqual(sautees, []);
});
test('l’enseignant, l’identifiant et les notes ne sont JAMAIS copiés', () => {
  const [d] = planCopie(cm1, []).aCreer;
  assert.equal('teacher_id' in d, false);
  assert.equal('id' in d, false);
});
test('une matière déjà présente (casse, accents) est sautée, jamais écrasée', () => {
  const cible = [{ id: 't1', name: 'DICTEE', coef: 5, max: 10, position: 0 }];
  const { aCreer, sautees } = planCopie(cm1, cible);
  assert.deepEqual(sautees, ['Dictée']);
  assert.deepEqual(aCreer.map((x) => x.name), ['Physique', 'Mathématiques']);
  assert.equal(aCreer[0].position, 1, 'les nouvelles s’ajoutent APRÈS les existantes');
});
test('copier deux fois ne crée aucun doublon', () => {
  const premiere = planCopie(cm1, []).aCreer;
  const apres = premiere.map((x, i) => ({ id: `n${i}`, name: x.name, position: x.position }));
  assert.deepEqual(planCopie(cm1, apres), { aCreer: [], sautees: ['Dictée', 'Physique', 'Mathématiques'] });
});
test('source vide : rien', () => {
  assert.deepEqual(planCopie([], cm1), { aCreer: [], sautees: [] });
  assert.deepEqual(planCopie(null, null), { aCreer: [], sautees: [] });
});
test('composite : l’enfant est lié à la COPIE du parent, parent créé avant', () => {
  const source = [
    { id: 'e1', name: 'Oral', coef: 1, max: 10, parent_id: 'p', position: 1 },
    { id: 'p', name: 'Français', coef: 4, max: 20, position: 0 },
  ];
  const { aCreer } = planCopie(source, []);
  assert.deepEqual(aCreer.map((x) => x.name), ['Français', 'Oral']);
  assert.equal(aCreer[1].parentCle, cleNom('Français'));
  assert.equal(aCreer[0].parentCle, null);
});
test('composite : si le parent existe déjà dans la cible, l’enfant s’y rattache', () => {
  const source = [
    { id: 'p', name: 'Français', coef: 4, max: 20, position: 0 },
    { id: 'e1', name: 'Oral', coef: 1, max: 10, parent_id: 'p', position: 1 },
  ];
  const cible = [{ id: 'T', name: 'Français', position: 0 }];
  const { aCreer, sautees } = planCopie(source, cible);
  assert.deepEqual(sautees, ['Français']);
  assert.equal(aCreer.length, 1);
  assert.equal(aCreer[0].parentIdCible, 'T');
  assert.equal(aCreer[0].parentCle, null);
});
test('doublon DANS la source : une seule copie', () => {
  const { aCreer } = planCopie([{ id: 'a', name: 'Maths', max: 20 }, { id: 'b', name: 'maths', max: 20 }], []);
  assert.equal(aCreer.length, 1);
});
