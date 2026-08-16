// ─────────────────────────────────────────────────────────────────────────────
// SOCLE D'IMPRESSION — pagination.
// ─────────────────────────────────────────────────────────────────────────────
// Deux besoins distincts :
//
//   1. SAVOIR combien de pages un document occupera, pour l'annoncer dans
//      l'aperçu et le vérifier dans les tests. C'est une mesure : on rend le
//      document à la largeur imprimable réelle et on divise sa hauteur par la
//      hauteur utile d'une page.
//
//   2. DÉCIDER où couper. Ce travail est délégué au navigateur — c'est lui qui
//      imprime, lui seul connaît la hauteur réelle de chaque ligne après retour
//      à la ligne. Notre rôle est de lui donner les bonnes contraintes
//      (`.nc-keep`, `<thead>`, `tr { break-inside: avoid }` — voir printStyles)
//      et de ne jamais présumer d'un nombre de lignes par page.
//
// Ce qui n'est PAS fait ici, et pourquoi : la numérotation « page i sur n » en
// pied de chaque page imprimée. Chrome n'implémente ni les marges nommées
// `@page { @bottom-center }` ni les compteurs de page CSS, et un pied
// positionné en absolu dans un bloc fragmenté n'est pas rendu de façon fiable.
// À la place, chaque document démarre sur une page neuve et porte son
// identification dans l'en-tête de tableau, répété sur chaque page.

import { pageMetrics, DEFAULT_PROFILE, CLASS } from './printStyles';

/**
 * Nombre de pages occupées par un contenu d'une hauteur donnée.
 * @param {number} heightPx  hauteur mesurée à la largeur imprimable
 * @param {string} profile
 */
export function pagesForHeight(heightPx, profile = DEFAULT_PROFILE) {
  const { contentHpx } = pageMetrics(profile);
  if (!Number.isFinite(heightPx) || heightPx <= 0) return 1;
  // Tolérance d'un pixel : un contenu de 1032,4 px sur 1032 px de hauteur utile
  // tient encore sur une page (arrondis de sous-pixel du moteur de rendu).
  return Math.max(1, Math.ceil((heightPx - 1) / contentHpx));
}

/**
 * Mesure un document HTML dans le DOM, à la géométrie d'impression exacte.
 * Renvoie la hauteur, le nombre de pages et le débordement horizontal.
 *
 * Le conteneur est rendu HORS ÉCRAN mais bien rendu : `display:none` remettrait
 * toutes les hauteurs à zéro.
 *
 * @param {string} html      une feuille (ou plusieurs)
 * @param {string} profile
 * @returns {{ heightPx:number, pages:number, overflowX:number, sheets:Array }}
 */
export function measureDocument(html, profile = DEFAULT_PROFILE) {
  if (typeof document === 'undefined') return { heightPx: 0, pages: 1, overflowX: 0, sheets: [] };
  const m = pageMetrics(profile);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${m.contentW}mm;background:#fff;z-index:-1;visibility:hidden`;
  host.innerHTML = html;
  // Géométrie d'impression : la feuille perd sa marge (portée par @page).
  for (const el of host.querySelectorAll(`.${CLASS.sheet}`)) {
    el.style.width = `${m.contentW}mm`;
    el.style.minHeight = '0';
    el.style.padding = '0';
    el.style.margin = '0';
    el.style.boxShadow = 'none';
  }
  document.body.appendChild(host);
  try {
    const sheets = Array.from(host.querySelectorAll(`.${CLASS.sheet}`)).map((el) => ({
      heightPx: el.offsetHeight,
      pages: pagesForHeight(el.offsetHeight, profile),
      overflowX: Math.max(0, el.scrollWidth - el.clientWidth),
    }));
    const heightPx = sheets.reduce((a, s) => a + s.heightPx, 0) || host.offsetHeight;
    return {
      heightPx,
      pages: sheets.length ? sheets.reduce((a, s) => a + s.pages, 0) : pagesForHeight(heightPx, profile),
      overflowX: sheets.reduce((a, s) => Math.max(a, s.overflowX), 0),
      sheets,
    };
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Découpe une liste de documents en lots imprimables.
 *
 * Pourquoi : tout envoyer dans une seule fenêtre marche jusqu'à quelques
 * centaines de pages, puis le coût devient celui d'un seul gros document que
 * l'utilisateur ne peut ni annuler ni imprimer progressivement. Au-delà du
 * seuil, on imprime lot par lot — l'utilisateur voit sa progression et peut
 * s'arrêter.
 *
 * @param {Array} items
 * @param {number} [size=BATCH_SIZE]
 */
export const BATCH_SIZE = 150;

export function chunk(items, size = BATCH_SIZE) {
  const list = Array.isArray(items) ? items : [];
  if (size <= 0 || list.length <= size) return [list];
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Faut-il proposer une impression par lots pour ce volume ? */
export const needsBatching = (count, size = BATCH_SIZE) => count > size;

/**
 * Estimation de durée, en secondes, pour un lot de N documents.
 * Calibrée sur mesure réelle (Chrome, poste de bureau) : ~17 ms de construction
 * par document, ~28 ms de pagination et de rendu par page, plus l'ouverture de
 * la fenêtre. Une marge de 60 % couvre les postes modestes des établissements.
 */
export function estimateSeconds(count) {
  if (!count) return 0;
  const ms = 400 + count * (17 + 28);
  return Math.max(1, Math.round((ms * 1.6) / 1000));
}

export default { pagesForHeight, measureDocument, chunk, needsBatching, estimateSeconds, BATCH_SIZE };
