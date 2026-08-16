// ─────────────────────────────────────────────────────────────────────────────
// BANC DE PERFORMANCE D'IMPRESSION — npm run test:print:perf
// ─────────────────────────────────────────────────────────────────────────────
// Mesure, pour 1 à 1000 documents : construction du HTML (QR compris),
// chargement de la fenêtre, pagination + rendu PDF par Chrome, poids du PDF.
// Sert à calibrer le seuil de découpage en lots (printPagination.BATCH_SIZE) et
// l'estimation de durée affichée à l'utilisateur.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, writeDoc, ensureOutDir } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const QRCode = require('qrcode');

const SRC = new URL('../src/', import.meta.url).href;
const { buildClassTranscripts, buildVerification } = await import(`${SRC}lib/transcriptEngine.js`);
const { transcriptSheetHtml, buildPrintDocument } = await import(`${SRC}lib/transcriptDoc.js`);
const { BATCH_SIZE, estimateSeconds } = await import(`${SRC}lib/print/printPagination.js`);
const fx = await import(`${SRC}lib/print/printTestUtils.js`);

const school = fx.fixtureSchool();
const cls = fx.fixtureClass();
const subs = fx.fixtureSubjects(12, 'court');

/** Construit une feuille complète, QR réel compris (le coût dominant). */
async function buildOne(i) {
  const students = fx.fixtureStudents(1).map((s) => ({ ...s, id: `st${i}`, matricule: `MAT-2025-${String(i).padStart(4, '0')}` }));
  const gm = fx.fixtureGradeMap(students, subs);
  const [d] = buildClassTranscripts({
    classStudents: students, cls, subjects: subs, gradeMap: gm, sys: 'FR', cycle: 'secondaire',
    countryCode: 'cameroon', schoolYear: '2025-2026', stats: fx.fixtureStats(), opts: { maxScale: 20 },
  });
  const verification = buildVerification({
    schoolId: school.id, schoolName: school.name, studentName: d.student.name,
    matricule: d.student.matricule, className: cls.name, year: '2025-2026',
    avg: d.generalAvg, rank: d.rankEntry?.rankD, decision: d.decision.fr,
  }, 'https://app.example.com');
  const qrSrc = await QRCode.toDataURL(verification.qrText, { margin: 1, width: 240, color: { dark: '#111111', light: '#ffffff' } });
  return transcriptSheetHtml(d, { qrSrc, verification, school });
}

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage();

const rows = [];
console.log('  docs |  construction |    HTML |  fenêtre |  pagination+PDF |    total |      PDF | pages');
console.log('  -----+---------------+---------+----------+-----------------+----------+----------+------');
for (const n of [1, 10, 50, 100, 300, 500, 1000]) {
  const t0 = Date.now();
  const sheets = [];
  for (let i = 0; i < n; i++) sheets.push(await buildOne(i));
  const tBuild = Date.now() - t0;

  const html = buildPrintDocument(sheets, `bench-${n}`, { autoPrint: false });
  const url = writeDoc(`bench-${n}`, html, port);

  const t1 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  const tLoad = Date.now() - t1;

  const t2 = Date.now();
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  const tPdf = Date.now() - t2;

  const pages = (await PDFDocument.load(pdf)).getPageCount();
  const row = {
    n, tBuild, tLoad, tPdf, total: tBuild + tLoad + tPdf,
    htmlMo: +(html.length / 1024 / 1024).toFixed(2),
    pdfMo: +(pdf.length / 1024 / 1024).toFixed(2),
    pages, ok: pages === n,
    estimation: estimateSeconds(n),
  };
  rows.push(row);
  console.log(`  ${String(n).padStart(4)} | ${String(tBuild).padStart(9)} ms | ${String(row.htmlMo).padStart(5)} Mo | ${String(tLoad).padStart(6)} ms | ${String(tPdf).padStart(12)} ms | ${String((row.total / 1000).toFixed(1)).padStart(6)} s | ${String(row.pdfMo).padStart(5)} Mo | ${String(pages).padStart(5)}${row.ok ? '' : ' ⟵ ÉCART'}`);
}

console.log(`\n  Seuil de découpage en lots : ${BATCH_SIZE} documents.`);
console.log('  Estimation annoncée à l’utilisateur vs mesure :');
for (const r of rows) {
  console.log(`   ${String(r.n).padStart(4)} docs : annoncé ${String(r.estimation).padStart(3)} s · mesuré ${(r.total / 1000).toFixed(1)} s`);
}

writeFileSync(join(ensureOutDir(), 'bench.json'), JSON.stringify(rows, null, 2));
await browser.close();
server.close();
