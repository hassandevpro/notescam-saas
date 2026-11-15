// ════════════════════════════════════════════════════════════════════════════
// ASSISTANT DU CALENDRIER SCOLAIRE — fonctions pures (aucune E/S, testées).
// Elles préparent des PROPOSITIONS ; rien n'est enregistré sans confirmation.
// ════════════════════════════════════════════════════════════════════════════
import { TRACKS } from './calendarTracks.js';
import { fenetresDePiste, ajouterJours, joursEntre } from './periodStatus.js';

const CHAMPS = ['start_date', 'end_date', 'exam_date', 'deadline_date', 'conseil_date'];
const iso = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/**
 * Anomalies d'une piste, dans l'ordre des périodes.
 *  - inverse        : début après fin
 *  - limite_avant_fin : limite de saisie antérieure à la fin de la période
 *  - chevauchement  : le début EXPLICITE d'une période tombe avant la fin de la précédente
 *  - trou           : jours sans période entre la fin de l'une et le début EXPLICITE de la suivante
 *  - hors_ordre     : une période finit avant la fin de la précédente
 */
export function diagnostiquer(trackKey, datesByKey, opts = {}) {
  const issues = [];
  const track = TRACKS[trackKey];
  if (!track) return issues;
  const fen = fenetresDePiste(trackKey, datesByKey, opts);
  let prev = null;
  for (const w of fen) {
    const d = datesByKey?.[w.key] || {};
    const debutExplicite = iso(d.start_date);
    if (debutExplicite && w.end && debutExplicite > w.end) issues.push({ type: 'inverse', key: w.key, order: w.order });
    if (w.end && iso(d.deadline_date) && iso(d.deadline_date) < w.end) {
      issues.push({ type: 'limite_avant_fin', key: w.key, order: w.order, jours: joursEntre(iso(d.deadline_date), w.end) });
    }
    if (prev && w.end && prev.end) {
      if (w.end < prev.end) issues.push({ type: 'hors_ordre', key: w.key, order: w.order, avec: prev.order });
      if (debutExplicite) {
        const ecart = joursEntre(prev.end, debutExplicite) - 1;     // jours libres entre les deux
        if (ecart > 0) issues.push({ type: 'trou', key: w.key, order: w.order, avec: prev.order, jours: ecart });
        if (ecart < 0) issues.push({ type: 'chevauchement', key: w.key, order: w.order, avec: prev.order, jours: -ecart });
      }
    }
    if (w.end) prev = w;
  }
  return issues;
}

/** Décale toutes les dates de `jours` jours (copie d'une année sur l'autre). */
export function decaler(datesByKey, jours) {
  const out = {};
  for (const [key, row] of Object.entries(datesByKey || {})) {
    const r = { ...row };
    for (const c of CHAMPS) if (iso(r[c])) r[c] = ajouterJours(iso(r[c]), jours);
    out[key] = r;
  }
  return out;
}

/** Même calendrier, un an plus tard : +364 jours garde le même jour de la semaine. */
export const anneeSuivante = (datesByKey) => decaler(datesByKey, 364);

/**
 * Proposition de découpage régulier d'une piste entre deux dates (début et fin d'année).
 * Chaque période reçoit début et fin ; les autres champs restent vides. Une PROPOSITION :
 * l'administrateur ajuste (les UA du primaire suivent souvent les mois, pas des durées égales).
 */
export function repartir(trackKey, debutAnnee, finAnnee) {
  const track = TRACKS[trackKey];
  const a = iso(debutAnnee); const b = iso(finAnnee);
  if (!track || !a || !b || b < a) return {};
  const n = track.periods.length;
  const total = joursEntre(a, b) + 1;
  const out = {};
  let debut = a;
  track.periods.forEach((p, i) => {
    const fin = i === n - 1 ? b : ajouterJours(a, Math.round(((i + 1) * total) / n) - 1);
    out[p.key] = { start_date: debut, end_date: fin };
    debut = ajouterJours(fin, 1);
  });
  return out;
}

/**
 * Effet d'un changement de calendrier : pour chaque période dont la fenêtre ou la limite
 * bouge, avant → après. Sert à l'aperçu « ce changement déplace X périodes » avant confirmation.
 */
export function impact(trackKey, avant, apres, opts = {}) {
  const f0 = fenetresDePiste(trackKey, avant, opts);
  const f1 = fenetresDePiste(trackKey, apres, opts);
  const out = [];
  f1.forEach((w, i) => {
    const o = f0[i];
    if (o.start !== w.start || o.end !== w.end || o.deadline !== w.deadline) {
      out.push({ key: w.key, order: w.order, avant: { start: o.start, end: o.end, deadline: o.deadline }, apres: { start: w.start, end: w.end, deadline: w.deadline } });
    }
  });
  return out;
}

/** Les lignes qui changent entre deux états de formulaire (pour le journal d'audit). */
export function lignesModifiees(avant, apres) {
  const cles = new Set([...Object.keys(avant || {}), ...Object.keys(apres || {})]);
  const out = [];
  for (const k of cles) {
    const a = avant?.[k] || {}; const b = apres?.[k] || {};
    const diffs = CHAMPS.filter((c) => (iso(a[c]) || '') !== (iso(b[c]) || ''));
    if (diffs.length) out.push({ key: k, champs: diffs.map((c) => ({ champ: c, avant: iso(a[c]) || '', apres: iso(b[c]) || '' })) });
  }
  return out;
}
