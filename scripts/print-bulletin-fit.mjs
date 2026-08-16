// De combien un bulletin dépasse-t-il sa page ? (profil « bulletin »)
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/print-bulletin-fit.mjs
import { createRequire } from 'node:module';
import { startServer, writeDoc } from './lib/print-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SRC = new URL('../src/', import.meta.url).href;
const { buildPrintDocument } = await import(`${SRC}lib/transcriptDoc.js`);
const { buildScBulletinSheet } = await import(`${SRC}lib/scBulletinDoc.js`);
const { buildTrimesterSheets } = await import(`${SRC}lib/apcBulletinDoc.js`);
const { perSubjectRanksAndStats, classProfile } = await import(`${SRC}lib/scBulletinPdf.js`);
const { noteNkey } = await import(`${SRC}core/apcEngine.js`);
const { pageMetrics } = await import(`${SRC}lib/print/printStyles.js`);
const fx = await import(`${SRC}lib/print/printTestUtils.js`);

const m = pageMetrics('bulletin');
const school = fx.fixtureSchool();

function scSheet(nSubjects) {
  const students = fx.fixtureStudents(3);
  const subs = fx.fixtureSubjects(nSubjects, 'court').map((s, i) => ({
    ...s, sc_groupe: i < Math.ceil(nSubjects * 0.7) ? 1 : 2, sc_groupe_ordre: i, charge_horaire: 4,
  }));
  const gm = fx.fixtureGradeMap(students, subs, { seqs: 6 });
  const seqs = [1, 2];
  const opts = { maxScale: 20 };
  const { ranks: subjectRanks, stats: subjectStats } = perSubjectRanksAndStats(subs, gm, 'c1', seqs, students, {});
  const classStats = classProfile(subs, gm, 'c1', seqs, students, 'FR', opts, {});
  return buildScBulletinSheet({
    subjects: subs, allGrades: gm, classId: 'c1', student: students[0], seqs, sys: 'FR', opts,
    subjectRanks, subjectStats, classStats, teachersById: {}, generalRank: '1er',
    school, trimestreId: 't1', classLabel: '2nde C', serieLabel: 'Série C',
    effectif: students.length, discipline: {}, decision: 'Admis(e)',
  });
}

function apcSheets(nMat, nComp) {
  const matieres = Array.from({ length: nMat }, (_, i) => ({ id: `m${i}`, nom: `Matière officielle n°${i + 1}`, coefficient: (i % 4) + 1, ordre: i }));
  const competences = matieres.flatMap((mm, i) => Array.from({ length: nComp }, (_, k) => ({
    id: `c${i}_${k}`, classe_id: '6e', trimestre_id: 't1', matiere_id: mm.id, actif: true, ordre: k,
    intitule: `Compétence ${k + 1} — résoudre une situation-problème relevant de la vie courante`, coefficient: 1,
  })));
  const sequences = [{ id: 's1', numero: 1, trimestre_id: 't1' }, { id: 's2', numero: 2, trimestre_id: 't1' }];
  const referentiel = { matieres, competences, sequences, classeMatieres: matieres.map((x) => ({ classe_id: '6e', matiere_id: x.id, coefficient: x.coefficient, ordre: x.ordre })) };
  const [student] = fx.fixtureStudents(1);
  const apcNotes = {};
  for (const c of competences) for (const s of sequences) apcNotes[noteNkey(student.id, c.id, s.id)] = String(10 + (c.ordre % 8));
  return buildTrimesterSheets(referentiel, apcNotes, {
    classeSlug: '6e', trimestreId: 't1', student, school, sys: 'FR', classLabel: '6e M2', effectif: 48,
    classStats: { min: 8.2, max: 17.4, avg: 12.6, count: 48, rate: 72 },
  });
}

const { server, port } = await startServer();
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });

async function measure(label, sheets) {
  const html = buildPrintDocument(sheets, label, { profile: 'bulletin', autoPrint: false });
  await page.goto(writeDoc(`fit-${label.replace(/\W+/g, '-')}`, html, port), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  const hs = await page.evaluate((w) => [...document.querySelectorAll('.nc-sheet')].map((el) => {
    el.style.setProperty('width', `${w}mm`, 'important');
    return el.offsetHeight;
  }), m.contentW);
  await page.emulateMedia({ media: null });
  hs.forEach((h, i) => {
    const over = h - m.contentHpx;
    console.log(`  ${label} feuille ${i + 1} : ${Math.round(h)} px / ${Math.round(m.contentHpx)} px utiles`
      + (over > 0 ? `  ⟵ dépasse de ${Math.round(over)} px (${(over / 3.7795).toFixed(1)} mm)` : `  (reste ${Math.round(-over)} px)`));
  });
}

console.log(`Profil « bulletin » : ${m.contentW}×${m.contentH} mm (${Math.round(m.contentWpx)}×${Math.round(m.contentHpx)} px)\n`);
console.log('— Bulletin SECOND CYCLE');
for (const n of [8, 12, 16]) await measure(`sc-${n}`, [scSheet(n)]);
console.log('\n— Bulletin APC');
for (const [a, b] of [[6, 2], [10, 3], [14, 4]]) await measure(`apc-${a}x${b}`, apcSheets(a, b));

await browser.close();
server.close();
