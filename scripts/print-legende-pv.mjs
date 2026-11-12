// La LÉGENDE du PV (et du rapport) reste dans la largeur imprimable, quel que soit le nombre de
// compétences et la longueur de leurs intitulés (Genius CE1 : « Utiliser les concepts … »).
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/print-legende-pv.mjs
// Sortie ≠ 0 si une entrée de légende dépasse le bord droit de la feuille.
import { createRequire } from 'node:module';
import { startServer, writeDoc } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SRC = new URL('../src/', import.meta.url).href;
const { buildPrintDocument } = await import(`${SRC}lib/transcriptDoc.js`);
const { pvSheetHtml } = await import(`${SRC}lib/pvDoc.js`);
const { pageMetrics } = await import(`${SRC}lib/print/printStyles.js`);
const fx = await import(`${SRC}lib/print/printTestUtils.js`);

// Intitulés LONGS, comme les compétences officielles (vrais libellés du référentiel primaire/APC).
const LONGS = [
  'Communiquer en français dans des situations de la vie courante à l’oral et à l’écrit',
  'Communicate in English in everyday situations, orally and in writing about familiar topics',
  'Pratiquer une langue nationale dans des situations de communication courante',
  'Utiliser les concepts de base en mathématiques pour résoudre des situations-problèmes',
  'Utiliser les concepts de base en sciences et technologie pour expliquer son environnement',
  'Pratiquer les valeurs sociales et citoyennes dans la vie de tous les jours',
  'Faire preuve d’autonomie, d’initiative, de créativité et d’esprit d’entreprise',
  'Utiliser les concepts et outils de base des TIC dans des situations simples',
  'Pratiquer des activités physiques, sportives et artistiques de manière adaptée',
  'Utiliser correctement des Concepts de Base en Orthographe et en Grammaire',
  'Mandarin Chinese — 汉语 communication in simple everyday situations and writing',
  'Exprimer ses émotions et respecter les règles de la vie en collectivité à l’école',
];

const mkPv = (nStudents, nSubjects, unites) => ({
  cls: fx.fixtureClass(), sys: 'FR', schoolYear: '2025-2026', periodLabel: 'Séquence 1',
  maxScale: 20, teacherName: 'Mme ABENA',
  units: Array.from({ length: unites }, (_, i) => ({ key: `u${i}`, label: `UA${i + 1}` })),
  cols: Array.from({ length: nSubjects }, (_, i) => ({ key: `c${i}`, name: `${LONGS[i % LONGS.length]} ${i >= LONGS.length ? i : ''}`.trim(), code: `C${i + 1}` })),
  rows: fx.fixtureStudents(nStudents).map((s, i) => ({
    name: s.name, matricule: s.matricule,
    cells: Object.fromEntries(Array.from({ length: nSubjects }, (_, c) => [`c${c}`, { moy: 10 + ((i + c) % 8), byUnit: Object.fromEntries(Array.from({ length: unites }, (_, u) => [`u${u}`, 9 + u])) }])),
    avg: 12.5, rankTxt: `${i + 1}er`, mention: 'Assez bien',
    decision: { passed: i % 4 !== 0, text: i % 4 !== 0 ? 'Admis' : 'Redouble la classe' },
  })),
  summary: { total: nStudents, admis: 9, ajournes: 3, notes: nStudents, rate: 75, avg: 12.6, min: 8.2, max: 17.4 },
});

const m = pageMetrics('large');
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }); // laptop 1366 px
let ko = 0;
console.log(`Largeur imprimable (paysage) : ${m.contentW} mm = ${Math.round(m.contentWpx)} px\n`);
for (const [eleves, matieres, unites] of [[24, 10, 1], [24, 12, 3], [40, 12, 1], [40, 20, 1]]) {
  const html = buildPrintDocument([pvSheetHtml(mkPv(eleves, matieres, unites), { school: fx.fixtureSchool() })], 'pv', { profile: 'large', autoPrint: false });
  for (const media of ['print', 'screen']) {
    await page.goto(writeDoc(`leg-${eleves}-${matieres}-${unites}-${media}`, html, port), { waitUntil: 'load' });
    await page.emulateMedia({ media });
    const r = await page.evaluate(() => {
      const sheet = document.querySelector('.nc-sheet');
      const bord = sheet.getBoundingClientRect().right;
      const leg = [...document.querySelectorAll('[data-part="legende"]')];
      const spans = leg.flatMap((l) => [...l.querySelectorAll('span')]);
      const depasse = spans.filter((s) => s.getBoundingClientRect().right > bord + 1).length;
      const horizontalScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return { legendes: leg.length, entrees: spans.length, depasse, horizontalScroll,
        lignes: leg[0] ? Math.round(leg[0].getBoundingClientRect().height / parseFloat(getComputedStyle(leg[0]).lineHeight || 14)) : 0 };
    });
    const mauvais = r.legendes > 0 && (r.depasse > 0 || (media === 'print' && r.horizontalScroll));
    if (mauvais) ko++;
    console.log(`  ${String(eleves).padStart(2)} élèves × ${String(matieres).padStart(2)} matières × ${unites} UA · ${media.padEnd(6)} : `
      + `${r.legendes ? `légende ${r.entrees} entrées sur ~${r.lignes} lignes, ${r.depasse} dépassent` : 'pas de légende (colonnes horizontales)'}`
      + `${r.horizontalScroll ? ' · SCROLL HORIZONTAL' : ''}${mauvais ? '   ⟵ DÉBORDE' : ''}`);
  }
}
await browser.close();
server.close();
console.log(ko ? `\n❌ ${ko} cas débordent` : '\n✅ aucune entrée de légende ne dépasse la feuille');
process.exit(ko ? 1 : 0);
