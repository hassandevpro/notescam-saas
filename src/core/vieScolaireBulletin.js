// VIE SCOLAIRE → BULLETIN, PAR SÉQUENCE — logique pure.
//
// LE DÉFAUT QUE CECI CORRIGE (Genius, 2026-11-18). Le surveillant général saisit
// sanctions, avertissements, blâmes, exclusions, retenues et incidents dans la
// Vie scolaire ; le bulletin, lui, n'imprimait que les cases tapées à la main au
// conseil de classe (`__aver_conduite__`, `__blame_conduite__`…). Rien ne reliait
// les deux : le registre restait invisible sur le bulletin.
//
// RÈGLES (décidées par le responsable, 2026-11-18) :
//   1. La séquence d'un fait se déduit de SA DATE, jamais du champ « Séquence »
//      choisi à la saisie (qui vaut par défaut la séquence ACTIVE le jour de la
//      saisie : une sanction du 10/10 saisie le 20/11 tombait en S2). Mêmes bornes
//      que l'appel (attendanceEngine) : dates d'enseignement réglées par l'admin,
//      à défaut le calendrier par défaut du secondaire ; un fait hors de toute
//      fenêtre rejoint la séquence la plus proche au lieu de disparaître.
//   2. Une valeur SAISIE au conseil pour une séquence — même 0 — l'emporte sur le
//      registre (surcouche de LECTURE, rien n'est écrit).
//   3. Trimestre = somme des séquences du trimestre, annuel = somme de l'année
//      (cf. cumulDiscipline).
//   4. Une sanction sans catégorie compte en CONDUITE (toutes les sanctions
//      saisies avant l'ajout de la catégorie).

import { sequenceForDate, sequenceLaPlusProche, calendrierSequencesParDefaut } from './attendanceEngine.js';

// Périodes servant au rattachement : celles de l'école si au moins une séquence
// de l'année a des dates, sinon le calendrier par défaut. `parDefaut` dit lequel.
export function periodesDeRattachement(periods, year) {
  const datees = (periods || []).some((x) => x.type === 'sequence' && x.sequence_order != null
    && x.teaching_start && x.teaching_end && (!year || !x.school_year || x.school_year === year));
  return datees ? { periods, parDefaut: false } : { periods: calendrierSequencesParDefaut(year), parDefaut: true };
}

export function sequenceDuFait(date, periods, year) {
  if (!date) return null;
  return sequenceForDate(date, periods, year) ?? sequenceLaPlusProche(date, periods, year);
}

// Jours d'une exclusion temporaire : durée saisie, sinon bornes (incluses), sinon 1.
export function joursExclusion(a) {
  const n = parseInt(a?.duration_days, 10);
  if (n > 0) return n;
  if (a?.start_date && a?.end_date) {
    const d = (Date.parse(String(a.end_date).slice(0, 10)) - Date.parse(String(a.start_date).slice(0, 10))) / 86400000;
    if (Number.isFinite(d) && d >= 0) return Math.round(d) + 1;
  }
  return 1;
}

const CELLULE = () => ({
  averTravail: 0, blameTravail: 0, averConduite: 0, blameConduite: 0,
  exclusions: 0, exclDef: 0, retenues: 0, tis: 0, incidents: 0,
});

/**
 * Agrège le registre de vie scolaire d'une classe par élève et par séquence.
 * @param {object} src  { actions, warnings, detentions, incidents } (lignes brutes)
 * @param {object} opts { periods, year, classId? }
 * @returns {{ byStudent: Object<string, Object<number, ReturnType<CELLULE>>>, parDefaut: boolean }}
 */
export function agregerVieScolaire({ actions = [], warnings = [], detentions = [], incidents = [] } = {}, { periods, year = null, classId = null } = {}) {
  const { periods: P, parDefaut } = periodesDeRattachement(periods, year);
  const byStudent = {};
  const cell = (row) => {
    if (!row?.student_id) return null;
    if (classId && row.class_id && row.class_id !== classId) return null;
    const seq = sequenceDuFait(row.date, P, year);
    if (seq == null) return null;
    const s = (byStudent[row.student_id] ??= {});
    return (s[seq] ??= CELLULE());
  };
  for (const a of actions) {
    const c = cell(a); if (!c) continue;
    const travail = a.category === 'travail';
    switch (a.action_type) {
      case 'avertissement_oral':
      case 'avertissement_ecrit': travail ? c.averTravail++ : c.averConduite++; break;
      case 'blame':               travail ? c.blameTravail++ : c.blameConduite++; break;
      case 'exclusion_temporaire': c.exclusions += joursExclusion(a); break;
      case 'exclusion_definitive': c.exclDef++; break;
      case 'retenue':             c.retenues++; break;
      case 'travail_interet':     c.tis++; break;
      default: break;
    }
  }
  // Tables sans écran de saisie aujourd'hui, lues pour ne rien perdre si une école en a.
  for (const w of warnings) { const c = cell(w); if (c) (w.category === 'travail' ? c.averTravail++ : c.averConduite++); }
  for (const d of detentions) { const c = cell(d); if (c) c.retenues++; }
  for (const i of incidents) { const c = cell(i); if (c) c.incidents++; }
  return { byStudent, parDefaut };
}

// Clés du bulletin alimentées par le registre. Les cinq premières existent déjà
// (saisie du conseil) ; les autres n'ont pas de saisie manuelle.
export const CLES_VIE_SCOLAIRE = {
  averTravail: '__aver_travail__', blameTravail: '__blame_travail__',
  averConduite: '__aver_conduite__', blameConduite: '__blame_conduite__',
  exclusions: '__exclusions__', exclDef: '__excl_def__',
  retenues: '__retenues__', tis: '__tis__', incidents: '__incidents__',
};

const vide = (v) => v === undefined || v === null || v === '';

/**
 * Surcouche de lecture : complète le gradeMap avec le registre (vie scolaire) et les
 * retards de l'appel, case par case, sans jamais remplacer une valeur saisie (règle 2).
 * @param {object} gradeMap  `${classId}_${studentId}_${seq}` → { clé: valeur }
 * @param {object} vs        sortie d'agregerVieScolaire
 * @param {object} att       sortie d'aggregateAttendance (pour les retards), facultatif
 */
export function surcoucheVieScolaire(gradeMap, classId, vs, att = null) {
  const out = { ...gradeMap };
  const poser = (studentId, seq, cle, n) => {
    if (!n) return;
    const key = `${classId}_${studentId}_${seq}`;
    const cur = out[key] || {};
    if (!vide(cur[cle])) return;
    out[key] = { ...cur, [cle]: String(n) };
  };
  for (const [studentId, seqs] of Object.entries(vs?.byStudent || {})) {
    for (const [seq, c] of Object.entries(seqs)) {
      for (const [champ, cle] of Object.entries(CLES_VIE_SCOLAIRE)) poser(studentId, seq, cle, c[champ]);
    }
  }
  for (const [studentId, seqs] of Object.entries(att?.byStudent || {})) {
    for (const [seq, c] of Object.entries(seqs)) poser(studentId, seq, '__retards__', c.lates);
  }
  return out;
}

// ── AFFICHAGE ───────────────────────────────────────────────────────────────
// Une SEULE ligne « Retards / Retenues / Incidents » dans les tableaux officiels : la
// colonne Discipline garde ainsi la hauteur de sa voisine « Travail » (5 lignes) et le
// bulletin une page ne s'allonge pas.
export const LIBELLE_RRI = { FR: 'Retards / Retenues / Incidents', EN: 'Lates / Detentions / Incidents' };
export function libelleRRI(sys) { return sys === 'EN' ? LIBELLE_RRI.EN : LIBELLE_RRI.FR; }
export function valeurRRI(d) {
  const r = d?.retards || 0, t = d?.retenues || 0, i = d?.incidents || 0;
  return r || t || i ? `${r} / ${t} / ${i}` : '';
}

const LIB = {
  FR: { averTravail: 'Avert. travail', blameTravail: 'Blâme travail', averConduite: 'Avert. conduite', blameConduite: 'Blâme conduite',
    exclusions: 'Exclusion', jours: 'j', exclDef: 'Exclusion définitive', retenues: 'Retenues', tis: "Trav. d'intérêt scol.", incidents: 'Incidents', retards: 'Retards' },
  EN: { averTravail: 'Warning (work)', blameTravail: 'Reprimand (work)', averConduite: 'Warning (conduct)', blameConduite: 'Reprimand (conduct)',
    exclusions: 'Suspension', jours: 'd', exclDef: 'Permanent exclusion', retenues: 'Detentions', tis: 'Community service', incidents: 'Incidents', retards: 'Lates' },
};

/**
 * Éléments non nuls, prêts à imprimer : « Blâme conduite 2 (S1 : 1, S2 : 1) ». Le détail
 * par séquence n'est donné que si la période en couvre plusieurs ET qu'elles diffèrent
 * de zéro des deux côtés — sinon il n'apprend rien et prend de la place.
 */
export function resumeVieScolaire(d, sys = 'FR', { detail = true } = {}) {
  const T = sys === 'EN' ? LIB.EN : LIB.FR;
  const seqs = Object.keys(d?.parSeq || {});
  const out = [];
  for (const k of ['averTravail', 'blameTravail', 'averConduite', 'blameConduite', 'exclusions', 'exclDef', 'retenues', 'tis', 'retards', 'incidents']) {
    const v = d?.[k] || 0;
    if (!v) continue;
    let txt = k === 'exclDef' ? T.exclDef : `${T[k]} ${v}${k === 'exclusions' ? ` ${T.jours}` : ''}`;
    if (detail && seqs.length > 1) {
      const parts = seqs.filter((s) => d.parSeq[s]?.[k]).map((s) => `S${s} : ${d.parSeq[s][k]}`);
      if (parts.length > 1) txt += ` (${parts.join(', ')})`;
    }
    out.push(txt);
  }
  return out;
}

/**
 * Cumul sur les séquences d'une période (séquence, trimestre, année) — SOMME, et le
 * détail par séquence pour l'affichage trimestriel.
 */
export function cumulVieScolaire(gradeMap, classId, studentId, seqs) {
  const n = (v) => parseInt(v || '0', 10) || 0;
  const champs = { ...CLES_VIE_SCOLAIRE, retards: '__retards__' };
  const total = Object.fromEntries(Object.keys(champs).map((k) => [k, 0]));
  const parSeq = {};
  for (const seq of seqs || []) {
    const s = gradeMap?.[`${classId}_${studentId}_${seq}`] || {};
    const c = {};
    for (const [k, cle] of Object.entries(champs)) { c[k] = n(s[cle]); total[k] += c[k]; }
    parSeq[seq] = c;
  }
  return { ...total, parSeq };
}
