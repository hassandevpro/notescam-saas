// Capacité d'une page pour le BULLETIN PRIMAIRE COMPACT.
//
// Mesure la hauteur réelle du gabarit à la géométrie d'IMPRESSION du profil
// « bulletin » (A4 portrait, marge 8 mm), bloc par bloc, pour savoir ce qui le
// fait déborder sur une seconde page et de combien.
//
// POURQUOI MESURER PLUTÔT QUE RÉGLER À L'ŒIL. `fitLiveSheets` réduit déjà
// chaque feuille, mais refuse de descendre sous `MIN_FIT_SCALE` (0,86) : en
// dessous, un bulletin devient illisible, et il coule alors sur deux pages.
// Savoir si l'on est à 0,88 ou à 0,62 change tout — dans un cas il manque
// quelques millimètres, dans l'autre il faut revoir la disposition.
//
// Le composant RÉEL est rendu (react-dom/server + loader JSX) : mesurer une
// copie HTML écrite à la main ne prouverait rien sur ce qui s'imprime.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/print-capacity-bulletin.mjs
import { createRequire } from 'node:module';
import { startServer, writeDoc } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { readFileSync } = require('node:fs');

const SRC = new URL('../src/', import.meta.url).href;

// Vu par le loader à la place de `import.meta.env` (cf. jsx-resolve.mjs). Les
// clés restent VIDES : ce banc mesure une mise en page, il ne contacte rien.
globalThis.__VITE_ENV__ = {};

const { pageMetrics } = await import(`${SRC}lib/print/printStyles.js`);
const { MIN_FIT_SCALE, facteurFit } = await import(`${SRC}lib/print/fitLiveSheets.js`);
const { default: BulletinPrimCompact } = await import(`${SRC}components/bulletins/BulletinPrimCompact.jsx`);
const { createElement } = require('react');

const CSS = readFileSync(new URL('../src/styles/bulletin.css', import.meta.url), 'utf8');
const m = pageMetrics('bulletin');

// ── Fixtures : le cas RÉEL le plus lourd ────────────────────────────────────
// Niveau 3 (CM1/CM2) : 11 compétences nationales, 4 critères, 6 regroupements.
// Plus ce que le carnet de THE GENIUS porte en pied — c'est l'ensemble de ces
// blocs facultatifs qui fait déborder, pas les onze lignes seules.
const CRITERES = [
  { id: 'cr-oral', nom: 'Oral' }, { id: 'cr-ecrit', nom: 'Écrit' },
  { id: 'cr-prat', nom: 'Pratique' }, { id: 'cr-sav', nom: 'Savoir-être' },
];

const COMPETENCES = [
  ['1A', 'Communiquer en français', 'langues'],
  ['1B', 'Communiquer en anglais', 'langues'],
  ['1C', 'Pratiquer au moins une langue nationale', 'langues'],
  ['2A', 'Utiliser les notions de base en mathématiques', 'maths_sciences'],
  ['2B', 'Utiliser les notions de base en sciences et technologies', 'maths_sciences'],
  ['3A', 'Pratiquer les valeurs sociales et citoyennes', 'vie_citoyennete'],
  ['4A', "Démontrer l'autonomie et l'esprit d'initiative", 'autonomie'],
  ['4B', "Faire preuve de créativité et d'esprit d'entreprenariat", 'autonomie'],
  ['5A', "Utiliser les outils des technologies de l'information", 'tic'],
  ['6A', 'Pratiquer les activités physiques et sportives', 'arts_sport'],
  ['6B', 'Pratiquer les activités artistiques', 'arts_sport'],
];

// Au-delà de onze, on PROLONGE comme le fait le réel : le bulletin bilingue
// porte deux blocs de langue et duplique les compétences non linguistiques, et
// une école ajoute ses lignes maison (CHINESE, Practical Work, ICT…). On garde
// donc le même domaine pour que les regroupements grossissent aussi — c'est eux
// qui coûtent le plus cher, et les ignorer sous-estimerait le débordement.
const MAISON = [
  ['CH', 'Chinese', 'langues'], ['PW', 'Practical Work', 'maths_sciences'],
  ['EG', 'Économie Générale', 'maths_sciences'], ['MU', 'Music', 'arts_sport'],
  ['NL', 'National Language 2', 'langues'], ['IC', 'ICT Practice', 'tic'],
  ['AC', 'Art and Crafts', 'arts_sport'], ['EP', 'EPS 2', 'arts_sport'],
  ['DQ', 'Dictée - Question', 'langues'], ['CR', 'Calcul Rapide', 'maths_sciences'],
  ['GE', 'General Knowledge', 'vie_citoyennete'],
];
// Au-delà de 22, on prolonge mécaniquement : il ne s'agit plus de ressembler au
// réel mais de trouver le point de rupture du gabarit.
const DOMAINES = ['langues', 'maths_sciences', 'vie_citoyennete', 'autonomie', 'tic', 'arts_sport'];
const TOUTES = [...COMPETENCES, ...MAISON,
  ...Array.from({ length: 24 }, (_, i) => [
    `X${i + 1}`, `Épreuve complémentaire n°${i + 1} de l'école`, DOMAINES[i % 6],
  ])];

const rowsFor = (n) => TOUTES.slice(0, n).map(([code, intitule, domaine], i) => ({
  code, intitule, domaine,
  parCritere: Object.fromEntries(CRITERES.map((c, j) => [c.id,
    { note: 12 + ((i + j) % 8), max: 20 }])),
  achieved: 54 + (i % 7), possible: 80, cote: ['A+', 'A', 'ECA', 'NA'][i % 4],
  nonEvaluee: false,
}));

const school = {
  id: 'sch-1', name: 'THE GENIUS BILINGUAL ACADEMY', current_year: '2025-2026',
  city: 'Yaoundé', country_code: 'cameroon', motto: 'Travail — Discipline — Réussite',
};
const cls = { id: 'cls-1', name: 'CM2 A', level: 'CM2', system: 'FR' };
const student = { id: 'st-1', name: 'NGUEMA ONDOA Marie-Claire', matricule: 'G-2025-0147', birth_date: '2015-03-14' };

const COTE_BAREME = [
  { cote: 'A+', libelle: 'Très bien acquis', seuil_min: 80 },
  { cote: 'A', libelle: 'Acquis', seuil_min: 60 },
  { cote: 'ECA', libelle: "En cours d'acquisition", seuil_min: 40 },
  { cote: 'NA', libelle: 'Non acquis', seuil_min: 0 },
];

const REPARTITION = [
  { label: '[0-4.99]', n: 1 }, { label: '[5-9.99]', n: 4 }, { label: '[10-11.99]', n: 9 },
  { label: '[12-13.99]', n: 11 }, { label: '[14-15.99]', n: 7 }, { label: '[16-20]', n: 3 },
];

const ADDITIONAL = [
  { id: 'a1', name: 'Social Values', parCritere: { 'cr-ecrit': { note: 15, max: 20 } }, achieved: 15, possible: 20, cote: 'A' },
  { id: 'a2', name: 'Music', parCritere: { 'cr-prat': { note: 17, max: 20 } }, achieved: 17, possible: 20, cote: 'A+' },
];

/**
 * Un bulletin, avec les blocs demandés. `blocs` dit lesquels des éléments
 * FACULTATIFS du carnet sont présents — c'est la combinaison qui décide.
 */
function bulletinHtml(n, blocs = {}) {
  const rows = rowsFor(n);
  const props = {
    school, cls, student, sys: 'FR', effectif: 35, periodLabel: 'Trimestre 2',
    critereColumns: CRITERES, rows,
    overall: { achieved: 612, possible: 880, pct: 69.5, evaluees: n, nonEvaluees: 0 },
    niveauTotal: 300, nonEvalueesCodes: blocs.provisoire ? ['5A', '6B'] : [],
    moyenneGenerale: 13.92, coteGenerale: 'A', rank: 7,
    appreciationGenerale: blocs.appreciation ? 'Travail sérieux et régulier ; peut encore progresser à l’écrit.' : null,
    decision: blocs.appreciation ? 'Admis(e) en classe supérieure' : null,
    groupes: blocs.groupes !== false,
    mentions: blocs.mentions ? { avertissement: 'non', tableauHonneur: 'oui', encouragement: 'oui' } : null,
    statsClasse: blocs.stats ? { premier: 17.4, dernier: 6.2, generale: 12.8 } : null,
    repartition: blocs.repartition ? REPARTITION : [],
    additionalSubjects: blocs.additional ? ADDITIONAL : [],
    coteBareme: blocs.legende ? COTE_BAREME : [],
    signatureParent: !!blocs.signatureParent,
    titulaire: 'Mme ABESSOLO Jeanne',
    pt: 9,
  };
  const body = renderToStaticMarkup(createElement(BulletinPrimCompact, props));
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { size: A4 portrait; margin: ${m.margin}mm; }
    html,body{margin:0;padding:0}
    ${CSS}
  </style></head><body><div class="bulletin-panel">${body}</div></body></html>`;
}

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

async function mesure(nom, n, blocs) {
  const html = bulletinHtml(n, blocs);
  await page.goto(writeDoc(`bul-${nom}`, html, port), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const h = await page.evaluate((w) => {
    const el = document.querySelector('.bulletin-paper');
    el.style.setProperty('width', `${w}mm`, 'important');
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('transform', 'none', 'important');
    return el.offsetHeight;
  }, m.contentW);
  const besoin = h / m.contentHpx;              // facteur qu'il FAUDRAIT
  const fit = facteurFit(h, m.contentHpx);      // ce que le socle accepte
  const tient = h - 1 <= m.contentHpx;
  const etat = tient ? 'tient déjà'
    : fit != null ? `réduit à ${fit}`
    : `DÉBORDE — il faudrait ${(1 / besoin).toFixed(3)} < ${MIN_FIT_SCALE}`;
  console.log(
    `  ${nom.padEnd(26)} ${String(Math.round(h)).padStart(5)} px  `
    + `(${(h / m.contentHpx * 100).toFixed(1)} % de la page)  ${etat}`,
  );
  return { nom, h, fit, tient };
}

console.log(`Profil « bulletin » : ${m.contentW}×${m.contentH} mm `
  + `(${Math.round(m.contentWpx)}×${Math.round(m.contentHpx)} px)`);
console.log(`Plancher de lisibilité MIN_FIT_SCALE = ${MIN_FIT_SCALE}\n`);

const TOUT = {
  groupes: true, legende: true, provisoire: true, appreciation: true,
  mentions: true, stats: true, repartition: true, additional: true, signatureParent: true,
};

console.log('— Le carnet COMPLET, par nombre de compétences');
for (const n of [11, 14, 17, 19, 22]) await mesure(`${n} compétences`, n, TOUT);

console.log('\n— 11 compétences : ce que coûte chaque bloc facultatif');
await mesure('nu (aucun bloc)', 11, { groupes: false });
for (const bloc of ['groupes', 'legende', 'provisoire', 'appreciation', 'mentions',
  'stats', 'repartition', 'additional', 'signatureParent']) {
  await mesure(`+ ${bloc}`, 11, { groupes: false, [bloc]: true });
}

console.log('\n— Jusqu\'où le carnet complet tient-il, maintenant ?');
for (const n of [17, 19, 22, 24, 26, 28, 30]) await mesure(`${n} compétences`, n, TOUT);

// ── OÙ PART LA HAUTEUR ? ────────────────────────────────────────────────────
// On ne coupe pas au hasard : on mesure chaque bloc de premier niveau de la
// feuille, plus le rembourrage de la feuille elle-même. C'est ce relevé qui dit
// où il y a du gras et où il y a de l'information.
console.log('\n— Décomposition du carnet complet à 22 compétences');
{
  const html = bulletinHtml(22, TOUT);
  await page.goto(writeDoc('bul-decomp', html, port), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const detail = await page.evaluate((w) => {
    const paper = document.querySelector('.bulletin-paper');
    paper.style.setProperty('width', `${w}mm`, 'important');
    paper.style.setProperty('max-width', 'none', 'important');
    paper.style.setProperty('transform', 'none', 'important');
    const cs = getComputedStyle(paper);
    const inner = paper.querySelector(':scope > div[style*="z-index"]') || paper;
    const blocs = [...inner.children].map((el) => ({
      tag: el.tagName.toLowerCase(),
      h: el.offsetHeight,
      apercu: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46),
    }));
    // Les lignes du tableau principal, pour isoler le coût d'une compétence et
    // celui d'un bandeau de regroupement.
    const t = inner.querySelector('table');
    const trs = t ? [...t.querySelectorAll('tr')].map((tr) => tr.offsetHeight) : [];
    return {
      padTop: parseFloat(cs.paddingTop), padBottom: parseFloat(cs.paddingBottom),
      blocs, trs,
    };
  }, m.contentW);

  console.log(`  rembourrage feuille : ${detail.padTop} px en haut + ${detail.padBottom} px en bas`
    + `  ⟵ EN PLUS de la marge @page de ${m.margin} mm`);
  for (const b of detail.blocs) {
    console.log(`  ${String(Math.round(b.h)).padStart(5)} px  <${b.tag}>  ${b.apercu}`);
  }
  const uniq = [...new Set(detail.trs)].sort((a, b) => a - b);
  console.log(`  lignes du tableau : ${detail.trs.length} au total, hauteurs ${uniq.join(' / ')} px`);
}

// ── LA PREUVE : COMBIEN DE PAGES DANS LE PDF ? ──────────────────────────────
//
// La hauteur mesurée dit ce que le gabarit devrait faire ; le PDF dit ce que
// l'imprimante recevra. C'est la règle du banc : on ne juge jamais un document
// sur son apparence à l'écran. On applique donc le MÊME facteur que
// `fitLiveSheets` poserait, puis on compte les pages.
console.log('\n— PDF réel : nombre de pages (auto-ajustement appliqué comme à l’impression)');
{
  // pdf.js doit être chargé en MODULE : la page doit donc venir du serveur
  // HTTP du harnais, pas d'un file://. Même mécanisme qu'openRasterizer.
  const compteurHtml = '<!doctype html><meta charset="utf-8"><body><script type="module">'
    + "import * as pdfjs from '/node_modules/pdfjs-dist/build/pdf.mjs';"
    + "pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';"
    + 'window.__numPages = async (b64) => {'
    + '  const bin = atob(b64); const bytes = new Uint8Array(bin.length);'
    + '  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);'
    + '  return (await pdfjs.getDocument({ data: bytes }).promise).numPages;'
    + '}; window.__pret = true;'
    + '</' + 'script></body>';
  const pdfjsPage = await browser.newPage();
  await pdfjsPage.goto(writeDoc('__compteur', compteurHtml, port));
  await pdfjsPage.waitForFunction(() => window.__pret === true, null, { timeout: 20000 });
  let tout = true;
  for (const n of [11, 17, 19, 22, 26, 30]) {
    const html = bulletinHtml(n, TOUT);
    await page.goto(writeDoc(`bul-pdf-${n}`, html, port), { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    // Le facteur que le socle poserait, mesuré dans les mêmes conditions.
    const h = await page.evaluate((w) => {
      const el = document.querySelector('.bulletin-paper');
      const sauve = el.getAttribute('style') || '';
      el.style.setProperty('width', `${w}mm`, 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('margin', '0', 'important');
      el.style.setProperty('transform', 'none', 'important');
      const mesure = el.offsetHeight;
      el.setAttribute('style', sauve);
      return mesure;
    }, m.contentW);
    const s = facteurFit(h, m.contentHpx);
    if (s != null) {
      await page.evaluate((v) => {
        document.querySelector('.bulletin-paper').style.setProperty('--nc-fit', String(v));
      }, s);
    }
    const pdf = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: `${m.margin}mm`, bottom: `${m.margin}mm`, left: `${m.margin}mm`, right: `${m.margin}mm` },
    });
    const pages = await pdfjsPage.evaluate(
      (b64) => window.__numPages(b64),
      Buffer.from(pdf).toString('base64'),
    );
    const ok = pages === 1;
    if (!ok) tout = false;
    console.log(`  ${String(n).padStart(2)} compétences : ${pages} page(s)`
      + `${s != null ? ` (réduit à ${s})` : ''}  ${ok ? 'OK' : '⟵ DÉBORDE'}`);
  }
  console.log(tout ? '\n  ✅ Tous tiennent sur UNE page.' : '\n  ❌ Au moins un déborde.');
}

await browser.close();
server.close();
