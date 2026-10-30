// Banc VISUEL ET DE PAGINATION du carnet primaire APC compact.
//
// Rend le composant RÉEL dans Chrome, cherche la densité comme l'application le
// fait, produit un PDF par jeu, COMPTE ses pages, mesure son remplissage et sa
// taille de police, puis le rastérise en PNG pour qu'on puisse le REGARDER.
//
// CE QUE CE BANC GARANTIT, et pourquoi chaque contrôle existe :
//
//   1. EXACTEMENT UNE PAGE par élève. Le défaut qui a motivé tout ceci : le
//      bloc signatures partait seul sur une 2e page alors que 57 mm restaient
//      libres sur la première.
//   2. REMPLISSAGE ≥ 97 % ET ≤ 100 %. Un carnet de 4 compétences doit occuper
//      la feuille autant qu'un carnet de 22 : sinon on imprime du vide, et le
//      titulaire n'a pas de place pour écrire.
//   3. CORPS ENTRE 7 ET 10 pt. En dessous, un parent ne lit plus ; au-dessus,
//      le carnet ne tient plus. La recherche de densité doit rester dans ces
//      bornes SANS qu'on les lui impose après coup.
//   4. L'ÉCRAN ET L'IMPRESSION MESURENT LA MÊME FEUILLE. C'est l'écart qui a
//      produit le défaut : l'ajustement mesurait en média `screen` (1098 px) et
//      Chrome paginait en média `print` (1044 px). 5 % d'erreur, et le bas de
//      page saute. Le banc exige maintenant que les deux concordent.
//
//   npm run bulletin:visual            → tous les jeux
//   npm run bulletin:visual -- ref     → un seul
//
// Sorties dans .print-tests/visual/ (ignoré par git).

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readdirSync as lsDir, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, writeDoc, openRasterizer, rasterize, OUT_DIR } from './lib/print-harness.mjs';
import { ajusterFeuilles } from './lib/densite-navigateur.mjs';
import {
  school, student, vierge, note, peu, extreme, aNLignes,
} from './lib/bulletin-jeux.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { readFileSync, readdirSync } = require('node:fs');

const SRC = new URL('../src/', import.meta.url).href;
globalThis.__VITE_ENV__ = {};

const { pageMetrics, DENSITE, printCss } = await import(`${SRC}lib/print/printStyles.js`);
const { CIBLE_MIN } = await import(`${SRC}lib/print/fitDensity.js`);
const { default: BulletinPrimCompact } = await import(`${SRC}components/bulletins/BulletinPrimCompact.jsx`);

// ── LE CSS DOIT ÊTRE CELUI QUI EST LIVRÉ, PAS UNE APPROXIMATION ────────────
//
// Première version de ce banc : seul `src/styles/bulletin.css` était injecté.
// Le rendu était FAUX — il manquait le préambule Tailwind (`@tailwind base`),
// qui pose entre autres `box-sizing: border-box` sur tout. Sans lui, la feuille
// ajoutait son rembourrage À sa largeur de 100 %, dépassait la page de 14 px, et
// la colonne de droite se faisait couper. Un défaut du BANC, pas du produit,
// mais qu'on aurait « corrigé » dans le produit.
//
// On lit donc les feuilles de style du BUILD : exactement ce que le navigateur
// de l'école charge. `npm run build` est donc un préalable.
function cssLivre() {
  const dir = new URL('../dist/assets/', import.meta.url);
  let fichiers;
  try { fichiers = readdirSync(dir); } catch { fichiers = []; }
  // L'ordre compte : le socle global (préambule Tailwind) AVANT le morceau
  // propre à l'écran Bulletins, qui le surcharge.
  const ordre = [
    fichiers.find((f) => /^index-.*\.css$/.test(f)),
    fichiers.find((f) => /^Bulletins-.*\.css$/.test(f)),
  ].filter(Boolean);
  if (ordre.length < 2) {
    console.error('\n  ✖ CSS du build introuvable dans dist/assets/.');
    console.error('    Lancez `npm run build` avant ce banc : sans le préambule');
    console.error('    Tailwind, le rendu mesuré ne serait pas celui des écoles.\n');
    process.exit(1);
  }
  return ordre.map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
}
const CSS = cssLivre();

// ── LA COUCHE D'IMPRESSION, POSÉE COMME L'APPLICATION LA POSE ──────────────
//
// Elle n'est PAS dans le CSS du build : `setPrintProfile('bulletin')` l'injecte
// a l'execution, en fin de <head>, via `installPrintStyles`. C'est elle qui
// porte le contrat de densite (`--nc-d` et tous les `--nc-*`) et la geometrie
// de la feuille.
//
// Premiere version de ce banc sans elle : le corps sortait a 12 pt — la taille
// par defaut du navigateur — parce que `font-size: var(--nc-body)` ne resolvait
// rien, et l'ecart ecran/impression atteignait 500 px. Un defaut du BANC, qui
// aurait condamne un correctif sain.
//
// Memes arguments que l'application : `screen: false` (l'apercu ecran vient du
// CSS du build), `page: true` (l'ecran Bulletins declare sa geometrie).
const CSS_PRINT = printCss({ profile: 'bulletin', screen: false, page: true });

const m = pageMetrics('bulletin');
const VIS = join(OUT_DIR, 'visual');
mkdirSync(VIS, { recursive: true });

// ON EFFACE LES SORTIES DU PASSAGE PRÉCÉDENT.
// Un passage où un jeu produisait 2 pages laisse un `xxx-p2.png` derrière lui ;
// au passage suivant, corrigé, seul `xxx-p1.png` est réécrit et l'ancien
// `-p2.png` reste là, avec sa date de la veille. On a failli conclure à un
// débordement qui n'existait plus.
for (const f of lsDir(VIS)) {
  if (/\.(png|pdf)$/.test(f)) rmSync(join(VIS, f), { force: true });
}

// Tolérance de concordance écran/impression. 6 px ≈ 1,6 mm : en dessous, c'est
// l'arrondi au pixel des bordures de tableau ; au-dessus, les deux médias ne
// décrivent plus la même feuille et le bas de page peut sauter.
const ECART_MAX_PX = 6;

const JEUX = {
  ref: ['a. vierge, 16 lignes (équivalent de la référence)', () => vierge()],
  note: ['b. entièrement noté, 16 lignes', () => note()],
  peu: ['c. peu de compétences (6)', peu],
  extreme: ['d. cas extrême (22 lignes, noms longs, intitulé 3 lignes, tous les blocs)', extreme],
  n4: ['f. 4 compétences — le carnet le plus vide', () => aNLignes(4)],
  n8: ['g. 8 compétences', () => aNLignes(8)],
  n16: ['h. 16 compétences', () => aNLignes(16)],
  n22: ['i. 22 compétences — le carnet le plus chargé', () => aNLignes(22)],
};

function doc(corps) {
  // L'ORDRE EST LE MEME QUE DANS L'APPLICATION : le CSS des ecrans d'abord, la
  // couche d'impression en dernier. A specificite egale, c'est la derniere
  // regle qui gagne, et c'est l'ecran actif qui doit parler en dernier.
  return `<!doctype html><html><head><meta charset="utf-8"/>
    <style>html,body{margin:0;padding:0}
${CSS}</style>
    <style id="nc-print-styles">${CSS_PRINT}</style>
  </head><body><div class="bulletin-panel">${corps}</div></body></html>`;
}
const html = (props) => doc(renderToStaticMarkup(createElement(BulletinPrimCompact, props)));

/**
 * Mesure, EN MÉDIA PRINT, ce que Chrome va réellement paginer : la hauteur de
 * chaque feuille et la taille de police de son tableau principal.
 */
function mesurerEnPrint(page) {
  return page.evaluate(() => [...document.querySelectorAll('.bulletin-paper')].map((el) => {
    // Le tableau principal est celui qui porte le plus de lignes : c'est lui
    // qui fait la hauteur, et c'est sa police que le parent lit.
    const tables = [...el.querySelectorAll('table')];
    const principal = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
    const cellule = principal?.querySelector('tbody td') || principal?.querySelector('td');
    const px = cellule ? parseFloat(getComputedStyle(cellule).fontSize) : NaN;
    return {
      hauteur: Math.max(el.scrollHeight, el.offsetHeight),
      corpsPt: px * (72 / 96),          // CSS px → points typographiques
      d: parseFloat(el.style.getPropertyValue('--nc-d') || 'NaN'),
    };
  }));
}

/** Compte les pages d'un PDF et rend aussi leur taille, en mm. */
async function pagesDu(raster, pdf) {
  return raster.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    const d = await pdfjs.getDocument({ data: bytes }).promise;
    const out = [];
    for (let p = 1; p <= d.numPages; p++) {
      const vp = (await d.getPage(p)).getViewport({ scale: 1 });
      out.push({ wmm: vp.width * 25.4 / 72, hmm: vp.height * 25.4 / 72 });
    }
    return out;
  }, Buffer.from(pdf).toString('base64'));
}

const demandes = process.argv.slice(2).filter((a) => JEUX[a]);
const aFaire = demandes.length ? demandes : Object.keys(JEUX);

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
const raster = await openRasterizer(browser, port);

console.log(`Profil « bulletin » : ${m.contentW}×${m.contentH} mm `
  + `(${Math.round(m.contentWpx)}×${Math.round(m.contentHpx)} px)`);
console.log(`Bornes de densité : corps ${DENSITE.bodyMin}–${DENSITE.bodyMax} pt ; `
  + `cible de remplissage ≥ ${(CIBLE_MIN * 100).toFixed(0)} %\n`);

let tout = true;
const echecs = [];
function exiger(ok, quoi) {
  if (!ok) { tout = false; echecs.push(quoi); }
  return ok;
}

// ── LES JEUX, UN PAR UN ─────────────────────────────────────────────────────
for (const cle of aFaire) {
  const [titre, fab] = JEUX[cle];
  await page.goto(writeDoc(`vis-${cle}`, html(fab()), port), { waitUntil: 'load' });

  // ÉTAPE 1 — l'ajustement, en média SCREEN : c'est ce que fait l'application.
  await page.emulateMedia({ media: 'screen' });
  const bilan = await ajusterFeuilles(page, m);
  const b = bilan[0];

  // ÉTAPE 2 — la mesure en média PRINT : c'est ce que Chrome pagine.
  await page.emulateMedia({ media: 'print' });
  const [vu] = await mesurerEnPrint(page);

  const pdf = await page.pdf({
    format: 'A4', printBackground: true, preferCSSPageSize: true,
    margin: { top: `${m.margin}mm`, bottom: `${m.margin}mm`, left: `${m.margin}mm`, right: `${m.margin}mm` },
  });
  writeFileSync(join(VIS, `${cle}.pdf`), pdf);
  const pages = await pagesDu(raster, pdf);
  for (let p = 1; p <= pages.length; p++) {
    writeFileSync(join(VIS, `${cle}-p${p}.png`), await rasterize(raster, pdf, p, 2));
  }

  const remplissage = vu.hauteur / m.contentHpx;
  const ecart = Math.abs(vu.hauteur - b.hauteur);

  console.log(`  ${titre}`);
  console.log(`     densité ${b.d.toFixed(3)} (${b.etat}, ${b.mesures} mesures)`
    + ` — corps ${vu.corpsPt.toFixed(1)} pt`);
  console.log(`     écran ${Math.round(b.hauteur)} px / print ${Math.round(vu.hauteur)} px`
    + ` (écart ${Math.round(ecart)} px) — remplissage ${(remplissage * 100).toFixed(1)} %`
    + `  →  ${pages.length} page(s)`);

  const unePage = exiger(pages.length === 1, `${cle} : ${pages.length} pages`);
  const tient = exiger(remplissage <= 1.0,
    `${cle} : déborde (${(remplissage * 100).toFixed(1)} %)`);
  const rempli = exiger(remplissage >= CIBLE_MIN || b.etat === 'plancher',
    `${cle} : sous-rempli (${(remplissage * 100).toFixed(1)} %)`);
  const lisible = exiger(vu.corpsPt >= DENSITE.bodyMin - 0.05 && vu.corpsPt <= DENSITE.bodyMax + 0.05,
    `${cle} : corps hors bornes (${vu.corpsPt.toFixed(1)} pt)`);
  const concorde = exiger(ecart <= ECART_MAX_PX,
    `${cle} : écran et print divergent de ${Math.round(ecart)} px`);

  const verdict = [
    unePage ? null : '⟵ PAS UNE PAGE',
    tient ? null : '⟵ DÉBORDE',
    rempli ? null : '⟵ SOUS-REMPLI',
    lisible ? null : '⟵ POLICE HORS BORNES',
    concorde ? null : '⟵ ÉCRAN ≠ PRINT',
  ].filter(Boolean);
  console.log(`     ${verdict.length ? verdict.join(' ') : 'OK — une page, pleine, lisible'}\n`);

  // ── LE MÊME JEU SUR PAPIER LETTER ────────────────────────────────────────
  //
  // POURQUOI. Une école qui laisse « Letter » dans le dialogue de Chrome ne
  // doit pas se retrouver avec deux pages. La feuille déclare
  // `@page { size: A4 portrait }` : avec `preferCSSPageSize`, c'est le CSS qui
  // décide de la boîte, et le pilote met l'A4 à l'échelle du Letter. On exige
  // donc que la pagination NE CHANGE PAS, et que la page reste de taille A4.
  const pdfLetter = await page.pdf({
    format: 'Letter', printBackground: true, preferCSSPageSize: true,
    margin: { top: `${m.margin}mm`, bottom: `${m.margin}mm`, left: `${m.margin}mm`, right: `${m.margin}mm` },
  });
  writeFileSync(join(VIS, `${cle}-letter.pdf`), pdfLetter);
  const pagesL = await pagesDu(raster, pdfLetter);
  const a4 = pagesL[0] && Math.abs(pagesL[0].hmm - 297) < 1.5 && Math.abs(pagesL[0].wmm - 210) < 1.5;
  exiger(pagesL.length === 1, `${cle} (Letter) : ${pagesL.length} pages`);
  exiger(a4, `${cle} (Letter) : la boîte de page n'est pas l'A4 déclarée`
    + ` (${pagesL[0]?.wmm.toFixed(0)}×${pagesL[0]?.hmm.toFixed(0)} mm)`);
  console.log(`     papier Letter → ${pagesL.length} page(s), boîte `
    + `${pagesL[0]?.wmm.toFixed(0)}×${pagesL[0]?.hmm.toFixed(0)} mm `
    + `${pagesL.length === 1 && a4 ? 'OK' : '⟵ ÉCHEC'}\n`);
}

// ── EXPORT PAR LOT : une page par élève, et rien qui passe de l'un à l'autre ─
//
// POURQUOI CE CONTRÔLE. « Imprimer toute la classe » empile les feuilles dans
// une seule page HTML (`classStudents.map(renderPrimBulletin)` dans
// Bulletins.jsx). Deux accidents sont possibles, et tous deux sont graves :
//   • une feuille qui déborde pousse la suivante — 35 élèves, 70 feuilles ;
//   • une rupture de page mal placée coupe un élève en deux, et le parent
//     reçoit la fin du bulletin de quelqu'un d'autre.
// On ne le vérifie donc pas à l'œil : on compte les pages du PDF, et on LIT le
// texte de chacune pour exiger qu'un seul nom d'élève y figure.
console.log('— e. Export par lot : 8 élèves, 8 pages, aucune page blanche');
{
  // Chaque élève a SES parents. Première version de ce contrôle : seul `name`
  // était remplacé, et les parents restaient ceux du jeu de référence — le
  // patronyme « FOMETHE » apparaissait donc sur les huit feuilles et le
  // contrôle de fuite criait au loup. Un défaut du BANC, qui aurait fait
  // chercher une fuite inexistante dans le gabarit.
  const NOMS = [
    ['FOMETHE DIVINA-GRACE ISIS', 'FOMETHE', 'FOMETHE ANACLET', 'FOMETHE ALEXANDRA'],
    ['KAMGA TCHOUPE LANDRY', 'KAMGA', 'KAMGA ROBERT', 'TCHOUPE ODILE'],
    ['NANA MBOUO ROSINE CLAIRE', 'NANA', 'NANA JUSTIN', 'MBOUO HENRIETTE'],
    ['BIKOK ASSOUMOU SERGE', 'BIKOK', 'BIKOK PAUL', 'ASSOUMOU CLARISSE'],
    ['DJOUMESSI LEKANE AUDREY', 'DJOUMESSI', 'DJOUMESSI MARTIN', 'LEKANE BRIGITTE'],
    ['ETOUNDI MVONDO PATRICK', 'ETOUNDI', 'ETOUNDI SAMUEL', 'MVONDO AGATHE'],
    ['SADJO ABBO HAMIDOU', 'SADJO', 'SADJO OUMAROU', 'ABBO FADIMATOU'],
    ['WANDJI TAGNE SYLVIE', 'WANDJI', 'WANDJI THOMAS', 'TAGNE LUCIENNE'],
  ];
  // Huit carnets DIFFÉRENTS. Si le gabarit laissait fuir une donnée d'un élève
  // à l'autre, huit copies identiques ne le montreraient pas ; et des carnets
  // de tailles très différentes forcent huit densités différentes dans une même
  // page HTML — exactement ce que « imprimer la classe » produit.
  // Huit carnets de tailles DIFFÉRENTES, donc huit densités différentes dans
  // une même page HTML — exactement ce que « imprimer la classe » produit.
  // `extreme` n'est pas du lot : il impose son propre élève (noms très longs),
  // qui écraserait celui qu'on vient de poser et rendrait le contrôle de fuite
  // illisible. Sa hauteur est couverte par le carnet de 22 lignes.
  const fabriques = [
    () => vierge(), peu, () => note(), () => aNLignes(22),
    () => aNLignes(4), () => aNLignes(8), () => aNLignes(16), () => aNLignes(12),
  ];
  const corps = NOMS.map(([nom, , pere, mere], i) => renderToStaticMarkup(createElement(
    BulletinPrimCompact,
    {
      ...fabriques[i](),
      student: {
        ...student, id: `st-${i}`, name: nom, matricule: `GEN2601${20 + i}`,
        nom_pere: pere, nom_mere: mere, tuteur: '',
      },
    },
  ))).join('');

  await page.goto(writeDoc('vis-lot', doc(corps), port), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'screen' });
  const bilanLot = await ajusterFeuilles(page, m);
  await page.emulateMedia({ media: 'print' });
  const vus = await mesurerEnPrint(page);

  const pdfLot = await page.pdf({
    format: 'A4', printBackground: true, preferCSSPageSize: true,
    margin: { top: `${m.margin}mm`, bottom: `${m.margin}mm`, left: `${m.margin}mm`, right: `${m.margin}mm` },
  });
  writeFileSync(join(VIS, 'lot.pdf'), pdfLot);

  const textes = await raster.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    const d = await pdfjs.getDocument({ data: bytes }).promise;
    const out = [];
    for (let p = 1; p <= d.numPages; p++) {
      const tc = await (await d.getPage(p)).getTextContent();
      out.push(tc.items.map((it) => it.str).join(' '));
    }
    return out;
  }, Buffer.from(pdfLot).toString('base64'));

  exiger(textes.length === NOMS.length,
    `lot : ${textes.length} pages pour ${NOMS.length} élèves`);
  console.log(`     ${NOMS.length} élèves  →  ${textes.length} page(s) `
    + `${textes.length === NOMS.length ? 'OK' : `⟵ ATTENDU ${NOMS.length}`}`);

  // Chaque feuille garde SA densité : c'est la propriété « chaque élève est
  // ajusté indépendamment ». Deux carnets très différents ne peuvent pas avoir
  // la même, sinon l'un des deux est mal servi.
  const densites = bilanLot.map((x) => x.d.toFixed(3));
  console.log(`     densités : ${densites.join('  ')}`);
  exiger(new Set(densites).size > 1,
    'lot : toutes les feuilles ont la même densité — elles ne sont pas ajustées séparément');

  vus.forEach((vu, i) => {
    const r = vu.hauteur / m.contentHpx;
    const etat = bilanLot[i].etat;
    exiger(r <= 1.0, `lot/${NOMS[i][1]} : déborde (${(r * 100).toFixed(1)} %)`);
    exiger(r >= CIBLE_MIN || etat === 'plancher',
      `lot/${NOMS[i][1]} : sous-rempli (${(r * 100).toFixed(1)} %)`);
    exiger(vu.corpsPt >= DENSITE.bodyMin - 0.05 && vu.corpsPt <= DENSITE.bodyMax + 0.05,
      `lot/${NOMS[i][1]} : corps hors bornes (${vu.corpsPt.toFixed(1)} pt)`);
  });

  // Un patronyme par page, et le BON. Le patronyme suffit : il est unique
  // entre les huit, et il survit au découpage du texte par pdf.js.
  const CLES = NOMS.map(([, cle]) => cle);
  textes.forEach((txt, i) => {
    const presents = CLES.filter((c) => txt.includes(c));
    const attendu = CLES[i];
    // Le patronyme de l'élève est aussi celui d'un de ses parents : on exige
    // donc que les SEPT AUTRES soient absents, et pas une occurrence unique.
    const propre = presents.length === 1 && presents[0] === attendu;
    exiger(propre, `lot : page ${i + 1} devait porter ${attendu}, trouvés ${presents.join(', ') || 'aucun'}`);
    console.log(`     page ${i + 1} : ${propre ? 'OK' : '⟵ FUITE'} — ${attendu}`
      + (propre ? '' : ` ; trouvés : ${presents.join(', ') || 'aucun'}`));
  });

  for (let p = 1; p <= textes.length; p++) {
    writeFileSync(join(VIS, `lot-p${p}.png`), await rasterize(raster, pdfLot, p, 2));
  }
}

console.log(`\n  ${tout
  ? '✅ Chaque carnet tient sur UNE page, pleine et lisible ; le lot ne mélange rien.'
  : `❌ ${echecs.length} contrôle(s) en échec :`}`);
for (const e of echecs) console.log(`     • ${e}`);
console.log(`  Images et PDF : ${VIS}`);

await browser.close();
server.close();
process.exit(tout ? 0 : 1);
