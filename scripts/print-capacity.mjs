// Capacité d'une page : à partir de combien de matières un relevé déborde ?
// Mesure la hauteur réelle du contenu à la largeur imprimable du profil.
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/print-capacity.mjs
import { createRequire } from 'node:module';
import { startServer, writeDoc } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SRC = new URL('../src/', import.meta.url).href;
const { buildClassTranscripts, buildVerification } = await import(`${SRC}lib/transcriptEngine.js`);
const { transcriptSheetHtml, buildPrintDocument } = await import(`${SRC}lib/transcriptDoc.js`);
const { pageMetrics } = await import(`${SRC}lib/print/printStyles.js`);
const fx = await import(`${SRC}lib/print/printTestUtils.js`);

const m = pageMetrics('standard');
const sheetFor = (n, style) => {
  const school = fx.fixtureSchool();
  const cls = fx.fixtureClass();
  const students = fx.fixtureStudents(1);
  const subs = fx.fixtureSubjects(n, style);
  const gm = fx.fixtureGradeMap(students, subs);
  const [d] = buildClassTranscripts({
    classStudents: students, cls, subjects: subs, gradeMap: gm, sys: 'FR', cycle: 'secondaire',
    countryCode: 'cameroon', schoolYear: '2025-2026', stats: fx.fixtureStats(), opts: { maxScale: 20 },
  });
  return transcriptSheetHtml(d, {
    qrSrc: fx.PIXEL, school,
    verification: buildVerification({ schoolId: school.id, studentName: d.student.name }, ''),
  });
};

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });

console.log(`Zone utile : ${m.contentW}×${m.contentH} mm (${Math.round(m.contentWpx)}×${Math.round(m.contentHpx)} px)\n`);
for (const style of ['long', 'court']) {
  console.log(`— libellés « ${style} »`);
  for (let n = 14; n <= 30; n++) {
    const html = buildPrintDocument([sheetFor(n, style)], `cap-${n}`, { autoPrint: false });
    await page.goto(writeDoc(`cap-${style}-${n}`, html, port), { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const h = await page.evaluate((w) => {
      const el = document.querySelector('.nc-sheet');
      // Le socle pose `width:auto !important` à l'impression : il faut le même poids.
      el.style.setProperty('width', w + 'mm', 'important');
      return el.offsetHeight;
    }, m.contentW);
    const pages = Math.max(1, Math.ceil((h - 1) / m.contentHpx));
    console.log(`  ${String(n).padStart(2)} matières : ${Math.round(h)} px → ${pages} page(s)${pages === 1 ? '' : '  ⟵ déborde'}`);
  }
}
await browser.close();
server.close();
