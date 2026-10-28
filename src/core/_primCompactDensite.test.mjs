// L'estimateur de hauteur du bulletin primaire compact, confronté aux hauteurs
// RÉELLEMENT MESURÉES par `scripts/print-capacity-bulletin.mjs`.
//
// POURQUOI CE TEST EXISTE. Un estimateur calibré une fois puis laissé seul
// dérive : on touche un rembourrage, une taille de police, et il continue
// d'annoncer que le carnet tient alors qu'il déborde. Les chiffres ci-dessous
// sont des RELEVÉS, pas des intentions — ils viennent du banc de mesure, qui
// rend le composant réel dans Chrome à la géométrie d'impression du profil
// « bulletin » (A4 portrait, marge 8 mm, zone utile 733 × 1062 px).
//
// Si ce test tombe après un changement de gabarit, ce n'est PAS lui qu'il faut
// ajuster : il faut relancer le banc et reporter les nouvelles mesures.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/print-capacity-bulletin.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_UTILE_PX, PLANCHER_FIT, HAUTEUR_MAX_PX, COUTS, GAINS_DENSE,
  hauteurEstimee, gainDense, densiteRequise, diagnostic,
} from './primCompactDensite.js';

// Le carnet COMPLET de THE GENIUS : six regroupements, matières
// complémentaires, légende, mention provisoire, appréciation, mentions, stats
// et répartition. C'est la composition la plus lourde que le produit imprime.
const complet = (lignes) => ({
  lignes, groupes: 6, additional: 2,
  legende: true, provisoire: true, appreciation: true,
  mentions: true, stats: true, repartition: true,
});

// Le carnet NU : aucun bloc facultatif, pas même les regroupements.
const nu = (lignes) => ({ lignes, groupes: 0, additional: 0 });

// ── 1. La géométrie ────────────────────────────────────────────────────────
test('la zone utile et le plancher décrivent bien le profil « bulletin »', () => {
  assert.equal(PAGE_UTILE_PX, 1062, 'A4 portrait moins 2 × 8 mm de marge, en px à 96 ppp');
  assert.equal(PLANCHER_FIT, 0.86, 'doit suivre MIN_FIT_SCALE de fitLiveSheets');
  // 1062 / 0,86 = 1234,8… → au-delà, l'auto-ajustement renonce.
  assert.equal(HAUTEUR_MAX_PX, 1234);
});

// ── 2. L'estimateur contre les hauteurs MESURÉES ───────────────────────────
//
// Relevé du banc, disposition AÉRÉE (celle d'avant le mode dense) :
//     11 → 1111 px   14 → 1162 px   17 → 1214 px   19 → 1248 px   22 → 1299 px
// et le carnet nu à 11 compétences → 747 px.
const MESURES_AERE = [[11, 1111], [14, 1162], [17, 1214], [19, 1248], [22, 1299]];

test('l’estimation colle aux hauteurs mesurées, à 20 px près', () => {
  for (const [lignes, mesure] of MESURES_AERE) {
    const estime = hauteurEstimee(complet(lignes));
    const ecart = estime - mesure;
    assert.ok(
      Math.abs(ecart) <= 20,
      `${lignes} compétences : estimé ${estime}, mesuré ${mesure} (écart ${ecart})`,
    );
    // L'écart doit pencher du bon côté : SUR-estimer fait densifier un peu tôt,
    // ce qui est sans conséquence ; SOUS-estimer laisse déborder.
    assert.ok(ecart >= 0, `${lignes} compétences : l’estimation ne doit pas sous-estimer`);
  }
});

test('le carnet nu est estimé juste, lui aussi', () => {
  const estime = hauteurEstimee(nu(11));
  assert.ok(Math.abs(estime - 747) <= 20, `estimé ${estime}, mesuré 747`);
});

test('chaque ligne ajoutée coûte ce qui a été mesuré', () => {
  // (1299 − 1111) / 11 = 17,09 px par compétence.
  const d = hauteurEstimee(complet(22)) - hauteurEstimee(complet(11));
  assert.ok(Math.abs(d - 188) <= 6, `11 lignes de plus devraient coûter ~188 px, estimé ${d}`);
  assert.equal(COUTS.ligne, 17.1);
});

// ── 3. La décision ────────────────────────────────────────────────────────
test('le carnet nu reste AÉRÉ : il tient à taille réelle', () => {
  assert.equal(densiteRequise(nu(11)), false);
  assert.equal(densiteRequise(nu(14)), false);
});

test('le carnet complet passe en DENSE dès onze compétences', () => {
  // Mesuré : 1111 px pour 1062 px de page. Il tenait grâce à une réduction à
  // 0,955 — donc en rapetissant les notes. En dense il tient à pleine taille.
  for (const [lignes] of MESURES_AERE) {
    assert.equal(densiteRequise(complet(lignes)), true, `${lignes} compétences`);
  }
});

test('une composition vide ou absurde ne fait pas tomber le calcul', () => {
  assert.equal(hauteurEstimee(), COUTS.socle);
  assert.equal(hauteurEstimee({}), COUTS.socle);
  assert.equal(hauteurEstimee({ lignes: null, groupes: undefined }), COUTS.socle);
  assert.equal(hauteurEstimee({ lignes: 'douze' }), COUTS.socle);
  assert.equal(densiteRequise(), false);
  assert.equal(densiteRequise(null), false);
});

// ── 4. Le gain du mode dense, tel qu'il a été mesuré ──────────────────────
//
// Décomposition relevée à 22 compétences, avant → après :
//   en-tête 144 → 86 · bandeaux 49 → 20 · identité 110 → 78
//   signatures 105 → 73 · rembourrage 8 → 0          = 159 px de base
//   répartition 52 → 35 (17) · provisoire 32 → 28 (4)
test('le gain dense dépend de la composition, et vaut 182 px au minimum', () => {
  assert.equal(gainDense(nu(11)), 182);
  assert.equal(gainDense(complet(22)), 182 + 17 + 4);
  assert.equal(GAINS_DENSE.base, 182);
});

test('le gain annoncé est EXACTEMENT celui qui a été mesuré', () => {
  // Carnet complet : 1299 → 1096 px, soit 203 px. C'est le chiffre du banc.
  assert.equal(gainDense(complet(22)), 203);
});

// ── 5. Le résultat : le carnet tient sur UNE page ────────────────────────
//
// Mesuré APRÈS le mode dense, par le banc :
//   11 → 907 px (tient)    17 → 1010 px (tient)    19 → 1045 px (tient)
//   22 → 1096 px (0,969)   26 → 1165 px (0,911)    30 → 1233 px (0,861)
//
// 30 compétences est donc la dernière qui passe RÉELLEMENT (1233 ≤ 1234).
// L'estimateur, lui, s'arrête à 28 : il sur-estime la hauteur de ~16 px (marges
// qui se fusionnent, qu'il ne modélise pas). On assure donc 28, et on ne lui
// fait pas promettre 30 qu'il ne sait pas prouver. Dans le pire des cas il
// annoncera un débordement pour un carnet de 29 ou 30 lignes qui tenait — un
// avertissement de trop, jamais un bulletin coupé.
test('le carnet complet tient sur une page jusqu’à 28 compétences', () => {
  for (const lignes of [11, 14, 17, 19, 22, 24, 26, 28]) {
    const d = diagnostic(complet(lignes));
    assert.equal(d.dense, true, `${lignes} compétences : devrait être dense`);
    assert.equal(d.tientEnDense, true, `${lignes} compétences : devrait tenir`);
    assert.equal(d.debordeDe, 0);
  }
});

test('au-delà, on le DIT plutôt que de le laisser découvrir à l’imprimante', () => {
  // Le diagnostic doit rendre un dépassement CHIFFRÉ : c'est ce qui permet à
  // l'écran d'annoncer « il manque tant », au lieu d'un échec muet.
  const d = diagnostic(complet(40));
  assert.equal(d.tientEnDense, false);
  assert.ok(d.debordeDe > 0, 'le dépassement doit être chiffré');
});

test('la disposition dense est TOUJOURS plus courte que l’aérée', () => {
  for (const c of [nu(11), nu(25), complet(11), complet(22), complet(40)]) {
    const d = diagnostic(c);
    assert.ok(d.hauteurDense < d.hauteur, 'dense doit gagner de la hauteur');
    assert.equal(d.hauteur - d.hauteurDense, gainDense(c));
  }
});
