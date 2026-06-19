// Export PDF des cartes scolaires.
//
// Pipeline (capture du DOM, AUCUNE reconstruction, AUCUN doc.text) :
//   Carte HTML (<IdCard/>)  →  html-to-image (toPng)  →  PNG haute résolution  →  jsPDF.addImage()
//
// Pourquoi html-to-image et pas html2canvas ?
//   html2canvas re-dessine le texte avec SON propre moteur → décalages de
//   baseline / line-height / letter-spacing vs l'aperçu. html-to-image sérialise
//   le noeud dans un <foreignObject> SVG et le rasterise via le MOTEUR DU
//   NAVIGATEUR → le texte est pixel-identique à ce qui est affiché à l'écran.
//
// jsPDF ne fait que poser l'image (ratio préservé) — voir idCardLayout.js.

import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { buildLayout, A4 } from './idCardLayout';

// Attend que toutes les images du noeud soient chargées (photo, logo, armoiries…).
async function waitForImages(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise((res) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          })
    )
  );
}

// Capture un noeud carte → dataURL PNG, rendu fidèle au navigateur.
async function captureCard(el, pixelRatio = 4) {
  await waitForImages(el);
  // S'assure que les polices système sont prêtes avant le rendu.
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  // Deux passes : la 1ère « réchauffe » le rendu (images inline) — corrige les
  // captures occasionnellement vides au premier appel sur certains navigateurs.
  const opts = {
    pixelRatio,
    backgroundColor: '#ffffff',
    cacheBust: true,
    skipFonts: true,           // on n'utilise que des polices système
    width: w,
    height: h,
    canvasWidth: w * pixelRatio,
    canvasHeight: h * pixelRatio,
    style: { transform: 'none', margin: '0', boxShadow: 'none' },
  };
  await toPng(el, opts);
  return toPng(el, opts);
}

/**
 * Génère le PDF des cartes.
 * @param {HTMLElement[]} cardEls  noeuds DOM des cartes (ordre = ordre élèves)
 * @param {object} opts
 * @param {string} opts.fileName
 * @param {number} opts.ratio      largeur/hauteur d'une carte (px)
 * @param {number} [opts.pixelRatio=4]
 * @param {'save'|'open'} [opts.mode='save']
 * @param {(done:number,total:number)=>void} [opts.onProgress]  avancement (cartes traitées)
 */
export async function exportIdCardsPdf(cardEls, { fileName = 'cartes-scolaires.pdf', ratio = 660 / 416, pixelRatio = 4, mode = 'save', onProgress } = {}) {
  if (!cardEls?.length) return;

  const total = cardEls.length;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { slots } = buildLayout({ count: total, ratio });

  onProgress?.(0, total);
  let curPage = 0;
  for (let i = 0; i < total; i++) {
    const img = await captureCard(cardEls[i], pixelRatio);
    const s = slots[i];
    if (s.page > curPage) { pdf.addPage(); curPage = s.page; }
    pdf.addImage(img, 'PNG', s.x, s.y, s.w, s.h, undefined, 'FAST');
    onProgress?.(i + 1, total);
    // Laisse le navigateur peindre la mise à jour du compteur entre 2 captures.
    await new Promise((r) => setTimeout(r, 0));
  }

  if (mode === 'open') {
    window.open(pdf.output('bloburl'), '_blank');
  } else {
    pdf.save(fileName);
  }
}

export { A4 };
