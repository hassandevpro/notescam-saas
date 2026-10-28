// Le bulletin primaire compact doit tenir sur UNE page. Ce module décide s'il
// faut passer le gabarit en disposition DENSE pour y arriver.
//
// Moteur PUR : aucun DOM, aucun store → testable sous Node.
//
// ── POURQUOI UNE DÉCISION, ET PAS SIMPLEMENT L'AUTO-AJUSTEMENT ─────────────
//
// `lib/print/fitLiveSheets.js` réduit déjà chaque feuille à l'impression, mais
// refuse de descendre sous `MIN_FIT_SCALE` (0,86) : en dessous le carnet devient
// illisible, et il coule alors sur une seconde page presque vide. Une école qui
// imprime 300 bulletins y perd 300 feuilles.
//
// MESURÉ (scripts/print-capacity-bulletin.mjs, profil « bulletin » A4 portrait
// marge 8 mm — zone utile 733 × 1062 px), carnet COMPLET de THE GENIUS :
//
//     compétences   hauteur    facteur nécessaire
//        11         1111 px        0,955   tient
//        14         1162 px        0,913   tient
//        17         1214 px        0,874   tient, de justesse
//        19         1248 px        0,851   DÉBORDE
//        22         1299 px        0,818   DÉBORDE
//
// Le basculement se situe donc entre 17 et 19 compétences — et c'est exactement
// le cas des classes bilingues, qui portent deux blocs de langue, et des écoles
// qui ajoutent leurs lignes maison (CHINESE, Practical Work, ICT…).
//
// ── POURQUOI UNE ESTIMATION PLUTÔT QU'UN SEUIL DE LIGNES ───────────────────
//
// Un seuil fixe (« dense au-delà de 18 lignes ») resserrerait pour rien un
// bulletin de 20 lignes SANS blocs facultatifs, qui tient très bien, et
// laisserait déborder un bulletin de 16 lignes QUI LES PORTE TOUS. Ce n'est pas
// le nombre de lignes qui décide, c'est la hauteur — donc on l'estime, à partir
// du coût mesuré de chaque bloc.
//
// L'estimation n'a pas besoin d'être exacte : elle doit seulement classer du bon
// côté du plancher. `_primCompactDensite.test.mjs` la confronte aux hauteurs
// relevées ci-dessus, et le banc de mesure reste la référence.

/** Zone utile d'une page du profil « bulletin », en px (A4 portrait, marge 8 mm). */
export const PAGE_UTILE_PX = 1062;

/** Plancher de lisibilité de l'auto-ajustement — doit suivre `MIN_FIT_SCALE`. */
export const PLANCHER_FIT = 0.86;

/**
 * Hauteur au-delà de laquelle l'auto-ajustement renonce et le bulletin coule
 * sur une 2e page : 1062 / 0,86 ≈ 1234 px.
 */
export const HAUTEUR_MAX_PX = Math.floor(PAGE_UTILE_PX / PLANCHER_FIT);

// ── COÛTS MESURÉS, en px, à 9 pt ────────────────────────────────────────────
// Relevés un à un par le banc (« ce que coûte chaque bloc facultatif »), en
// partant du carnet NU à 11 compétences (747 px).
export const COUTS = {
  // Tout ce qui est là quoi qu'il arrive : en-tête officiel (144), bandeau de
  // titre (29) et de période (20), bandeau d'identité (110), tableau de
  // synthèse (115), signatures (105), rembourrage et interstices. On en retire
  // les 11 lignes de compétences du relevé nu pour isoler le socle.
  socle: 559,
  ligne: 17.1,          // une compétence, ou une ligne maison
  groupe: 19,           // un bandeau de regroupement (jusqu'à 6, ou plus)
  legende: 16,          // l'échelle des cotes
  provisoire: 36,       // la mention « bulletin provisoire »
  appreciation: 32,     // la ligne appréciation + décision
  mentions: 17,         // travail académique
  stats: 32,            // stats de performance
  repartition: 57,      // « Autres statistiques » (3 lignes)
  additionalBase: 38,   // l'en-tête du tableau des matières complémentaires
  additionalLigne: 19,  // chacune de ses lignes
};

/**
 * Hauteur estimée du bulletin, en px, à la géométrie d'impression.
 *
 * @param {object} c  composition du bulletin
 * @param {number} c.lignes        compétences + lignes maison du tableau principal
 * @param {number} c.groupes       bandeaux de regroupement affichés
 * @param {number} c.additional    matières complémentaires
 * @param {boolean} c.legende|c.provisoire|c.appreciation|c.mentions|c.stats|c.repartition
 */
export function hauteurEstimee(composition = {}) {
  // `= {}` ne couvre PAS un `null` explicite, et un appelant qui n'a pas encore
  // chargé son référentiel en passe un. On ne laisse pas une mise en page
  // échouer sur une lecture de propriété.
  const c = composition || {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  let h = COUTS.socle;
  h += n(c.lignes) * COUTS.ligne;
  h += n(c.groupes) * COUTS.groupe;
  if (n(c.additional) > 0) h += COUTS.additionalBase + n(c.additional) * COUTS.additionalLigne;
  for (const k of ['legende', 'provisoire', 'appreciation', 'mentions', 'stats', 'repartition']) {
    if (c[k]) h += COUTS[k];
  }
  return Math.round(h);
}

// ── CE QUE LA DISPOSITION DENSE FAIT GAGNER, en px ──────────────────────────
//
// RELEVÉ, pas estimé : décomposition du carnet complet à 22 compétences, avant
// et après (`scripts/print-capacity-bulletin.mjs`, section « décomposition »).
//
//                                      normal   dense   gain
//   en-tête officiel (logo, interlignes)  144      86     58
//   bandeaux titre + période fondus        49      20     29
//   bandeau d'identité (photo, lignes)    110      78     32
//   cases de signature (92 px → 58 px)    105      73     32
//   rembourrage vertical de la feuille      8       0      8
//   interstices et case d'observations      —       —     23
//   ────────────────────────────────────────────────── base  182
//   « Autres statistiques » sans son titre 52      35     17
//   mention « provisoire » resserrée       32      28      4
//                                              total    203
//
// Les 23 px d'« interstices » sont le reste : les `marginTop` ramenés de 4 à 2
// aux quatre tables, de 6 à 3 et de 5 à 3, et la case d'observations de 26 à
// 16 px. Ils sont TOUJOURS là, donc ils appartiennent à la base — les avoir
// oubliés faisait annoncer un débordement à 28 compétences alors que le banc
// mesurait 1199 px, soit une page.
//
// Le gain DÉPEND de la composition : un bulletin sans « Autres statistiques »
// ne gagne pas ses 17 px. On le calcule plutôt que de retenir partout le total
// du carnet complet, qui serait optimiste ailleurs.
export const GAINS_DENSE = {
  base: 182,          // en-tête, bandeaux, identité, signatures, interstices
  repartition: 17,
  provisoire: 4,
};

/** Ce que la disposition dense fait gagner pour CETTE composition, en px. */
export function gainDense(composition = {}) {
  const c = composition || {};
  let g = GAINS_DENSE.base;
  if (c.repartition) g += GAINS_DENSE.repartition;
  if (c.provisoire) g += GAINS_DENSE.provisoire;
  return g;
}

/**
 * Faut-il passer en disposition dense ?
 *
 * ── LE SEUIL EST LA PAGE PLEINE, PAS LE PLANCHER DE L'AUTO-AJUSTEMENT ──────
 *
 * On pourrait n'intervenir qu'au bord du gouffre, quand la feuille va vraiment
 * couler sur une 2e page (> HAUTEUR_MAX_PX). Ce serait un mauvais calcul, pour
 * une raison de LISIBILITÉ et non de place :
 *
 *   • l'auto-ajustement réduit la feuille ENTIÈRE — les notes, les barèmes et
 *     les cotes rétrécissent avec le décor ;
 *   • la disposition dense ne touche QUE le décor — en-tête, bandeaux, photo,
 *     cases de signature. Le tableau des notes garde sa taille réelle.
 *
 * Un carnet dense à l'échelle 1 est donc PLUS lisible que le même carnet aéré
 * réduit à 0,87. Mesuré : 17 compétences en aéré tombaient à 0,874 ; les mêmes
 * en dense tiennent à pleine taille.
 *
 * Règle retenue, donc : dense dès que la mise en page aérée ne tient plus à
 * taille réelle. En deçà, l'aéré est conservé — c'est la mise en page que
 * l'école préfère, et elle tient.
 *
 * @returns {boolean}
 */
export function densiteRequise(composition = {}) {
  return hauteurEstimee(composition) > PAGE_UTILE_PX;
}

/**
 * Diagnostic complet, pour l'écran et pour les tests : on expose le détail
 * plutôt qu'un simple booléen, parce qu'un bulletin qui déborde MALGRÉ le mode
 * dense doit pouvoir le dire à l'école, avec le chiffre.
 *
 * @returns {{ hauteur, hauteurDense, dense, tientEnDense, debordeDe }}
 *   `debordeDe` = px encore en trop en mode dense (0 s'il tient).
 */
export function diagnostic(composition = {}) {
  const hauteur = hauteurEstimee(composition);
  const hauteurDense = Math.max(0, hauteur - gainDense(composition));
  const dense = hauteur > PAGE_UTILE_PX;
  const retenue = dense ? hauteurDense : hauteur;
  return {
    hauteur,
    hauteurDense,
    dense,
    tientEnDense: retenue <= HAUTEUR_MAX_PX,
    debordeDe: Math.max(0, retenue - HAUTEUR_MAX_PX),
  };
}
