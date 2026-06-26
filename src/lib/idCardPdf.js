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

// Attend que toutes les images du noeud soient chargées ET décodées
// (photo, logo, armoiries, QR…). Le décodage explicite évite la 1ère capture
// blanche/partielle quand le navigateur n'a pas encore peint l'image.
async function waitForImages(node) {
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      if (!(img.complete && img.naturalWidth > 0)) {
        await new Promise((res) => {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
        });
      }
      // decode() peut rejeter (image cassée) → on ignore, le repli s'affichera.
      try { await img.decode(); } catch { /* noop */ }
    })
  );
}

// pixelRatio par défaut. Une carte fait 660 px de large et est posée sur ~89 mm
// d'A4 (cf. idCardLayout). À 2× → 1320 px ≈ 380 DPI : largement net pour
// l'impression. L'ancien 4× (~750 DPI) quadruplait mémoire et temps pour rien,
// et faisait planter le navigateur sur les gros effectifs.
const DEFAULT_PIXEL_RATIO = 2;

// Capture un noeud carte → dataURL PNG, rendu fidèle au navigateur.
// Les images de la carte sont déjà des data-URL (résolues en amont dans
// IdCardModal) : la capture ne fait donc AUCUN fetch et ne peut pas être
// contaminée (tainted canvas). Une nouvelle tentative est faite en cas d'aléa.
async function captureCard(el, pixelRatio) {
  await waitForImages(el);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const opts = {
    pixelRatio,
    backgroundColor: '#ffffff',
    skipFonts: true,           // on n'utilise que des polices système
    cacheBust: false,
    width: w,
    height: h,
    canvasWidth: w * pixelRatio,
    canvasHeight: h * pixelRatio,
    style: { transform: 'none', margin: '0', boxShadow: 'none' },
  };
  try {
    return await toPng(el, opts);
  } catch {
    // Un échec transitoire (peinture/mémoire) ne doit pas tuer tout l'export :
    // on laisse le navigateur respirer puis on retente une fois.
    await new Promise((r) => setTimeout(r, 120));
    try {
      return await toPng(el, opts);
    } catch (err) {
      // Deux échecs → on renvoie null : l'appelant saute cette carte au lieu
      // d'abandonner tout le lot (mieux vaut 23/24 cartes qu'aucune).
      console.error('captureCard: échec définitif d’une carte', err);
      return null;
    }
  }
}

/**
 * Génère le PDF des cartes.
 * @param {HTMLElement[]} cardEls  noeuds DOM des cartes (ordre = ordre élèves)
 * @param {object} opts
 * @param {string} opts.fileName
 * @param {number} opts.ratio      largeur/hauteur d'une carte (px)
 * @param {number} [opts.pixelRatio=2]  2× ≈ 380 DPI à l'impression (cf. DEFAULT_PIXEL_RATIO)
 * @param {'save'|'open'} [opts.mode='save']
 * @param {(done:number,total:number)=>void} [opts.onProgress]  avancement (cartes traitées)
 * @param {object} [opts.layout]   surcharge de la planche (cols/rows/margin/gapX/gapY).
 *   Défaut = planche cartes 2×4. Pour un document pleine page (ex. diplôme A4),
 *   passer { cols:1, rows:1, margin:0, gapX:0, gapY:0 } avec un ratio A4.
 *   Le MOTEUR reste unique : seule la géométrie de pose change.
 * @param {'portrait'|'landscape'} [opts.orientation='portrait'] orientation des pages A4.
 */
export async function exportIdCardsPdf(cardEls, { fileName = 'cartes-scolaires.pdf', ratio = 660 / 416, pixelRatio = DEFAULT_PIXEL_RATIO, mode = 'save', onProgress, layout, orientation = 'portrait' } = {}) {
  if (!cardEls?.length) return;

  const total = cardEls.length;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
  const page = orientation === 'landscape' ? { w: A4.h, h: A4.w } : A4;
  const { slots } = buildLayout({ count: total, ratio, page, ...(layout || {}) });

  onProgress?.(0, total);
  let curPage = 0;
  let failed = 0;
  for (let i = 0; i < total; i++) {
    const img = await captureCard(cardEls[i], pixelRatio);
    const s = slots[i];
    if (s.page > curPage) { pdf.addPage(); curPage = s.page; }
    // Carte capturée → on la pose ; sinon on saute son emplacement (slot vide).
    if (img) {
      try {
        pdf.addImage(img, 'PNG', s.x, s.y, s.w, s.h, undefined, 'FAST');
      } catch (err) {
        console.error('addImage: carte ignorée', err);
        failed++;
      }
    } else {
      failed++;
    }
    onProgress?.(i + 1, total);
    // Laisse le navigateur peindre la mise à jour du compteur entre 2 captures.
    await new Promise((r) => setTimeout(r, 0));
  }

  // Tout a échoué → on lève pour que l'appelant affiche l'erreur (pas de PDF vide).
  if (failed === total) throw new Error('Aucune carte n’a pu être générée.');

  if (mode === 'open') {
    window.open(pdf.output('bloburl'), '_blank');
  } else {
    pdf.save(fileName);
  }

  return { total, failed };
}

export { A4 };
