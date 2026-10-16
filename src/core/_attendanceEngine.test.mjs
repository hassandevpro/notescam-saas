// L'APPEL SE TRADUIT-IL EN HEURES JUSTES SUR LE BULLETIN ?
//
// Chaque test vise une façon concrète de compter faux : journée comptée pour
// une heure, double comptage dans la journée, retard pris pour une absence,
// justification ignorée, pointage hors séquence perdu.
import {
  aggregateAttendance, dayTotals, dayShape, sequenceForDate, isoWeekday,
  distinctStudents, localISODate, attendanceAuto, attendanceTotals, DEFAULT_HOURS,
} from './attendanceEngine.js';

let fails = 0;
const ok = (c, m, got) => { if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m, got !== undefined ? JSON.stringify(got) : ''); } };

const periods = [
  { type: 'sequence', sequence_order: 1, school_year: '2026-2027', teaching_start: '2026-09-07', teaching_end: '2026-10-16' },
  { type: 'sequence', sequence_order: 2, school_year: '2026-2027', teaching_start: '2026-10-19', teaching_end: '2026-11-27' },
];
const D = DEFAULT_HOURS;
const rec = (o) => ({ student_id: 's1', class_id: 'c1', date: '2026-10-05', status: 'absent', session: null, subject_id: null, ...o });

console.log('Unités horaires');
ok(dayTotals([rec({})], { ...D, slots: [] }).absNJ === 6, 'journée entière = 6 h sans emploi du temps');
ok(dayTotals([rec({ session: 'matin' })], { ...D, slots: [] }).absNJ === 3, 'demi-journée = 3 h');
ok(dayTotals([rec({ session: 'H2' })], { ...D, slots: [] }).absNJ === 1, 'Heure n = 1 h');
ok(dayTotals([rec({ subject_id: 'maths' })], { ...D, slots: [] }).absNJ === 1, 'appel d’une matière sans période = 1 h, pas une journée');
ok(dayTotals([rec({ subject_id: 'maths' }), rec({ subject_id: 'svt' })], { ...D, slots: [] }).absNJ === 2, 'deux matières = deux heures');

console.log('Emploi du temps');
const tt = [
  { class_id: 'c1', day_of_week: 1, start_time: '07:30', subject_id: 'maths' },
  { class_id: 'c1', day_of_week: 1, start_time: '08:30', subject_id: 'fr' },
  { class_id: 'c1', day_of_week: 1, start_time: '10:00', subject_id: 'svt' },
  { class_id: 'c1', day_of_week: 1, start_time: '13:00', subject_id: 'eps' },
];
const shape = dayShape(tt, 'c1', 1);
ok(shape.day === 4 && shape.morning === 3 && shape.afternoon === 1, 'lundi : 4 h dont 3 le matin');
ok(dayTotals([rec({})], shape).absNJ === 4, 'journée = heures réelles de la classe');
ok(dayTotals([rec({ session: 'apres-midi' })], shape).absNJ === 1, 'après-midi = heures réelles');
ok(dayTotals([rec({ subject_id: 'fr' }), rec({ session: 'H2' })], shape).absNJ === 1, 'matière = son créneau : pas de double comptage avec « Heure 2 »');
ok(isoWeekday('2026-10-05') === 1 && isoWeekday('2026-10-11') === 7, 'jour de semaine sans décalage de fuseau');

console.log('Pas de double comptage dans la journée');
ok(dayTotals([rec({}), rec({ session: 'H1' }), rec({ session: 'matin' })], { ...D, slots: [] }).absNJ === 6, 'journée + heure + matin = 6 h, pas 10');
ok(dayTotals([rec({ session: 'matin' }), rec({ session: 'H1' })], { ...D, slots: [] }).absNJ === 3, 'H1 incluse dans le matin');
ok(dayTotals([rec({ session: 'matin' }), rec({ session: 'H5' })], { ...D, slots: [] }).absNJ === 4, 'H5 hors du matin : s’ajoute');

console.log('Justification et retards');
const j = dayTotals([rec({}), rec({ status: 'excused', session: 'matin' })], { ...D, slots: [] });
ok(j.absJ === 3 && j.absNJ === 3, 'matin justifié après coup : 3 h J + 3 h NJ', j);
ok(dayTotals([rec({ status: 'retard' })], { ...D, slots: [] }).absNJ === 0, 'un retard n’est pas une heure d’absence');

console.log('Agrégation par séquence');
const att = [
  rec({}),                                                   // séq 1 : 6 h NJ
  rec({ date: '2026-10-06', status: 'excused', session: 'matin' }), // séq 1 : 3 h J
  rec({ date: '2026-10-07', status: 'retard' }),             // séq 1 : retard
  rec({ date: '2026-10-20', session: 'H1' }),                // séq 2 : 1 h NJ
  rec({ date: '2026-10-17' }),                               // samedi entre deux séquences → hors séquence
  rec({ student_id: 's2', date: '2026-10-05', status: 'retard' }),
];
const late = [
  { student_id: 's1', class_id: 'c1', date: '2026-10-07' },  // même jour que le retard de l'appel → 1 seul
  { student_id: 's1', class_id: 'c1', date: '2026-10-08' },  // autre jour → 2e retard
];
const agg = aggregateAttendance(att, { periods, lateArrivals: late, year: '2026-2027' });
const s1 = agg.byStudent.s1;
ok(s1[1].absNJ === 6 && s1[1].absJ === 3, 'séquence 1 : 6 h NJ, 3 h J', s1[1]);
ok(s1[1].lates === 2, 'retards appel + registre dédoublonnés par jour', s1[1].lates);
ok(s1[2].absNJ === 1, 'séquence 2 : 1 h NJ');
ok(agg.unassigned === 1, 'pointage hors séquence compté, pas perdu', agg.unassigned);
ok(agg.byStudent.s2[1].absNJ === 0 && agg.byStudent.s2[1].lates === 1, 'élève seulement en retard : 0 h d’absence');
ok(attendanceAuto(agg, 'inconnu', 1).absNJAuto === 0, 'élève sans pointage : 0');
ok(sequenceForDate('2026-10-16', periods) === 1 && sequenceForDate('2026-10-19', periods) === 2, 'bornes de séquence incluses');
ok(sequenceForDate('2026-10-05', periods, '2025-2026') === null, 'autre année : pas de séquence');

console.log('Statistiques sur une plage');
{
  const tot = attendanceTotals(att);
  ok(tot.s1.absNJ === 6 + 1 + 6 && tot.s1.absJ === 3, 'heures totales hors séquences (rien de perdu)', tot.s1);
  ok(tot.s1.lates === 1 && tot.s1.days === 4, 'retards et jours d’absence comptés à part', tot.s1);
}

console.log('Compteurs du jour');
ok(distinctStudents([{ student_id: 'a', status: 'absent' }, { student_id: 'a', status: 'absent' }, { student_id: 'b', status: 'retard' }], (r) => r.status === 'absent') === 1, 'absent en H1 et H2 = un seul absent du jour');
ok(localISODate(new Date(2026, 9, 5, 0, 30)) === '2026-10-05', 'date locale (pas UTC) à 0 h 30');

if (fails) { console.error(`\n${fails} échec(s)`); process.exit(1); }
console.log('\nOK');
