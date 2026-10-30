// LES DEUX DISPOSITIONS DU PRIMAIRE PORTENT LE MÊME CONTRAT DE DENSITÉ.
//
// Ce que ce test verrouille, et pourquoi il existe.
//
// Le contrat de densité (`src/lib/print/fitDensity.js`) ne sait ajuster qu'une
// feuille qui porte la classe `nc-densite` et dont les tailles sont des
// variables `--nc-*`. Il avait été posé sur la seule disposition COMPACTE.
// Or « Auto » ne choisit celle-ci que pour une période d'UNE unité
// d'apprentissage : dès qu'une école imprimait un trimestre ou l'année, c'est
// la disposition DÉTAILLÉE qui rendait — sans une seule variable. L'ajustement
// ne trouvait alors aucune feuille à mesurer, ne réduisait rien, et le carnet
// débordait. Personne ne le voyait : l'écran allait bien, les bancs d'essai ne
// testaient que le gabarit compact, et le bilan d'impression était vert.
//
// Mesuré dans l'application elle-même (édition LAN, Chrome, Trimestre 1 et
// Annuel) : 3 pages par élève, la console disant « aucune feuille
// .bulletin-paper.nc-densite ». Après correction : la recherche s'exécute, la
// feuille descend jusqu'au plancher lisible, et le bulletin le DIT quand il ne
// tient toujours pas — il n'écrase plus le texte en silence.
//
// On rend le composant RÉEL : vérifier une copie écrite à la main ne prouverait
// rien sur ce qui s'imprime.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_primDetailDensite.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');

globalThis.__VITE_ENV__ = {};

const { default: BulletinPrimAnnualUA } = await import('./BulletinPrimAnnualUA.jsx');

const school = { name: 'ECOLE PRIMAIRE BILINGUE', director: 'Mme NGO BALEPA' };
const student = { name: 'ABOUDI NGONO Sarah', matricule: '26-CM2-001' };

const criteres = [
  { id: 'oral', nom: 'Oral', points_max: 10 },
  { id: 'ecrit', nom: 'Écrit', points_max: 20 },
  { id: 'pratique', nom: 'Pratique', points_max: 5 },
  { id: 'savoir_etre', nom: 'Savoir-être', points_max: 5 },
];

const ligne = (code, intitule) => ({
  code,
  intitule,
  criteres,
  uas: [1, 2, 3].map((ua) => ({
    ua,
    trimestre: 1,
    notesByCritere: { oral: 8, ecrit: 14, pratique: 4, savoir_etre: 4 },
    baremes: { oral: 10, ecrit: 20, pratique: 5, savoir_etre: 5 },
    achieved: 30,
    possible: 40,
    cote: 'A',
  })),
  totalAchieved: 30,
  totalPossible: 40,
  totalCote: 'A',
});

const rendu = () => renderToStaticMarkup(createElement(BulletinPrimAnnualUA, {
  school,
  sys: 'FR',
  title: 'BULLETIN DU PREMIER TRIMESTRE — PRIMAIRE APC',
  student,
  classLabel: 'CM2 A',
  effectif: 8,
  profPrincipal: 'KONGYUY DELPHINE',
  competenceRows: [
    ligne('1A', 'Communiquer en français'),
    ligne('2A', 'Utiliser les notions de base en mathématiques'),
  ],
  moyenneGenerale: 15.2,
  coteGenerale: 'A',
  rang: 2,
  classStats: { avg: 13.1, min: 7.4, max: 17.2, rate: 75 },
  appreciation: 'Bon trimestre.',
  mentions: { avertissement: 'non', tableauHonneur: 'oui', encouragement: 'non' },
  repartition: [{ label: '[10-11.99]', n: 3 }],
  groupes: true,
}));

test('la feuille demande le contrat de densité', () => {
  const html = rendu();
  assert.match(html, /class="[^"]*\bnc-densite\b/,
    'sans la classe `nc-densite`, ajusterDensite ne voit pas la feuille et n\'ajuste rien');
});

test('le corps du bulletin est dimensionné par la variable, pas par un nombre', () => {
  const html = rendu();
  assert.match(html, /--nc-body/, 'la taille du corps doit venir de --nc-body');
  assert.match(html, /--nc-gap/, 'les espacements doivent venir de --nc-gap');
  assert.match(html, /--nc-sign/, 'le cadre des signatures est une zone libre : --nc-sign');
  assert.match(html, /--nc-observ/, "la zone d'appréciation est une zone libre : --nc-observ");
});

test('aucune taille de police figée ne subsiste dans la feuille', () => {
  const html = rendu();
  // `font-size:9pt` ou `font-size:8px` écrits en dur rendraient la recherche
  // de densité partiellement inopérante : la feuille ne suivrait plus `--nc-d`.
  const figees = [...html.matchAll(/font-size:\s*([0-9.]+)(pt|px)/g)].map((m) => m[0]);
  assert.deepEqual(figees, [],
    `tailles figées trouvées : ${figees.join(', ')}`);
});

test('ce que l\'école a saisi est affiché tel quel, rien n\'est déduit', () => {
  const html = rendu();
  assert.match(html, /ABOUDI NGONO Sarah/);
  assert.match(html, /15\.2/, 'la moyenne générale vient des props');
  assert.match(html, /2 \/ 8/, 'le rang vient des props');
  assert.match(html, /Bon trimestre\./);
});
