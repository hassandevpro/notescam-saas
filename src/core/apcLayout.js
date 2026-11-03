// Planificateur de mise en page du bulletin APC (premier cycle) — moteur d'AUTO-FIT.
//
// Objectif : tenir le bulletin sur UNE page A4, jusqu'à 14 matières.
//
// ── CHANGEMENT DE CIBLE DU 2026-11-02 ────────────────────────────────────────
// Ce module visait « 2 pages maximum, jamais sous 10 pt ». Demande du
// responsable : UNE page, quitte à descendre à 6,5 pt. Deux choses ont changé.
//
// 1. LA CIBLE. L'ancien `planApcLayout` parcourait les densités de la plus
//    grande police à la plus petite et retenait LA PREMIÈRE qui tenait en
//    « ≤ 2 pages ». Il sortait donc 2 pages à 11 pt sans jamais essayer 1 page à
//    8 pt : l'ordre des essais rendait la page unique inatteignable. On fait
//    maintenant DEUX passes — toutes les densités pour UNE page d'abord, puis le
//    repli 2 pages. C'est la seule façon d'obtenir « la plus grande police qui
//    tient sur une page » et non « la plus grande police tout court ».
//
// 2. LE PLANCHER. 6,5 pt au lieu de 10 pt (cf. `PT_PLANCHER`), atteint par
//    paliers : on ne descend d'un palier que si le précédent ne tient pas.
//    Au-dessous, on ne rogne plus — on reprend 2 pages, puis autant qu'il faut.
//    Un bulletin à 5 pt ne se lit pas ; une 2e page, oui.
//
// Algorithme (deux dimensions d'adaptation, jamais la police sous 10pt) :
//   1) Estimer, pour une DENSITÉ donnée (taille de police + interligne + padding),
//      la hauteur de chaque ligne de compétence (avec retour à la ligne) et les
//      hauteurs « fixes » (en-tête, identité, en-tête de colonnes, pied, n° de page).
//   2) Essayer une liste de densités, de la plus AÉRÉE (11pt) à la plus COMPACTE
//      (10pt + interligne/padding resserrés), et retenir la PREMIÈRE qui fait tenir
//      le bulletin sur 2 pages (pied compris). On préfère donc la plus grande police,
//      puis — si besoin — on RESSERRE l'espacement (section 8) plutôt que de réduire
//      la police : aucune densité ne descend sous 10pt.
//   3) Répartir les matières sur les pages : matière entière tant que possible ;
//      report sur la page suivante avant toute coupure ; coupure au niveau compétence
//      seulement en dernier recours (en-tête de colonnes répété + « (suite) »).
//   4) Équilibrer les 2 pages (blanc résiduel égal) pour éviter « 80 % / 20 % ».
//   5) Si même la densité la plus compacte dépasse 2 pages, on RESTE à 10pt et on
//      produit le nombre de pages nécessaire (best-effort — lisibilité avant densité).
//
// Pur (pas de React/DOM) : testable et réutilisable par le rendu écran/PDF.

// Géométrie de page : LUE DANS LE SOCLE D'IMPRESSION, jamais redéclarée ici.
// L'auto-fit raisonne sur la surface réellement imprimable ; si la marge du
// profil « bulletin » change, le planificateur s'adapte au lieu de mentir.
import { pageMetrics } from '../lib/print/printStyles';
// LE PLANCHER DU FILET DE ZOOM, lu lui aussi dans le socle. Le planificateur
// n'est pas le dernier recours : avant d'imprimer, `fitLiveSheets` mesure la
// feuille RENDUE et la réduit par `--nc-fit` jusqu'à MIN_FIT_SCALE. Une page
// estimée à 1,16 fois la hauteur utile tient donc RÉELLEMENT, à 0,86 de zoom.
// Ignorer ce filet, c'était envoyer en deux feuilles des bulletins qui tenaient
// sur une — mesuré le 2026-11-02 à 30 lignes de compétence (banc
// `scripts/apc-plafond-lignes.mjs`).
import { MIN_FIT_SCALE } from '../lib/print/fitLiveSheets.js';

const PAGE = pageMetrics('bulletin');
const PAD = 2;                                          // padding interne de la feuille (mm)
// `USABLE_H` est la hauteur utile BRUTE. Les plans multi-pages en reprennent
// une part seulement (cf. MARGE_MULTI) ; le plan d'UNE page, lui, peut la
// remplir entièrement — c'est le filet de zoom qui l'y rattrape.
const USABLE_H = PAGE.contentH - 2 * PAD;               // hauteur utile réelle
const BASE_USABLE_H = USABLE_H;
const TABLE_W  = PAGE.contentW - 2 * PAD;               // largeur utile réelle
// 35 % : la largeur RÉELLEMENT déclarée par FIXED_COLS dans
// BulletinApcOfficial, et désormais TENUE grâce à table-layout: fixed. La
// valeur était restée à 0,42 après le rééquilibrage des colonnes : le
// planificateur estimait donc les intitulés plus courts que le rendu.
const COMP_COL_W = TABLE_W * 0.35;                      // colonne COMPÉTENCES (large)

// Métriques typographiques approchées (mm). La largeur d'un caractère ne dépend que
// de la police ; la hauteur d'une ligne dépend en plus de l'interligne (facteur lhK).
const charWmm = (pt) => pt * 0.180;                    // largeur moyenne d'un caractère
const BASE_LINE = 0.420;                               // mm/pt à interligne de référence (≈1.18)
const BASE_ROWPAD = 1.4;                               // padding vertical d'une ligne (mm) de référence
const lineHmm = (pt, d) => pt * BASE_LINE * d.lhK;     // interligne effectif (compressé par lhK)
const rowPadMm = (d) => BASE_ROWPAD * d.padK;          // padding vertical effectif

// En-tête de colonnes légèrement plus grand que le corps (lisibilité, section 2 :
// « en-têtes 11–12pt » alors que le corps peut descendre à 10pt).
export const apcHeaderPt = (pt) => Math.min(12, pt + 1);

// Hauteurs des blocs « fixes » (mm) — l'interligne et le padding suivent la densité.
// ── BLOCS FIXES : CALIBRÉS SUR LA MESURE, PLUS SUR UN BARÈME ────────────────
// Relevé le 2026-11-02 par `scripts/apc-blocs-mesure.mjs` (composant réel,
// média print, profil « bulletin »), en mode COMPACT :
//   en-tête officiel 28 mm · bandeau titre 7 mm · identité 2 lignes 22 mm
//   en-tête de colonnes 11 mm · trois blocs 48 mm · appréciation 12 mm
//   signatures 18 mm
// Les anciennes formules se trompaient de 8 mm sur l'en-tête de colonnes et de
// 6 mm sur le pied, TOUJOURS dans le sens optimiste : elles promettaient une
// page que Chrome coupait en deux. On majore donc légèrement, et le repli zoom
// du socle (`fitLiveSheets`, plancher 0,86) absorbe le reste.
const header1Mm = (d) => 57 + 2 * (lineHmm(d.pt, d) + 1.2 * d.padK);   // officiel + titre + identité (2 rangs)
const contMm    = (d) => lineHmm(d.pt, d) + 3 * d.padK;                // bandeau de continuation
const theadMm   = (d) => lineHmm(apcHeaderPt(d.pt), d) * 2 + 4.5 * d.padK;
const PAGENUM_MM = 5;
// TOTAL (1 ligne) + le plus haut des trois blocs (9 rangs : Discipline)
// + appréciation (12 mm, fixe) + signatures (18 mm en compact).
const footerMm  = (d) => 12 + 10 * (lineHmm(d.pt, d) + 1.1 * d.padK) + 18 + 20 * d.padK;

const charsPerLine = (pt) => Math.max(10, Math.floor(COMP_COL_W / charWmm(pt)));

/**
 * DEUX LIGNES AU PLUS — c'est désormais une VÉRITÉ, pas une espérance.
 * La cellule porte `.apc-clamp2` (-webkit-line-clamp: 2), donc un intitulé de
 * 200 caractères occupe deux lignes et des points de suspension. Avant ce
 * clamp, l'estimation comptait les lignes « naturelles » et se trompait dans
 * les DEUX sens : trop peu quand la colonne était étranglée par un tableau non
 * fixe (quatre lignes rendues pour deux estimées), trop quand l'intitulé était
 * court. Borner ici, c'est rendre la hauteur d'une ligne PRÉVISIBLE — sans
 * quoi aucune promesse de page unique ne tient.
 */
export const LIGNES_MAX_COMP = 2;
export const apcCompLineCount = (text, pt) =>
  Math.min(LIGNES_MAX_COMP,
    Math.max(1, Math.ceil(String(text || '').length / charsPerLine(pt))));

// La hauteur d'une LIGNE du tableau est celle de sa cellule la plus haute. La
// colonne « MATIÈRES / ENSEIGNANT » porte le nom PUIS l'enseignant, soit deux
// lignes dès qu'un enseignant est saisi : une ligne ne descend donc jamais
// sous deux lignes de texte, quelle que soit la longueur de la compétence.
// L'estimation l'ignorait et sous-évaluait chaque première ligne de matière.
const LIGNES_MIN_RANG = 2;
const compHeight = (c, d) => Math.max(LIGNES_MIN_RANG, apcCompLineCount(c?.intitule, d.pt))
  * lineHmm(d.pt, d) + rowPadMm(d);
// Les compétences SUIVANTES d'une même matière partagent la cellule de matière
// (rowSpan) : elles ne sont pas tenues par ce plancher.
const compHeightSuite = (c, d) => apcCompLineCount(c?.intitule, d.pt) * lineHmm(d.pt, d) + rowPadMm(d);
const compsOf = (m) => (m.competences && m.competences.length ? m.competences : [{ intitule: '' }]);
const matiereHeight = (m, d) => compsOf(m)
  .reduce((a, c, i) => a + (i === 0 ? compHeight(c, d) : compHeightSuite(c, d)), 0);
const totalMatiereHeight = (matieres, d) => (matieres || []).reduce((a, m) => a + matiereHeight(m, d), 0);

/** Plancher de lisibilité, en points. En dessous, on préfère une 2e page. */
export const PT_PLANCHER = 6.5;

// Densités essayées, de la plus aérée à la plus compacte. À chaque palier de
// police on resserre d'abord l'interligne et le rembourrage : une ligne plus
// serrée coûte moins à la lecture qu'un caractère plus petit, donc on épuise
// l'espacement avant de toucher au corps.
const ATTEMPTS = [
  { pt: 11,   lhK: 1.00, padK: 1.00 },
  { pt: 10.5, lhK: 1.00, padK: 1.00 },
  { pt: 10,   lhK: 1.00, padK: 1.00 },
  { pt: 10,   lhK: 0.95, padK: 0.55 },
  { pt: 10,   lhK: 0.90, padK: 0.30 },
  { pt: 9,    lhK: 0.95, padK: 0.55 },
  { pt: 9,    lhK: 0.90, padK: 0.30 },
  { pt: 8.5,  lhK: 0.90, padK: 0.30 },
  { pt: 8,    lhK: 0.90, padK: 0.30 },
  { pt: 7.5,  lhK: 0.90, padK: 0.30 },
  { pt: 7.5,  lhK: 0.86, padK: 0.22 },
  { pt: 7,    lhK: 0.86, padK: 0.22 },
  { pt: PT_PLANCHER, lhK: 0.86, padK: 0.20 },
];

// Paramètres de rendu CSS dérivés d'une densité (consommés par le composant écran).
const cssOf = (d) => ({
  fontPt: d.pt,
  lineH: Math.round(1.18 * d.lhK * 100) / 100,   // interligne CSS (unitless)
  cellPadV: Math.round(d.padK * 100) / 100,      // padding vertical de cellule (px, base 1px)
});

// Marque contFromPrev / contToNext sur les chunks d'une même matière répartis sur
// plusieurs pages (pour afficher « (suite) » et répéter le résumé de la matière).
function markContinuations(pages) {
  const seen = new Map();   // matiereId → dernier chunk rencontré
  for (const page of pages) {
    for (const ch of page) {
      const prev = seen.get(ch.m.id);
      if (prev) { prev.contToNext = true; ch.contFromPrev = true; }
      seen.set(ch.m.id, ch);
    }
  }
}

// Empile les matières dans des pages de capacités `caps` (mm). Stratégie (section 3
// « éviter autant que possible la coupure d'une matière ») :
//   1) si la matière entière tient dans la place restante de la page courante → on
//      la pose en entier ;
//   2) sinon, si la page courante a déjà du contenu et que la matière entière tient
//      sur la page SUIVANTE → on la reporte en entier (aucune coupure) ;
//   3) sinon (matière plus haute qu'une page, ou dernière page) → coupure au niveau
//      compétence, en répétant l'en-tête et en marquant « (suite) ».
// Renvoie les pages (tableaux de chunks) ou null si ça déborde au-delà de la
// dernière capacité fournie.
function packInto(matieres, d, caps) {
  const pages = caps.map(() => []);
  const used = caps.map(() => 0);
  let pi = 0;
  const room = () => caps[pi] - used[pi];
  const started = () => pages[pi].length > 0 || used[pi] > 0;

  for (const m of matieres) {
    const comps = compsOf(m);
    const mH = matiereHeight(m, d);

    // 1) tient en entier sur la page courante.
    if (mH <= room()) {
      pages[pi].push({ m, comps: comps.slice(), contFromPrev: false, contToNext: false });
      used[pi] += mH;
      continue;
    }
    // 2) reportable en entier sur la page suivante (évite la coupure).
    if (started() && pi < caps.length - 1 && mH <= caps[pi + 1]) {
      pi += 1;
      pages[pi].push({ m, comps: comps.slice(), contFromPrev: false, contToNext: false });
      used[pi] += mH;
      continue;
    }
    // 3) coupure inévitable → répartition au niveau compétence.
    let k = 0;
    while (k < comps.length) {
      const h = compHeight(comps[k], d);
      if (h > room() && started()) {
        if (pi >= caps.length - 1) return null;   // plus de page disponible
        pi += 1;
      }
      let chunk = pages[pi][pages[pi].length - 1];
      if (!chunk || chunk.m !== m) { chunk = { m, comps: [], contFromPrev: false, contToNext: false }; pages[pi].push(chunk); }
      chunk.comps.push(comps[k]);
      used[pi] += h;
      k += 1;
    }
  }
  markContinuations(pages);
  return pages;
}

// MARGE DE SÉCURITÉ DES PLANS MULTI-PAGES.
//
// Mesuré le 2026-11-02 (`scripts/apc-plafond-lignes.mjs`) : à 42 lignes de
// compétence le planificateur annonçait DEUX pages en 10 pt et Chrome en
// imprimait TROIS. Le plan remplissait chaque page à ras de l'estimation ; la
// moindre erreur d'estimation en bas de page 2 chassait le bloc signatures
// (`break-inside: avoid`) sur une feuille à lui, presque vide. Un bulletin qui
// annonce deux pages et en sort trois, dont une quasi blanche, c'est du papier
// perdu dans une école qui en compte les feuilles.
//
// Le filet de zoom ne protège PAS ici : il réduit une feuille trop longue,
// mais une page intermédiaire remplie au millimètre n'a aucune réserve. On
// retient donc 10 % de la hauteur utile sur CHAQUE page d'un plan
// multi-pages. 10 % et pas 4 % : à 4 % le cas 42 lignes sortait ENCORE en
// trois feuilles (mesuré). Le chiffre vient du banc, pas d'un raisonnement — 
// l'estimation en mm/pt reste optimiste d'environ 8 % en bas de page, et on
// paie cette incertitude en réserve plutôt qu'en feuilles.
//
// LE COÛT EST FAIBLE PARCE QUE CE CHEMIN EST RARE : depuis la passe « une page
// avec filet », tout bulletin jusqu'à 34 lignes de compétence tient sur une
// seule feuille. Un plan multi-pages ne concerne donc plus que les bulletins
// de 35 lignes et plus.
const MARGE_MULTI = 0.90;

// Tente une mise en page lisible sur AU PLUS 2 pages pour une densité donnée.
function planTwoPages(matieres, d) {
  const USABLE_H = BASE_USABLE_H * MARGE_MULTI;
  const body1 = USABLE_H - header1Mm(d) - theadMm(d) - PAGENUM_MM;

  // Cas 2 pages : pied réservé en bas de page 2. On ÉQUILIBRE le remplissage
  // (section 4) : la hauteur cible de matières en page 1 égalise le blanc résiduel
  // des deux zones de matières → évite « page 1 = 80 %, page 2 = 20 % ».
  const body2 = USABLE_H - contMm(d) - theadMm(d) - PAGENUM_MM - footerMm(d);
  const H = totalMatiereHeight(matieres, d);
  // Blanc égal : body1 - m1 == body2 - m2, avec m1 + m2 = H → m1 = (H + body1 - body2)/2.
  // Borné : ≥ (H - body2) pour que le reste tienne en page 2, ≤ body1.
  const balanced = (H + body1 - body2) / 2;
  const page1Target = Math.max(H - body2, Math.min(body1, balanced));
  const two = packInto(matieres, d, [page1Target, body2])   // essai équilibré
    || packInto(matieres, d, [body1, body2]);               // repli glouton (granularité matière)
  if (two && two.length <= 2) return { pages: two, footerPageIndex: 1, totalPages: 2 };
  return null;
}

// UNE SEULE PAGE : matières + TOTAL + les trois blocs + appréciation +
// signatures, tout dans la hauteur utile. Extrait de `planTwoPages`, où il
// était noyé : la page unique est désormais une CIBLE à part entière, essayée
// sur toutes les densités avant qu'on envisage une seconde feuille.
// `PAGENUM_MM` n'est plus retranché : sur un bulletin d'une page, « Page 1
// sur 1 » ne s'imprime pas (il n'apprend rien à personne).
// `tol` : la tolérance accordée au filet de zoom (1 = aucune). Voir la note
// sur MIN_FIT_SCALE en tête de fichier.
function planOnePage(matieres, d, tol = 1) {
  const body = USABLE_H * tol - header1Mm(d) - theadMm(d) - footerMm(d);
  if (body <= 0) return null;
  const pages = packInto(matieres, d, [body]);
  return pages && pages.length === 1
    ? { pages, footerPageIndex: 0, totalPages: 1 }
    : null;
}

// Repli (best-effort) : densité la plus compacte, autant de pages que
// nécessaire, pied sur la dernière page.
function planUnlimited(matieres, d) {
  const USABLE_H = BASE_USABLE_H * MARGE_MULTI;   // cf. MARGE_MULTI
  const body1 = USABLE_H - header1Mm(d) - theadMm(d) - PAGENUM_MM;
  const bodyC = USABLE_H - contMm(d) - theadMm(d) - PAGENUM_MM;
  // Beaucoup de pages disponibles (borne large).
  const caps = [body1, ...Array(20).fill(bodyC)];
  const packed = packInto(matieres, d, caps) || [[]];
  const pages = packed.filter((p, i) => i === 0 || p.length);   // retire les pages vides en trop
  // Place le pied sur la dernière page si la place reste, sinon page dédiée.
  const lastUsed = pages[pages.length - 1].reduce((a, ch) => a + ch.comps.reduce((s, c) => s + compHeight(c, d), 0), 0);
  const lastCap = pages.length === 1 ? body1 : bodyC;
  let footerPageIndex;
  if (lastUsed + footerMm(d) <= lastCap) {
    footerPageIndex = pages.length - 1;
  } else {
    pages.push([]);
    footerPageIndex = pages.length - 1;
  }
  return { pages, footerPageIndex, totalPages: pages.length };
}

// Point d'entrée : renvoie { fontPt, lineH, cellPadV, pages, footerPageIndex, totalPages }.
//   pages : tableau de pages ; chaque page = liste de chunks { m, comps[],
//           contFromPrev, contToNext }.
//   fontPt / lineH / cellPadV : densité de rendu (police pt, interligne, padding px).
export function planApcLayout(matieres) {
  const list = matieres || [];

  // PASSE 1 — UNE PAGE, à la plus grande police qui tienne. C'est l'objectif.
  for (const d of ATTEMPTS) {
    const plan = planOnePage(list, d);
    if (plan) return { ...cssOf(d), ...plan, cible: 1 };
  }

  // PASSE 1 BIS — UNE PAGE AVEC LE FILET. Ce qui dépasse de moins de
  // 1/0,86 (≈ 16 %) sera ramené dans la page par `--nc-fit`, qui réduit la
  // feuille RENDUE après mesure. On ne tente ce pari qu'une fois la passe
  // stricte épuisée, et toujours de la plus grande police vers la plus petite :
  // une page légèrement réduite reste plus lisible qu'une page composée en
  // 6,5 pt. Le pari est SÛR dans un sens — si la mesure réelle dépasse quand
  // même, `facteurFit` renvoie null, aucun zoom n'est posé et Chrome pagine ;
  // on retombe alors sur deux feuilles, ce qui était l'ancien comportement.
  // 1,08 et NON 1/0,86 = 1,163. Mesuré le 2026-11-02 : à 1,163 le
  // planificateur acceptait 30 lignes en 7,5 pt, la feuille rendue faisait
  // 1245 px pour 1062 disponibles, et le facteur requis tombait a 0,853 — SOUS
  // le plancher de 2 millièmes. Le filet renonçait, Chrome paginait, et on
  // avait perdu la lisibilité (7,5 pt) SANS gagner la page unique. En pariant
  // plus petit, le planificateur descend d'un cran de densité et le pari
  // devient tenable : la même feuille en 6,5 pt rentre à 0,96 de zoom.
  // Autrement dit : on ne garde de marge que ce qu'on sait tenir.
  const TOL = 1.08;
  for (const d of ATTEMPTS) {
    const plan = planOnePage(list, d, TOL);
    if (plan) return { ...cssOf(d), ...plan, cible: 1 };
  }

  // PASSE 2 — deux pages, à la plus grande police qui tienne. On y vient
  // seulement quand même le plancher de lisibilité ne fait pas tenir une page :
  // un bulletin illisible est pire qu'un bulletin en deux feuilles.
  for (const d of ATTEMPTS) {
    const plan = planTwoPages(list, d);
    if (plan) return { ...cssOf(d), ...plan, cible: 2 };
  }

  // REPLI — autant de pages qu'il faut, au plancher. Rien n'est jamais coupé en
  // silence (cf. `planUnlimited`).
  const dense = ATTEMPTS[ATTEMPTS.length - 1];
  return { ...cssOf(dense), ...planUnlimited(list, dense), cible: 0 };
}
