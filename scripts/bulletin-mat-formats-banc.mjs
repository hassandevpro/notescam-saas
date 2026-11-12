// BANC : bulletin de MATERNELLE — formats Classique (sans / avec émojis) et Enfantin, rendu réel, PDF réel, pages.
//
//   npm run build            (le CSS du build est indispensable)
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-mat-formats-banc.mjs <etiquette> [filtre]
// Écrit .print-tests/mat-formats/<etiquette>/<cas>.{html,pdf} et affiche le nombre de pages de chaque cas.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ETIQ = process.argv[2] || 'apres';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, '.print-tests', 'mat-formats');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { startServer, writeDoc } = await import('./lib/print-harness.mjs');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../src/', import.meta.url).href;
const { pageMetrics, printCss } = await import(`${SRC}lib/print/printStyles.js`);
const { ajusterFeuilles } = await import('./lib/densite-navigateur.mjs');
const { default: Mat } = await import(`${SRC}components/bulletins/BulletinMatOfficial.jsx`);

const dossierCss = new URL('../dist/assets/', import.meta.url);
const fich = readdirSync(dossierCss);
const CSS = [fich.find((x) => /^index-.*\.css$/.test(x)), fich.find((x) => /^Bulletins-.*\.css$/.test(x))]
  .filter(Boolean).map((x) => readFileSync(new URL(x, dossierCss), 'utf8')).join('\n');
const CSS_PRINT = printCss({ profile: 'large', screen: false, page: true });
const m = pageMetrics('large');

// Portrait d'enfant SYNTHÉTIQUE (aucune vraie photo) : fond uni, tête et épaules.
const svg = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#9fb4c7"/><ellipse cx="${w / 2}" cy="${h * 1.02}" rx="${w * 0.42}" ry="${h * 0.3}" fill="#34455a"/><ellipse cx="${w / 2}" cy="${h * 0.42}" rx="${w * 0.2}" ry="${h * 0.24}" fill="#e8b894"/><path d="M${w * 0.3} ${h * 0.34} Q${w / 2} ${h * 0.1} ${w * 0.7} ${h * 0.34} Q${w / 2} ${h * 0.22} ${w * 0.3} ${h * 0.34}Z" fill="#1f1a17"/></svg>`;
const uri = (w, h) => `data:image/svg+xml;utf8,${encodeURIComponent(svg(w, h))}`;

// NC_DEMO=1 : données NEUTRES (aucun vrai nom d'école ni d'enfant) — pour les miniatures livrées avec l'application.
const DEMO = process.env.NC_DEMO === '1';
const school = DEMO
  ? { id: 's1', name: 'ÉCOLE DE DÉMONSTRATION', country_code: 'cameroon', current_year: '2026-2027', phone: '600 00 00 00', director: 'Mme Directrice', bulletin_accent: '#047857' }
  : { id: 's1', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', country_code: 'cameroon', current_year: '2026-2027', phone: '+237 678341213', director: 'Eyong Sergine', bulletin_accent: '#047857' };
const eleve = (o = {}) => (DEMO
  ? { id: 'e1', name: 'AMINA DÉMO', matricule: 'D260001', gender: 'F', date_naissance: '2022-05-14', lieu_naissance: 'Yaoundé', nom_pere: 'PARENT UN', nom_mere: 'PARENT DEUX', photo_url: uri(400, 520), ...o }
  : { id: 'e1', name: 'AIDARBEK DANIEL', matricule: 's260009', gender: 'M', date_naissance: '2022-11-30', lieu_naissance: 'Kazakhstan', nom_pere: 'YERTAY TANGAT', nom_mere: 'ZHUMABAY NURDINA', parent_phone: '699574735', photo_url: uri(400, 520), ...o });
const DOMAINES = ['Langage et communication', 'Pre-reading and pre-writing', 'Pre-numeracy and logical reasoning', 'Psychomotor skills', 'Discovery of the world', 'Social and emotional life', 'Artistic activities', 'Personal autonomy'];
const OBS = ['Very good', 'Getting there', "Let's practise together", 'Good', 'Very curious', 'Making progress', 'Excellent', 'Good'];
const NIV = ['A', 'ECA', 'NA', 'A', 'A', 'ECA', 'A', 'A'];
const rows = (n = 8, niv = NIV, obs = OBS) => Array.from({ length: n }, (_, i) => ({
  code: `D${i + 1}`,
  intitule: DOMAINES[i] || `Domaine d'apprentissage numéro ${i + 1} avec un intitulé assez long pour passer à la ligne`,
  parUa: {}, niveau: niv[i % niv.length] ?? '', observation: obs ? obs[i % obs.length] : '',
}));
const avecUa = (r) => r.map((x, i) => ({ ...x, parUa: { 1: 'ECA', 2: NIV[i % NIV.length], 3: 'A' } }));
const base = {
  school, sys: 'EN', title: 'LEARNING UNIT 1 REPORT CARD — NURSERY', student: eleve(), classLabel: 'Nursery 1', effectif: 12,
  profPrincipal: DEMO ? 'Mme Enseignante' : 'Nji Mantoh Mearilyne', uas: [], rows: rows(), decision: '', paysage: true,
  appreciation: DEMO ? 'A happy and curious child who loves playing with friends.' : "Daniel is a happy and curious little boy who loves playing with his friends. Let's keep practising counting games together!",
};
const classique = { format: 'classique', emojis: false, visage: 'triste' };
const emojis = { format: 'classique', emojis: true, visage: 'triste' };
const enfantin = { format: 'enfantin', emojis: true, visage: 'encourageant' };
const CAS = {
  'classique-sans-emojis': { ...base, ...classique, paysage: false },
  'classique-emojis': { ...base, ...emojis },
  'enfantin': { ...base, ...enfantin },
  'enfantin-visage-triste': { ...base, ...enfantin, visage: 'triste' },
  'classique-emojis-visage-encourageant': { ...base, ...emojis, visage: 'encourageant' },
  'enfantin-6-domaines': { ...base, ...enfantin, rows: rows(6) },
  'enfantin-10-domaines': { ...base, ...enfantin, rows: rows(10) },
  'enfantin-14-domaines': { ...base, ...enfantin, rows: rows(14) },
  'classique-emojis-10-domaines': { ...base, ...emojis, rows: rows(10) },
  'enfantin-aucune-evaluation': { ...base, ...enfantin, rows: rows(8, [''], null) },
  'enfantin-tout-A': { ...base, ...enfantin, rows: rows(8, ['A'], null) },
  'enfantin-sans-photo': { ...base, ...enfantin, student: eleve({ photo_url: null }) },
  'classique-emojis-sans-photo': { ...base, ...emojis, student: eleve({ photo_url: null }) },
  'enfantin-nom-tres-long': { ...base, ...enfantin, student: eleve({ name: 'NGUEMA ONDOA Marie-Claire Françoise Éléonore de la Rédemption Mballa Essomba' }) },
  'enfantin-photo-paysage': { ...base, ...enfantin, student: eleve({ photo_url: uri(640, 300) }) },
  'enfantin-photo-carree': { ...base, ...enfantin, student: eleve({ photo_url: uri(300, 300) }) },
  'enfantin-photo-minuscule': { ...base, ...enfantin, student: eleve({ photo_url: uri(24, 32) }) },
  'enfantin-francais': { ...base, ...enfantin, sys: 'FR', title: "BULLETIN DE L'UA1 — MATERNELLE" },
  'enfantin-trimestre-3-ua': { ...base, ...enfantin, uas: [1, 2, 3], rows: avecUa(rows(8)) },
  'classique-emojis-trimestre-3-ua': { ...base, ...emojis, uas: [1, 2, 3], rows: avecUa(rows(8)) },
  'enfantin-couleur-rouge': { ...base, ...enfantin, school: { ...school, bulletin_accent: '#b91c1c' } },
  'enfantin-observation-ecole': { ...base, ...enfantin, rows: rows(8, NIV, ['', '', '', '', '', '', '', '']) },
};
const htmlDe = (corps) => `<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0;padding:0}${CSS}</style><style id="nc-print-styles">${CSS_PRINT}</style></head><body><div class="bulletin-panel">${corps}</div></body></html>`;

const dir = join(OUT, ETIQ); mkdirSync(dir, { recursive: true });
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const cptPage = await browser.newPage();
await cptPage.goto(writeDoc('__compteur', '<!doctype html><meta charset="utf-8"><body><script type="module">import * as pdfjs from "/node_modules/pdfjs-dist/build/pdf.mjs";pdfjs.GlobalWorkerOptions.workerSrc="/node_modules/pdfjs-dist/build/pdf.worker.mjs";window.__n=async(b)=>{const s=atob(b);const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return (await pdfjs.getDocument({data:u}).promise).numPages};window.__p=true;</' + 'script></body>', port));
await cptPage.waitForFunction(() => window.__p === true);
const filtre = process.argv[3];
for (const [nom, p] of Object.entries(CAS)) {
  if (filtre && !nom.includes(filtre)) continue;
  const html = htmlDe(renderToStaticMarkup(createElement(Mat, p)));
  writeFileSync(join(dir, `${nom}.html`), html, 'utf8');
  await page.goto(writeDoc(`mf-${ETIQ}-${nom}`, html, port), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'screen' });
  const bilan = await ajusterFeuilles(page, m);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true, margin: { top: `${m.margin}mm`, bottom: `${m.margin}mm`, left: `${m.margin}mm`, right: `${m.margin}mm` } });
  writeFileSync(join(dir, `${nom}.pdf`), pdf);
  const pages = await cptPage.evaluate((b) => window.__n(b), Buffer.from(pdf).toString('base64'));
  const d = bilan[0] ? `densité ${bilan[0].d?.toFixed?.(3)} (${bilan[0].etat})` : 'sans densité mesurée';
  console.log(`${nom.padEnd(40)} ${pages} page(s)  ${d}`);
}
await browser.close(); server.close();
