// LE BULLETIN DE SÉQUENCE APC TIENT-IL SUR UNE PAGE ? — mesure, puis preuve.
//
// Demandé le 2026-11-02 : le bulletin de séquence doit tenir sur UNE page A4
// portrait, jusqu'à 14 matières, sans devenir illisible.
//
// POURQUOI UN BANC ET PAS UN RÉGLAGE À L'ŒIL. `core/apcLayout.js` ESTIME les
// hauteurs (mm/pt approchés) ; Chrome, lui, pagine sur ce qu'il mesure. Les deux
// divergent, et c'est cette divergence qui envoie le bloc signatures seul sur
// une page 2 (`break-inside: avoid`). On rend donc le composant RÉEL, on produit
// un VRAI PDF, et on compte ses pages avec pdf.js.
//
//   npm run build                       (le CSS du build est un préalable)
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs scripts/apc-sequence-fit.mjs
//
// Options :
//   --png      rasterise la page 1 (et la 2 s'il y en a une) dans .print-tests/
//   --cas=N    ne mesure que le cas N (0 = réel du responsable)

import { createRequire } from 'node:module';
import { startServer, writeDoc, ensureOutDir, openRasterizer, rasterize } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { renderToStaticMarkup } = require('react-dom/server');
const { createElement } = require('react');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');

const SRC = new URL('../src/', import.meta.url).href;
globalThis.__VITE_ENV__ = {};

const { pageMetrics, printCss } = await import(`${SRC}lib/print/printStyles.js`);
const { MIN_FIT_SCALE } = await import(`${SRC}lib/print/fitLiveSheets.js`);
const { apcCote } = await import(`${SRC}core/apcEngine.js`);
const { profilClasse } = await import(`${SRC}core/apcEngine.js`);
const { default: BulletinApcOfficial } = await import(`${SRC}components/bulletins/BulletinApcOfficial.jsx`);

const ARGS = process.argv.slice(2);
const VEUT_PNG = ARGS.includes('--png');
const CAS_SEUL = (ARGS.find((a) => a.startsWith('--cas=')) || '').split('=')[1];

// Le CSS du build : sans le préambule Tailwind (`box-sizing: border-box`) la
// feuille déborde de son rembourrage et toutes les mesures sont fausses.
function cssLivre() {
  const dir = new URL('../dist/assets/', import.meta.url);
  let fichiers = [];
  try { fichiers = readdirSync(dir); } catch { /* dist absent */ }
  const ordre = [
    fichiers.find((x) => /^index-.*\.css$/.test(x)),
    fichiers.find((x) => /^Bulletins-.*\.css$/.test(x)),
  ].filter(Boolean);
  if (ordre.length < 2) {
    console.error('\n  ✖ CSS du build introuvable. Lancez `npm run build` avant ce banc.\n');
    process.exit(1);
  }
  return ordre.map((x) => readFileSync(new URL(x, dir), 'utf8')).join('\n');
}
const CSS = cssLivre();
const CSS_PRINT = printCss({ profile: 'bulletin', screen: false, page: true });
const m = pageMetrics('bulletin');

// ── LE CAS RÉEL, données du responsable (2026-11-02) ────────────────────────
const school = {
  id: 'sch-bc', name: 'BRIGHT CONTINENT BILINGUAL SCHOOL', current_year: '2026-2027',
  city: 'Yaoundé', country_code: 'cameroon', motto: 'Travail — Discipline — Réussite',
};
// LES NOMS DE CHAMPS SONT CEUX DU MODÈLE, pas des approximations. La première
// version de ce fixture écrivait birth_date / pere / phone ; le composant lit
// date_naissance / nom_pere / parent_phone, si bien que la capture sortait avec
// « Né(e) le : » et « Parents / Tuteurs : » VIDES. Un banc de mise en page qui
// mesure des lignes vides sous-estime la hauteur du bloc identité — et la
// capture montrée au responsable ne montre pas son bulletin.
const student = {
  id: 'st-ah', name: 'ABDOURAHMAN HAROUN', matricule: 's260033',
  gender: 'M', date_naissance: '18/05/2011', lieu_naissance: 'Maroua', statut: '',
  nom_pere: 'HAROUN ABDOU', nom_mere: 'AÏSSATOU MAL', tuteur: '',
  parent_phone: '690 00 00 00',
};

// (nom, note/20, coef, enseignant, intitulé de compétence)
// Le dernier champ COMPTE : c'est la longueur de l'intitulé qui décide du
// nombre de lignes, donc de la hauteur du tableau.
const MATIERES_REELLES = [
  ['Anglais',      12,   3, 'NKOLO Pauline',   'Communiquer oralement et par écrit dans des situations de la vie courante'],
  ['Maths',         2.5, 4, 'TCHOUTA Blaise',  'Résoudre des problèmes relevant des nombres, de la géométrie et des mesures'],
  ['Informatique', 14,   2, '',                "Utiliser les outils des technologies de l'information et de la communication"],
  ['Histoire',     15.5, 2, 'MBALLA Serge',    'Situer des faits historiques dans le temps et en expliquer les causes'],
  ['Géographie',   13,   2, 'MBALLA Serge',    "Lire et interpréter une carte, un graphique et un document géographique"],
  ['SVTEEHB',       5.5, 2, 'ESSOMBA Claire',  'Expliquer le fonctionnement du vivant et adopter des comportements sains'],
  ['Langue Turc',  16.5, 1, 'YILMAZ Ahmet',    'Communiquer dans des situations simples de la vie quotidienne'],
  ['PCT',           0.5, 2, 'FOUDA Michel',    'Expliquer des phénomènes physiques, chimiques et technologiques simples'],
  ['EPS',          14,   2, 'ABEGA Paul',      'Pratiquer des activités physiques et sportives en respectant les règles'],
  ['ECM',          19,   2, 'NGONO Rose',      'Pratiquer les valeurs sociales et citoyennes dans la vie de la classe'],
  ['Espagnol',      6,   2, 'DIAZ Carmen',     'Communiquer dans des situations simples de la vie quotidienne'],
];

// Matières ajoutées pour les cas de robustesse (jusqu'à 14, comme demandé).
const MATIERES_SUP = [
  ['Travail Manuel', 11, 1, 'OYONO Jean',  "Réaliser un objet utile à partir de matériaux de récupération"],
  ['Musique',        13, 1, '',            'Interpréter un chant et reconnaître des rythmes simples'],
  ['Arts Plastiques', 9, 1, 'BIYA Alice',  'Produire une œuvre plastique en utilisant des techniques variées'],
];

/** Construit `data` tel que `BulletinApcOfficial` l'attend. */
function dataDe(defs, { compsParMatiere = 1 } = {}) {
  const matieres = defs.map(([nom, note, coef, ens, intitule], i) => {
    // Les compétences supplémentaires répètent l'intitulé : c'est ce que fait
    // le réel quand une matière est évaluée sur plusieurs compétences.
    const competences = Array.from({ length: compsParMatiere }, (_, k) => ({
      intitule: compsParMatiere === 1 ? intitule : `${intitule} (volet ${k + 1})`,
      note, max: 20, nbCompetencesMatiere: compsParMatiere,
    }));
    return {
      id: `m${i}`, nom, enseignant: ens, competences,
      moyenne: note, coef, ponderee: Math.round(note * coef * 100) / 100,
      cote: apcCote(note).code,
      minmax: { min: Math.max(0, note - 3), max: Math.min(20, note + 4) },
      appreciation: '',
    };
  });
  const coefSum = matieres.reduce((a, x) => a + x.coef, 0);
  const mxSum   = Math.round(matieres.reduce((a, x) => a + x.ponderee, 0) * 100) / 100;
  const moy     = Math.round((mxSum / coefSum) * 100) / 100;
  return { matieres, coefSum, mxSum, moyenneGenerale: moy, cote: apcCote(moy).code };
}

// Les 6 moyennes de la 3EME ESP — min 9.13, max 12.33, 3 au-dessus de 10.
const MOYENNES_CLASSE = [9.13, 9.90, 9.50, 10.50, 11.50, 12.33];
const CLASS_STATS = profilClasse(MOYENNES_CLASSE, 6);

function bulletinHtml(defs, opts = {}) {
  const data = dataDe(defs, opts);
  const body = renderToStaticMarkup(createElement(BulletinApcOfficial, {
    school, sys: 'FR',
    title: 'BULLETIN DE LA SÉQUENCE 1 (T1)',
    student, classLabel: '3EME ESP', effectif: 6,
    profPrincipal: 'NKOLO Pauline',
    rang: 4, classStats: CLASS_STATS, data,
    appreciation: '',
  }));
  return {
    data,
    html: `<!doctype html><html><head><meta charset="utf-8"/><style>
      html,body{margin:0;padding:0}
      ${CSS}
    </style>
    <style id="nc-print-styles">${CSS_PRINT}</style>
    </head><body><div class="bulletin-panel">${body}</div></body></html>`,
  };
}

// ── Les cas mesurés ─────────────────────────────────────────────────────────
// `max` = nombre de pages ADMIS. Il vaut 1 partout où la page unique est
// atteignable, et c'est la garantie que ce banc verrouille.
//
// LE CAS 3 FAIT EXCEPTION, ET IL FAUT DIRE POURQUOI PLUTÔT QUE LE MASQUER.
// 14 matières × 4 compétences = 56 lignes de tableau. Mesuré le 2026-11-02
// (`scripts/apc-plafond-lignes.mjs`) : les blocs officiels obligatoires —
// en-tête 22,6 mm, bandeau titre 6,9 mm, identité 23,0 mm, en-tête de colonnes
// 10,8 mm, les trois blocs 60,3 mm, appréciation 12,2 mm, signatures 19,3 mm —
// occupent 155 mm des 281 mm utiles. Il reste 126 mm, soit 2,25 mm par ligne
// pour 56 lignes. Une ligne de deux lignes de texte en 6,5 pt en fait 5,0. Le
// plafond réel est de 34 lignes, et il a été repoussé de 28 à 34 par la passe
// « une page avec filet ».
//
// La demande du 2026-11-02 disait « jusqu'à 14 matières […] SANS QUE ÇA
// DEVIENNE ILLISIBLE », et fixait elle-même le plancher à 6,5 pt. Au-delà du
// plafond, respecter le plancher VAUT MIEUX que tenir la promesse d'une page :
// on sort deux feuilles propres. Ce banc l'exige donc explicitement — et il
// échouera si un jour ce cas sortait en TROIS feuilles, ce qui était le cas
// avant la marge de sécurité multi-pages.
const CAS = [
  { n: 0, nom: 'RÉEL — 11 matières × 1 compétence', max: 1, defs: MATIERES_REELLES, opts: {} },
  { n: 1, nom: '14 matières × 1 compétence',        max: 1, defs: [...MATIERES_REELLES, ...MATIERES_SUP], opts: {} },
  { n: 2, nom: '14 matières × 2 compétences',       max: 1, defs: [...MATIERES_REELLES, ...MATIERES_SUP], opts: { compsParMatiere: 2 } },
  { n: 3, nom: '14 matières × 4 compétences (56 lignes — hors capacité, cf. note)',
    max: 2, defs: [...MATIERES_REELLES, ...MATIERES_SUP], opts: { compsParMatiere: 4 } },
];

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1700 } });

// Compteur de pages pdf.js — chargé en module, donc servi par le harnais HTTP.
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

const dossier = ensureOutDir();
const raster = VEUT_PNG ? await openRasterizer(browser, port) : null;

console.log(`\n  Page : A4 portrait, marge ${m.margin} mm — hauteur utile ${m.contentH} mm\n`);

const resultats = [];
for (const cas of CAS) {
  if (CAS_SEUL != null && String(cas.n) !== CAS_SEUL) continue;
  const { html, data } = bulletinHtml(cas.defs, cas.opts);
  await page.goto(writeDoc(`apc-seq-${cas.n}`, html, port), { waitUntil: 'load' });

  // LE REPLI ZOOM DE L'APPLICATION, qui manquait à ce banc.
  // Avant d'imprimer, "Bulletins.jsx" appelle "fitLiveSheets" : chaque feuille
  // trop longue reçoit "--nc-fit", un facteur de réduction borné au plancher de
  // lisibilité (MIN_FIT_SCALE = 0,86). Mesurer sans lui, c'était mesurer un
  // document que l'école ne reçoit jamais. Même formule que "facteurFit", même
  // mesure à la largeur imprimable que "hauteurImprimable".
  const fit = await page.evaluate(({ contentW, contentHpx, plancher }) => {
    const out = [];
    for (const el of document.querySelectorAll('.bulletin-paper:not(.nc-densite)')) {
      el.style.removeProperty('--nc-fit');
      const sauve = { width: el.style.width, maxWidth: el.style.maxWidth, margin: el.style.margin, boxShadow: el.style.boxShadow, transform: el.style.transform };
      el.style.setProperty('width', contentW + 'mm', 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('margin', '0', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
      el.style.setProperty('transform', 'none', 'important');
      const h = el.offsetHeight;
      for (const k of Object.keys(sauve)) el.style[k] = sauve[k];
      let s = null;
      if (h - 1 > contentHpx) {
        const f = Math.floor((contentHpx / h) * 1000) / 1000;
        s = f >= plancher ? f : null;
      }
      if (s != null) el.style.setProperty('--nc-fit', String(s));
      out.push({ h, s });
    }
    return out;
  }, { contentW: m.contentW, contentHpx: m.contentHpx, plancher: MIN_FIT_SCALE });

  // La police retenue par le planificateur, lue sur la feuille réelle.
  const pt = await page.evaluate(() => {
    const el = document.querySelector('.bulletin-paper');
    return el ? getComputedStyle(el).fontSize : '?';
  });
  // Hauteur réellement occupée par la 1re feuille, en média print.
  await page.emulateMedia({ media: 'print' });
  const h = await page.evaluate(() => {
    const el = document.querySelector('.bulletin-paper');
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });

  const pdf = await page.pdf({
    format: 'A4', printBackground: true, preferCSSPageSize: true,
    margin: { top: `${m.margin}mm`, bottom: `${m.margin}mm`, left: `${m.margin}mm`, right: `${m.margin}mm` },
  });
  const pages = await pdfjsPage.evaluate(
    (b64) => window.__numPages(b64),
    Buffer.from(pdf).toString('base64'),
  );
  await page.emulateMedia({ media: 'screen' });

  const attendu = cas.max ?? 1;
  const marque = pages <= attendu ? (pages === 1 ? '✅' : '✅ (2 p. admises)') : '❌';
  const z = fit.map((x) => (x.s == null ? (x.h - 1 > m.contentHpx ? "DÉBORDE" : "1.000") : x.s.toFixed(3))).join("/");
  console.log(`  ${marque} cas ${cas.n} — ${cas.nom.padEnd(34)} ${pages}/${attendu} page(s)   corps ${pt}   brut ${fit.map((x)=>x.h).join("/")} px   zoom ${z}   dispo ${Math.round(m.contentHpx)} px`);
  resultats.push({ ...cas, pages, attendu, pt, h, moy: data.moyenneGenerale, coef: data.coefSum, mx: data.mxSum });

  if (VEUT_PNG) {
    writeFileSync(new URL(`apc-seq-${cas.n}.pdf`, `file:///${dossier.replace(/\\/g, '/')}/`), pdf);
    for (let p = 1; p <= Math.min(pages, 2); p++) {
      const png = await rasterize(raster, pdf, p, 1.4);
      writeFileSync(new URL(`apc-seq-${cas.n}-p${p}.png`, `file:///${dossier.replace(/\\/g, '/')}/`), png);
    }
  }
}

// ── Le contrôle du cas réel : les chiffres attendus par le responsable ──────
const reel = resultats.find((r) => r.n === 0);
if (reel) {
  console.log('\n  Contrôle des calculs (cas réel) — AUCUN n\'a été touché :');
  const att = [['total M×coef', reel.mx, 237.5], ['coef', reel.coef, 24], ['moyenne', reel.moy, 9.9]];
  for (const [nom, obtenu, attendu] of att) {
    console.log(`    ${Math.abs(obtenu - attendu) < 0.051 ? '✅' : '❌'} ${nom} : ${obtenu} (attendu ${attendu})`);
  }
  console.log(`    ${CLASS_STATS.count === 3 ? '✅' : '❌'} nombre de moyennes : ${CLASS_STATS.count} (attendu 3)`);
  console.log(`    ${CLASS_STATS.rate === 50 ? '✅' : '❌'} taux de réussite : ${CLASS_STATS.rate} % (attendu 50)`);
}

const debordent = resultats.filter((r) => r.pages > r.attendu);
const uneSeule  = resultats.filter((r) => r.attendu === 1);
console.log(debordent.length
  ? `\n  ❌ ${debordent.length} cas sur ${resultats.length} dépasse(nt) leur budget de pages : ${debordent.map((r) => `${r.nom} (${r.pages} > ${r.attendu})`).join(' · ')}\n`
  : `\n  ✅ Budget de pages respecté : ${uneSeule.length} cas sur UNE page, et le cas hors capacité tient en 2 feuilles au lieu de 3.\n`);
if (VEUT_PNG) console.log(`  Images et PDF : ${dossier}\n`);

await browser.close();
server.close();
process.exitCode = debordent.length ? 1 : 0;
