// EXPORT PDF DES TABLEAUX D'HONNEUR — pages HTML (modeles.js) → PDF A4, côté navigateur.
//
// Même principe que transcriptPdf (html-to-image puis jsPDF), avec trois différences qui
// comptent pour ces documents :
//   1. Les POLICES sont incorporées (getFontEmbedCSS, calculé UNE fois pour tout le lot) :
//      transcriptPdf les ignore (skipFonts), si bien que Great Vibes ou Cinzel retombaient sur
//      une police système dans le PDF. Elles sont servies localement : rien d'externe, le
//      serveur d'école les fournit hors ligne.
//   2. Capture JPEG (~200 dpi) en UNE passe par page (la passe de chauffe n'est faite qu'une
//      fois) : un lot de 60 certificats ne fait plus des centaines de mégaoctets ni des
//      minutes d'attente ; la main est rendue au navigateur entre deux pages.
//   3. L'orientation est celle de CHAQUE page (certificat paysage, palmarès portrait).
import { toJpeg, getFontEmbedCSS } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { chargerPolices } from './rendu.js';

const attendreImages = (el) => Promise.all([...el.querySelectorAll('img')].map((img) => (img.complete && img.naturalWidth
  ? null : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))));

/**
 * @param {string[]} pages  HTML de chaque page (.hon-page)
 * @param {{ fileName?: string, mode?: 'save'|'open'|'blob', onProgress?: (fait:number,total:number)=>void, ratio?: number, qualite?: number }} o
 */
export async function exporterHonneurPdf(pages, { fileName = 'tableau-honneur.pdf', mode = 'save', onProgress, ratio = 2.2, qualite = 0.92 } = {}) {
  if (!pages?.length) return null;
  await chargerPolices();
  const hote = document.createElement('div');
  hote.style.cssText = 'position:fixed;left:-20000px;top:0;z-index:-1;background:#fff';
  hote.innerHTML = pages.join('');
  document.body.appendChild(hote);
  try {
    const feuilles = [...hote.querySelectorAll('.hon-page')];
    await Promise.all(feuilles.map(attendreImages));
    try { await document.fonts.ready; } catch { /* */ }
    const fontEmbedCSS = await getFontEmbedCSS(feuilles[0]).catch(() => '');
    let pdf = null;
    onProgress?.(0, feuilles.length);
    for (let i = 0; i < feuilles.length; i++) {
      const el = feuilles[i];
      const paysage = el.dataset.orientation !== 'portrait';
      const opts = { pixelRatio: ratio, quality: qualite, backgroundColor: '#ffffff', fontEmbedCSS, cacheBust: false,
        width: el.offsetWidth, height: el.offsetHeight };
      if (i === 0) await toJpeg(el, opts);              // chauffe : polices et images décodées
      const img = await toJpeg(el, opts);
      const [w, h] = paysage ? [297, 210] : [210, 297];
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: paysage ? 'landscape' : 'portrait', compress: true });
      else pdf.addPage('a4', paysage ? 'landscape' : 'portrait');
      pdf.addImage(img, 'JPEG', 0, 0, w, h, undefined, 'FAST');
      onProgress?.(i + 1, feuilles.length);
      await new Promise((r) => setTimeout(r, 0));      // l'interface reste réactive
    }
    if (mode === 'blob') return pdf.output('blob');
    if (mode === 'open') window.open(pdf.output('bloburl'), '_blank');
    else pdf.save(fileName);
    return null;
  } finally {
    document.body.removeChild(hote);
  }
}
