// ════════════════════════════════════════════════════════════════════════════
// SERVICE DES PÉRIODES — l'UNIQUE endroit qui répond à « quelle période est
// ouverte, et quelle est sa date limite ? ».
// ════════════════════════════════════════════════════════════════════════════
// Avant : `currentPeriodOfTrack` (calendarTracks.js), `effectiveDeadline`, une
// échéance recalculée à la main dans TeacherMonitor et l'heuristique « dernière
// période saisie + 1 » répondaient chacun à leur façon, avec leur propre notion
// de « aujourd'hui » (fuseau de l'appareil) et sans notion de début de période.
// Désormais tout passe par ici, appuyé sur `periodStatus.js` (jour calendaire
// d'Africa/Douala, début déduit, limite posée par l'administration).
//
// Le garde `_periodServiceUnique.test.mjs` interdit de réintroduire
// `currentPeriodOfTrack` / `effectiveDeadline` dans un écran.
import { fenetresDePiste, jourDouala, joursEntre } from './periodStatus.js';
import { TRACKS } from './calendarTracks.js';

const jour = (today) => (typeof today === 'string' ? today : jourDouala(today ?? new Date()));

/** Échéance de saisie d'une ligne de calendrier (aucune date déduite d'ailleurs). */
export const echeanceDeLigne = (row) => (row ? (row.deadline_date || row.end_date || row.exam_date || null) : null);

/**
 * La période OUVERTE d'une piste au jour dit : la première dont la limite n'est
 * pas passée. Si toutes sont passées, la dernière (« fin d'année »).
 * Même forme que l'ancien `currentPeriodOfTrack`, plus `start` et `avenir`.
 * @returns null si aucune date n'est renseignée sur la piste.
 */
export function periodeCourante(trackKey, datesByKey, today = new Date(), opts = {}) {
  const track = TRACKS[trackKey];
  const t = jour(today);
  if (!track || !t) return null;
  const rows = fenetresDePiste(trackKey, datesByKey, opts).filter((w) => w.datee && w.deadline);
  if (!rows.length) return null;
  const open = rows.find((w) => w.deadline >= t);
  const w = open || rows[rows.length - 1];
  const daysLeft = joursEntre(t, w.deadline);
  return {
    trackKey, order: w.order, key: w.key, period: w.period,
    dates: datesByKey?.[w.key] || null,
    start: w.start, end: w.end, deadline: w.deadline,
    daysLeft, overdue: daysLeft < 0, atRisk: daysLeft >= 0 && daysLeft <= 3,
    avenir: !!(w.start && t < w.start),
    last: !open,
  };
}

/** Échéance d'UNE période donnée (celle qu'inspecte l'utilisateur). */
export function echeanceDePeriode(trackKey, datesByKey, order, today = new Date(), opts = {}) {
  const t = jour(today);
  const w = fenetresDePiste(trackKey, datesByKey, opts).find((x) => x.order === Number(order));
  if (!w || !w.deadline) return { date: null, daysLeft: null, overdue: false, atRisk: false, avenir: false };
  const daysLeft = joursEntre(t, w.deadline);
  return {
    date: w.deadline, daysLeft, overdue: daysLeft < 0,
    atRisk: daysLeft >= 0 && daysLeft <= 3, avenir: !!(w.start && t < w.start),
  };
}

/** Périodes dont la limite est dépassée (alertes de retard cumulé). */
export function periodesDepassees(trackKey, datesByKey, today = new Date(), opts = {}) {
  const t = jour(today);
  return fenetresDePiste(trackKey, datesByKey, opts).filter((w) => w.deadline && w.deadline < t).map((w) => w.period);
}
