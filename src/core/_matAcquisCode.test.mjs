// Le SIGLE de la cote suit la langue de la classe — le STOCKAGE, jamais.
//
// « A » et « NA » se lisent dans les deux langues. « ECA » non : c'est
// l'abréviation d'« En Cours d'Acquisition », illisible sur un bulletin
// anglophone, où la cote se dit « In Progress » → IP.
//
// L'invariant à ne pas casser : `mat_observations.niveau_acquis` ne contient
// QUE 'A' | 'ECA' | 'NA'. C'est ce que sa contrainte de domaine accepte, et ce
// qui permet à une école bilingue de tirer les deux bulletins de la même
// observation. Rien ne doit écrire 'IP' en base.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matAcquisCode, matAcquisFromInput, matAcquisLabel, MAT_ACQUIS_CODE_EN,
} from './referentielI18n.js';
import { MAT_ACQUIS_CODES, isValidAcquis } from './matEngine.js';

test('francophone : les sigles officiels, inchangés', () => {
  for (const c of MAT_ACQUIS_CODES) assert.equal(matAcquisCode(c, 'FR'), c);
});

test('anglophone : ECA devient IP, A et NA tiennent', () => {
  assert.equal(matAcquisCode('A', 'EN'), 'A');
  assert.equal(matAcquisCode('ECA', 'EN'), 'IP');
  assert.equal(matAcquisCode('NA', 'EN'), 'NA');
});

test("l'espagnol retombe sur le français, comme le reste du module", () => {
  assert.equal(matAcquisCode('ECA', 'ES'), 'ECA');
});

test('une cote absente ne fabrique pas de sigle', () => {
  assert.equal(matAcquisCode('', 'EN'), '');
  assert.equal(matAcquisCode(null, 'EN'), '');
});

test('le sigle anglais reste cohérent avec son libellé', () => {
  // IP ↔ « In progress » : une légende ne doit jamais contredire la cote.
  assert.equal(matAcquisCode('ECA', 'EN'), 'IP');
  assert.equal(matAcquisLabel('ECA', 'En cours', 'EN'), 'In progress');
});

test('relecture : les deux sigles rendent le code CANONIQUE', () => {
  assert.equal(matAcquisFromInput('IP'), 'ECA');
  assert.equal(matAcquisFromInput('ip'), 'ECA');
  assert.equal(matAcquisFromInput('ECA'), 'ECA');
  assert.equal(matAcquisFromInput(' eca '), 'ECA');
  assert.equal(matAcquisFromInput('A'), 'A');
  assert.equal(matAcquisFromInput('na'), 'NA');
});

test('une saisie inconnue est refusée, pas devinée', () => {
  for (const bad of ['B', 'OG', 'ACQUIS', '', null, undefined, 'I P']) {
    assert.equal(matAcquisFromInput(bad), null, `${JSON.stringify(bad)} ne doit rien valoir`);
  }
});

test("INVARIANT : tout ce qui ressort de la relecture est stockable en base", () => {
  for (const saisie of ['A', 'ECA', 'IP', 'NA', 'ip', 'na']) {
    const code = matAcquisFromInput(saisie);
    assert.ok(isValidAcquis(code), `${saisie} → ${code} doit passer la contrainte`);
  }
  // Et le sigle anglais n'est JAMAIS une valeur de stockage valide.
  assert.equal(isValidAcquis('IP'), false);
  assert.equal(MAT_ACQUIS_CODE_EN.eca, 'IP');
});

test('aller-retour : saisir le sigle affiché le réaffiche identique', () => {
  for (const sys of ['FR', 'EN']) {
    for (const canon of MAT_ACQUIS_CODES) {
      const affiche = matAcquisCode(canon, sys);
      assert.equal(matAcquisFromInput(affiche), canon, `${sys} ${canon}`);
      assert.equal(matAcquisCode(matAcquisFromInput(affiche), sys), affiche);
    }
  }
});
