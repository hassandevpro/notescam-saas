// COMBIEN DE LIGNES DE COMPÉTENCE TIENNENT SUR UNE PAGE A4 ? — on cherche le
// PLAFOND, en rendant le composant réel et en comptant les pages du PDF.
//
// POURQUOI CE BANC. `apc-sequence-fit.mjs` répond « oui / non » sur quatre cas
// choisis. Quand un cas échoue, il ne dit pas s'il manquait deux lignes ou
// trente — donc il ne dit pas si le réglage est à un cheveu ou si la demande
// est physiquement impossible. Celui-ci donne le chiffre, et le chiffre permet
// d'écrire une garantie HONNÊTE dans la documentation plutôt qu'une promesse.
//
//   npm run build
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/apc-plafond-lignes.mjs

import { createRequire } from 'node:module';
import { startServer, writeDoc } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { readFileSync, readdirSync } = require('node:fs');

const SRC = new URL('../src/', import.meta.url).href;
globalThis.__VITE_ENV__ = {};

const { pageMetrics, printCss } = await import(`${SRC}lib/print/printStyles.js`);
const { MIN_FIT_SCALE } = await import(`${SRC}lib/print/fitLiveSheets.js`);
const { apcCote, profilClasse } = await import(`${SRC}core/apcEngine.js`);
const { default: BulletinApcOfficial } = await import(`${SRC}components/bulletins/BulletinApcOfficial.jsx`);

function cssLivre() {
  const dir = new URL('../dist/assets/', import.meta.url);
  const f = readdirSync(dir);
  const ordre = [f.find((x) => /^index-.*\.css$/.test(x)), f.find((x) => /^Bulletins-.*\.css$/.test(x))].filter(Boolean);
  if (ordre.length < 2) { console.error('\n  Lancez `npm run build` avant ce banc.\n'); process.exit(1); }
  return ordre.map((x) => readFileSync(new URL(x, dir), 'utf8')).join('\n');
}
const CSS = cssLivre();
const CSS_PRINT = printCss({ profile: 'bulletin', screen: false, page: true });
const m = pageMetrics('bulletin');

const school = { id: 's', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', current_year: '2026-2027', city: 'Yaounde', country_code: 'cameroon' };
const student = { id: 'e', name: 'ABDOURAHMAN HAROUN', matricule: 's260033', gender: 'M', birth_date: '2011-05-18', birth_place: 'Maroua' };
const CLASS_STATS = profilClasse([9.13, 9.9, 9.5, 10.5, 11.5, 12.33], 6);

// Intitulé LONG : c'est le pire cas, celui que le clamp borne à deux lignes.
const INTITULE = 'Resoudre des problemes relevant des nombres, de la geometrie et des mesures dans des situations de la vie courante';

function htmlPour(nbMatieres, compsParMatiere) {
  const matieres = Array.from({ length: nbMatieres }, (_, i) => {
    const note = 8 + (i % 9);
    return {
      id: 'm' + i, nom: 'Matiere ' + (i + 1) + ' a nom assez long', enseignant: 'ENSEIGNANT ' + (i + 1),
      competences: Array.from({ length: compsParMatiere }, (_, k) => ({
        intitule: INTITULE + ' (volet ' + (k + 1) + ')', note, max: 20, nbCompetencesMatiere: compsParMatiere,
      })),
      moyenne: note, coef: 2, ponderee: note * 2, cote: apcCote(note).code,
      minmax: { min: Math.max(0, note - 3), max: Math.min(20, note + 4) }, appreciation: '',
    };
  });
  const coefSum = matieres.reduce((a, x) => a + x.coef, 0);
  const mxSum = matieres.reduce((a, x) => a + x.ponderee, 0);
  const moy = Math.round((mxSum / coefSum) * 100) / 100;
  const data = { matieres, coefSum, mxSum, moyenneGenerale: moy, cote: apcCote(moy).code };
  const body = renderToStaticMarkup(createElement(BulletinApcOfficial, {
    school, sys: 'FR', title: 'BULLETIN DE LA SEQUENCE 1 (T1)', student,
    classLabel: '3EME ESP', effectif: 6, profPrincipal: 'NKOLO Pauline',
    rang: 4, classStats: CLASS_STATS, data, appreciation: '',
  }));
  return '<!doctype html><html><head><meta charset="utf-8"/>'
    + '<style>html,body{margin:0;padding:0} ' + CSS + '</style>'
    + '<style id="nc-print-styles">' + CSS_PRINT + '</style>'
    + '</head><body><div class="bulletin-panel">' + body + '</div></body></html>';
}

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1700 } });

const compteurHtml = '<!doctype html><meta charset="utf-8"><body><script type="module">'
  + "import * as pdfjs from '/node_modules/pdfjs-dist/build/pdf.mjs';"
  + "pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';"
  + 'window.__numPages = async (b64) => { const bin = atob(b64); const b = new Uint8Array(bin.length);'
  + ' for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);'
  + ' return (await pdfjs.getDocument({ data: b }).promise).numPages; }; window.__pret = true;'
  + '</' + 'script></body>';
const pdfjsPage = await browser.newPage();
await pdfjsPage.goto(writeDoc('__compteur2', compteurHtml, port));
await pdfjsPage.waitForFunction(() => window.__pret === true, null, { timeout: 20000 });

async function mesure(nbMat, comps) {
  await page.goto(writeDoc('plafond-' + nbMat + 'x' + comps, htmlPour(nbMat, comps), port), { waitUntil: 'load' });
  const info = await page.evaluate(({ contentW, contentHpx, plancher }) => {
    const el = document.querySelector('.bulletin-paper:not(.nc-densite)');
    if (!el) return { h: 0, s: null, pt: '?' };
    el.style.removeProperty('--nc-fit');
    const sv = { width: el.style.width, maxWidth: el.style.maxWidth, margin: el.style.margin, boxShadow: el.style.boxShadow, transform: el.style.transform };
    el.style.setProperty('width', contentW + 'mm', 'important');
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('transform', 'none', 'important');
    const h = el.offsetHeight;
    for (const k of Object.keys(sv)) el.style[k] = sv[k];
    let s = null;
    if (h - 1 > contentHpx) { const f = Math.floor((contentHpx / h) * 1000) / 1000; s = f >= plancher ? f : null; }
    if (s != null) el.style.setProperty('--nc-fit', String(s));
    return { h, s, pt: getComputedStyle(el).fontSize, feuilles: document.querySelectorAll('.bulletin-paper').length };
  }, { contentW: m.contentW, contentHpx: m.contentHpx, plancher: MIN_FIT_SCALE });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true,
    margin: { top: m.margin + 'mm', bottom: m.margin + 'mm', left: m.margin + 'mm', right: m.margin + 'mm' } });
  await page.emulateMedia({ media: 'screen' });
  const pages = await pdfjsPage.evaluate((b64) => window.__numPages(b64), Buffer.from(pdf).toString('base64'));
  return { ...info, pages };
}

console.log('\n  Page utile ' + m.contentH + ' mm = ' + m.contentHpx + ' px · plancher de zoom ' + MIN_FIT_SCALE);
console.log('\n  14 matieres, de 1 a 4 competences chacune (intitules LONGS) :');
for (const comps of [1, 2, 3, 4]) {
  const r = await mesure(14, comps);
  console.log('    14 x ' + comps + ' = ' + String(14 * comps).padStart(2) + ' lignes  ->  '
    + r.pages + ' page(s)  corps ' + r.pt + '  brut ' + r.h + ' px  zoom ' + (r.s ?? 1));
}
console.log('\n  Plafond en NOMBRE DE LIGNES (1 competence par matiere) :');
let dernierOk = 0;
for (let n = 14; n <= 44; n += 2) {
  const r = await mesure(n, 1);
  const ok = r.pages === 1;
  if (ok) dernierOk = n;
  console.log('    ' + String(n).padStart(2) + ' lignes  ->  ' + r.pages + ' page(s)  corps ' + r.pt
    + '  brut ' + r.h + ' px  zoom ' + (r.s ?? 1) + '  ' + (ok ? 'OK' : 'DEBORDE'));
  if (!ok) break;
}
console.log('\n  => Derniere valeur tenant sur UNE page : ' + dernierOk + ' lignes.\n');

await browser.close();
server.close();
