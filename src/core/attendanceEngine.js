// APPEL QUOTIDIEN → ABSENCES DU BULLETIN — logique pure.
//
// LE DÉFAUT QUE CECI CORRIGE. L'école tenait deux registres sans lien :
//   • l'appel (table `attendance`, page Absences) : le surveillant ou le prof
//     pointe chaque jour Absent / Retard / Excusé, par journée, demi-journée,
//     heure ou matière ;
//   • les absences du bulletin (`__abs_j__` / `__abs_nj__`, en HEURES par
//     séquence) : retapées à la main au conseil de classe.
// Rien ne reliait les deux. Le pointage quotidien ne servait qu'aux
// statistiques, et le bulletin portait un chiffre que personne ne pouvait
// recouper avec l'appel.
//
// Ce module calcule, depuis l'appel, les heures justifiées / non justifiées et
// les retards de chaque élève pour chaque séquence. Il PROPOSE ; le conseil de
// classe applique (même principe que les sanctions, cf. scEngine
// vieScolaireAutoConduite). Jamais d'écrasement silencieux.
//
// RÈGLES (chacune corrige une erreur de comptage possible) :
//   1. Unité = l'heure de cours. Journée = heures du jour de la classe (emploi
//      du temps), demi-journée = heures du matin / de l'après-midi, « Heure n »
//      = 1 h. Sans emploi du temps : 6 h par jour, 3 h par demi-journée.
//   2. Une absence pointée DANS UNE MATIÈRE sans période précise compte pour
//      1 h — pas pour la journée. Avant, un prof qui faisait l'appel de son
//      cours en laissant « Journée entière » (valeur par défaut) enregistrait
//      une journée complète pour une heure manquée.
//   3. Pas de double comptage dans une même journée : une journée entière
//      couvre tout ; une demi-journée couvre ses heures ; les heures isolées
//      s'ajoutent sans dépasser le total du jour.
//   4. Excusé ⇒ heures JUSTIFIÉES ; Absent ⇒ NON justifiées. Si la même
//      plage est pointée des deux façons, la justification l'emporte (c'est
//      la correction la plus tardive en pratique : le mot du parent arrive
//      après l'appel).
//   5. Un retard n'est jamais une heure d'absence : il est compté à part, une
//      fois par élève et par jour, qu'il vienne de l'appel ou du registre des
//      retards (Vie scolaire).
//   6. La séquence est déterminée par la date (dates d'enseignement des
//      périodes). Un pointage hors de toute séquence n'est pas perdu : il est
//      compté dans `unassigned`, pour que l'écart se voie.

export const DEFAULT_HOURS = { day: 6, morning: 3, afternoon: 3 };
const NOON = '12:00';

// Jour ISO (1 = lundi … 7 = dimanche) d'une date 'YYYY-MM-DD', sans fuseau.
export function isoWeekday(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const wd = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

// Heures de cours d'une classe pour un jour de la semaine, d'après l'emploi du
// temps. Renvoie DEFAULT_HOURS si la classe n'a aucun créneau ce jour-là.
export function dayShape(timetable, classId, weekday) {
  const slots = (timetable || [])
    .filter((s) => s.class_id === classId && Number(s.day_of_week) === weekday)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  if (!slots.length) return { ...DEFAULT_HOURS, slots: [] };
  const morning = slots.filter((s) => String(s.start_time).slice(0, 5) < NOON).length;
  return { day: slots.length, morning, afternoon: slots.length - morning, slots };
}

// Plages couvertes par un pointage, sous forme d'ensemble d'unités horaires
// numérotées 1..day. Les unités du matin viennent d'abord.
function unitsOf(rec, shape) {
  const all = Array.from({ length: shape.day }, (_, i) => i + 1);
  const session = rec.session || '';
  if (session === 'matin') return new Set(all.slice(0, shape.morning));
  if (session === 'apres-midi') return new Set(all.slice(shape.morning));
  const h = /^H(\d+)$/.exec(session);
  if (h) return new Set([Number(h[1])]);              // Heure n (peut dépasser shape.day : comptée quand même)
  if (!session && rec.subject_id) {
    // Règle 2 : appel d'une matière sans période → une heure, identifiée par
    // la matière (deux matières différentes = deux heures distinctes).
    const slot = shape.slots?.findIndex((s) => s.subject_id === rec.subject_id);
    return new Set([slot >= 0 ? slot + 1 : `subj:${rec.subject_id}`]);
  }
  return new Set(all);                                   // journée entière
}

// Heures d'une journée pour UN élève : { absJ, absNJ, late }.
export function dayTotals(recs, shape) {
  const excused = new Set(), absent = new Set();
  let late = false;
  for (const r of recs) {
    if (r.status === 'retard') { late = true; continue; }
    const target = r.status === 'excused' ? excused : r.status === 'absent' ? absent : null;
    if (!target) continue;
    for (const u of unitsOf(r, shape)) target.add(u);
  }
  for (const u of excused) absent.delete(u);              // règle 4
  return { absJ: excused.size, absNJ: absent.size, late };
}

// Séquence (sequence_order) d'une date, d'après les périodes de l'année.
export function sequenceForDate(date, periods, year = null) {
  const d = String(date).slice(0, 10);
  const p = (periods || []).find((x) =>
    x.type === 'sequence' && x.sequence_order != null
    && (!year || !x.school_year || x.school_year === year)
    && x.teaching_start && x.teaching_end
    && x.teaching_start.slice(0, 10) <= d && d <= x.teaching_end.slice(0, 10));
  return p ? p.sequence_order : null;
}

/**
 * Agrège l'appel d'une classe en heures par élève et par séquence.
 * @param {object[]} attendance   lignes `attendance` (une classe, une année)
 * @param {object}   opts
 * @param {object[]} opts.periods      academic_periods de l'année
 * @param {object[]} [opts.timetable]  timetable_slots
 * @param {object[]} [opts.lateArrivals] lignes `late_arrivals` (registre Vie scolaire)
 * @param {string}   [opts.year]
 * @returns {{ byStudent: Object<string, Object<number, {absJ, absNJ, lates, days}>>, unassigned: number }}
 */
export function aggregateAttendance(attendance, { periods, timetable = [], lateArrivals = [], year = null } = {}) {
  // Regroupement élève × jour.
  const days = new Map();
  const key = (s, d) => `${s}|${String(d).slice(0, 10)}`;
  for (const r of attendance || []) {
    if (!r?.student_id || !r.date) continue;
    const k = key(r.student_id, r.date);
    if (!days.has(k)) days.set(k, { studentId: r.student_id, classId: r.class_id, date: String(r.date).slice(0, 10), recs: [], late: false });
    days.get(k).recs.push(r);
  }
  // Règle 5 : le registre des retards rejoint l'appel, dédoublonné par jour.
  for (const l of lateArrivals || []) {
    if (!l?.student_id || !l.date) continue;
    const k = key(l.student_id, l.date);
    if (!days.has(k)) days.set(k, { studentId: l.student_id, classId: l.class_id, date: String(l.date).slice(0, 10), recs: [], late: false });
    days.get(k).late = true;
  }

  const byStudent = {};
  let unassigned = 0;
  for (const day of days.values()) {
    const seq = sequenceForDate(day.date, periods, year);
    const shape = dayShape(timetable, day.classId, isoWeekday(day.date));
    const t = dayTotals(day.recs, shape);
    const late = t.late || day.late;
    if (seq == null) { if (t.absJ || t.absNJ || late) unassigned++; continue; }
    const s = (byStudent[day.studentId] ??= {});
    const cell = (s[seq] ??= { absJ: 0, absNJ: 0, lates: 0, days: 0 });
    cell.absJ += t.absJ;
    cell.absNJ += t.absNJ;
    if (late) cell.lates++;
    if (t.absJ || t.absNJ) cell.days++;
  }
  return { byStudent, unassigned };
}

// Totaux par élève sur une plage quelconque (statistiques), sans découpage
// par séquence : mêmes règles d'heures et de dédoublonnage.
export function attendanceTotals(attendance, { timetable = [] } = {}) {
  const days = new Map();
  for (const r of attendance || []) {
    if (!r?.student_id || !r.date) continue;
    const k = `${r.student_id}|${String(r.date).slice(0, 10)}`;
    if (!days.has(k)) days.set(k, { studentId: r.student_id, classId: r.class_id, date: String(r.date).slice(0, 10), recs: [] });
    days.get(k).recs.push(r);
  }
  const out = {};
  for (const day of days.values()) {
    const t = dayTotals(day.recs, dayShape(timetable, day.classId, isoWeekday(day.date)));
    const c = (out[day.studentId] ??= { absJ: 0, absNJ: 0, lates: 0, days: 0 });
    c.absJ += t.absJ; c.absNJ += t.absNJ;
    if (t.late) c.lates++;
    if (t.absJ || t.absNJ) c.days++;
  }
  return out;
}

// Valeurs proposées pour une case du bulletin (élève × séquence).
export function attendanceAuto(agg, studentId, seq) {
  const c = agg?.byStudent?.[studentId]?.[seq];
  return c ? { absJAuto: c.absJ, absNJAuto: c.absNJ, latesAuto: c.lates } : { absJAuto: 0, absNJAuto: 0, latesAuto: 0 };
}

// Nombre d'ÉLÈVES distincts (pas de lignes) ayant un statut donné — un élève
// absent en H1 et H2 est UN absent du jour, pas deux.
export function distinctStudents(rows, predicate = () => true) {
  return new Set((rows || []).filter(predicate).map((r) => r.student_id)).size;
}

// Date locale 'YYYY-MM-DD'. `toISOString()` donne la date UTC : entre minuit et
// 1 h à Douala (UTC+1), l'appel du jour était enregistré à la date de la veille.
export function localISODate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
