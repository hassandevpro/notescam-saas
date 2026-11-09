// FORM1/FORM2 (EN, grade_max=20) : le rapport de classe et le PV restent sur /20.
//   node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_rapportsSur20.test.mjs
import { buildClassReport } from './classReportEngine.js';
import { bulletinScale } from '../core/bulletinScale.js';
let failed = false;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed = true; };
const cls = { id: 'f1', system: 'EN', grade_max: 20, name: 'FORM1' };
const sc = bulletinScale(cls, 'EN', 20);
ok(sc.maxScale === 20, `bulletinScale EN grade_max 20 -> ${sc.maxScale}`);
ok(bulletinScale(null, 'EN', 20).maxScale > 0, 'classe nulle : pas de plantage');
const subjects = [{ id: 's1', class_id: 'f1', name: 'Maths', max: 20, coef: 1 }];
const students = [{ id: 'e1', name: 'A' }];
const gradeMap = { 'f1_e1_1': { s1: '14' } };
const rep = buildClassReport({ engine: 'classic', cls, students, subjects, period: { seqs: [1] }, gradeMap, sys: 'EN', gOpts: { maxScale: sc.maxScale }, scaleMax: sc.maxScale, passThreshold: sc.maxScale / 2 });
const avg = rep.rows?.[0]?.avg;
ok(avg === 14, `moyenne de 14/20 reste 14 (obtenu ${avg})`);
const sans = buildClassReport({ engine: 'classic', cls, students, subjects, period: { seqs: [1] }, gradeMap, sys: 'EN', gOpts: {}, scaleMax: 20, passThreshold: 10 }).rows[0].avg;
console.log('   sans maxScale (ancien comportement) :', sans);
ok(sans !== 14, 'sans maxScale le rapport EN divergeait de /20 (preuve du bug corrigé)');
process.exit(failed ? 1 : 0);
