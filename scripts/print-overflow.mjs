// Débordement horizontal : le contenu tient-il dans la largeur imprimable ?
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/print-overflow.mjs
import { createRequire } from 'node:module';
import { startServer, writeDoc } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SRC = new URL('../src/', import.meta.url).href;
const { buildPrintDocument } = await import(`${SRC}lib/transcriptDoc.js`);
const { pvSheetHtml } = await import(`${SRC}lib/pvDoc.js`);
const { pageMetrics } = await import(`${SRC}lib/print/printStyles.js`);
const fx = await import(`${SRC}lib/print/printTestUtils.js`);

const mkPv = (nStudents, nSubjects, nUnits) => ({
  cls: fx.fixtureClass(), sys: 'FR', schoolYear: '2025-2026', periodLabel: 'Trimestre 1',
  maxScale: 20, teacherName: 'Mme ABENA',
  units: Array.from({ length: nUnits }, (_, i) => ({ key: `u${i}`, label: `Séq ${i + 1}` })),
  cols: Array.from({ length: nSubjects }, (_, i) => ({ key: `c${i}`, name: `Matière ${i + 1}`, code: `M${i + 1}` })),
  rows: fx.fixtureStudents(nStudents).map((s, i) => ({
    name: s.name, matricule: s.matricule,
    cells: Object.fromEntries(Array.from({ length: nSubjects }, (_, c) => [`c${c}`, { moy: 10 + ((i + c) % 8), byUnit: Object.fromEntries(Array.from({ length: nUnits }, (_, u) => [`u${u}`, 9 + u])) }])),
    avg: 12.5, rankTxt: `${i + 1}er`, mention: 'Assez bien',
    decision: { passed: i % 4 !== 0, text: i % 4 !== 0 ? 'Admis' : 'Redouble la classe' },
  })),
  summary: { total: nStudents, admis: 9, ajournes: 3, notes: nStudents, rate: 75, avg: 12.6, min: 8.2, max: 17.4 },
});

const m = pageMetrics('large');
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

console.log(`Largeur imprimable (paysage) : ${m.contentW} mm = ${Math.round(m.contentWpx)} px\n`);
for (const [subs, units] of [[6, 2], [9, 2], [12, 2], [9, 4], [15, 1], [20, 1]]) {
  const html = buildPrintDocument([pvSheetHtml(mkPv(8, subs, units), { school: fx.fixtureSchool() })], 'pv', { profile: 'large', autoPrint: false });
  await page.goto(writeDoc(`ovf-${subs}x${units}`, html, port), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const res = await page.evaluate((w) => {
    const el = document.querySelector('.nc-sheet');
    el.style.setProperty('width', w + 'mm', 'important');
    const table = el.querySelector('table:nth-of-type(3)') || el.querySelectorAll('table')[el.querySelectorAll('table').length - 2];
    const widest = [...el.querySelectorAll('table')].reduce((a, t) => Math.max(a, t.scrollWidth), 0);
    return { sheet: el.scrollWidth, client: el.clientWidth, widestTable: widest, tableW: table ? table.scrollWidth : 0 };
  }, m.contentW);
  const over = res.widestTable - res.client;
  console.log(`  ${String(subs).padStart(2)} matières × ${units} séq (${subs * (units + 1)} colonnes de notes) : `
    + `feuille ${res.sheet} px / utile ${res.client} px · tableau le plus large ${res.widestTable} px`
    + `${over > 1 ? `  ⟵ DÉBORDE de ${over} px` : ''}`);
}
await browser.close();
server.close();
