// LES BLOCS FIXES DU BULLETIN APC FONT QUELLE HAUTEUR, VRAIMENT ?
//
// `core/apcLayout.js` ESTIME ces hauteurs en mm/pt pour décider du nombre de
// pages. Le banc `apc-sequence-fit.mjs` a montré l'écart : au cas réel la
// feuille 1 fait 761 px pour 1062 disponibles, et pourtant le planificateur
// sort 2 pages. Avant de régler quoi que ce soit, on MESURE chaque bloc à la
// géométrie d'impression.
//
//   npm run build
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/apc-blocs-mesure.mjs

import { createRequire } from 'node:module';
import { startServer, writeDoc } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { readFileSync, readdirSync } = require('node:fs');

const SRC = new URL('../src/', import.meta.url).href;
globalThis.__VITE_ENV__ = {};

const { pageMetrics, printCss, PX_PER_MM } = await import(`${SRC}lib/print/printStyles.js`);
const { apcCote, profilClasse } = await import(`${SRC}core/apcEngine.js`);
const { default: BulletinApcOfficial } = await import(`${SRC}components/bulletins/BulletinApcOfficial.jsx`);

function cssLivre() {
  const dir = new URL('../dist/assets/', import.meta.url);
  const f = readdirSync(dir);
  const ordre = [f.find((x) => /^index-.*\.css$/.test(x)), f.find((x) => /^Bulletins-.*\.css$/.test(x))].filter(Boolean);
  if (ordre.length < 2) { console.error('\n  ✖ Lancez `npm run build` avant ce banc.\n'); process.exit(1); }
  return ordre.map((x) => readFileSync(new URL(x, dir), 'utf8')).join('\n');
}
const CSS = cssLivre();
const CSS_PRINT = printCss({ profile: 'bulletin', screen: false, page: true });
const m = pageMetrics('bulletin');

const school = { id: 's', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', current_year: '2026-2027', city: 'Yaoundé', country_code: 'cameroon' };
const student = { id: 'e', name: 'ABDOURAHMAN HAROUN', matricule: 's260033', gender: 'M', birth_date: '2011-05-18', birth_place: 'Maroua' };

const DEFS = [
  ['Anglais', 12, 3, 'NKOLO Pauline', 'Communiquer oralement et par écrit dans des situations de la vie courante'],
  ['Maths', 2.5, 4, 'TCHOUTA Blaise', 'Résoudre des problèmes relevant des nombres, de la géométrie et des mesures'],
  ['Informatique', 14, 2, '', "Utiliser les outils des technologies de l'information et de la communication"],
];
const data = (() => {
  const matieres = DEFS.map(([nom, note, coef, ens, intitule], i) => ({
    id: `m${i}`, nom, enseignant: ens,
    competences: [{ intitule, note, max: 20, nbCompetencesMatiere: 1 }],
    moyenne: note, coef, ponderee: note * coef, cote: apcCote(note).code,
    minmax: { min: note - 2, max: note + 2 }, appreciation: '',
  }));
  const coefSum = matieres.reduce((a, x) => a + x.coef, 0);
  const mxSum = matieres.reduce((a, x) => a + x.ponderee, 0);
  return { matieres, coefSum, mxSum, moyenneGenerale: mxSum / coefSum, cote: 'CA' };
})();

const body = renderToStaticMarkup(createElement(BulletinApcOfficial, {
  school, sys: 'FR', title: 'BULLETIN DE LA SÉQUENCE 1 (T1)', student,
  classLabel: '3EME ESP', effectif: 6, profPrincipal: 'NKOLO Pauline',
  rang: 4, classStats: profilClasse([9.13, 9.9, 9.5, 10.5, 11.5, 12.33], 6), data,
  appreciation: '',
}));

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>html,body{margin:0;padding:0} ${CSS}</style>
<style id="nc-print-styles">${CSS_PRINT}</style>
</head><body><div class="bulletin-panel">${body}</div></body></html>`;

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1700 } });
await page.goto(writeDoc('apc-blocs', html, port), { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });

const mes = await page.evaluate(() => {
  const feuille = document.querySelector('.bulletin-paper');
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null);
  const enfants = [...(feuille?.querySelector(':scope > div') || feuille)?.children || []];
  return {
    feuille: h(feuille),
    largeur: feuille ? Math.round(feuille.getBoundingClientRect().width) : null,
    rembourrage: feuille ? getComputedStyle(feuille).padding : null,
    // Les blocs, dans l'ordre du DOM, avec leur première ligne de texte.
    blocs: enfants.map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 28),
      h: h(el),
      txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46),
    })),
    thead: h(feuille?.querySelector('thead')),
    // POURQUOI UNE LIGNE EST SI HAUTE : c'est la cellule la plus haute qui
    // decide. On les mesure toutes, avec leur largeur et leur texte.
    cellules: [...(feuille?.querySelector('tbody.apc-mat tr')?.children || [])].map((td, i) => ({
      i, w: Math.round(td.getBoundingClientRect().width),
      h: Math.round(td.getBoundingClientRect().height * 10) / 10,
      txt: (td.textContent || '').replace(/s+/g, ' ').trim().slice(0, 40),
    })),
    entetes: [...(feuille?.querySelectorAll('thead th') || [])].map((th) => ({
      w: Math.round(th.getBoundingClientRect().width),
      txt: (th.textContent || '').replace(/s+/g, ' ').trim().slice(0, 22),
    })),
    uneLigne: h(feuille?.querySelector('tbody.apc-mat tr')),
    keeps: [...(feuille?.querySelectorAll('.apc-keep') || [])].map(h),
  };
});

const mm = (px) => (px == null ? '—' : `${(px / 3.7795275591).toFixed(1)} mm`);
console.log(`\n  Page utile : ${m.contentH} mm (${Math.round(m.contentH * 3.7795)} px) · largeur ${m.contentW} mm`);
console.log(`  Feuille mesurée : ${mes.feuille} px = ${mm(mes.feuille)} · largeur ${mes.largeur} px · padding ${mes.rembourrage}\n`);
console.log('  Blocs de la feuille (ordre du DOM) :');
for (const b of mes.blocs) {
  console.log(`    ${String(b.h).padStart(7)} px  ${mm(b.h).padStart(9)}  <${b.tag}> ${b.cls.padEnd(28)} ${b.txt}`);
}
console.log(`\n    en-tête de colonnes (thead) : ${mes.thead} px = ${mm(mes.thead)}`);
console.log(`    une ligne de compétence     : ${mes.uneLigne} px = ${mm(mes.uneLigne)}`);
console.log(`    blocs .apc-keep             : ${mes.keeps.map((x) => `${x} px`).join(' + ')}`);
console.log('\n  Cellules de la 1re ligne — la plus haute impose la hauteur de la ligne :');
for (const c of mes.cellules) {
  console.log(`    col ${String(c.i).padStart(2)}  ${String(c.w).padStart(4)} px large  ${String(c.h).padStart(6)} px haut   ${c.txt}`);
}
console.log('\n  Largeurs des colonnes (en-têtes) :');
for (const e of mes.entetes) console.log(`    ${String(e.w).padStart(4)} px   ${e.txt}`);
console.log(`\n  PX_PER_MM du socle : ${PX_PER_MM}\n`);

await browser.close();
server.close();
