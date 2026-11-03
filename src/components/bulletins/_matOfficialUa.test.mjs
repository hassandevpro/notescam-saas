// LE BULLETIN DE MATERNELLE MONTRE LA PÉRIODE DEMANDÉE, ET SON APPRÉCIATION.
//
// Deux défauts constatés à l'écran le 2026-11-02, tous deux silencieux :
//
//   1. Choisir « UA 1 » sortait un bulletin couvrant UA1, UA2 ET UA3 : l'écran
//      des bulletins redérivait les UA du trimestre (`uasDuTrimestre(seqs[0])`)
//      au lieu de lire `period.uas`. Une enseignante qui tirait le bulletin
//      d'une seule unité recevait trois colonnes dont deux vides.
//   2. La ligne « Appréciation générale de l'enseignant(e) : » s'imprimait vide
//      sur TOUS les bulletins de maternelle — la prop n'était jamais passée.
//
// Le premier défaut se corrige dans `Bulletins.jsx` ; ce test couvre la part qui
// vit dans le GABARIT : une seule UA ne doit pas produire une colonne d'UA
// doublée par une colonne « Synthèse » portant la même cote.
//
// On rend le composant RÉEL (react-dom/server) : relire le source ne prouverait
// rien sur ce qui s'imprime.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs src/components/bulletins/_matOfficialUa.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');

globalThis.__VITE_ENV__ = {};

const SRC = new URL('../../', import.meta.url).href;
const { default: BulletinMatOfficial } = await import(`${SRC}components/bulletins/BulletinMatOfficial.jsx`);

const school  = { id: 's', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', country_code: 'cameroon', current_year: '2026-2027' };
const student = { id: 'e', name: 'ABDOUL AZIZ ALKASSOUM', matricule: 'N-1' };

// Trois domaines, cotés sur UA1 seulement : c'est le cas réel d'un trimestre
// commencé — UA2 et UA3 ne sont pas encore observées.
const ROWS_UA1 = [
  { code: 'D1', intitule: 'Langage',  parUa: { 1: 'A' },   niveau: 'A',   observation: 'S’exprime bien.' },
  { code: 'D2', intitule: 'Motricité', parUa: { 1: 'ECA' }, niveau: 'ECA', observation: '' },
  { code: 'D3', intitule: 'Graphisme', parUa: { 1: 'NA' },  niveau: 'NA',  observation: '' },
];

const rendu = (extra) => renderToStaticMarkup(createElement(BulletinMatOfficial, {
  school, student, sys: 'FR', classLabel: 'Nursery 1', effectif: 12,
  profPrincipal: 'KONGYUY DELPHINE', rows: ROWS_UA1,
  ...extra,
}));

/** Le TEXTE du rendu, balises retirées et espaces normalisés. */
const texte = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

/** Le nombre de colonnes de l'en-tête du tableau.
 *  `/<th/` matcherait aussi `<thead` — d'où la classe de caractères. */
const nbColonnes = (html) => {
  const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
  return (thead.match(/<th[\s>]/g) || []).length;
};

// ── 1. UNE SEULE UA : pas de colonne d'UA, pas de « Synthèse » ───────────────
test('une seule UA ne produit ni colonne d’UA ni colonne Synthèse', () => {
  const html = rendu({ uas: [1], title: "BULLETIN DE L'UA1 — MATERNELLE" });
  const txt  = texte(html);

  assert.ok(!/\bUA1\b/.test(txt.replace(/BULLETIN DE L'UA1[^·]*/, '')),
    'aucune colonne intitulée UA1 en dehors du titre');
  assert.ok(!txt.includes('Synthèse'),
    'pas de colonne « Synthèse » : la synthèse d’une seule UA est cette UA');
  assert.ok(txt.includes('Niveau'),
    'la mise en page classique revient, avec sa colonne « Niveau »');
  // N° · DOMAINES · Niveau · Observations = 4 colonnes, celles d'avant les UA.
  assert.equal(nbColonnes(html), 4, 'quatre colonnes, comme le gabarit d’origine');
});

// ── 2. Le titre de l'UA est bien celui qu'on imprime ────────────────────────
test('le titre passé est rendu tel quel', () => {
  const txt = texte(rendu({ uas: [1], title: "BULLETIN DE L'UA1 — MATERNELLE" }));
  assert.ok(txt.includes("BULLETIN DE L'UA1"),
    'le document dit de quelle UA il s’agit — c’est lui qui distingue les trois bulletins d’un trimestre');
  assert.ok(!txt.includes('TRIMESTRE'),
    'un bulletin d’UA ne s’annonce pas comme un bulletin de trimestre');
});

// ── 3. UN TRIMESTRE : les trois UA et la synthèse, inchangé ─────────────────
test('un trimestre garde ses colonnes d’UA et sa synthèse', () => {
  const html = rendu({ uas: [1, 2, 3], title: 'BULLETIN DU PREMIER TRIMESTRE — MATERNELLE' });
  const txt  = texte(html);
  assert.ok(txt.includes('UA1') && txt.includes('UA2') && txt.includes('UA3'),
    'les trois unités du trimestre sont en colonnes');
  assert.ok(txt.includes('Synthèse'), 'la synthèse du trimestre reste');
  // N° · DOMAINES · UA1 · UA2 · UA3 · Synthèse · Observations = 7
  assert.equal(nbColonnes(html), 7, 'sept colonnes pour un trimestre de trois UA');
});

// ── 4. L'APPRÉCIATION GÉNÉRALE s'imprime quand on la donne ──────────────────
test('l’appréciation générale est imprimée', () => {
  const txt = texte(rendu({ uas: [1], appreciation: 'Enfant curieuse et appliquée.' }));
  assert.ok(txt.includes("Appréciation générale de l'enseignant(e)"),
    'la ligne du bulletin est bien là');
  assert.ok(txt.includes('Enfant curieuse et appliquée.'),
    'et elle porte le texte saisi — c’est ce qui manquait sur tous les bulletins');
});

test('sans appréciation, la ligne reste mais rien n’est inventé', () => {
  const txt = texte(rendu({ uas: [1] }));
  assert.ok(txt.includes("Appréciation générale de l'enseignant(e)"), 'la ligne subsiste');
  assert.ok(!/undefined|null|NaN/.test(txt), 'aucun « undefined » imprimé');
});

// ── 5. Les cotes données sont rendues, et pas d'autres ──────────────────────
test('les cotes affichées sont celles fournies', () => {
  const txt = texte(rendu({ uas: [1] }));
  assert.ok(txt.includes('Langage') && txt.includes('Motricité') && txt.includes('Graphisme'),
    'les trois domaines sont là');
  assert.ok(txt.includes('S’exprime bien.'), 'l’observation du domaine est rendue');
  assert.ok(!/undefined|NaN/.test(txt), 'aucune valeur parasite');
});
