// Génère des bulletins de DÉMONSTRATION du Programme d'Éducation Bilingue
// Spécial avec des données entièrement FICTIVES, puis les rend réellement en PDF
// et en PNG via Chrome (playwright).
//
// Émet aussi out/bulletins-bilingue/fixtures.json : le CONTEXTE et les DONNÉES
// ASSEMBLÉES de chaque bulletin. L'aperçu React (out/preview-bilingue) se branche
// sur ce même fichier → les deux rendus consomment la même source, et toute
// divergence entre l'écran et le papier est forcément un écart de MISE EN FORME,
// jamais de calcul.
//
// Aucune donnée réelle n'est lue : ni élève, ni note, ni compte.
//
// Usage : node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/demo-bilingue-bulletins.mjs

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const SRC = new URL('../src/', import.meta.url).href;
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const { matieresForBilClasse, subjectsFromBilReferentiel, assembleBilBulletin, assembleBilAnnual } =
  await import(`${SRC}core/bilEngine.js`);
const { buildBilBulletinSheet, buildBilAnnualSheet } = await import(`${SRC}lib/bilBulletinDoc.js`);
const { buildPrintDocument } = await import(`${SRC}lib/print/printLayout.js`);

const ref = JSON.parse(readFileSync(join(ROOT, 'examples/bilingue/referentiel-bilingue-special-premier-cycle.json'), 'utf8'));
const OUT = join(ROOT, 'out', 'bulletins-bilingue');
mkdirSync(OUT, { recursive: true });

// ── Données FICTIVES ─────────────────────────────────────────────────────────
const school = {
  name: 'Collège Bilingue de Démonstration',
  address: '1234 Yaoundé', phone: '+237 6 00 00 00 00',
  current_year: '2025-2026', director: 'NGONO Ariane',
  country: 'cameroon', bulletin_engine: 'bilingue_special',
};
const eleve = (name, matricule, sexe) => ({
  id: 'demo-' + matricule, name, matricule, gender: sexe,
  date_naissance: '12/03/2013', lieu_naissance: 'Douala',
  nom_pere: 'M. (fictif)', parent_phone: '+237 6 00 00 00 01',
});

// Générateur déterministe : mêmes bulletins à chaque exécution.
let seed = 20230614;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const note = () => Math.round((6 + rnd() * 13) * 2) / 2;   // 6 → 19, au demi-point

let idN = 0;
const makeId = () => `s${++idN}`;

function classeDemo(classeSlug, serieId, label) {
  const rows = matieresForBilClasse(ref, { serieId, classeId: classeSlug });
  const subjects = subjectsFromBilReferentiel(rows, { schoolId: 'demo', classId: 'cls-' + classeSlug, makeId });
  return { rows, subjects, label, serieId, classeSlug };
}

// Remplit les notes. `trous` = matières laissées NON ÉVALUÉES ; `zeros` = matières
// où l'élève a réellement eu 0 (cas que le bulletin doit compter, pas ignorer).
function notes(subjects, classId, studentId, seqs, { trous = [], zeros = [] } = {}) {
  const g = {};
  for (const seq of seqs) {
    const grid = {};
    for (const s of subjects) {
      if (trous.includes(s.id)) continue;
      grid[s.id] = zeros.includes(s.id) ? '0' : String(note());
    }
    g[`${classId}_${studentId}_${seq}`] = grid;
  }
  return g;
}

const docs = [];

// ── 1. Francophone 6e — trimestre 1 complet, avec un vrai zéro ───────────────
{
  const c = classeDemo('6e', 'bil_fr', '6e Bilingue Spécial');
  const st = eleve('MBALLA Chimène', 'DEMO-6E-001', 'F');
  const zeroSur = c.subjects.find((s) => s.name.startsWith('Travail Manuel')).id;
  docs.push({
    nom: '1-francophone-6e-trimestre1', titre: 'Bulletin 6e — Trimestre 1', kind: 'term',
    ctx: {
      school, student: st, subjects: c.subjects, serieId: c.serieId,
      allGrades: notes(c.subjects, 'cls-6e', st.id, [1, 2], { zeros: [zeroSur] }),
      classId: 'cls-6e', seqs: [1, 2], trimestreId: 't1',
      classLabel: c.label, effectif: 48, titulaire: 'M. ONANA Paul',
      generalRank: '7e / 48', classStats: { avg: 11.42, min: 5.1, max: 17.8, count: 48 },
      decision: 'Travail satisfaisant — encouragements',
      discipline: { absJ: 4, absNJ: 2, conduite: 'Bonne', exclusions: 0 },
      maxScale: 20,
    },
  });
}

// ── 2. Francophone 4e — trimestre incomplet → PROVISOIRE ────────────────────
{
  const c = classeDemo('4e', 'bil_fr', '4e Bilingue Spécial');
  const st = eleve('FOTSO Landry', 'DEMO-4E-014', 'M');
  const trous = c.subjects.filter((s) => /SVTEEHB|Langue Vivante|Cultures/.test(s.name)).map((s) => s.id);
  docs.push({
    nom: '2-francophone-4e-trimestre2-provisoire', titre: 'Bulletin 4e — Trimestre 2 (provisoire)', kind: 'term',
    ctx: {
      school, student: st, subjects: c.subjects, serieId: c.serieId,
      allGrades: notes(c.subjects, 'cls-4e', st.id, [3, 4], { trous }),
      classId: 'cls-4e', seqs: [3, 4], trimestreId: 't2',
      classLabel: c.label, effectif: 52, titulaire: 'Mme ATANGANA Rose',
      generalRank: '', classStats: { avg: 10.9, min: 4.5, max: 16.2, count: 52 },
      discipline: { absJ: 0, absNJ: 6, conduite: 'Passable', exclusions: 1 },
      maxScale: 20,
    },
  });
}

// ── 3. Anglophone Form 1 — trimestre 1 ──────────────────────────────────────
{
  const c = classeDemo('form1', 'bil_en', 'Form 1 Special Bilingual');
  const st = eleve('TABI Blessing', 'DEMO-F1-003', 'F');
  docs.push({
    nom: '3-anglophone-form1-term1', titre: 'Report card Form 1 — Term 1', kind: 'term',
    ctx: {
      school, student: st, subjects: c.subjects, serieId: c.serieId,
      allGrades: notes(c.subjects, 'cls-form1', st.id, [1, 2]),
      classId: 'cls-form1', seqs: [1, 2], trimestreId: 't1',
      classLabel: c.label, effectif: 41, titulaire: 'Mr. NJIE Samuel',
      generalRank: '3rd / 41', classStats: { avg: 12.1, min: 6.4, max: 18.0, count: 41 },
      decision: 'Very good work — keep it up',
      discipline: { absJ: 2, absNJ: 0, conduite: 'Very good', exclusions: 0 },
      maxScale: 20,
    },
  });
}

// ── 5. Form 2 — COUVERTURE PARTIELLE : matières notées sur 1 séquence sur 2 ──
// Cas qui passait pour définitif avant correction : les matières sont toutes
// « évaluées », mais trois d'entre elles sur une seule séquence du trimestre.
{
  const c = classeDemo('form2', 'bil_en', 'Form 2 Special Bilingual');
  const st = eleve('AKO Derick', 'DEMO-F2-007', 'M');
  const partielles = c.subjects.filter((s) => /Mathematics|Physics|History/.test(s.name)).map((s) => s.id);
  const g = notes(c.subjects, 'cls-form2', st.id, [1, 2]);
  // On retire la séquence 2 de ces trois matières : elles gardent une moyenne.
  for (const id of partielles) delete g['cls-form2_' + st.id + '_2'][id];
  docs.push({
    nom: '5-anglophone-form2-couverture-partielle', titre: 'Report card Form 2 — Term 1 (partial coverage)', kind: 'term',
    ctx: {
      school, student: st, subjects: c.subjects, serieId: c.serieId,
      allGrades: g, classId: 'cls-form2', seqs: [1, 2], trimestreId: 't1',
      classLabel: c.label, effectif: 39, titulaire: 'Mrs. EBONG Grace',
      classStats: { avg: 11.8, min: 5.0, max: 17.5, count: 39 },
      discipline: { absJ: 1, absNJ: 0, conduite: 'Good', exclusions: 0 },
      maxScale: 20,
    },
  });
}

// ── 4. Francophone 6e — bulletin ANNUEL ─────────────────────────────────────
{
  const c = classeDemo('6e', 'bil_fr', '6e Bilingue Spécial');
  const st = eleve('MBALLA Chimène', 'DEMO-6E-001', 'F');
  docs.push({
    nom: '4-francophone-6e-annuel', titre: 'Bulletin annuel 6e', kind: 'annual',
    ctx: {
      school, student: st, subjects: c.subjects, serieId: c.serieId,
      allGrades: notes(c.subjects, 'cls-6e', st.id, [1, 2, 3, 4, 5, 6]),
      classId: 'cls-6e', termSeqs: [[1, 2], [3, 4], [5, 6]],
      classLabel: c.label, effectif: 48, titulaire: 'M. ONANA Paul',
      decision: 'Admise en classe de 5e',
      discipline: { absJ: 9, absNJ: 3, conduite: 'Bonne', exclusions: 0 },
      maxScale: 20,
    },
  });
}

// ── Écriture : HTML + fixtures partagées avec l'aperçu React ─────────────────
const fixtures = [];
for (const d of docs) {
  const sheet = d.kind === 'annual' ? buildBilAnnualSheet(d.ctx) : buildBilBulletinSheet(d.ctx);
  writeFileSync(join(OUT, d.nom + '.html'), buildPrintDocument([sheet], d.titre, { profile: 'bulletin' }), 'utf8');

  // MÊME fonction pure, MÊME contexte → l'aperçu React affichera ces chiffres.
  const data = d.kind === 'annual' ? assembleBilAnnual(d.ctx) : assembleBilBulletin(d.ctx);
  fixtures.push({
    nom: d.nom, titre: d.titre, kind: d.kind,
    sys: data.sys, school, student: d.ctx.student,
    classLabel: d.ctx.classLabel, effectif: d.ctx.effectif, titulaire: d.ctx.titulaire,
    seqs: d.ctx.seqs || [], maxScale: d.ctx.maxScale ?? 20,
    decision: d.ctx.decision || '', discipline: d.ctx.discipline || {},
    data,
  });
}
writeFileSync(join(OUT, 'fixtures.json'), JSON.stringify(fixtures, null, 2), 'utf8');
console.log(`${docs.length} bulletins HTML + fixtures.json écrits dans out/bulletins-bilingue/`);

// ── Rendu réel (Chrome) ──────────────────────────────────────────────────────
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
for (const d of docs) {
  await page.goto('file://' + join(OUT, d.nom + '.html').replace(/\\/g, '/'));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: join(OUT, d.nom + '.pdf'), format: 'A4', printBackground: true });
  await page.screenshot({ path: join(OUT, d.nom + '.png'), fullPage: true });
  console.log(`  rendu : ${d.nom}.pdf + .png`);
}
await browser.close();
console.log('Terminé — données 100 % fictives.');
