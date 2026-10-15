// ─────────────────────────────────────────────────────────────────────────────
// SOCLE D'IMPRESSION — auto-ajustement des feuilles rendues DANS l'application.
// ─────────────────────────────────────────────────────────────────────────────
//
// LE DÉFAUT QUE CECI CORRIGE. Deux chemins d'impression coexistent :
//
//   • les documents construits en HTML autonome (relevés, PV, emploi du temps)
//     passent par `printLayout.js`, qui embarque un script de mesure et réduit
//     chaque feuille pour la faire tenir sur une page ;
//   • les BULLETINS, eux, sont rendus dans l'application et imprimés par un
//     simple `window.print()` sur le DOM vivant. Ils ne voient donc JAMAIS ce
//     script.
//
// `styles/bulletin.css` annonce pourtant, en commentaire : « Le bulletin occupe
// toute la page et tient sur UNE seule page : chaque .bulletin-paper est isolé
// et son contenu mis à l'échelle au besoin. » La mise à l'échelle n'existait
// pas. Seul un compactage statique (police à 10,5 px, cellules resserrées) la
// remplaçait — suffisant pour une dizaine de matières, dépassé au-delà : le bas
// du bulletin (résultats, observations, signatures) partait sur une 2e page,
// presque vide, et une école qui imprime 300 bulletins y perdait 300 feuilles.
//
// CE MODULE applique la MÊME logique que `printLayout.js`, au même plancher de
// lisibilité, mais sur le DOM vivant et UNIQUEMENT pour l'impression :
//   1. il mesure chaque feuille à la hauteur imprimable réelle du profil ;
//   2. il écrit le facteur de réduction dans une variable CSS sur la feuille ;
//   3. `@media print` applique la réduction (et compense la largeur).
//
// L'écran n'est donc pas touché : on ne rétrécit pas l'aperçu que la secrétaire
// lit, seulement la feuille qui part à l'imprimante.

import { pageMetrics, DEFAULT_PROFILE } from './printStyles.js';

// Plancher de lisibilité, identique à celui du socle HTML autonome
// (`printLayout.js`). En dessous, on renonce à faire tenir : un bulletin illisible
// est plus coûteux qu'un bulletin sur deux pages.
export const MIN_FIT_SCALE = 0.86;

// Nom de la variable CSS lue par la feuille de style d'impression.
export const FIT_VAR = '--nc-fit';

/**
 * Mesure la hauteur d'une feuille à la géométrie d'IMPRESSION.
 *
 * À l'écran, `.bulletin-paper` porte une ombre, des marges et une largeur
 * maximale qui ne sont pas celles de l'impression. On neutralise donc le temps
 * de la mesure, puis on restaure — sans quoi le facteur calculé vaudrait pour
 * une géométrie qui n'existe pas au moment d'imprimer.
 */
function hauteurImprimable(el, contentWmm) {
  const sauve = {
    width: el.style.width, maxWidth: el.style.maxWidth,
    margin: el.style.margin, boxShadow: el.style.boxShadow,
    transform: el.style.transform,
  };
  el.style.setProperty('width', `${contentWmm}mm`, 'important');
  el.style.setProperty('max-width', 'none', 'important');
  el.style.setProperty('margin', '0', 'important');
  el.style.setProperty('box-shadow', 'none', 'important');
  el.style.setProperty('transform', 'none', 'important');
  const h = el.offsetHeight;
  for (const [k, v] of Object.entries(sauve)) el.style[k] = v;
  return h;
}

/**
 * Calcule le facteur de réduction d'une feuille. Fonction PURE — c'est elle que
 * les tests couvrent, la mesure DOM restant hors de portée de Node.
 *
 * @param {number} hauteurPx   hauteur mesurée à la largeur imprimable
 * @param {number} dispoPx     hauteur utile d'une page
 * @returns {number|null} le facteur (< 1), ou null s'il n'y a rien à réduire
 *                        ou si la réduction tomberait sous le plancher.
 */
export function facteurFit(hauteurPx, dispoPx) {
  if (!Number.isFinite(hauteurPx) || hauteurPx <= 0) return null;
  if (!Number.isFinite(dispoPx) || dispoPx <= 0) return null;
  // Tolérance d'un pixel : 1032,4 px sur 1032 px tient encore (sous-pixels).
  if (hauteurPx - 1 <= dispoPx) return null;
  const s = Math.floor((dispoPx / hauteurPx) * 1000) / 1000;
  return s >= MIN_FIT_SCALE ? s : null;
}

/**
 * Ajuste toutes les feuilles correspondant au sélecteur, pour l'impression.
 *
 * Idempotent : on remet à zéro avant de mesurer, donc deux impressions
 * successives ne cumulent pas les réductions.
 *
 * @returns {{ ajustees: number, debordantes: number, total: number }}
 *   `debordantes` = feuilles trop longues pour être réduites sans devenir
 *   illisibles ; elles couleront sur une seconde page, et l'appelant peut le
 *   dire à l'utilisateur plutôt que de le lui laisser découvrir à l'imprimante.
 */
export function fitLiveSheets(selector = '.bulletin-paper', profile = DEFAULT_PROFILE) {
  if (typeof document === 'undefined') return { ajustees: 0, debordantes: 0, total: 0 };
  const { contentW, contentHpx } = pageMetrics(profile);
  const feuilles = Array.from(document.querySelectorAll(selector));
  let ajustees = 0;
  let debordantes = 0;

  for (const el of feuilles) {
    el.style.removeProperty(FIT_VAR);
    el.removeAttribute('data-nc-fit');
    const h = hauteurImprimable(el, contentW);
    const s = facteurFit(h, contentHpx);
    if (s == null) {
      // Soit elle tient déjà, soit elle est trop longue pour être réduite.
      if (h - 1 > contentHpx) { debordantes++; el.setAttribute('data-nc-fit', 'flow'); }
      continue;
    }
    el.style.setProperty(FIT_VAR, String(s));
    el.setAttribute('data-nc-fit', String(s));
    ajustees++;
  }
  return { ajustees, debordantes, total: feuilles.length };
}

/** Retire toute réduction posée par `fitLiveSheets` (après impression). */
export function resetLiveSheets(selector = '.bulletin-paper') {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll(selector)) {
    el.style.removeProperty(FIT_VAR);
    el.removeAttribute('data-nc-fit');
  }
}
