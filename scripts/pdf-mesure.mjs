// Mesure un PDF : pages, taille, étendue du contenu, tailles de police réelles.
import { readFileSync } from 'node:fs';
const pdfjs = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const file = process.argv[2];
const data = new Uint8Array(readFileSync(file));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
console.log('Pages:', doc.numPages);
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = tc.items.filter((i) => i.str && i.str.trim());
  // pdf.js : transform[5] = y depuis le BAS ; hauteur de police = |transform[3]|
  const ys = items.map((i) => vp.height - i.transform[5]);
  const tailles = items.map((i) => Math.abs(i.transform[3])).sort((a, b) => a - b);
  const xs = items.map((i) => i.transform[4]);
  const med = tailles[Math.floor(tailles.length / 2)];
  const distinct = [...new Set(tailles.map((t) => t.toFixed(1)))];
  console.log(`\nPage ${p} : ${vp.width.toFixed(0)}×${vp.height.toFixed(0)} pt (${(vp.width * 25.4 / 72).toFixed(0)}×${(vp.height * 25.4 / 72).toFixed(0)} mm) — ${items.length} blocs de texte`);
  console.log(`  contenu : y ${Math.min(...ys).toFixed(0)} → ${Math.max(...ys).toFixed(0)} pt ; x ${Math.min(...xs).toFixed(0)} → ${Math.max(...xs).toFixed(0)} pt`);
  console.log(`  police : min ${tailles[0].toFixed(1)} / médiane ${med.toFixed(1)} / max ${tailles[tailles.length - 1].toFixed(1)} pt ; tailles distinctes : ${distinct.join(', ')}`);
  console.log(`  début : ${items.slice(0, 8).map((i) => i.str.trim()).join(' | ')}`);
  console.log(`  fin   : ${items.slice(-8).map((i) => i.str.trim()).join(' | ')}`);
}
