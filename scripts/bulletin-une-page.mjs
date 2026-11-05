// LE BULLETIN « APC REPORT CARD » TIENT-IL SUR UNE PAGE A4 ? — mesuré, pas supposé.
//
// Chaîne : composant RÉEL (`BulletinAPC`) → HTML → Chromium en média print → PDF →
// nombre de pages (pdf-lib) → rastérisation PNG (pdf.js). Et, avant cela, la
// hauteur de chaque bloc de la feuille à la géométrie d'impression.
//
//   npm run build        (le banc charge le CSS livré)
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/bulletin-une-page.mjs [options]
//
//   --classe  form1 | class5 | ce1bil     (16 / 27 / 44 matières)      défaut form1
//   --sans-photo                            élève sans photo
//   --beaucoup-abs                          presque toutes les cases « ABS »
//   --fit                                   applique `fitLiveSheets` comme l'application
//   --png <dossier>                         écrit les PNG des pages
//   --json                                  sortie machine (utilisée par le test)

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, writeDoc, openRasterizer, rasterize } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { PDFDocument } = require('pdf-lib');

globalThis.__VITE_ENV__ = {};
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)), removeItem: (k) => _store.delete(k),
};
globalThis.sessionStorage = globalThis.localStorage;

const SRC = new URL('../src/', import.meta.url).href;
const { printCss, pageMetrics, PX_PER_MM } = await import(`${SRC}lib/print/printStyles.js`);
const { BulletinAPC } = await import(`${SRC}pages/Bulletins.jsx`);

const ARGV = process.argv.slice(2);
const flag = (n) => ARGV.includes(n);
const opt = (n, d) => { const i = ARGV.indexOf(n); return i >= 0 ? ARGV[i + 1] : d; };

// ── Les matières : noms, groupes et enseignants réalistes (THE GENIUS, FORM1) ──
const FORM1 = [
  ['Français intensif', 5, 'BETEGNE GHISLAIN AIME', 'Langues'],
  ['English Language', 4, 'BOMOIN NJOMBU SHERIFA CORANI', 'Langues'],
  ['Chinese', 1, 'EBENSOH AGNES', 'Langues'],
  ['Literature in English', 2, 'BOMOIN NJOMBU SHERIFA CORANI', 'Langues'],
  ['Mathematics', 4, 'EKOH WALLIST USABI', 'Sciences'],
  ['Biology', 2, 'DJIEUFACK PHILADELPHE', 'Sciences'],
  ['Chemistry', 2, 'DJIEUFACK PHILADELPHE', 'Sciences'],
  ['Physics', 2, 'EKOH WALLIST USABI', 'Sciences'],
  ['ICT', 2, 'EKOH WALLIST USABI', 'Sciences'],
  ['Geography', 2, 'DJIEUFACK PHILADELPHE', 'Sciences sociales'],
  ['History', 2, 'DJIEUFACK PHILADELPHE', 'Sciences sociales'],
  ['Citizenship', 2, 'DJIEUFACK PHILADELPHE', 'Sciences sociales'],
  ['Physical Education', 2, 'MEZELIEU TAKUNJUH SIJANDEMICE', 'Arts'],
  ['Home Economics', 2, 'GUJONG ODILIA', 'Arts'],
  ['Manual Labour', 1, 'DJIEUFACK PHILADELPHE', 'Arts'],
  ['Genius Labs', 1, 'AKIMBOM VANESSA', 'Autres'],
];
const NOMS = ['Mathematics', 'Physics', 'Biology', 'Chemistry', 'Geography', 'History', 'Literature', 'Grammar',
  'Reading', 'Writing', 'Art', 'Music', 'Drama', 'Religion', 'Ethics', 'Computer', 'Economics', 'Accounting',
  'Law', 'Philosophy', 'Sports', 'Agriculture', 'Craft', 'Technology', 'Health', 'Environment', 'Civics',
  'Phonics', 'Spelling', 'Vocabulary', 'Oral', 'Handwriting', 'Dictation', 'Poetry', 'Storytelling', 'Logic',
  'Geometry', 'Algebra', 'Measures', 'Numeration', 'Hygiene', 'Nature study', 'Moral', 'Songs'];
const jeu = (n) => (n === 16 ? FORM1 : NOMS.slice(0, n).map((nom, i) => [`${nom} ${i + 1}`, 1 + (i % 4),
  ['BETEGNE GHISLAIN AIME', 'BOMOIN NJOMBU SHERIFA CORANI', 'EKOH WALLIST USABI'][i % 3],
  ['Langues', 'Sciences', 'Sciences sociales', 'Arts', 'Autres'][i % 5]]));

const CLASSES = { form1: 16, class5: 27, ce1bil: 44 };
const classe = opt('--classe', 'form1');
const N = opt('--matieres', null) ? Number(opt('--matieres')) : CLASSES[classe];
if (!N) { console.error('classe inconnue'); process.exit(2); }

const teachers = [...new Set(jeu(N).map((x) => x[2]))].map((name, i) => ({ id: `t${i}`, name }));
const subjects = jeu(N).map(([name, coef, ens, grp], i) => ({
  id: `m${i}`, name, coef, max: 20, teacher_id: teachers.find((t) => t.name === ens).id,
  sc_groupe: grp, class_id: 'C1',
}));

const abs = flag('--beaucoup-abs');
const classId = 'C1';
const gradeMap = {};
const eleves = Array.from({ length: 41 }, (_, i) => ({ id: `s${i}`, name: `ELEVE ${i}` }));
eleves.forEach((e, k) => {
  for (const seq of [1, 2]) {
    const g = {};
    subjects.forEach((s, i) => {
      const absent = (abs && (i + k) % 4 !== 0) || (!abs && i % 7 === 3 && seq === 2);
      g[s.id] = absent ? 'ABS' : String(8 + ((k * 7 + i * 3 + seq) % 12));
    });
    gradeMap[`${classId}_${e.id}_${seq}`] = g;
  }
});

const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="150"><rect width="120" height="150" fill="#9ca3af"/><circle cx="60" cy="55" r="28" fill="#e5e7eb"/><rect x="25" y="95" width="70" height="55" rx="25" fill="#e5e7eb"/></svg>');
const student = {
  id: 's0', name: 'TANGOUNG EDELQUIEN NGWA', matricule: 'GN260041', gender: 'F',
  date_naissance: '2015-07-31', lieu_naissance: 'BAMENDA',
  nom_pere: 'NGWA JESMOND', nom_mere: 'NEBA BLESSING', parent_phone: '674 86 09 57',
  photo_url: flag('--sans-photo') ? null : PHOTO,
};
const school = {
  id: 's', name: 'THE GENIUS INTERNATIONAL COLLEGE', current_year: '2026-2027',
  address: 'B.P. 1443 Bafoussam', phone: '690 56 76 76', country_code: 'cameroon_en',
  region: 'Ouest', division: 'Mifi',
};
const cls = { id: classId, name: 'FORM1', grade_max: 20, cycle: 'secondaire', system: 'EN', head_teacher_id: 't1' };

const subjectGrades = {};
subjects.forEach((s) => {
  const v = gradeMap[`${classId}_s0_1`][s.id];
  subjectGrades[s.id] = v === 'ABS' ? null : Number(v);
});

const body = renderToStaticMarkup(createElement(BulletinAPC, {
  school, cls, student, subjects, subjectGrades, studentAvg: 14.16, rank: { rankN: 27, rankD: '27th' },
  stats: { avg: 15.13, min: 9.22, max: 19.2, total: 41, above: 40 },
  period: { value: 'trim_1', label: 'Term 1', seqs: [1, 2] }, sys: 'EN', teachers, gradeMap, classId,
  classStudents: eleves,
}));

function cssLivre() {
  const dir = new URL('../dist/assets/', import.meta.url);
  const f = readdirSync(dir);
  const ordre = [f.find((x) => /^index-.*\.css$/.test(x)), f.find((x) => /^Bulletins-.*\.css$/.test(x))].filter(Boolean);
  if (ordre.length < 2) { console.error('\n  ✖ Lancez `npm run build` avant ce banc.\n'); process.exit(1); }
  return ordre.map((x) => readFileSync(new URL(x, dir), 'utf8')).join('\n');
}
// `--filigrane` : l'élément que la page Bulletins ajoute pour l'impression
// (`.official-print-watermark`, position:fixed ⇒ répété sur chaque page). Le logo de test est
// un carré ROUGE : à 6 % d'opacité il donne un rose détectable, que le texte noir ne produit pas.
const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#ff0000"/></svg>');
const FILIGRANE = flag('--filigrane')
  ? `<div class="official-print-watermark" aria-hidden="true"><img src="${LOGO}" alt=""/></div>` : '';
const PROFIL = 'bulletin';
const m = pageMetrics(PROFIL);
const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>html,body{margin:0;padding:0} ${cssLivre()}</style>
<style id="nc-print-styles">${printCss({ profile: PROFIL, screen: false, page: true })}</style>
</head><body>${FILIGRANE}<div class="bulletin-panel">${body}</div></body></html>`;

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1700 } });
const url = writeDoc(`bulletin-${classe}`, html, port);
await page.goto(url, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });

// Comme l'application, avant d'imprimer : recherche de densité pour les feuilles qui ont pris
// le contrat `--nc-*`, filet de zoom pour les autres. `--sans-fit` rend le PDF brut.
let bilan = null;
const dForce = opt('--d', null);
if (dForce !== null) {
  // Densité imposée (test d'indépendance des données vis-à-vis de la mise en page).
  await page.evaluate((d) => document.querySelector('.bulletin-paper').style.setProperty('--nc-d', d), dForce);
} else if (!flag('--sans-fit')) {
  bilan = await page.evaluate(async (base) => {
    const d = await import(`${base}/src/lib/print/fitDensity.js`);
    const f = await import(`${base}/src/lib/print/fitLiveSheets.js`);
    const neuf = d.ajusterDensite('.bulletin-paper.nc-densite', 'bulletin');
    const ancien = f.fitLiveSheets('.bulletin-paper:not(.nc-densite)', 'bulletin');
    const el = document.querySelector('.bulletin-paper');
    return { neuf, ancien, d: el ? getComputedStyle(el).getPropertyValue('--nc-d') : null };
  }, `http://127.0.0.1:${port}`);
}

const mes = await page.evaluate(() => {
  const feuille = document.querySelector('.bulletin-paper');
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null);
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const enfants = [...(feuille?.children || [])];
  const table = feuille?.querySelector('table');
  const lignes = [...(feuille?.querySelectorAll('tbody tr') || [])];
  const nbTd = (r) => r.querySelectorAll(':scope > td').length;
  const sous = lignes.filter((r) => /^TOTAL/.test((r.textContent || '').trim()));
  const entetesGroupe = lignes.filter((r) => nbTd(r) === 1);
  const mat = lignes.filter((r) => nbTd(r) >= 6 && !sous.includes(r));
  const tableaux = [...(feuille?.querySelectorAll(':scope > table, :scope > div > table, table') || [])];
  const police = (el) => (el ? parseFloat(cs(el).fontSize) : null);
  const tailles = new Set();
  feuille?.querySelectorAll('*').forEach((el) => {
    if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      tailles.add(Math.round(parseFloat(cs(el).fontSize) * 0.75 * 10) / 10);   // px → pt
    }
  });
  return {
    feuille: h(feuille), largeur: feuille ? Math.round(feuille.getBoundingClientRect().width) : null,
    padding: feuille ? cs(feuille).padding : null, zoom: feuille ? cs(feuille).zoom : null,
    blocs: enfants.map((el) => ({
      tag: el.tagName.toLowerCase(), h: h(el),
      txt: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
    })),
    thead: h(feuille?.querySelector('thead')),
    nMatieres: mat.length,
    ligneMatiere: mat.length ? Math.round((mat.reduce((a, r) => a + r.getBoundingClientRect().height, 0) / mat.length) * 10) / 10 : null,
    ligneNomProf: (() => { const sp = feuille?.querySelector('tbody tr td span[style*="block"]'); return sp ? h(sp) : null; })(),
    nEntetesGroupe: entetesGroupe.length,
    ligneEnteteGroupe: entetesGroupe.length ? Math.round((entetesGroupe.reduce((a, r) => a + r.getBoundingClientRect().height, 0) / entetesGroupe.length) * 10) / 10 : null,
    hMatieres: Math.round(mat.reduce((a, r) => a + r.getBoundingClientRect().height, 0) * 10) / 10,
    hSousTotaux: Math.round(sous.reduce((a, r) => a + r.getBoundingClientRect().height, 0) * 10) / 10,
    hEntetesGroupe: Math.round(entetesGroupe.reduce((a, r) => a + r.getBoundingClientRect().height, 0) * 10) / 10,
    nSousTotaux: sous.length,
    ligneSousTotal: sous.length ? Math.round((sous.reduce((a, r) => a + r.getBoundingClientRect().height, 0) / sous.length) * 10) / 10 : null,
    nTableaux: tableaux.length,
    hTableaux: tableaux.map(h),
    taillesPt: [...tailles].sort((a, b) => a - b),
    photo: h(feuille?.querySelector('img')),
    // Les DONNÉES du bulletin, sans la mise en page : toute la matière textuelle, espaces normalisés.
    texte: (feuille?.textContent || '').replace(/\s+/g, ' ').trim(),
    // Plus petite taille (pt) des cellules de notes/moyennes (texte numérique du corps du tableau).
    minNotePt: (() => {
      let m = Infinity;
      feuille?.querySelectorAll('tbody td').forEach((td) => {
        if (/^[0-9.]+$/.test((td.textContent || "").trim())) m = Math.min(m, parseFloat(cs(td).fontSize) * 0.75);
      });
      return Number.isFinite(m) ? Math.round(m * 10) / 10 : null;
    })(),
    police: police(feuille),
  };
});

const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
const pages = (await PDFDocument.load(pdf)).getPageCount();

const result = { classe, avecPhoto: !flag('--sans-photo'), abs, fit: !flag('--sans-fit'), bilan, pages,
  pageUtileMm: m.contentH, margeMm: m.margin, ...mes };

// Pixels rosés (R≈255, G et B entre 225 et 252) : la signature d'un rouge à ~6 %.
const rosesParPage = [];
if (flag('--filigrane')) {
  const raster = await openRasterizer(browser, port);
  for (let p = 1; p <= pages; p++) {
    const png = await rasterize(raster, pdf, p, 1);
    const n = await raster.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let k = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i + 1] > 222 && d[i + 1] < 252 && Math.abs(d[i + 1] - d[i + 2]) < 6) k++;
      return k;
    }, Buffer.from(png).toString('base64'));
    rosesParPage.push(n);
  }
}
result.rosesParPage = rosesParPage;

const pngDir = opt('--png', null);
if (pngDir) {
  mkdirSync(pngDir, { recursive: true });
  const raster = await openRasterizer(browser, port);
  for (let p = 1; p <= pages; p++) {
    const png = await rasterize(raster, pdf, p, 1.4);
    const buf = typeof png === 'string' ? Buffer.from(png.replace(/^data:image\/png;base64,/, ''), 'base64') : png;
    writeFileSync(join(pngDir, `${classe}${flag('--sans-photo') ? '-sans-photo' : ''}${abs ? '-abs' : ''}${flag('--sans-fit') ? '-brut' : ''}-p${p}.png`), buf);
  }
}
await browser.close(); server.close();

if (flag('--json')) { console.log(JSON.stringify(result)); process.exit(0); }
const mm = (px) => (px == null ? '—' : `${(px / PX_PER_MM).toFixed(1)} mm`);
console.log(`\n  ${classe} · ${N} matières · ${result.avecPhoto ? 'avec' : 'sans'} photo${abs ? ' · beaucoup d’ABS' : ''}${result.fit ? ' · densité/fit appliqués' : ' · brut'}`);
console.log(`  densité --nc-d = ${result.bilan?.d ?? '—'}  ${result.bilan ? JSON.stringify(result.bilan.neuf) : ''}`);
console.log(`  PAGES : ${pages}    page utile ${m.contentH.toFixed(1)} mm (marge ${m.margin} mm)`);
console.log(`  Feuille : ${result.feuille} px = ${mm(result.feuille)} · padding ${result.padding} · zoom ${result.zoom}`);
console.log('\n  Blocs de la feuille (ordre du DOM) :');
for (const b of result.blocs) console.log(`    ${String(b.h).padStart(7)} px ${mm(b.h).padStart(9)}  <${b.tag}> ${b.txt}`);
console.log(`\n  en-tête du tableau : ${mm(result.thead)}`);
console.log(`  ligne de matière (moy. sur ${result.nMatieres}) : ${mm(result.ligneMatiere)}   dont nom d'enseignant sur sa propre ligne : ${mm(result.ligneNomProf)}`);
console.log(`  en-têtes de groupe : ${result.nEntetesGroupe} × ${mm(result.ligneEnteteGroupe)} = ${mm(result.hEntetesGroupe)}`);
console.log(`  matières : ${result.nMatieres} lignes = ${mm(result.hMatieres)} ; sous-totaux : ${result.nSousTotaux} = ${mm(result.hSousTotaux)}`);
console.log(`  ligne de sous-total (moy. sur ${result.nSousTotaux}) : ${mm(result.ligneSousTotal)}`);
console.log(`  tableaux (${result.nTableaux}) : ${result.hTableaux.map(mm).join(' · ')}`);
console.log(`  photo : ${mm(result.photo)}`);
console.log(`  tailles de texte rencontrées (pt) : ${result.taillesPt.join(', ')}\n`);
