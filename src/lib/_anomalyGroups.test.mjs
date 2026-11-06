// Les anomalies se regroupent par cause : « Histoire jamais notée » = UNE ligne.
// node src/lib/_anomalyGroups.test.mjs
import assert from 'node:assert';
import { groupAnomalies, describeGroup } from './anomalyGroups.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('✅ ' + m); n++; };
const t = (fr) => fr;
const mk = (id, name, classId, className, names, status = 'warning') =>
  ({ id, name, classId, className, status, issues: [{ code: 'missing_subjects', names, count: names.length }] });

// 5eme : Histoire non notée pour les 10 élèves (cas réel de THE GENIUS).
const cinq = Array.from({ length: 10 }, (_, i) => mk(`e${i}`, `ELEVE ${i}`, 'c5', '5eme', ['Histoire']));
// FORM1 : Physics manque à 3 élèves sur 41.
const form1 = ['A', 'B', 'C'].map((x, i) => mk(`f${i}`, `FORM ${x}`, 'f1', 'FORM1', ['Physics']));
const g = groupAnomalies([...cinq, ...form1], { c5: 10, f1: 41 });

ok(g.length === 2, `13 lignes d'élèves → 2 lignes lisibles (${g.length})`);
const hist = g.find((x) => x.subject === 'Histoire');
ok(hist.wholeClass && hist.students.length === 10, 'Histoire : toute la classe (10/10)');
ok(describeGroup(hist, t).title.includes('toute la classe'), 'le titre dit « toute la classe »');
const phys = g.find((x) => x.subject === 'Physics');
ok(!phys.wholeClass && phys.students.length === 3, 'Physics : 3 élèves sur 41, pas la classe');
ok(describeGroup(phys, t).detail.includes('FORM A'), 'les noms des élèves concernés sont listés');
ok(g[0].subject === 'Histoire', 'la matière non notée pour toute la classe passe en premier');

// Un élève avec 3 matières manquantes → 3 groupes (une par matière à saisir).
const multi = groupAnomalies([mk('x', 'X', 'c6', '6eme', ['ESF', 'SVT', 'ECM'])], { c6: 19 });
ok(multi.length === 3 && multi.every((x) => x.status === 'warning'), 'une ligne par matière à saisir');

// Bloqué avant avertissement ; classe sans note = une ligne.
const blocked = Array.from({ length: 24 }, (_, i) => ({ id: `m${i}`, name: `M${i}`, classId: 'cm1', className: 'CM1', status: 'blocked', issues: [{ code: 'no_grades' }] }));
const mix = groupAnomalies([...cinq, ...blocked], { c5: 10, cm1: 24 });
ok(mix[0].status === 'blocked' && mix[0].wholeClass && mix[0].students.length === 24, 'CM1 : 24 lignes → 1 ligne « aucune note », bloquante, en tête');
ok(describeGroup(mix[0], t).title.includes('Aucune note saisie'), 'message clair pour une classe sans notes');

console.log(`\n${n} vérifications — OK`);
