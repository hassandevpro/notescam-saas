// BANC : bulletin PRIMAIRE à note unique — rendu réel, PDF réel, nombre de pages, HTML de comparaison.
//
//   npm run build            (le CSS du build est indispensable, cf. print-capacity-bulletin.mjs)
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-note-unique-banc.mjs avant
//   ... modifier le code ...
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-note-unique-banc.mjs apres
//   node scripts/bulletin-note-unique-banc.mjs compare
//
// Écrit .print-tests/nu-banc/<etiquette>/<cas>.{html,pdf} et affiche le nombre de pages de chaque cas.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ETIQ = process.argv[2] || 'apres';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, '.print-tests', 'nu-banc');


const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { startServer, writeDoc } = await import('./lib/print-harness.mjs');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../src/', import.meta.url).href;
const { pageMetrics, printCss } = await import(`${SRC}lib/print/printStyles.js`);
const { ajusterFeuilles } = await import('./lib/densite-navigateur.mjs');
const { default: BulletinPrimNoteUnique } = await import(`${SRC}components/bulletins/BulletinPrimNoteUnique.jsx`);
const N = await import(`${SRC}core/primNoteUnique.js`);
const { PRIM_COTE_DEFAULT, buildPrimRanks } = await import(`${SRC}core/primEngine.js`);
const { computePrimClassStats } = await import(`${SRC}core/primClassStats.js`);

const dossierCss = new URL('../dist/assets/', import.meta.url);
const fich = readdirSync(dossierCss);
const CSS = [fich.find((x) => /^index-.*\.css$/.test(x)), fich.find((x) => /^Bulletins-.*\.css$/.test(x))]
  .filter(Boolean).map((x) => readFileSync(new URL(x, dossierCss), 'utf8')).join('\n');
const CSS_PRINT = printCss({ profile: 'bulletin', screen: false, page: true });
const m = pageMetrics('bulletin');


const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAABuCAIAAAAoIZPuAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABHUlEQVR4nO3awQ3CQBAEQecfwAVBJB2WX0h8LGHhYz8lOYLW7EwbfKxXnvWGcGCxPgIBR3B0dRPSERxJR9+MhmMJjqQjx9JdydQdwZF05FjSHf3yjq5KgyPpyLGkO1KlPfWLr2UJjqQjx5LuSJVmWdrxd6qhDY6kI8eS7kiVZlkytO1AYGiDI+nIsaQ7UqVZlgxtuxHwjuBIOnIs6Y5UaZYlQxvv6J8IaFhwJB05lnRHqjTLkqGNd0TDmkLASoMj6cixpDtSpVmWDG28IxrWuJL6RD84ko4cS7ojVZplydDGO6JhsdLG9ZykB0fSkWNJd6RKsywZ2nhHNCxW2ribk/TgSDpyLOmOVGmWJUMb74iGxUobR0DSgyPp6O6xnCtQkfOw1mzpAAAAAElFTkSuQmCC';
const school = { id: 's1', name: 'ÉCOLE PRIMAIRE DE DÉMONSTRATION', country_code: 'cameroon', current_year: '2026-2027', city: 'Bafoussam', phone: '690 56 76 76', current_year_label: '2026-2027' };
const eleve = (o = {}) => ({ id: 'e1', name: 'AKATEU MEGNE INDIRA FALIDA', matricule: 'P260048', gender: 'F', date_naissance: '2015-04-03', lieu_naissance: 'BAFOUSSAM', nom_pere: 'SIKADI ERIC', nom_mere: 'METTIEDJIE BOPDA YOLANDE', parent_phone: '670432085', ...o });
const MODELE = [['Communicate in English', 28, 50], ['Langue nationale', 16, 20], ['Sciences et technologies', 31.5, 50], ["Technologies de l'information (TIC)", 21, 30], ['Activités physiques et sportives', 18, 20], ['Activités artistiques', 16.5, 20], ['Dictée-question', 20.5, 40], ['Étude de texte', 19, 30], ["Production d'écrits", 20, 30], ['Calcul rapide', 13, 20], ['Connaissances générales', 22.5, 40], ['Problème', 34.5, 50]];
const mat = (l) => l.map(([intitule, a, p]) => ({ intitule, cells: [{ achieved: a, possible: p }] }));
const extra = (n) => Array.from({ length: n }, (_, i) => [`Matière complémentaire n°${i + 1} avec un intitulé volontairement long pour vérifier le retour à la ligne`, 10 + (i % 7), 20]);
const REP = [[0, 3.99], [4, 5.99], [6, 7.99], [8, 9.99], [10, 11.99], [12, 13.99], [14, 15.99], [16, 17.99], [18, 20]].map(([a, b], i) => ({ label: `[${a}-${b}]`, n: [0, 0, 0, 0, 1, 8, 5, 11, 0][i] }));
const cas = (liste, o = {}) => {
  const lignes = N.lignesNoteUnique(mat(liste), PRIM_COTE_DEFAULT);
  const totaux = N.totauxNoteUnique(lignes);
  const g = totaux.moyenne == null ? null : (await_cote(totaux.moyenne));
  return { school, cls: { name: 'CM2' }, student: eleve(), sys: 'FR', effectif: 26, titulaire: 'ATEBA TONJON CYNTHIA', title: N.titreNoteUnique({ label: 'Séquence 1' }, 'FR', true),
    lignes, totaux, coteGenerale: g, coteBareme: PRIM_COTE_DEFAULT, appreciationGenerale: 'En cours d’acquisition', decision: '', rank: 19, observations: '',
    mentions: { avertissement: 'non', tableauHonneur: 'non', encouragement: 'non', felicitation: 'non' },
    statsClasse: { premier: 17.74, dernier: 11.79, generale: 15.25, reussis: 25, echoues: 0, reussite: 100 }, repartition: REP, repartitionTotal: 25, ...o };
};
function await_cote(m) { const b = PRIM_COTE_DEFAULT.slice().sort((a, c) => c.seuil_min - a.seuil_min); return (b.find((x) => (m / 20) * 100 >= x.seuil_min) || b[b.length - 1]).cote; }
const CAS = {
  'nu-modele-cm2': cas(MODELE),
  'nu-8-matieres': cas(MODELE.slice(0, 8)),
  'nu-16-matieres': cas([...MODELE, ...extra(4)]),
  'nu-20-matieres-noms-longs': cas([...MODELE, ...extra(8)]),
  'nu-nom-long-sans-photo': cas(MODELE, { student: eleve({ name: 'NGUEMA ONDOA Marie-Claire Françoise Éléonore de la Rédemption Mballa Essomba' }) }),
  'nu-avec-photo': cas(MODELE, { student: eleve({ photo_url: PNG }) }),
  'nu-sans-logo-ni-cachet': cas(MODELE, { school: { ...school, logo_url: null, stamp_url: null, signature_url: null } }),
  'nu-couleur-bleue': cas(MODELE, { school: { ...school, bulletin_accent: '#1d4ed8' } }),
  'nu-en': cas(MODELE, { sys: 'EN', title: N.titreNoteUnique({ label: 'Sequence 1' }, 'EN') }),
  'nu-matiere-non-notee': cas([...MODELE.slice(0, 10), ['Chinois', null, null], ['Compétence APC (somme des critères)', 19, 30]]),
};
const htmlDe = (corps) => `<!doctype html><html><head><meta charset="utf-8"/><style>html,body{margin:0;padding:0}${CSS}</style><style id="nc-print-styles">${CSS_PRINT}</style></head><body><div class="bulletin-panel">${corps}</div></body></html>`;

const dir = join(OUT, ETIQ); mkdirSync(dir, { recursive: true });
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
const cptPage = await browser.newPage();
await cptPage.goto(writeDoc('__compteur', '<!doctype html><meta charset="utf-8"><body><script type="module">import * as pdfjs from "/node_modules/pdfjs-dist/build/pdf.mjs";pdfjs.GlobalWorkerOptions.workerSrc="/node_modules/pdfjs-dist/build/pdf.worker.mjs";window.__n=async(b)=>{const s=atob(b);const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return (await pdfjs.getDocument({data:u}).promise).numPages};window.__p=true;</' + 'script></body>', port));
await cptPage.waitForFunction(() => window.__p === true);

const tout = Object.entries(CAS).map(([nom, p]) => [nom, createElement(BulletinPrimNoteUnique, p)]);
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
