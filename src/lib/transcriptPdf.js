// Export PDF des relevés de notes.
//
// Pipeline identique aux cartes scolaires (idCardPdf.js) : on rend la MÊME
// feuille HTML A4 hors écran, on la rasterise via html-to-image (fidèle au
// navigateur, contrairement à html2canvas), puis jsPDF pose l'image pleine page.
//
// Une feuille = une page A4. Le HTML provient de transcriptDoc.js (source unique).

import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

const A4 = { w: 210, h: 297 }; // mm

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

async function captureSheet(el, pixelRatio) {
  await waitForImages(el);
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const opts = {
    pixelRatio,
    backgroundColor: '#ffffff',
    cacheBust: true,
    skipFonts: true,
    width: w,
    height: h,
    canvasWidth: w * pixelRatio,
    canvasHeight: h * pixelRatio,
    style: { transform: 'none', margin: '0', boxShadow: 'none' },
  };
  await toPng(el, opts);       // 1re passe = warm-up (cf. idCardPdf)
  return toPng(el, opts);
}

/**
 * Génère le PDF des relevés à partir de feuilles HTML A4.
 * @param {string[]} sheetHtmls  innerHTML de chaque feuille (.nc-sheet inclus)
 * @param {object} opts
 * @param {string} opts.fileName
 * @param {number} [opts.pixelRatio=3]
 * @param {'save'|'open'} [opts.mode='save']
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 */
export async function exportTranscriptsPdf(sheetHtmls, { fileName = 'releves.pdf', pixelRatio = 3, mode = 'save', onProgress } = {}) {
  if (!sheetHtmls?.length) return;

  // Conteneur hors écran (mais rendu — display:none casse offsetWidth).
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1';
  host.innerHTML = sheetHtmls.join('\n');
  document.body.appendChild(host);

  try {
    const sheets = Array.from(host.querySelectorAll('.nc-sheet'));
    const total = sheets.length;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

    onProgress?.(0, total);
    for (let i = 0; i < total; i++) {
      const img = await captureSheet(sheets[i], pixelRatio);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, 0, A4.w, A4.h, undefined, 'FAST');
      onProgress?.(i + 1, total);
      await new Promise((r) => setTimeout(r, 0));
    }

    if (mode === 'open') window.open(pdf.output('bloburl'), '_blank');
    else pdf.save(fileName);
  } finally {
    document.body.removeChild(host);
  }
}

export { A4 };
