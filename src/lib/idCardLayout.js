// Géométrie pure de la planche A4 de cartes scolaires.
// Aucune dépendance navigateur → testable en Node.
//
// On ne repositionne JAMAIS le texte : on calcule seulement où poser l'IMAGE
// (capture fidèle de chaque carte) sur la page, en préservant le ratio.

export const A4 = { w: 210, h: 297 }; // mm

/**
 * Construit le plan de pose des cartes.
 * @param {object} o
 * @param {number} o.count   nombre de cartes
 * @param {number} o.ratio   largeur/hauteur d'une carte (px) — préserve l'aspect
 * @param {number} [o.cols=2]
 * @param {number} [o.rows=4]
 * @param {number} [o.margin=12] marge page (mm)
 * @param {number} [o.gapX=8] espace horizontal (mm)
 * @param {number} [o.gapY=8] espace vertical (mm)
 * @param {{w:number,h:number}} [o.page=A4] dimensions de page (mm). Permet le paysage
 *   (ex. { w:297, h:210 }) sans toucher au reste de la géométrie.
 * @returns {{ cardW:number, cardH:number, perPage:number, pages:number, slots:Array }}
 */
export function buildLayout({ count, ratio, cols = 2, rows = 4, margin = 12, gapX = 8, gapY = 8, page = A4 }) {
  if (!ratio || ratio <= 0) throw new Error('ratio invalide');
  const cardW = (page.w - margin * 2 - gapX * (cols - 1)) / cols;
  const cardH = cardW / ratio;
  const perPage = cols * rows;
  const slots = [];
  for (let i = 0; i < count; i++) {
    const idx = i % perPage;
    const page = Math.floor(i / perPage);
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    slots.push({
      index: i,
      page,
      x: margin + col * (cardW + gapX),
      y: margin + row * (cardH + gapY),
      w: cardW,
      h: cardH,
    });
  }
  return { cardW, cardH, perPage, pages: Math.ceil(count / perPage) || 0, slots };
}
