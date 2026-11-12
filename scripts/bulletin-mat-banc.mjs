// BANC : bulletin MATERNELLE vs bulletin PRIMAIRE — rendu réel, PDF réel, nombre de pages, HTML de comparaison.
//
//   npm run build            (le CSS du build est indispensable, cf. print-capacity-bulletin.mjs)
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-mat-banc.mjs avant
//   ... modifier le code ...
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-mat-banc.mjs apres
//   node scripts/bulletin-mat-banc.mjs compare
//
// Écrit .print-tests/mat-banc/<etiquette>/<cas>.{html,pdf} et affiche le nombre de pages de chaque cas.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ETIQ = process.argv[2] || 'apres';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, '.print-tests', 'mat-banc');

if (ETIQ === 'compare') {
  const h = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
  const A = join(OUT, 'avant'), P = join(OUT, 'apres');
  let ko = 0;
  for (const f of readdirSync(A).filter((x) => x.endsWith('.html')).sort()) {
    const same = existsSync(join(P, f)) && h(join(A, f)) === h(join(P, f));
    const mat = f.startsWith('mat-');
    console.log(`${same ? '= identique' : '≠ DIFFÉRENT '}  ${f}${mat ? '   (maternelle : changement attendu)' : ''}`);
    if (!same && !mat) ko++;
  }
  console.log(ko ? `\n❌ ${ko} bulletin(s) primaire/secondaire modifié(s)` : '\n✅ primaire/secondaire : HTML strictement identique avant/après');
  process.exit(ko ? 1 : 0);
}

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { startServer, writeDoc } = await import('./lib/print-harness.mjs');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../src/', import.meta.url).href;
const { pageMetrics, printCss } = await import(`${SRC}lib/print/printStyles.js`);
const { ajusterFeuilles } = await import('./lib/densite-navigateur.mjs');
const { default: BulletinMatOfficial } = await import(`${SRC}components/bulletins/BulletinMatOfficial.jsx`);
const { default: BulletinPrimAnnualUA } = await import(`${SRC}components/bulletins/BulletinPrimAnnualUA.jsx`);

const dossierCss = new URL('../dist/assets/', import.meta.url);
const fich = readdirSync(dossierCss);
const CSS = [fich.find((x) => /^index-.*\.css$/.test(x)), fich.find((x) => /^Bulletins-.*\.css$/.test(x))]
  .filter(Boolean).map((x) => readFileSync(new URL(x, dossierCss), 'utf8')).join('\n');
const CSS_PRINT = printCss({ profile: 'bulletin', screen: false, page: true });
const m = pageMetrics('bulletin');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABuCAIAAAAoIZPuAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABHUlEQVR4nO3awQ3CQBAEQecfwAVBJB2WX0h8LGHhYz8lOYLW7EwbfKxXnvWGcGCxPgIBR3B0dRPSERxJR9+MhmMJjqQjx9JdydQdwZF05FjSHf3yjq5KgyPpyLGkO1KlPfWLr2UJjqQjx5LuSJVmWdrxd6qhDY6kI8eS7kiVZlkytO1AYGiDI+nIsaQ7UqVZlgxtuxHwjuBIOnIs6Y5UaZYlQxvv6J8IaFhwJB05lnRHqjTLkqGNd0TDmkLASoMj6cixpDtSpVmWDG28IxrWuJL6RD84ko4cS7ojVZplydDGO6JhsdLG9ZykB0fSkWNJd6RKsywZ2nhHNCxW2ribk/TgSDpyLOmOVGmWJUMb74iGxUobR0DSgyPp6O6xnCtQkfOw1mzpAAAAAElFTkSuQmCC';
const school = { id: 's1', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', country_code: 'cameroon', current_year: '2026-2027', city: 'Douala', motto: 'Discipline — Travail — Réussite' };
const eleve = (o = {}) => ({ id: 'e1', name: 'ABDOUL AZIZ ALKASSOUM', matricule: 'N-0147', gender: 'M', date_naissance: '2020-03-14', ...o });

const DOMAINES_FR = ['Langage et communication', 'Graphisme et pré-écriture', 'Numération et logique', 'Psychomotricité', 'Découverte du monde', 'Vivre ensemble', 'Activités artistiques', 'Autonomie et hygiène'];
const DOMAINES_EN = ['Language and communication', 'Graphics and pre-writing', 'Numeracy and logic', 'Psychomotor skills', 'Discovering the world', 'Living together', 'Artistic activities', 'Autonomy and hygiene'];
const COTES = ['A', 'ECA', 'NA'];
const matRows = (noms, obs = 'S’exprime bien et participe avec plaisir.') => noms.map((n, i) => ({
  code: `D${i + 1}`, intitule: n,
  parUa: { 1: COTES[i % 3], 2: COTES[(i + 1) % 3], 3: i % 4 === 0 ? '' : COTES[(i + 2) % 3] },
  niveau: COTES[(i + 1) % 3], observation: i % 2 ? obs : '',
}));
const plus = (n) => Array.from({ length: n }, (_, i) => `Domaine complémentaire n°${i + 1} de l’école — éveil et découverte`);

const CAS_MAT = {
  'mat-standard':       { sys: 'FR', student: eleve(), rows: matRows(DOMAINES_FR), uas: [1, 2, 3] },
  'mat-nom-long-photo': { sys: 'FR', student: eleve({ name: 'NGUEMA ONDOA Marie-Claire Françoise Éléonore de la Rédemption', photo_url: PNG }), rows: matRows(DOMAINES_FR), uas: [1, 2, 3] },
  'mat-sans-photo-ua1': { sys: 'FR', student: eleve({ name: 'N’GUESSAN Ève-Marie' }), rows: matRows(DOMAINES_FR), uas: [1] },
  'mat-bilingue-en':    { sys: 'EN', student: eleve({ name: 'TCHOUTA Joël' }), rows: matRows(DOMAINES_EN, 'Expresses himself well.'), uas: [1, 2, 3] },
  'mat-24-domaines':    { sys: 'FR', student: eleve(), rows: matRows([...DOMAINES_FR, ...plus(16)], 'Observation un peu plus longue pour vérifier le retour à la ligne dans la cellule.'), uas: [1, 2, 3] },
};

const CR = [{ id: 'c1', nom: 'Oral', points_max: 5 }, { id: 'c2', nom: 'Écrit', points_max: 10 }, { id: 'c3', nom: 'Pratique', points_max: 5 }];
const primRow = (i) => ({
  code: `${i + 1}A`, intitule: `Compétence ${i + 1} du primaire`, criteres: CR, domaine: null,
  totalAchieved: 15, totalPossible: 20, totalCote: 'A',
  uas: [1, 2, 3].map((ua) => ({ ua, trimestre: 1, notesByCritere: { c1: 4, c2: 8, c3: 4 }, baremes: { c1: 5, c2: 10, c3: 5 }, achieved: 16, possible: 20, cote: 'A' })),
});
const primProps = { school, sys: 'FR', title: 'BULLETIN DU PREMIER TRIMESTRE', student: eleve(), classLabel: 'CE1', effectif: 32, profPrincipal: 'Mme ABESSOLO Jeanne',
  competenceRows: Array.from({ length: 5 }, (_, i) => primRow(i)), moyenneGenerale: 14.5, coteGenerale: 'A', rang: 3,
  classStats: { avg: 12.1, max: 17, min: 6, reussis: 25, echoues: 7, rate: 78 }, appreciation: 'Bon travail.' };

const CAS_AUTRES = {
  'prim-detaille': { C: BulletinPrimAnnualUA, p: primProps },
  'prim-detaille-bil-en': { C: BulletinPrimAnnualUA, p: { ...primProps, sys: 'EN', title: 'FIRST TERM REPORT' } },
};

const htmlDe = (corps) => `<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0;padding:0}${CSS}</style><style id="nc-print-styles">${CSS_PRINT}</style></head><body><div class="bulletin-panel">${corps}</div></body></html>`;

const dir = join(OUT, ETIQ); mkdirSync(dir, { recursive: true });
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
const cptPage = await browser.newPage();
await cptPage.goto(writeDoc('__compteur', '<!doctype html><meta charset="utf-8"><body><script type="module">import * as pdfjs from "/node_modules/pdfjs-dist/build/pdf.mjs";pdfjs.GlobalWorkerOptions.workerSrc="/node_modules/pdfjs-dist/build/pdf.worker.mjs";window.__n=async(b)=>{const s=atob(b);const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return (await pdfjs.getDocument({data:u}).promise).numPages};window.__p=true;</' + 'script></body>', port));
await cptPage.waitForFunction(() => window.__p === true);

const tout = [
  ...Object.entries(CAS_MAT).map(([nom, c]) => [nom, createElement(BulletinMatOfficial, { school, title: c.sys === 'EN' ? 'FIRST TERM REPORT' : 'BULLETIN DU PREMIER TRIMESTRE', classLabel: 'Petite Section', effectif: 28, profPrincipal: 'Mme ABESSOLO Jeanne', appreciation: 'Enfant curieux et attentif.', decision: '', ...c })]),
  ...Object.entries(CAS_AUTRES).map(([nom, c]) => [nom, createElement(c.C, c.p)]),
];
for (const [nom, el] of tout) {
  const html = htmlDe(renderToStaticMarkup(el));
  writeFileSync(join(dir, `${nom}.html`), html, 'utf8');
  await page.goto(writeDoc(`mb-${ETIQ}-${nom}`, html, port), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'screen' });
  const bilan = await ajusterFeuilles(page, m);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: `${m.margin}mm`, bottom: `${m.margin}mm`, left: `${m.margin}mm`, right: `${m.margin}mm` } });
  writeFileSync(join(dir, `${nom}.pdf`), pdf);
  const pages = await cptPage.evaluate((b) => window.__n(b), Buffer.from(pdf).toString('base64'));
  const d = bilan[0] ? `densité ${bilan[0].d?.toFixed?.(3)} (${bilan[0].etat})` : 'sans densité mesurée';
  console.log(`${nom.padEnd(24)} ${pages} page(s)  ${d}`);
}
await browser.close(); server.close();
