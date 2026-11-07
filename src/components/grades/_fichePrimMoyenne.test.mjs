// FICHE DE NOTES DU PRIMAIRE — plus de Total entre les compétences, mais la
// Moyenne et le Rang en fin de ligne (version « avec les notes »).
//   node src/components/grades/_fichePrimMoyenne.test.mjs
//
// La feuille est construite dans un composant React : on ne peut pas l'importer sous
// Node. On garde donc deux preuves : le TEXTE du composant (ce qu'il construit), et
// le MOTEUR de feuille (ce qu'il imprime d'une colonne calculée selon le mode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construireFeuille } from '../../core/feuilleNotes.js';

const src = readFileSync(new URL('./PrimCompetenceWorkspace.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('plus aucune colonne « Total » ajoutée à chaque compétence', () => {
  assert.ok(!/\|__total/.test(src), 'la colonne `<compétence>|__total` ne doit plus exister');
  assert.ok(!/colonnes\.push\(\{[^}]*label: t\('Total'/.test(src), 'plus de push d\'une colonne Total par compétence');
});

test('une synthèse en fin de feuille : Moyenne et Rang, colonnes calculées', () => {
  assert.match(src, /id: '__synthese\|__moy'[^}]*calculee: true/);
  assert.match(src, /id: '__synthese\|__rang'[^}]*calculee: true/);
  assert.match(src, /id: '__synthese',/, 'un seul groupe de synthèse');
});

test('la moyenne et le rang viennent du MÊME calcul que le bulletin et le PV', () => {
  assert.match(src, /usePvBuilder\(pvClasses\)/);
  assert.match(src, /pvForClass\(selectedClass, `s\$\{ua\}`\)/, 'le PV de CETTE UA');
  assert.match(src, /rang: r\.rank \? String\(r\.rankTxt \|\| r\.rank\)\.split\(' \/ '\)\[0\] : ''/, 'le rang « 3e / 8 » devient « 3e »');
  assert.match(src, /if \(compId === '__synthese'\)/, 'la valeur de la synthèse est servie à la feuille');
});

test('le moteur imprime la synthèse sur la feuille remplie, et la laisse vide sur la vierge', () => {
  const groupes = [
    { id: '1a', label: '1a — Lire', colonnes: [{ id: '1a|o', label: 'Oral', bareme: 10 }, { id: '1a|e', label: 'Écrit', bareme: 10 }] },
    { id: '__synthese', label: 'Synthèse', colonnes: [
      { id: '__synthese|__moy', label: 'Moyenne /10', calculee: true },
      { id: '__synthese|__rang', label: 'Rang', calculee: true },
    ] },
  ];
  const eleves = [{ id: 'e1', numero: 1, nom: 'A' }];
  const valeur = (e, c) => ({ '1a|o': '8', '1a|e': '7', '__synthese|__moy': '7.5', '__synthese|__rang': '2e' }[c] ?? '');
  const rempli = construireFeuille({ groupes, eleves, vierge: false, valeur, maxColonnes: 10, maxLignes: 10 });
  const cell = rempli.pages[0].lignes[0].cellules;
  assert.equal(cell['__synthese|__moy'], '7.5');
  assert.equal(cell['__synthese|__rang'], '2e');
  assert.ok(!Object.keys(cell).some((k) => k.endsWith('|__total')), 'aucun total par compétence');
  const vierge = construireFeuille({ groupes, eleves, vierge: true, valeur, maxColonnes: 10, maxLignes: 10 });
  assert.deepEqual(vierge.pages[0].lignes[0].cellules, {}, 'la feuille vierge reste vierge');
});
