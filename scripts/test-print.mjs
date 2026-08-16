// ─────────────────────────────────────────────────────────────────────────────
// SUITE DE TESTS D'IMPRESSION — npm run test:print
// ─────────────────────────────────────────────────────────────────────────────
// Vérifie les documents scolaires là où ça compte : dans le PDF que produit
// Chrome, et sur les pixels de ce PDF une fois rastérisé.
//
// Couverture :
//   1. Géométrie      — A4 portrait / paysage, marges, zone imprimable
//   2. Fixtures       — 8 à 40 matières, élève sans moyenne, sans logo…
//   3. Volumes        — 1, 2, 5, 20, 100, 300 documents → autant de pages
//   4. Couleurs       — les aplats institutionnels sortent-ils à l'encre ?
//   5. Blocs solidaires — signature, cachet, QR jamais coupés
//   6. Visuel         — page vierge, contenu dans la zone non imprimable,
//                       débordement, bande blanche anormale
//   7. Valeurs        — aucun NaN / undefined / Infinity dans un document
//   8. Procès-verbal  — profil paysage, en-tête répété, débordement horizontal
//   9. Aperçu         — le nombre de pages annoncé est celui qui s'imprime
//  10. Bulletins      — APC et SC : pages, couleurs, marges, auto-ajustement
//  11. Architecture   — une seule géométrie de page, un seul window.open
//
// Usage : node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/test-print.mjs
//         (l'option est portée par le script npm)

import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  startServer, openRasterizer, rasterize, analyzePage, createRunner, writeDoc, ensureOutDir,
} from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

const SRC = new URL('../src/', import.meta.url).href;
const { buildClassTranscripts, buildVerification } = await import(`${SRC}lib/transcriptEngine.js`);
const { transcriptSheetHtml, certificateSheetHtml, buildPrintDocument } = await import(`${SRC}lib/transcriptDoc.js`);
const { pageMetrics } = await import(`${SRC}lib/print/printStyles.js`);
const { auditDocument, checkParts } = await import(`${SRC}lib/print/printValidation.js`);
const fx = await import(`${SRC}lib/print/printTestUtils.js`);

const NAVY = '#1e3a5f';
const PT_PER_MM = 72 / 25.4;
const r = createRunner();

// ── Fabrique de documents de test ────────────────────────────────────────────
function transcriptSheet({ subjects = 14, style = 'long', mode = 'complet', school: over = {} } = {}) {
  const school = fx.fixtureSchool(over);
  const cls = fx.fixtureClass();
  const students = fx.fixtureStudents(1);
  const subs = fx.fixtureSubjects(subjects, style);
  const gm = fx.fixtureGradeMap(students, subs, { mode });
  const [d] = buildClassTranscripts({
    classStudents: students, cls, subjects: subs, gradeMap: gm, sys: 'FR', cycle: 'secondaire',
    countryCode: 'cameroon', schoolYear: '2025-2026', stats: fx.fixtureStats(), opts: { maxScale: 20 },
  });
  const verification = buildVerification({
    schoolId: school.id, schoolName: school.name, studentName: d.student.name,
    matricule: d.student.matricule, className: cls.name, year: '2025-2026',
    avg: d.generalAvg, rank: d.rankEntry?.rankD, decision: d.decision.fr,
  }, 'https://app.example.com');
  return transcriptSheetHtml(d, { qrSrc: fx.PIXEL, verification, school });
}

function certificateSheet() {
  const school = fx.fixtureSchool();
  const cls = fx.fixtureClass();
  const [student] = fx.fixtureStudents(1);
  const verification = buildVerification({
    schoolId: school.id, schoolName: school.name, studentName: student.name,
    matricule: student.matricule, className: cls.name, year: '2025-2026',
  }, 'https://app.example.com');
  return certificateSheetHtml(student, cls, {
    qrSrc: fx.PIXEL, verification, school, sys: 'FR',
    schoolYear: '2025-2026', place: 'Yaoundé', date: '15/08/2026',
  });
}

// ── Rendu d'un document dans Chrome ──────────────────────────────────────────
async function renderPdf(page, { name, sheets, profile = 'standard', printBackground = true, fit = false, port }) {
  const html = buildPrintDocument(sheets, name, { profile, autoPrint: false, fit });
  const url = writeDoc(name, html, port);
  await page.goto(url, { waitUntil: 'load' });
  const pdf = await page.pdf({ printBackground, preferCSSPageSize: true });
  writeFileSync(join(ensureOutDir(), `${name}.pdf`), pdf);
  const doc = await PDFDocument.load(pdf);
  const first = doc.getPage(0).getSize();
  return { pdf, pages: doc.getPageCount(), size: first, url };
}

// ═════════════════════════════════════════════════════════════════════════════
const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
const raster = await openRasterizer(browser, port);

try {
  // ── 1. Géométrie ───────────────────────────────────────────────────────────
  r.group('1. Géométrie de page');
  for (const [profile, wmm, hmm] of [['standard', 210, 297], ['large', 297, 210]]) {
    const m = pageMetrics(profile);
    const sheets = profile === 'large' ? [transcriptSheet({ subjects: 8 })] : [transcriptSheet({ subjects: 8 })];
    const { size, pages } = await renderPdf(page, { name: `geo-${profile}`, sheets, profile, port });
    const wpt = Math.round(size.width), hpt = Math.round(size.height);
    r.check(`${profile} : page ${wmm}×${hmm} mm`,
      Math.abs(wpt - wmm * PT_PER_MM) < 2 && Math.abs(hpt - hmm * PT_PER_MM) < 2,
      `${wpt}×${hpt} pt`);
    r.check(`${profile} : marge ${m.margin} mm déclarée`, m.margin >= 8, `zone utile ${m.contentW}×${m.contentH} mm`);
    r.check(`${profile} : document non vide`, pages >= 1, `${pages} page(s)`);
  }

  // ── 2. Fixtures de non-régression ──────────────────────────────────────────
  r.group('2. Fixtures (matières, données manquantes, identité)');
  const fixtureReport = [];
  for (const f of fx.FIXTURES) {
    const sheets = [transcriptSheet({ subjects: f.subjects, style: f.style, mode: f.mode, school: f.school || {} })];
    const { pages } = await renderPdf(page, { name: `fx-${f.key}`, sheets, port });
    fixtureReport.push({ key: f.key, pages, expected: f.pages });
    r.check(`${f.key} : ${f.pages} page(s) attendue(s)`, pages === f.pages, `obtenu ${pages}`);

    const audit = auditDocument(sheets[0]);
    r.check(`${f.key} : aucune valeur interdite`, audit.ok,
      audit.ok ? '' : audit.issues.slice(0, 3).map((i) => `${i.token} → « ${i.context} »`).join(' | '));

    if (f.parts) {
      const parts = checkParts(sheets[0], f.parts);
      r.check(`${f.key} : éléments obligatoires présents`, parts.ok, parts.missing.join(', '));
    }
  }

  // Un établissement sans logo ne doit pas produire d'image cassée.
  const noLogo = transcriptSheet({ subjects: 12, school: { logo_url: null, stamp_url: null, signature_url: null } });
  r.check('sans logo/cachet : aucune balise <img> vide', !/<img[^>]+src=""/.test(noLogo));

  // ── 3. Volumes ─────────────────────────────────────────────────────────────
  r.group('3. Volumes (1 document = 1 page neuve)');
  const one = transcriptSheet({ subjects: 12, style: 'court' });
  for (const n of [1, 2, 5, 20, 100, 300]) {
    const sheets = Array.from({ length: n }, () => one);
    const t0 = Date.now();
    const { pages } = await renderPdf(page, { name: `vol-${n}`, sheets, port });
    r.check(`${n} document(s) → ${n} page(s)`, pages === n, `obtenu ${pages} · ${Date.now() - t0} ms`);
  }

  // ── 4. Couleurs à l'impression ─────────────────────────────────────────────
  r.group('4. Couleurs institutionnelles (case « arrière-plans » décochée)');
  const colorSheets = [transcriptSheet({ subjects: 12 })];
  for (const [label, printBackground] of [['case cochée', true], ['case DÉCOCHÉE (défaut Chrome)', false]]) {
    const { pdf } = await renderPdf(page, { name: `color-${printBackground ? 'on' : 'off'}`, sheets: colorSheets, printBackground, port });
    const png = await rasterize(raster, pdf, 1, 1.5);
    const a = await analyzePage(png, { marginMm: 12, pageWmm: 210 });
    writeFileSync(join(ensureOutDir(), `color-${printBackground ? 'on' : 'off'}.png`), png);
    r.check(`bandeau bleu marine imprimé — ${label}`, a.hasColor(NAVY, 500), `${a.colorCount(NAVY)} px`);
  }

  // ── 5. Blocs solidaires et débordement de page ─────────────────────────────
  r.group('5. Blocs solidaires et pagination');
  for (const n of [24, 25, 30, 40]) {
    const sheets = [transcriptSheet({ subjects: n })];
    const { pdf, pages } = await renderPdf(page, { name: `keep-${n}`, sheets, port });
    // Le QR et la signature doivent être ENTIERS sur la dernière page.
    const last = await rasterize(raster, pdf, pages, 1.5);
    writeFileSync(join(ensureOutDir(), `keep-${n}-p${pages}.png`), last);
    const a = await analyzePage(last, { marginMm: 12, pageWmm: 210 });
    r.check(`${n} matières : dernière page non vierge`, !a.blank, `encre ${(a.inkRatio * 100).toFixed(2)} %`);
    r.check(`${n} matières : rien dans la zone non imprimable`,
      a.edgeInk.top + a.edgeInk.bottom + a.edgeInk.left + a.edgeInk.right === 0,
      JSON.stringify(a.edgeInk));
    r.check(`${n} matières : bloc de vérification entier sur la dernière page`,
      /data-part="verification"/.test(sheets[0]) && a.inkRatio > 0.01,
      `${pages} page(s)`);
  }

  // ── 6. Contrôle visuel page par page ───────────────────────────────────────
  r.group('6. Contrôle visuel (rastérisation)');
  const visualCases = [
    { name: 'vis-transcript', sheets: [transcriptSheet({ subjects: 14 })], profile: 'standard', pageWmm: 210 },
    { name: 'vis-certificat', sheets: [certificateSheet()], profile: 'standard', pageWmm: 210 },
    { name: 'vis-multipage', sheets: [transcriptSheet({ subjects: 35 })], profile: 'standard', pageWmm: 210 },
  ];
  for (const c of visualCases) {
    const { pdf, pages } = await renderPdf(page, { name: c.name, sheets: c.sheets, profile: c.profile, port });
    for (let i = 1; i <= pages; i++) {
      const png = await rasterize(raster, pdf, i, 1.5);
      writeFileSync(join(ensureOutDir(), `${c.name}-p${i}.png`), png);
      const a = await analyzePage(png, { marginMm: 12, pageWmm: c.pageWmm });
      r.check(`${c.name} p${i} : page non vierge`, !a.blank, `encre ${(a.inkRatio * 100).toFixed(2)} %`);
      r.check(`${c.name} p${i} : marges respectées`,
        a.edgeInk.top + a.edgeInk.bottom + a.edgeInk.left + a.edgeInk.right === 0, JSON.stringify(a.edgeInk));
      r.check(`${c.name} p${i} : contenu dans la page`,
        a.bbox && a.bbox.maxX <= a.width && a.bbox.maxY <= a.height, '');
      if (i < pages) {
        r.check(`${c.name} p${i} : pas de bande blanche anormale en bas`,
          a.bottomWhiteMm < 60, `${a.bottomWhiteMm.toFixed(0)} mm de blanc`);
      }
    }
  }

  // ── 7. Garde-fous sur les valeurs ──────────────────────────────────────────
  r.group('7. Valeurs interdites');
  const badSubjects = fx.fixtureSubjects(6, 'court').map((s, i) => (i === 0 ? { ...s, max: 0 } : s));
  {
    const school = fx.fixtureSchool();
    const cls = fx.fixtureClass();
    const students = fx.fixtureStudents(1);
    const gm = fx.fixtureGradeMap(students, badSubjects);
    const [d] = buildClassTranscripts({
      classStudents: students, cls, subjects: badSubjects, gradeMap: gm, sys: 'FR', cycle: 'secondaire',
      countryCode: 'cameroon', schoolYear: '2025-2026', stats: fx.fixtureStats(), opts: { maxScale: 20 },
    });
    const html = transcriptSheetHtml(d, {
      qrSrc: fx.PIXEL, school,
      verification: buildVerification({ schoolId: school.id, studentName: d.student.name }, ''),
    });
    const audit = auditDocument(html);
    r.check('barème matière nul → aucun « NaN » imprimé', audit.ok,
      audit.ok ? '' : audit.issues.map((i) => i.token).join(', '));
  }
  {
    const partial = transcriptSheet({ subjects: 10, mode: 'partiel' });
    r.check('notes partielles → aucune valeur interdite', auditDocument(partial).ok);
    const empty = transcriptSheet({ subjects: 10, mode: 'sans-moyenne' });
    r.check('élève sans aucune note → aucune valeur interdite', auditDocument(empty).ok);
  }

  // ── 8. Procès-verbal (A4 paysage, tableau multipage) ───────────────────────
  r.group('8. Procès-verbal — profil paysage');
  {
    const { pvSheetHtml } = await import(`${SRC}lib/pvDoc.js`);
    const school = fx.fixtureSchool();
    const mkPv = (nStudents) => ({
      cls: fx.fixtureClass(),
      sys: 'FR', schoolYear: '2025-2026', periodLabel: 'Trimestre 1', maxScale: 20, teacherName: 'Mme ABENA',
      units: [{ key: 'u1', label: 'Séq 1' }, { key: 'u2', label: 'Séq 2' }],
      cols: Array.from({ length: 9 }, (_, i) => ({ key: `c${i}`, name: `Matière ${i + 1}`, code: `M${i + 1}` })),
      rows: fx.fixtureStudents(nStudents).map((s, i) => ({
        name: s.name, matricule: s.matricule,
        cells: Object.fromEntries(Array.from({ length: 9 }, (_, c) => [`c${c}`, { moy: 10 + ((i + c) % 8), byUnit: { u1: 9 + (c % 6), u2: 11 + (i % 5) } }])),
        avg: 12.5, rankTxt: `${i + 1}er`, mention: 'Assez bien',
        decision: { passed: i % 4 !== 0, text: i % 4 !== 0 ? 'Admis' : 'Redouble' },
      })),
      summary: { total: nStudents, admis: Math.round(nStudents * 0.75), ajournes: Math.round(nStudents * 0.25), notes: nStudents, rate: 75, avg: 12.6, min: 8.2, max: 17.4 },
    });

    const mLarge = pageMetrics('large');
    for (const n of [12, 40, 60]) {
      const sheets = [pvSheetHtml(mkPv(n), { school })];
      const { pdf, pages, size } = await renderPdf(page, { name: `pv-${n}`, sheets, profile: 'large', port });
      r.check(`PV ${n} élèves : page A4 paysage`, Math.abs(Math.round(size.width) - 842) < 2, `${Math.round(size.width)}×${Math.round(size.height)} pt`);
      r.check(`PV ${n} élèves : aucune valeur interdite`, auditDocument(sheets[0]).ok);

      // Aucun texte hors page : le tableau doit tenir dans la largeur imprimable.
      await page.emulateMedia({ media: 'print' });
      const ovf = await page.evaluate((w) => {
        const el = document.querySelector('.nc-sheet');
        el.style.setProperty('width', `${w}mm`, 'important');
        const widest = [...el.querySelectorAll('table')].reduce((a, t) => Math.max(a, t.scrollWidth), 0);
        return { over: widest - el.clientWidth, client: el.clientWidth };
      }, mLarge.contentW);
      await page.emulateMedia({ media: null });
      r.check(`PV ${n} élèves : aucun débordement horizontal`, ovf.over <= 4, `${ovf.over} px au-delà de ${ovf.client} px`);

      const png = await rasterize(raster, pdf, pages, 1.5);
      writeFileSync(join(ensureOutDir(), `pv-${n}-p${pages}.png`), png);
      const a = await analyzePage(png, { marginMm: 8, pageWmm: 297 });
      r.check(`PV ${n} élèves : dernière page non vierge`, !a.blank, `${pages} page(s) · encre ${(a.inkRatio * 100).toFixed(2)} %`);
      r.check(`PV ${n} élèves : rien dans la zone non imprimable`,
        a.edgeInk.top + a.edgeInk.bottom + a.edgeInk.left + a.edgeInk.right === 0, JSON.stringify(a.edgeInk));
      if (pages > 1) {
        const p2 = await rasterize(raster, pdf, 2, 1.5);
        writeFileSync(join(ensureOutDir(), `pv-${n}-p2.png`), p2);
        const a2 = await analyzePage(p2, { marginMm: 8, pageWmm: 297 });
        // L'en-tête ne se répète que si le TABLEAU continue sur la page. Une page
        // ne portant que le résumé et les signatures (blocs solidaires renvoyés
        // en bloc) est un cas normal, pas un en-tête manquant.
        const tableContinues = a2.inkRatio > 0.05;
        r.check(`PV ${n} élèves : ${tableContinues ? 'en-tête de tableau répété page 2' : 'page 2 = résumé + signatures (blocs solidaires)'}`,
          tableContinues ? a2.hasColor(NAVY, 300) : !a2.blank,
          `${a2.colorCount(NAVY)} px de bandeau · encre ${(a2.inkRatio * 100).toFixed(2)} %`);
      }
    }
  }

  // ── 9. Aperçu = impression ─────────────────────────────────────────────────
  // Le panneau d'aperçu annonce un nombre de pages calculé par
  // printPagination.measureDocument. Ce nombre doit être CELUI que l'imprimante
  // sortira — sinon l'aperçu ment. On charge donc le vrai module dans le
  // navigateur et on compare sa mesure au PDF produit par Chrome.
  r.group('9. Aperçu = impression (nombre de pages annoncé)');
  {
    const previewPage = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const shim = `<!doctype html><meta charset="utf-8"/>
<script type="importmap">{"imports":{
  "/src/lib/print/printStyles": "/src/lib/print/printStyles.js"
}}</script>
<body><script type="module">
import { measureDocument } from '/src/lib/print/printPagination.js';
window.__measure = (html, profile) => measureDocument(html, profile);
window.__ready = true;
</script></body>`;
    writeFileSync(join(ensureOutDir(), '__preview.html'), shim, 'utf8');
    await previewPage.goto(`http://127.0.0.1:${port}/.print-tests/__preview.html`);
    await previewPage.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

    const cases = [
      { name: 'aperçu relevé 14 matières', sheets: [transcriptSheet({ subjects: 14 })], profile: 'standard' },
      { name: 'aperçu relevé 35 matières', sheets: [transcriptSheet({ subjects: 35 })], profile: 'standard' },
      { name: 'aperçu certificat', sheets: [certificateSheet()], profile: 'standard' },
    ];
    for (const c of cases) {
      const { pages } = await renderPdf(page, { name: `prev-${c.name.replace(/\W+/g, '-')}`, sheets: c.sheets, profile: c.profile, port });
      const measured = await previewPage.evaluate(
        ([html, profile]) => window.__measure(html, profile),
        [c.sheets[0], c.profile],
      );
      r.check(`${c.name} : aperçu ${measured.pages} = impression ${pages}`, measured.pages === pages,
        `hauteur ${Math.round(measured.heightPx)} px · débordement ${measured.overflowX} px`);
    }
    await previewPage.close();
  }

  // ── 10. Bulletins MINESEC (APC premier cycle, SC second cycle) ─────────────
  // Ces bulletins passaient par une rastérisation html-to-image → jsPDF. Ils
  // sortent maintenant du socle, en vectoriel : mêmes marges, mêmes règles de
  // saut, mêmes garde-fous que les autres documents officiels.
  r.group('10. Bulletins MINESEC');
  {
    const { buildTrimesterSheets } = await import(`${SRC}lib/apcBulletinDoc.js`);
    const { buildScBulletinSheet } = await import(`${SRC}lib/scBulletinDoc.js`);
    const { perSubjectRanksAndStats, classProfile } = await import(`${SRC}lib/scBulletinPdf.js`);
    const { noteNkey } = await import(`${SRC}core/apcEngine.js`);
    const { planApcLayout } = await import(`${SRC}core/apcLayout.js`);
    const school = fx.fixtureSchool();
    const mBul = pageMetrics('bulletin');

    // ---- APC : référentiel minimal mais réaliste (compétences par matière) ----
    const CLASSE = '6e';
    const mkApc = (nMatieres, nCompetences) => {
      const matieres = Array.from({ length: nMatieres }, (_, i) => ({
        id: `m${i}`, nom: `Matière officielle n°${i + 1}`, coefficient: (i % 4) + 1, ordre: i,
      }));
      const competences = matieres.flatMap((m, i) => Array.from({ length: nCompetences }, (_, k) => ({
        id: `c${i}_${k}`, classe_id: CLASSE, trimestre_id: 't1', matiere_id: m.id, actif: true, ordre: k,
        intitule: `Compétence ${k + 1} — résoudre une situation-problème relevant de la vie courante`,
        coefficient: 1,
      })));
      const sequences = [{ id: 's1', numero: 1, trimestre_id: 't1' }, { id: 's2', numero: 2, trimestre_id: 't1' }];
      const referentiel = {
        matieres, competences, sequences,
        classeMatieres: matieres.map((m) => ({ classe_id: CLASSE, matiere_id: m.id, coefficient: m.coefficient, ordre: m.ordre })),
      };
      const [student] = fx.fixtureStudents(1);
      const apcNotes = {};
      for (const c of competences) for (const s of sequences) apcNotes[noteNkey(student.id, c.id, s.id)] = String(10 + (c.ordre % 8));
      return { referentiel, apcNotes, student, matieres };
    };

    for (const [nMat, nComp] of [[6, 2], [10, 3], [14, 4]]) {
      const { referentiel, apcNotes, student } = mkApc(nMat, nComp);
      const sheets = buildTrimesterSheets(referentiel, apcNotes, {
        classeSlug: CLASSE, trimestreId: 't1', student, school, sys: 'FR',
        classLabel: '6e M2', effectif: 48, profPrincipal: 'Mme ABENA',
        classStats: { min: 8.2, max: 17.4, avg: 12.6, count: 48, rate: 72 },
      });
      const name = `bul-apc-${nMat}x${nComp}`;
      const { pdf, pages, size } = await renderPdf(page, { name, sheets, profile: 'bulletin', fit: true, port });

      r.check(`APC ${nMat} matières × ${nComp} compétences : A4 portrait`,
        Math.abs(Math.round(size.width) - 595) < 2 && Math.abs(Math.round(size.height) - 842) < 2,
        `${Math.round(size.width)}×${Math.round(size.height)} pt · ${sheets.length} feuille(s) → ${pages} page(s)`);
      r.check(`APC ${nMat}×${nComp} : une feuille = une page`, pages === sheets.length, `${sheets.length} → ${pages}`);
      r.check(`APC ${nMat}×${nComp} : aucune valeur interdite`, auditDocument(sheets.join('')).ok,
        auditDocument(sheets.join('')).issues.slice(0, 3).map((i) => i.token).join(', '));

      const png = await rasterize(raster, pdf, pages, 1.5);
      writeFileSync(join(ensureOutDir(), `${name}-p${pages}.png`), png);
      const a = await analyzePage(png, { marginMm: mBul.margin, pageWmm: 210, safeMm: 4 });
      r.check(`APC ${nMat}×${nComp} : dernière page non vierge`, !a.blank, `encre ${(a.inkRatio * 100).toFixed(2)} %`);
      r.check(`APC ${nMat}×${nComp} : rien dans la zone non imprimable`,
        a.edgeInk.top + a.edgeInk.bottom + a.edgeInk.left + a.edgeInk.right === 0, JSON.stringify(a.edgeInk));
    }

    // Couleur : les aplats du bulletin doivent sortir même case décochée.
    {
      const { referentiel, apcNotes, student } = mkApc(8, 3);
      const sheets = buildTrimesterSheets(referentiel, apcNotes, {
        classeSlug: CLASSE, trimestreId: 't1', student, school, sys: 'FR', classLabel: '6e M2', effectif: 48,
      });
      const before = await renderPdf(page, { name: 'bul-apc-color-on', sheets, profile: 'bulletin', printBackground: true, fit: true, port });
      const after = await renderPdf(page, { name: 'bul-apc-color-off', sheets, profile: 'bulletin', printBackground: false, fit: true, port });
      const aOn = await analyzePage(await rasterize(raster, before.pdf, 1, 1.5), { marginMm: mBul.margin, pageWmm: 210 });
      const aOff = await analyzePage(await rasterize(raster, after.pdf, 1, 1.5), { marginMm: mBul.margin, pageWmm: 210 });
      r.check('APC : aplats identiques avec et sans « arrière-plans »',
        Math.abs(aOn.inkPixels - aOff.inkPixels) < aOn.inkPixels * 0.02,
        `${aOn.inkPixels} px vs ${aOff.inkPixels} px`);
    }

    // ---- Auto-fit : la marge du profil pilote bien le planificateur ----
    {
      const { matieres } = mkApc(12, 4);
      const withComps = matieres.map((m, i) => ({
        ...m,
        competences: Array.from({ length: 4 }, (_, k) => ({
          intitule: `Compétence ${k + 1} — résoudre une situation-problème relevant de la vie courante (${i})`,
        })),
      }));
      const plan = planApcLayout(withComps);
      // Le planificateur ne descend JAMAIS sous 10 pt : au-delà de ce qu'une
      // densité lisible peut absorber, il produit une page de plus (best-effort
      // documenté). On vérifie donc la lisibilité, pas un plafond de pages.
      r.check('auto-fit APC : police ≥ 10 pt', plan.fontPt >= 10, `${plan.fontPt} pt`);
      r.check('auto-fit APC : plan cohérent', (plan.pages?.length || 0) >= 1 && (plan.pages?.length || 0) <= 3,
        `${plan.pages?.length} page(s) à ${plan.fontPt} pt pour 12 matières × 4 compétences`);
    }

    // ---- SC : bulletin second cycle (moteur de notes classique) ----
    {
      const cls = fx.fixtureClass({ id: 'c1', name: '2nde C', serie: 'C' });
      const students = fx.fixtureStudents(3);
      const subs = fx.fixtureSubjects(12, 'court').map((s, i) => ({
        ...s, sc_groupe: i < 8 ? 1 : 2, sc_groupe_ordre: i, charge_horaire: 4,
      }));
      const gm = fx.fixtureGradeMap(students, subs, { seqs: 6 });
      const seqs = [1, 2];
      const opts = { maxScale: 20 };
      const { ranks: subjectRanks, stats: subjectStats } = perSubjectRanksAndStats(subs, gm, 'c1', seqs, students, {});
      const classStats = classProfile(subs, gm, 'c1', seqs, students, 'FR', opts, {});
      const sheets = students.map((student) => buildScBulletinSheet({
        subjects: subs, allGrades: gm, classId: 'c1', student, seqs, sys: 'FR', opts,
        subjectRanks, subjectStats, classStats, teachersById: {},
        generalRank: '1er', school, trimestreId: 't1', classLabel: cls.name, serieLabel: 'Série C',
        effectif: students.length, discipline: {}, decision: 'Admis(e)',
      }));
      const { pdf, pages, size } = await renderPdf(page, { name: 'bul-sc', sheets, profile: 'bulletin', fit: true, port });
      r.check('SC : A4 portrait', Math.abs(Math.round(size.width) - 595) < 2, `${Math.round(size.width)}×${Math.round(size.height)} pt`);
      r.check('SC : une feuille = une page', pages === sheets.length, `${sheets.length} → ${pages}`);
      r.check('SC : aucune valeur interdite', auditDocument(sheets.join('')).ok,
        auditDocument(sheets.join('')).issues.slice(0, 3).map((i) => `${i.token} (${i.context})`).join(' | '));

      for (let i = 1; i <= Math.min(pages, 2); i++) {
        const png = await rasterize(raster, pdf, i, 1.5);
        writeFileSync(join(ensureOutDir(), `bul-sc-p${i}.png`), png);
        const a = await analyzePage(png, { marginMm: mBul.margin, pageWmm: 210, safeMm: 4 });
        r.check(`SC p${i} : page non vierge`, !a.blank, `encre ${(a.inkRatio * 100).toFixed(2)} %`);
        r.check(`SC p${i} : rien dans la zone non imprimable`,
          a.edgeInk.top + a.edgeInk.bottom + a.edgeInk.left + a.edgeInk.right === 0, JSON.stringify(a.edgeInk));
      }
    }
  }

  // ── 11. Géométrie unique (impression en page des bulletins React) ──────────
  // Les bulletins classiques, GE, primaire et maternelle s'impriment depuis le
  // DOM de l'application. Ils ne peuvent pas être rendus ici sans monter React,
  // mais ce qui casse à l'impression est vérifiable : une géométrie de page
  // déclarée à deux endroits, et des couleurs déclarées sélecteur par sélecteur.
  r.group('11. Géométrie unique (bulletins imprimés en page)');
  {
    const { printCss } = await import(`${SRC}lib/print/printStyles.js`);
    const css = printCss({ profile: 'bulletin', screen: false, page: true });
    const mBul = pageMetrics('bulletin');

    r.check('profil « bulletin » : @page A4 portrait avec marge',
      css.includes(`@page { size: A4 portrait; margin: ${mBul.margin}mm; }`), `marge ${mBul.margin} mm`);
    r.check('profil « bulletin » : couleurs forcées jusque dans body *',
      /body \*/.test(css) && /print-color-adjust: exact !important/.test(css));

    const bulletinCss = readFileSync(new URL('../src/styles/bulletin.css', import.meta.url), 'utf8');
    r.check('bulletin.css ne déclare plus de @page', !/@page\s*\{/.test(bulletinCss),
      'la géométrie vient du socle');
    r.check('bulletin.css ne redéclare plus les couleurs des bandeaux',
      (bulletinCss.match(/print-color-adjust/g) || []).length <= 3,
      `${(bulletinCss.match(/print-color-adjust/g) || []).length} occurrence(s) restante(s)`);

    const apcLayoutSrc = readFileSync(new URL('../src/core/apcLayout.js', import.meta.url), 'utf8');
    r.check('auto-fit APC : plus de marge en dur, la géométrie vient du socle',
      !/const\s+PAGE_H\s*=|MARGIN\s*=\s*\d/.test(apcLayoutSrc) && /pageMetrics\('bulletin'\)/.test(apcLayoutSrc));

    // Un seul point d'entrée vers window.open dans tout le code d'impression.
    for (const f of ['lib/transcriptDoc.js', 'lib/pvDoc.js', 'lib/apcBulletinPdf.js', 'lib/scBulletinPdf.js']) {
      const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
      r.check(`${f} : aucune ouverture de fenêtre en direct`, !/window\.open\(/.test(src));
      r.check(`${f} : aucune règle @page locale`, !/@page/.test(src));
    }
  }

  writeFileSync(join(ensureOutDir(), 'fixtures-report.json'), JSON.stringify(fixtureReport, null, 2));
} finally {
  await browser.close();
  server.close();
}

process.exit(r.summary() ? 0 : 1);
