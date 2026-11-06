// Relevé de notes par PÉRIODE : année entière ou une séquence (UA au primaire).
// node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_transcriptPeriode.test.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildClassPv } from './pvEngine.js';
import { buildClassTranscripts } from './transcriptEngine.js';
import { transcriptsFromPv } from './transcriptFromPv.js';
import { transcriptSheetHtml } from './transcriptDoc.js';
import { buildBilSubjectsForClass } from './bilAutoConfig.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('✅ ' + m); n++; };
const eq = (a, b, m) => ok(a === b, `${m} (${a} === ${b})`);

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, '../../examples/bilingue/referentiel-bilingue-special-premier-cycle.json'), 'utf8'));
const cls = { id: 'c1', school_id: 'e1', level: 'Form 1', name: 'FORM1', system: 'EN', cycle: 'secondaire' };
let k = 0;
const subjects = buildBilSubjectsForClass({ referentiel: ref, school: { bulletin_engine: 'bilingue_special' }, cls, makeId: () => `s${++k}` });
const students = [{ id: 'a', name: 'ABBA' }, { id: 'b', name: 'BELLO' }];
const gradeMap = {};
students.forEach((st, si) => { for (let q = 1; q <= 6; q++) { const g = {}; subjects.forEach((s, i) => { g[s.id] = String(8 + si * 3 + (i % 4) + (q % 3)); }); gradeMap[`c1_${st.id}_${q}`] = g; } });
const base = { cls, engine: 'bilingue', sys: 'EN', cycle: 'secondaire', schoolYear: '2026-2027', students, subjects, gradeMap, opts: { maxScale: 20 }, bilReferentiel: ref };

console.log('── Relevé bilingue (via le PV) ──');
const an = transcriptsFromPv(buildClassPv({ ...base, period: 'annuel' }));
eq(an[0].periodLabel, null, 'année entière : pas de titre de période');
eq(an[0].cols.length, 6, 'année entière : six colonnes de séquences');
const s3 = transcriptsFromPv(buildClassPv({ ...base, period: 's3' }));
eq(s3[0].cols.length, 1, 'séquence 3 : une seule colonne');
eq(s3[0].periodLabel, 'Sequence 3', 'séquence 3 : titre de période (feuille anglaise)');
const html = transcriptSheetHtml(s3[0], { school: {}, qrSrc: '', verification: { code: 'X', url: '' } });
ok(html.includes('Sequence 3') && !html.includes('ANNUAL TRANSCRIPT'), 'la feuille porte « Sequence 3 », plus « ANNUAL »');
ok(html.includes('GENERAL AVERAGE') && !html.includes('ANNUAL GENERAL AVERAGE'), 'la ligne de moyenne n\'est plus « annuelle »');

console.log('\n── Relevé calcul classique : une séquence ──');
const subs = [{ id: 'm', name: 'Maths', coef: 2, max: 20 }];
const gm = { c2_a_1: { m: '10' }, c2_a_2: { m: '16' } };
const c2 = { id: 'c2', name: '6e', system: 'FR', cycle: 'secondaire' };
const mk = (periodSeq) => buildClassTranscripts({ classStudents: [{ id: 'a', name: 'A' }], cls: c2, subjects: subs, gradeMap: gm, sys: 'FR', cycle: 'secondaire', countryCode: 'cameroon_fr', schoolYear: '2026-2027', opts: { maxScale: 20 }, periodSeq })[0];
eq(mk(null).generalAvg, 13, 'année entière : moyenne des séquences notées (10 et 16)');
const q2 = mk(2);
eq(q2.generalAvg, 16, 'séquence 2 : moyenne de la seule séquence 2');
eq(q2.cols.length, 1, 'séquence 2 : une colonne');
ok(!!q2.periodLabel, 'séquence 2 : titre de période présent');
eq(mk(9).cols.length, 6, 'séquence inconnue : retombe sur l\'année (jamais un relevé vide)');

console.log(`\n${n} vérifications — OK`);
