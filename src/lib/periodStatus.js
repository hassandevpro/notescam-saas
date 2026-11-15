// ÉTAT DES PÉRIODES DE SAISIE — logique PURE (ni React, ni store, ni réseau).
//
// Pourquoi ce module. `currentPeriodOfTrack` (calendarTracks.js) tenait pour
// « ouverte » la PREMIÈRE période dont l'échéance n'était pas passée, sans jamais
// savoir si elle avait COMMENCÉ — `sequence_dates` n'a pas de date de début. Une
// séquence 2 non commencée devenait « à saisir » dès que la limite de la séquence
// 1 était dépassée (ou que la 1 était complète, via le repli « dernière période
// saisie + 1 »). Et `effectiveDeadline` prenait la DATE D'EXAMEN pour limite de
// saisie quand celle-ci manquait : d'où des « échéances dépassées de 36 j » dont
// personne ne connaissait l'origine.
//
// RÈGLES ICI
//   fin        = end_date, sinon exam_date, sinon deadline_date   (la fin d'enseignement)
//   limite     = deadline_date, sinon fin + jours de grâce        (jamais l'examen « en silence »)
//   début      = start_date, sinon LENDEMAIN de la fin de la période précédente (déduit)
//   états      : à venir (avant le début) · en cours / à jour (entre début et limite) ·
//                en retard (limite dépassée, saisie incomplète) · clôturée (limite dépassée, complète)
//   Une période PASSÉE incomplète reste « en retard » même quand la suivante démarre.
//   Dates en 'YYYY-MM-DD', jour calendaire d'Africa/Douala (UTC+1, sans heure d'été) :
//   début inclus à 00h00, fin incluse à 23h59 (on compare des JOURS, pas des instants).
import { TRACKS } from './calendarTracks.js';

export const TZ = 'Africa/Douala';

/** Jour calendaire d'Africa/Douala ('YYYY-MM-DD') d'un instant donné. */
export function jourDouala(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
}

const utc = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const joursEntre = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export function ajouterJours(s, n) {
  const d = new Date(utc(s) + n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
const iso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/**
 * Fenêtres de toutes les périodes d'une piste, dans l'ordre.
 * @returns [{ key, order, period, start, startDeduit, end, deadline, datee }]
 *          `datee` = la période porte au moins une date exploitable.
 */
export function fenetresDePiste(trackKey, datesByKey, { graceDays = 0 } = {}) {
  const track = TRACKS[trackKey];
  if (!track) return [];
  let finPrecedente = null;
  return track.periods.map((p) => {
    const d = datesByKey?.[p.key] || {};
    const end = iso(d.end_date) || iso(d.exam_date) || iso(d.deadline_date);
    const deadline = iso(d.deadline_date) || (end ? ajouterJours(end, graceDays) : null);
    const explicite = iso(d.start_date);
    const start = explicite || (finPrecedente ? ajouterJours(finPrecedente, 1) : null);
    if (end) finPrecedente = end;
    return { key: p.key, order: p.order, period: p, start, startDeduit: !explicite && !!start, end, deadline, datee: !!(end || deadline) };
  });
}

/**
 * État d'UNE période.
 * @param progres { expected, entered } — `expected` null/0 : saisie non évaluable
 * @returns 'sans_date' | 'a_venir' | 'a_jour' | 'en_cours' | 'en_retard' | 'cloturee' | 'inconnu'
 */
export function etatPeriode(fenetre, today, progres) {
  if (!fenetre?.datee || !fenetre.deadline) return 'sans_date';
  const t = typeof today === 'string' ? today : jourDouala(today);
  if (fenetre.start && t < fenetre.start) return 'a_venir';
  if (!progres || !progres.expected) return 'inconnu';
  const complete = progres.entered >= progres.expected;
  if (t <= fenetre.deadline) return complete ? 'a_jour' : 'en_cours';
  return complete ? 'cloturee' : 'en_retard';
}

/**
 * Cartes « Notes à compléter » d'UNE classe : toutes ses périodes en retard (même
 * passées), la période en cours / à jour, et la prochaine période à venir.
 * `progress(order)` renvoie { expected, entered } et n'est appelé que pour les
 * périodes commencées.
 */
export function suiviDeClasse(trackKey, datesByKey, today, progress, opts = {}) {
  const t = typeof today === 'string' ? today : jourDouala(today);
  const out = { retards: [], courante: null, avenir: null, sansDate: true };
  for (const f of fenetresDePiste(trackKey, datesByKey, opts)) {
    if (!f.datee) continue;
    out.sansDate = false;
    const etat = etatPeriode(f, t, f.start && t < f.start ? null : progress(f.order));
    if (etat === 'a_venir') { if (!out.avenir) out.avenir = { fenetre: f, etat }; continue; }
    if (etat === 'inconnu' || etat === 'sans_date' || etat === 'cloturee') continue;
    const p = progress(f.order);
    const item = {
      fenetre: f, etat, order: f.order, entered: p.entered, expected: p.expected,
      joursRetard: etat === 'en_retard' ? joursEntre(f.deadline, t) : 0,
      joursRestants: etat !== 'en_retard' ? joursEntre(t, f.deadline) : null,
    };
    if (etat === 'en_retard') out.retards.push(item); else out.courante = item;   // en_cours | a_jour
  }
  return out;
}
