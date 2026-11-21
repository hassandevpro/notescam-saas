// node src/core/_primMoyenneEleve.test.mjs
// Cas BELLO Serge (CE1, La Retraite, UA1) : l'export (20:45) lisait Savoir-être 2/3 → 17,33 ;
// l'écran, après qu'il a été déclaré absent (20:53) → 17,78. UNE règle, deux états de données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { moyenneCompetencePrim, moyenneGeneralePrim } from './primMoyenneEleve.js';

const criteres = [
  { id: 'oral', points_max: 12 }, { id: 'ecrit', points_max: 15 },
  { id: 'pratique', points_max: 20 }, { id: 'savoir_etre', points_max: 3 },
];
const cle = (c, ua) => `${c}|${ua}`;
const calc = (lignes, opts = {}) => {
  const m = new Map(lignes.map((l) => [cle(l.critere_id, l.ua), l]));
  return moyenneCompetencePrim({ criteres, uas: [1], noteDe: (c, ua) => m.get(cle(c, ua)), ...opts });
};
const oral = { critere_id: 'oral', ua: 1, note: 11, points_max: 12 };
const ecrit = { critere_id: 'ecrit', ua: 1, note: 13, points_max: 15 };

test('Oral 11/12 + Écrit 13/15 + Savoir-être 2/3 = 26/30 → 17,33', () => {
  assert.equal(calc([oral, ecrit, { critere_id: 'savoir_etre', ua: 1, note: 2, points_max: 3 }]), 17.33);
});
test('Savoir-être déclaré absent : hors total → 24/27 → 17,78', () => {
  assert.equal(calc([oral, ecrit, { critere_id: 'savoir_etre', ua: 1, note: null, statut: 'absent', points_max: 3 }]), 17.78);
});
test('Pratique jamais saisie : ne compte pas comme 0 ; « zéro si manquante » la compte', () => {
  const l = [oral, ecrit, { critere_id: 'savoir_etre', ua: 1, note: 2, points_max: 3 }];
  assert.equal(calc(l), 17.33);
  assert.equal(calc(l, { zeroSiManquante: true }), 10.4);   // 26/50 = 52 % → 10,4
});
test('règle « en points » : cellules brutes ΣT×20÷ΣS', () => {
  const cellulesOut = [];
  calc([oral, ecrit, { critere_id: 'savoir_etre', ua: 1, note: 2, points_max: 3 }], { cellulesOut });
  assert.deepEqual(cellulesOut, [{ achieved: 26, possible: 30 }]);
  assert.equal(moyenneGeneralePrim({ cellules: cellulesOut, moyennePoints: true }), 17.33);
  assert.equal(moyenneGeneralePrim({ lignes: [{ moyenne: 17.33, coef: 1 }], moyennePoints: false }), 17.33);
});
test('GARDE : écran Bulletins et rapports de classe passent par la même fonction', () => {
  const lire = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(lire('../pages/Bulletins.jsx'), /moyenneCompetencePrim/);
  assert.match(lire('../pages/Bulletins.jsx'), /moyenneGeneralePrim/);
  assert.match(lire('../lib/classReportEngine.js'), /moyenneCompetencePrim/);
  assert.match(lire('../lib/classReportEngine.js'), /moyenneGeneralePrim/);
  // plus de seconde copie du calcul de moyenne par compétence
  assert.doesNotMatch(lire('../pages/Bulletins.jsx'), /avgPct = pcts\.reduce/);
});
