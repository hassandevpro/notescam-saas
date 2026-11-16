// Banc d'essai du bulletin secondaire UNE PAGE (BulletinSecUnePage), 1er et 2nd cycle.
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/sec1page-essais.mjs [dossier-sortie]
// Cas : 12 / 18 / 22 matieres, competences tres longues, noms tres longs, EPS a 3 competences,
// lot de 30 = 30 pages. PORTRAIT et PAYSAGE. Exit 1 si un PDF n'a pas 1 page/eleve, ou si, sur les cas
// "normaux", une cellule deborde (texte coupe) ou si le contenu sort de la feuille.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { PDFDocument } = require('pdf-lib');
const { chromium } = require('playwright-core');
globalThis.__VITE_ENV__ = {};
const SRC = new URL('../src/', import.meta.url).href;
const { default: Bulletin, SEC1P_GABARIT } = await import(`${SRC}components/bulletins/BulletinSecUnePage.jsx`);
const OUT = resolve(process.argv[2] || '.print-tests/sec1page');
mkdirSync(OUT, { recursive: true });
const css = readFileSync(new URL('../src/styles/bulletin.css', import.meta.url), 'utf8');

const NOMS = ['Français', 'Anglais', 'Mathématiques', 'Physique-Chimie-Technologie', 'Sciences de la Vie et de la Terre', 'Histoire', 'Géographie', 'Éducation à la Citoyenneté', 'Informatique', 'Éducation Physique et Sportive', 'Langues Nationales', 'Travail Manuel', 'Arts plastiques', 'Musique', 'Allemand', 'Espagnol', 'Latin', 'Économie Familiale', 'Philosophie', 'Entrepreneuriat', 'Religion', 'Lecture Dirigée'];
const COTES = ['CTBA', 'CBA', 'CA', 'CMA', 'CNA'];
const COMP = (long, j) => (long ? `Résoudre une situation de vie courante en mobilisant, de manière autonome et argumentée, les ressources acquises en classe et en dehors, puis communiquer la démarche suivie (compétence ${j + 1}) `.repeat(2) : `Résoudre une situation de vie ${j + 1}`);

function cycle1({ n = 12, long = false, graine = 0 }) {
  const matieres = Array.from({ length: n }, (_, i) => {
    const eps = NOMS[i % NOMS.length].startsWith('Éducation Physique');
    const nc = eps ? 3 : 1;
    const moy = 6 + ((i * 3 + graine) % 13) + 0.5;
    const coef = 1 + (i % 4);
    const cote = COTES[Math.min(4, Math.floor((20 - moy) / 4))];
    return {
      nom: NOMS[i % NOMS.length], enseignant: i % 5 === 0 ? '' : `M. Enseignant Numéro ${i + 1}`, coef, moyenne: moy, ponderee: moy * coef, cote,
      minmax: { min: 4.5, max: 18.25 }, appreciation: i % 3 ? 'Peut mieux faire' : 'Bon travail, continuez ainsi avec sérieux',
      competences: Array.from({ length: nc }, (_, j) => ({ intitule: COMP(long, j), note: 8 + ((i + j) % 10) + 0.25, max: 20, nbCompetencesMatiere: nc })),
    };
  });
  return { matieres, coefSum: matieres.reduce((a, m) => a + m.coef, 0), mxSum: matieres.reduce((a, m) => a + m.ponderee, 0), moyenneGenerale: 12.37, cote: 'CA' };
}
function cycle2({ n = 12, long = false, graine = 0 }) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i, nom: long ? `${NOMS[i % NOMS.length]} — intitulé de matière volontairement très long pour la ligne` : NOMS[i % NOMS.length], enseignant: `M. Enseignant ${i + 1}`, coef: 1 + (i % 4), charge: 2 + (i % 3), moyenne: 7 + ((i * 3 + graine) % 12) + 0.25, ponderee: 30.5, rang: 1 + (i % 9), minmax: { min: 5.5, max: 17.5 }, appreciation: long ? 'Appréciation très longue '.repeat(6) : 'Assez bien' }));
  const h = Math.ceil(n / 2);
  const groups = [rows.slice(0, h), rows.slice(h)].filter((r) => r.length).map((r, gi) => ({ ordre: gi + 1, nom: `GROUPE ${gi + 1}`, rows: r, coefSum: 9, chargeSum: 10, moyenne: 11.5, mxSum: 100.5 }));
  return { groups, coefSum: 25, mxSum: 250.5, moyenneGenerale: 11.9, generalRank: 4, appreciation: 'Assez bien', classStats: { avg: 10.5, min: 6, max: 16, count: 30, rate: 62 } };
}
const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="14" fill="#1F3A6E"/><circle cx="50" cy="42" r="22" fill="#f5c518"/></svg>');
const school = { id: 's', logo_url: LOGO, name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', country_code: 'cameroon', current_year: '2026-2027', phone: '+237 678341213', director: 'Eyong Sergine' };
const eleve = { id: 'e', name: 'MOUHAMAN NABIL', gender: 'Masculin', matricule: 'S260002', date_naissance: '2012-04-15', lieu_naissance: 'Yaoundé', nom_pere: 'ABDOULAYE HAYATOU', nom_mere: 'HAWA IBRAHIM', parent_phone: '699453972', statut: '' };
const longNom = 'NGOUNOU TCHOKOUAHA DE LA SAINTE-FAMILLE JEAN-BAPTISTE EMMANUEL MARIE';
const bul = (cycle, paysage, o = {}) => createElement(Bulletin, {
  cycle, paysage, school, sys: 'FR', title: cycle === 1 ? 'BULLETIN DE NOTES — 1ER TRIMESTRE (1ER CYCLE)' : 'BULLETIN DE NOTES — 1ÈRE SÉQUENCE (2ND CYCLE)',
  student: eleve, classLabel: cycle === 1 ? '4ème Esp' : 'Tle C', serieLabel: cycle === 2 ? 'Série C' : undefined, effectif: 30, profPrincipal: 'Mokuh Susan',
  rang: 5, classStats: { avg: 10.5, min: 6, max: 16, count: 30, rate: 62 }, appreciation: 'Travail satisfaisant, des efforts à poursuivre.',
  discipline: { absNJ: 2, absJ: 1, conduite: 'Bonne', decision: 'Admis(e)', mentions: ['Encouragements'] }, decision: 'Admis(e) en classe supérieure',
  data: cycle === 1 ? cycle1({ n: 12 }) : cycle2({ n: 12 }), ...o,
});
const CAS = (cycle) => {
  const d = (n, long, graine) => (cycle === 1 ? cycle1({ n, long, graine }) : cycle2({ n, long, graine }));
  return {
    a_12: () => ({ data: d(12) }), b_18: () => ({ data: d(18) }), c_22: () => ({ data: d(22) }),
    d_longs: () => ({ data: d(18, true), student: { ...eleve, name: longNom, nom_pere: 'PÈRE ' + 'LONG '.repeat(20), nom_mere: 'MÈRE ' + 'LONG '.repeat(20) }, appreciation: 'Appréciation très longue '.repeat(30), profPrincipal: 'Madame Mokuh Susan Nkengafac Epse Tabot' }),
    e_vide: () => ({ data: cycle === 1 ? { matieres: [], coefSum: 0, mxSum: 0, moyenneGenerale: null } : { groups: [], coefSum: 0, mxSum: 0, moyenneGenerale: null } }),
  };
};
const page = (html, paysage) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
@page { size: A4 ${paysage ? 'landscape' : 'portrait'}; margin: 8mm; }
body { margin: 0; background: #fff; }</style></head><body><div>${html}</div></body></html>`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }));
const ctx = await browser.newContext();
const echecs = []; const rap = [];
async function pdf(nom, els, paysage, attendu, { clip = false } = {}) {
  const html = els.map((e) => renderToStaticMarkup(e)).join('');
  const p = await ctx.newPage();
  await p.emulateMedia({ media: 'print' });
  await p.setContent(page(html, paysage), { waitUntil: 'load' });
  const mesure = await p.evaluate(() => {
    const feuilles = [...document.querySelectorAll('.sec1p')];
    const r = { debord: 0, coupe: [], ligneMax: 0, lignes: 0, vide: 0 };
    for (const f of feuilles.slice(0, 1)) {
      const fb = f.getBoundingClientRect();
      const z = f.querySelector('[data-zone="lignes"]');
      r.lignes = z.children.length; r.zone = Math.round(z.getBoundingClientRect().height * 0.75);
      const zb = z.getBoundingClientRect();
      const rows = [...z.children];
      const last = rows[rows.length - 1]?.getBoundingClientRect();
      r.vide = last ? Math.round(zb.bottom - last.bottom) : 0;
      f.querySelectorAll('*').forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && (b.bottom > fb.bottom + 1 || b.right > fb.right + 1)) r.debord += 1; });
      rows.forEach((row, i) => { row.querySelectorAll(':scope > div').forEach((c) => { if (c.scrollHeight > c.clientHeight + 1 && !getComputedStyle(c).webkitLineClamp) r.coupe.push(`l${i}:${(c.textContent || '').slice(0, 20)}`); }); });
      r.ligneMax = Math.max(0, ...rows.map((x) => x.getBoundingClientRect().height));
    }
    return r;
  });
  const buf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  await p.close();
  const f = join(OUT, `${nom}.pdf`); writeFileSync(f, buf);
  const pages = (await PDFDocument.load(buf)).getPageCount();
  let ko = pages !== attendu;
  if (clip && (mesure.debord || mesure.coupe.length)) ko = true;
  if (ko) echecs.push(`${nom}: ${pages} pages (attendu ${attendu}) debord=${mesure.debord} coupe=${mesure.coupe.slice(0, 4).join('|')}`);
  rap.push(`${ko ? 'KO' : 'OK'}  ${nom.padEnd(22)} ${pages}/${attendu} p  debord=${mesure.debord} coupe=${mesure.coupe.length} ligneMax=${mesure.ligneMax.toFixed(0)}px videBas=${mesure.vide}px zone=${mesure.zone}pt  ${(statSync(f).size / 1024).toFixed(0)}Ko`);
}
for (const cycle of [1, 2]) for (const paysage of [false, true]) {
  const o = `c${cycle}_${paysage ? 'paysage' : 'portrait'}`;
  for (const [k, fn] of Object.entries(CAS(cycle))) await pdf(`${k}_${o}`, [bul(cycle, paysage, fn())], paysage, 1, { clip: ['a_12', 'b_18'].includes(k) });
  const lot = Array.from({ length: 30 }, (_, i) => bul(cycle, paysage, { student: { ...eleve, id: `e${i}`, name: `ELEVE NUMERO ${i + 1}` }, data: cycle === 1 ? cycle1({ n: 14, graine: i }) : cycle2({ n: 14, graine: i }) }));
  await pdf(`f_lot30_${o}`, lot, paysage, 30);
}
await browser.close();
console.log(`Gabarit ${SEC1P_GABARIT}\n` + rap.join('\n'));
if (echecs.length) { console.log('\nECHECS :\n' + echecs.join('\n')); process.exit(1); }
console.log('\nOK : une page par élève dans tous les cas.');
