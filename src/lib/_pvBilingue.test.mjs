// PV des classes du PROGRAMME BILINGUE SPÉCIAL (6e–3e, Form 1–3).
// Exécution : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_pvBilingue.test.mjs
//
// Avant : 'bilingue' n'était pas dans PV_ENGINES, donc 5eme / 6eme / FORM1 / FORM2
// n'avaient aucun procès-verbal. Ici on prouve deux choses :
//   1. le PV existe pour ces classes ;
//   2. ses moyennes sont CELLES DU BULLETIN (mêmes fonctions, mêmes coefficients).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildClassPv, pvApplicable } from './pvEngine.js';
import { buildBilSubjectsForClass, enrichBilSubjects, bilRefKeyForClass } from './bilAutoConfig.js';
import { assembleBilBulletin, assembleBilAnnual } from '../core/bilEngine.js';
import { transcriptsFromPv, transcriptUsesPv } from './transcriptFromPv.js';

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('✅ ' + m); pass++; };
const eq = (a, b, m) => ok(a === b, `${m} (${a} === ${b})`);

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, '../../examples/bilingue/referentiel-bilingue-special-premier-cycle.json'), 'utf8'));
const school = { bulletin_engine: 'bilingue_special' };
const cls = { id: 'c1', school_id: 'e1', level: 'Form 1', name: 'FORM1', system: 'EN', cycle: 'secondaire' };
let n = 0;
const subjects = buildBilSubjectsForClass({ referentiel: ref, school, cls, makeId: () => `s${++n}` });
const students = [{ id: 'a', name: 'ABBA' }, { id: 'b', name: 'BELLO' }, { id: 'c', name: 'CHI' }];

// Notes déterministes : l'élève a note la matière i à (8 + i + k) en séquence k.
const gradeMap = {};
students.forEach((st, si) => {
  for (let seq = 1; seq <= 6; seq++) {
    const g = {};
    subjects.forEach((s, i) => { g[s.id] = String(Math.min(20, 6 + si * 3 + (i % 5) + seq % 3)); });
    gradeMap[`${cls.id}_${st.id}_${seq}`] = g;
  }
});

const base = { cls, engine: 'bilingue', sys: 'EN', cycle: 'secondaire', schoolYear: '2026-2027', students, subjects, gradeMap, opts: { maxScale: 20 } };

console.log('── Le PV existe pour une classe bilingue ──');
ok(pvApplicable('bilingue'), 'bilingue est délibérable');
const pvT1 = buildClassPv({ ...base, period: 't1', bilReferentiel: ref });
ok(!!pvT1, 'PV Term 1 produit pour FORM1');
eq(pvT1.rows.length, 3, 'une ligne par élève');
eq(pvT1.units.map((u) => u.label).join(','), 'S1,S2', 'Term 1 = séquences 1 et 2');
ok(pvT1.cols.length === subjects.length, 'une colonne par matière du référentiel');

console.log('\n── Les moyennes sont celles du bulletin ──');
const enriched = enrichBilSubjects(subjects, ref, cls);
const serieId = bilRefKeyForClass(cls).serieId;
for (const st of students) {
  const bull = assembleBilBulletin({ subjects: enriched, allGrades: gradeMap, classId: cls.id, student: st, seqs: [1, 2], serieId, maxScale: 20 });
  const row = pvT1.rows.find((r) => r.id === st.id);
  eq(row.avg, bull.moyenneGenerale, `moyenne de ${st.name} : PV = bulletin`);
}

console.log('\n── Annuel : même règle que le bulletin annuel ──');
const pvAn = buildClassPv({ ...base, period: 'annuel', bilReferentiel: ref });
ok(!!pvAn && pvAn.units.length === 6, 'annuel : une colonne par séquence (S1 à S6)');
const pvS3 = buildClassPv({ ...base, period: 's3', bilReferentiel: ref });
eq(pvS3.units.map((u) => u.label).join(','), 'S3', 'période Séquence 3 = une seule colonne S3');
const bS3 = assembleBilBulletin({ subjects: enrichBilSubjects(subjects, ref, cls), allGrades: gradeMap, classId: cls.id, student: students[0], seqs: [3], serieId: bilRefKeyForClass(cls).serieId, maxScale: 20 });
eq(pvS3.rows.find((r) => r.id === 'a').avg, bS3.moyenneGenerale, 'moyenne de la séquence 3 = bulletin de la séquence 3');
for (const st of students) {
  const bull = assembleBilAnnual({ subjects: enriched, allGrades: gradeMap, classId: cls.id, student: st, serieId, maxScale: 20, termSeqs: [[1, 2], [3, 4], [5, 6]] });
  eq(pvAn.rows.find((r) => r.id === st.id).avg, bull.moyenneGenerale, `annuel ${st.name} : PV = bulletin`);
}

console.log('\n── Rang cohérent avec les moyennes ──');
const ranked = [...pvT1.rows].sort((a, b) => a.rank - b.rank);
ok(ranked[0].avg >= ranked[1].avg && ranked[1].avg >= ranked[2].avg, 'rang 1 = meilleure moyenne');

console.log('\n── Garde-fou : jamais un PV faux ──');
eq(buildClassPv({ ...base, period: 't1', bilReferentiel: null }), null, 'sans référentiel : pas de PV (coefficients inconnus)');
eq(buildClassPv({ ...base, cls: { ...cls, level: 'Form 4', name: 'Form 4' }, period: 't1', bilReferentiel: ref }), null, 'Form 4 hors service : pas de PV');

console.log('\n── Relevé de notes : mêmes chiffres que le PV et le bulletin ──');
const rel = transcriptsFromPv(pvAn);
eq(rel.length, 3, 'un relevé par élève');
for (const st of students) {
  const bull = assembleBilAnnual({ subjects: enriched, allGrades: gradeMap, classId: cls.id, student: st, serieId, maxScale: 20, termSeqs: [[1, 2], [3, 4], [5, 6]] });
  const d = rel.find((x) => x.student.id === st.id);
  eq(d.generalAvg, bull.moyenneGenerale, `relevé ${st.name} : moyenne = bulletin annuel`);
  const first = bull.domaines.flatMap((x) => x.rows)[0];
  eq(d.rows.find((r) => r.subject.id === first.id).annual, first.moyenne, `relevé ${st.name} : moyenne de matière = bulletin`);
}
eq(rel[0].scaleLabel, '/20', 'barème /20 même sur une classe anglophone (plus de /100 deviné)');
ok(rel[0].cols.length === 6 && rel[0].cols[0].label === 'S1', 'relevé : six colonnes de séquences');
ok(rel.every((d) => d.generalAppr.text), 'mention présente (le relevé anglais la montrait vide)');
ok(!transcriptUsesPv('classic') && transcriptUsesPv('bilingue') && transcriptUsesPv('apc_primaire'), 'seuls les moteurs à calcul propre passent par le PV');

console.log(`\n${pass} vérifications — OK`);
