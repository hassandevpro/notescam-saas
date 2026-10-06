// SURCHARGE PAR ÉCOLE de l'intitulé d'un domaine de maternelle.
//
// `mat_domaines` est NATIONALE : 44 écoles la partagent. Et
// `mat_observations.domaine_id` porte une clé étrangère vers elle — une école ne
// peut donc ni renommer un domaine en base, ni en inventer un.
//
// La surcharge est la seule voie : on garde l'IDENTITÉ officielle (l'id, donc la
// FK et le bulletin ministériel) et on affiche le mot de l'école, porté par la
// ligne `subjects` qui référence `mat_domaine_id`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domaineLabelOverrides, withDomaineOverrides } from './matDomaineMatch.js';
import { matDomaineLabel } from './referentielI18n.js';

const domaines = [
  { id: 'langage_communication', code: 'D1', intitule: 'Langage et communication' },
  { id: 'psychomotricite',       code: 'D4', intitule: 'Psychomotricité' },
  { id: 'autonomie_personnelle', code: 'D8', intitule: 'Autonomie personnelle' },
];

test('une ligne subjects liée par mat_domaine_id surcharge son domaine', () => {
  const subjects = [
    { class_id: 'c1', name: 'Éveil au langage', mat_domaine_id: 'langage_communication' },
  ];
  const ov = domaineLabelOverrides(subjects, 'c1', domaines);
  assert.equal(ov.get('langage_communication'), 'Éveil au langage');

  const out = withDomaineOverrides(domaines, ov);
  assert.equal(out[0].intitule, 'Éveil au langage');
  assert.equal(out[0].id, 'langage_communication', "l'identité officielle est conservée");
  assert.equal(out[0].code, 'D1');
  assert.equal(out[1].intitule, 'Psychomotricité', 'les autres ne bougent pas');
});

test("la surcharge resiste a une relocalisation en aval", () => {
  // Sans le drapeau, matDomaineLabel() retraduirait depuis l'id et ecraserait le
  // mot de l'ecole sur un bulletin anglophone. C'est le bug qu'on verrouille ici.
  const ov = domaineLabelOverrides(
    [{ class_id: 'c1', name: 'Our own wording', mat_domaine_id: 'psychomotricite' }], 'c1', domaines,
  );
  const [d1, d4] = withDomaineOverrides(domaines, ov);
  assert.equal(d4._override, true);
  assert.equal(d4._override ? d4.intitule : matDomaineLabel(d4, 'EN'), 'Our own wording');
  // Un domaine NON surchargé se traduit normalement.
  assert.equal(d1._override, undefined);
  assert.equal(d1._override ? d1.intitule : matDomaineLabel(d1, 'EN'), 'Language and communication');
});

test('le rapprochement par NOM marche aussi, sans mat_domaine_id', () => {
  // Une école qui a saisi ses matières à la main n'a pas le lien canonique.
  const ov = domaineLabelOverrides(
    [{ class_id: 'c1', name: 'Psychomotricité', mat_domaine_id: null }], 'c1', domaines,
  );
  assert.equal(ov.get('psychomotricite'), 'Psychomotricité');
});

test('une autre classe ne surcharge rien', () => {
  const subjects = [{ class_id: 'c2', name: 'Autre mot', mat_domaine_id: 'psychomotricite' }];
  assert.equal(domaineLabelOverrides(subjects, 'c1', domaines).size, 0);
});

test('une matière sans nom ne vide pas le libellé officiel', () => {
  const subjects = [{ class_id: 'c1', name: '   ', mat_domaine_id: 'psychomotricite' }];
  assert.equal(domaineLabelOverrides(subjects, 'c1', domaines).size, 0);
  const out = withDomaineOverrides(domaines, new Map());
  assert.equal(out[1].intitule, 'Psychomotricité');
});

test('deux lignes rivales : la première gagne, sans clignoter', () => {
  const subjects = [
    { class_id: 'c1', name: 'Premier', mat_domaine_id: 'psychomotricite' },
    { class_id: 'c1', name: 'Second',  mat_domaine_id: 'psychomotricite' },
  ];
  assert.equal(domaineLabelOverrides(subjects, 'c1', domaines).get('psychomotricite'), 'Premier');
});

test('aucune surcharge → la liste officielle est rendue telle quelle', () => {
  assert.equal(withDomaineOverrides(domaines, new Map()), domaines);
  assert.equal(withDomaineOverrides(domaines, null), domaines);
});
