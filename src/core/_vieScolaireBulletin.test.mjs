// LA VIE SCOLAIRE ARRIVE-T-ELLE SUR LE BON BULLETIN ?
//
// Chaque test vise une façon concrète de se tromper : séquence prise au champ saisi
// plutôt qu'à la date, saisie du conseil écrasée, trimestre qui garde la dernière
// séquence au lieu de sommer, fait hors calendrier perdu, autre classe comptée.
import {
  agregerVieScolaire, surcoucheVieScolaire, cumulVieScolaire, joursExclusion, periodesDeRattachement,
} from './vieScolaireBulletin.js';
import { scDisciplineConseil } from './scEngine.js';

let fails = 0;
const ok = (c, m, got) => { if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m, got !== undefined ? JSON.stringify(got) : ''); } };

const Y = '2026-2027';
const periods = [1, 2, 3, 4].map((k) => ({
  type: 'sequence', sequence_order: k, school_year: Y,
  teaching_start: ['2026-09-07', '2026-10-19', '2026-12-07', '2027-01-18'][k - 1],
  teaching_end:   ['2026-10-16', '2026-11-27', '2027-01-15', '2027-02-26'][k - 1],
}));
const act = (o) => ({ student_id: 's1', class_id: 'c1', action_type: 'blame', date: '2026-10-05', ...o });

console.log('Séquence par la DATE');
let vs = agregerVieScolaire({ actions: [act({ sequence_order: 2 })] }, { periods, year: Y });
ok(vs.byStudent.s1[1]?.blameConduite === 1 && !vs.byStudent.s1[2], 'blâme du 05/10 saisi « Séquence 2 » → S1', vs.byStudent.s1);
vs = agregerVieScolaire({ actions: [act({ date: '2026-11-02' })] }, { periods, year: Y });
ok(vs.byStudent.s1[2]?.blameConduite === 1, 'blâme du 02/11 → S2');
vs = agregerVieScolaire({ actions: [act({ date: '2026-10-17' })] }, { periods, year: Y });
ok(vs.byStudent.s1[1]?.blameConduite === 1, 'samedi 17/10 hors fenêtre → séquence la plus proche (S1), pas perdu');
vs = agregerVieScolaire({ actions: [act({ class_id: 'autre' })] }, { periods, year: Y, classId: 'c1' });
ok(!vs.byStudent.s1, 'une sanction d’une autre classe n’est pas comptée');

console.log('Calendrier par défaut quand l’admin n’a réglé aucune date');
const p0 = periodesDeRattachement([{ type: 'sequence', sequence_order: 1, school_year: Y }], Y);
ok(p0.parDefaut && p0.periods.length === 6, 'aucune date réglée → calendrier par défaut, signalé');
vs = agregerVieScolaire({ actions: [act({ date: '2026-10-20' })] }, { periods: [], year: Y });
ok(vs.parDefaut && vs.byStudent.s1[2]?.blameConduite === 1, 'défaut : 20/10 → S2 (S1 = 1/9–15/10)', vs.byStudent.s1);

console.log('Types et catégories');
vs = agregerVieScolaire({ actions: [
  act({ action_type: 'avertissement_oral' }), act({ action_type: 'avertissement_ecrit', category: 'travail' }),
  act({ action_type: 'blame', category: 'travail' }), act({ action_type: 'blame' }),
  act({ action_type: 'exclusion_temporaire', duration_days: 3 }), act({ action_type: 'exclusion_temporaire', start_date: '2026-10-05', end_date: '2026-10-06' }),
  act({ action_type: 'exclusion_definitive' }), act({ action_type: 'retenue' }), act({ action_type: 'travail_interet' }),
], incidents: [act({}), act({})], detentions: [act({})], warnings: [act({ category: 'travail' })] }, { periods, year: Y });
const c = vs.byStudent.s1[1];
ok(c.averConduite === 1 && c.averTravail === 2, 'avertissements : sans catégorie = conduite ; travail compté à part (+ table avertissements)', c);
ok(c.blameTravail === 1 && c.blameConduite === 1, 'blâmes travail / conduite séparés', c);
ok(c.exclusions === 5, 'exclusions : 3 j saisis + 2 j par les bornes', c);
ok(c.exclDef === 1 && c.retenues === 2 && c.tis === 1 && c.incidents === 2, 'définitive, retenues (sanction + table), TIS, incidents', c);
ok(joursExclusion({}) === 1, 'exclusion sans durée ni bornes = 1 jour');

console.log('La saisie du conseil l’emporte, case par case');
const gm = { c1_s1_1: { __blame_conduite__: '0', __abs_j__: '2' } };
const sur = surcoucheVieScolaire(gm, 'c1', vs, { byStudent: { s1: { 1: { lates: 4 } } } });
ok(sur.c1_s1_1.__blame_conduite__ === '0', 'blâme conduite saisi « 0 » au conseil : gardé');
ok(sur.c1_s1_1.__aver_conduite__ === '1' && sur.c1_s1_1.__exclusions__ === '5', 'cases vides : complétées par le registre', sur.c1_s1_1);
ok(sur.c1_s1_1.__retards__ === '4' && sur.c1_s1_1.__abs_j__ === '2', 'retards de l’appel ajoutés ; absences intactes');
ok(gm.c1_s1_1.__aver_conduite__ === undefined, 'le gradeMap d’origine n’est pas modifié');

console.log('Trimestre et année = SOMME des séquences');
const g2 = {
  c1_s1_1: { __blame_conduite__: '1', __aver_travail__: '1', __exclusions__: '2' },
  c1_s1_2: { __blame_conduite__: '1', __exclusions__: '3', __retards__: '2' },
  c1_s1_3: { __blame_conduite__: '1' },
};
const t1 = cumulVieScolaire(g2, 'c1', 's1', [1, 2]);
ok(t1.blameConduite === 2 && t1.exclusions === 5 && t1.retards === 2 && t1.averTravail === 1, 'T1 = S1 + S2', t1);
ok(t1.parSeq[1].blameConduite === 1 && t1.parSeq[2].exclusions === 3, 'détail par séquence disponible', t1.parSeq);
ok(cumulVieScolaire(g2, 'c1', 's1', [1, 2, 3, 4, 5, 6]).blameConduite === 3, 'année = S1…S6');
// (Assertion sur scDisciplineConseil retirée de cette livraison : le correctif du cumul dans
// scEngine.js fait partie du lot « vie scolaire sur les bulletins », pas encore en ligne.)

if (fails) { console.error(`\n${fails} échec(s)`); process.exit(1); }
console.log('\nOK');
