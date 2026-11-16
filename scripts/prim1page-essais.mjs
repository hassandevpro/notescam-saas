// Banc d'essai du bulletin primaire UNE PAGE (BulletinPrim1Page) : rend le composant
// RÉEL (react-dom/server), l'imprime avec Chrome (même moteur que l'application), compte
// les pages du PDF et écrit les PDF d'essai.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/prim1page-essais.mjs [dossier-sortie]
//
// Cas : (a) normal comme la référence, (b) UA1+UA2+UA3 remplies, (c) 6 compétences,
// (d) textes très longs, (e) 14 compétences (densité), (f) lot de 30 bulletins.
// Chaque cas en PORTRAIT et en PAYSAGE. Exit 1 si un PDF n'a pas exactement 1 page/élève.

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
const { default: Bulletin, PRIM1P_GABARIT } = await import(`${SRC}components/bulletins/BulletinPrim1Page.jsx`);
const { PRIM_COTE_DEFAULT } = await import(`${SRC}core/primEngine.js`);

const OUT = resolve(process.argv[2] || '.print-tests/prim1page');
mkdirSync(OUT, { recursive: true });
const css = readFileSync(new URL('../src/styles/bulletin.css', import.meta.url), 'utf8');

const CR = [
  { id: 'o', nom: 'Oral' }, { id: 'e', nom: 'Written' }, { id: 'p', nom: 'Practical' }, { id: 'a', nom: 'Attitude' },
];
const DEFS = [
  ['1A', 'Communicate in French', 20, [10, 20, 5, 5]],
  ['1B', 'Communicate in English', 40, [10, 25, 3, 2]],
  ['1C', 'Practise a national language', 20, [10, 6, 2, 2]],
  ['2A', 'Use basic notions in mathematics', 40, [5, 30, 3, 2]],
  ['2B', 'Use basic notions in science and technology', 40, [5, 30, 3, 2]],
  ['3A', 'Practise social values', 20, [5, 10, 3, 2]],
  ['3B', 'Practise citizenship values', 20, [5, 10, 3, 2]],
  ['4A', 'Demonstrate autonomy, initiative, creativity and entrepreneurship', 20, [5, 10, 3, 2]],
  ['5A', 'Use basic ICT concepts and tools', 20, [3, 10, 5, 2]],
  ['6A', 'Practise physical and sporting activities', 20, [3, 5, 10, 2]],
  ['6B', 'Practise artistic activities', 20, [3, 10, 5, 2]],
];
const cote = (v, m) => { const p = (v / m) * 100; return p >= 90 ? 'A+' : p >= 75 ? 'A' : p >= 55 ? 'ECA' : 'NA'; };
const coteTot = (v, m) => { const p = (v / m) * 100; return p >= 90 ? 'A+' : p >= 70 ? 'A' : p >= 50 ? 'ECA' : 'NA'; };

function lignes({ n = 11, uasRemplies = [2], long = false, graine = 1, nUA = 3, decimales = false } = {}) {
  const base = [];
  for (let i = 0; i < n; i++) base.push(DEFS[i % DEFS.length]);
  return base.map(([code, intitule, tot, maxs], i) => {
    const criteres = CR.map((c, j) => ({ ...c, points_max: maxs[j] }));
    const uas = Array.from({ length: nUA }, (_, x) => x + 1).map((ua) => {
      const notesByCritere = {}; const baremes = {};
      let achieved = null; let possible = null;
      if (uasRemplies.includes(ua)) {
        achieved = 0; possible = 0;
        criteres.forEach((c, j) => {
          // « Written » absent de 1A en UA2 : cellule vide sans erreur (cas du modèle)
          if (i === 0 && j === 1 && ua === 2) return;
          let v = Math.min(c.points_max, Math.round(c.points_max * (((i * 7 + j * 3 + ua * 5 + graine) % 10) / 10)));
          if (decimales && (i + j + ua) % 3 === 0 && v + 0.5 <= c.points_max) v += 0.5;
          notesByCritere[c.id] = v; baremes[c.id] = c.points_max; achieved += v; possible += c.points_max;
        });
      }
      return { ua, trimestre: ua <= 3 ? 1 : ua <= 6 ? 2 : 3, notesByCritere, baremes, achieved, possible, cote: achieved != null ? coteTot(achieved, possible) : null };
    });
    const faites = uas.filter((u) => u.achieved != null);
    const ta = faites.length ? Math.round((faites.reduce((a, u) => a + u.achieved, 0) / faites.length) * 100) / 100 : null;
    const tp = faites.length ? Math.round((faites.reduce((a, u) => a + u.possible, 0) / faites.length) * 100) / 100 : tot;
    return {
      code: i < 11 ? code : `${code}${i}`,
      intitule: long ? `${intitule} — intitulé volontairement très très long pour éprouver la troncature propre du gabarit sur deux lignes puis au-delà` : intitule,
      criteres, uas, totalAchieved: ta, totalPossible: tp, totalCote: ta != null ? coteTot(ta, tp) : null,
    };
  });
}

const school = { id: 's', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', country_code: 'cameroon', current_year: '2026-2027', phone: '+237 678341213', director: 'Eyong Sergine' };
const eleveBase = { id: 'e', name: 'MOUHAMAN NABIL', gender: 'Masculin', matricule: 'P260002', date_naissance: '2020-04-15', lieu_naissance: 'Yaoundé', nom_pere: 'ABDOULAYE HAYATOU', nom_mere: 'HAWA IBRAHIM', parent_phone: '699453972', statut: '' };

const bul = (extra, paysage) => createElement(Bulletin, {
  paysage, annuel: !!extra?.annuel, school, sys: 'EN', title: extra?.annuel ? 'ANNUAL REPORT CARD — PRIMARY (CBA)' : 'FIRST TERM REPORT CARD — PRIMARY (CBA)', student: eleveBase, classLabel: 'Class 3', effectif: 2,
  profPrincipal: 'Mokuh Susan', competenceRows: lignes(), moyenneGenerale: 9.09, coteGenerale: 'NA', rang: null, classStats: null,
  appreciation: 'NOT ACHIEVED: NEEDS SERIOUS ATTENTION AND FOLLOW-UP.', bareme: PRIM_COTE_DEFAULT, ...extra,
});

const longTxt = 'LONGUEUR '.repeat(30).trim();
const CAS = {
  a_normal: () => ({}),
  b_ua123: () => ({ competenceRows: lignes({ uasRemplies: [1, 2, 3] }), moyenneGenerale: 12.4, coteGenerale: 'ECA', rang: 3, effectif: 28, classStats: { avg: 10.2, max: 15.5, min: 6.1, rate: 40 } }),
  c_6comp: () => ({ competenceRows: lignes({ n: 6 }) }),
  d_longs: () => ({
    competenceRows: lignes({ long: true }),
    student: { ...eleveBase, name: 'NGOUNOU TCHOKOUAHA DE LA SAINTE-FAMILLE JEAN-BAPTISTE EMMANUEL MARIE', nom_pere: `PÈRE ${longTxt}`, nom_mere: `MÈRE ${longTxt}`, statut: 'Redoublant' },
    appreciation: `${longTxt} ${longTxt} ${longTxt}`, profPrincipal: 'Madame Mokuh Susan Nkengafac Epse Tabot',
    mentions: { avertissement: 'Oui', tableauHonneur: '', encouragement: 'Oui', felicitation: '' }, repartition: [{ label: '[0-9.99]', n: 4 }, { label: '[10-14.99]', n: 9 }, { label: '[15-20]', n: 3 }],
  }),
  e_14comp: () => ({ competenceRows: lignes({ n: 14, uasRemplies: [1, 2, 3] }) }),
};

const ANN = (o = {}) => ({ annuel: true, ...o });
const CAS_ANNUEL = {
  annuel_a_2ua: () => ANN({ competenceRows: lignes({ nUA: 8, uasRemplies: [1, 2] }), moyenneGenerale: 11.81, coteGenerale: 'ECA', appreciation: '' }),
  annuel_b_8ua_decimales: () => ANN({ competenceRows: lignes({ nUA: 8, uasRemplies: [1, 2, 3, 4, 5, 6, 7, 8], decimales: true }), moyenneGenerale: 12.4, coteGenerale: 'ECA', rang: 3, effectif: 28, classStats: { avg: 10.2, max: 15.5, min: 6.1, rate: 40 } }),
  annuel_c_6comp: () => ANN({ competenceRows: lignes({ nUA: 8, n: 6, uasRemplies: [1, 2, 3] }) }),
  annuel_d_longs: () => ANN({
    competenceRows: lignes({ nUA: 8, long: true, uasRemplies: [1, 2, 3, 4] }),
    student: { ...eleveBase, name: 'NGOUNOU TCHOKOUAHA DE LA SAINTE-FAMILLE JEAN-BAPTISTE EMMANUEL MARIE', nom_pere: 'PÈRE ' + longTxt, nom_mere: 'MÈRE ' + longTxt },
    appreciation: longTxt + ' ' + longTxt + ' ' + longTxt, profPrincipal: 'Madame Mokuh Susan Nkengafac Epse Tabot',
  }),
  annuel_e_14comp: () => ANN({ competenceRows: lignes({ nUA: 8, n: 14, uasRemplies: [1, 2, 3, 4, 5, 6, 7, 8], decimales: true }) }),
};

const page = (html, paysage) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
@page { size: A4 ${paysage ? 'landscape' : 'portrait'}; margin: 8mm; }
body { margin: 0; background: #fff; }</style></head><body><div>${html}</div></body></html>`;

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }));
const ctx = await browser.newContext();
const echecs = [];
const lignesRapport = [];

async function pdf(nom, elements, paysage, attendu) {
  const html = elements.map((el) => renderToStaticMarkup(el)).join('');
  const p = await ctx.newPage();
  await p.emulateMedia({ media: 'print' });
  await p.setContent(page(html, paysage), { waitUntil: 'load' });
  const buf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  await p.close();
  const f = join(OUT, `${nom}.pdf`);
  writeFileSync(f, buf);
  const pages = (await PDFDocument.load(buf)).getPageCount();
  const ko = pages !== attendu;
  if (ko) echecs.push(`${nom}: ${pages} pages (attendu ${attendu})`);
  lignesRapport.push(`${ko ? 'KO' : 'OK'}  ${nom.padEnd(28)} ${pages}/${attendu} page(s)  ${(statSync(f).size / 1024).toFixed(0)} Ko`);
}

for (const paysage of [false, true]) {
  const o = paysage ? 'paysage' : 'portrait';
  for (const [k, fn] of Object.entries(CAS)) await pdf(`${k}_${o}`, [bul(fn(), paysage)], paysage, 1);
  // Lot de 30 bulletins : 30 pages exactement, taille raisonnable
  const lot = Array.from({ length: 30 }, (_, i) => bul({ ...CAS.b_ua123(), student: { ...eleveBase, id: `e${i}`, name: `ELEVE NUMERO ${i + 1}` }, competenceRows: lignes({ uasRemplies: [1, 2, 3], graine: i }) }, paysage));
  await pdf(`f_lot30_${o}`, lot, paysage, 30);
}
// ANNUEL : paysage uniquement
for (const [k, fn] of Object.entries(CAS_ANNUEL)) await pdf(k + '_paysage', [bul(fn(), true)], true, 1);
const lotAnn = Array.from({ length: 30 }, (_, i) => bul({ ...CAS_ANNUEL.annuel_b_8ua_decimales(), student: { ...eleveBase, id: 'a' + i, name: 'ELEVE NUMERO ' + (i + 1) }, competenceRows: lignes({ nUA: 8, uasRemplies: [1, 2, 3, 4, 5, 6, 7, 8], decimales: true, graine: i }) }, true));
await pdf('annuel_f_lot30_paysage', lotAnn, true, 30);
await browser.close();
console.log(`Gabarit ${PRIM1P_GABARIT}\n` + lignesRapport.join('\n'));
if (echecs.length) { console.log('\nECHECS :\n' + echecs.join('\n')); process.exit(1); }
console.log('\nOK : une page par élève dans tous les cas.');
