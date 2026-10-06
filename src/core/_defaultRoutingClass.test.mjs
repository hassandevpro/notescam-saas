// defaultRoutingClass — classe de référence quand AUCUNE n'est encore choisie.
//
// Régression couverte : une institutrice dont toutes les classes sont maternelles
// atterrissait sur le poste de saisie du PRIMAIRE (« Aucune classe primaire »),
// donc sans domaine ni élève à noter. Le repli doit partir d'une classe que le
// compte voit vraiment, dans l'ordre pédagogique.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRoutingClass, resolveClassEngine } from './engineResolver.js';

const minedub = { bulletin_engine: 'minedub' };
const officiel = { bulletin_engine: 'officiel' };

test('maternelle seule → la classe de référence est maternelle', () => {
  const classes = [
    { id: 'b', name: 'GS B', level: 'GS' },
    { id: 'a', name: 'PS A', level: 'PS' },
  ];
  // À section égale, le tri est alphabétique — comme la liste de classes du poste
  // de saisie maternelle. Ce qui compte ici : le moteur résolu, pas laquelle.
  const cls = defaultRoutingClass(classes);
  assert.equal(cls.id, 'b');
  assert.equal(resolveClassEngine(minedub, cls), 'maternelle');
});

test('ordre pédagogique : maternelle avant primaire, primaire avant collège', () => {
  const classes = [
    { id: '6e', name: '6e A', level: '6e' },
    { id: 'cm2', name: 'CM2', level: 'CM2' },
    { id: 'ms', name: 'MS', level: 'MS' },
  ];
  assert.equal(defaultRoutingClass(classes).id, 'ms');
  assert.equal(defaultRoutingClass(classes.filter((c) => c.id !== 'ms')).id, 'cm2');
});

test('Nursery anglophone reconnue comme maternelle', () => {
  const classes = [{ id: 'n1', name: 'Nursery 1', level: 'Nursery 1', system: 'EN' }];
  assert.equal(resolveClassEngine(officiel, defaultRoutingClass(classes)), 'maternelle');
});

test('aucune classe → null, et le moteur retombe sur classic', () => {
  assert.equal(defaultRoutingClass([]), null);
  assert.equal(defaultRoutingClass(null), null);
  assert.equal(resolveClassEngine(minedub, defaultRoutingClass([])), 'classic');
});

test('tri par nom numérique à section égale', () => {
  const classes = [
    { id: 'b', name: 'PS 10', level: 'PS' },
    { id: 'a', name: 'PS 2', level: 'PS' },
  ];
  assert.equal(defaultRoutingClass(classes).id, 'a');
});
