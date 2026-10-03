// Périodes de BULLETIN du secondaire APC (premier cycle MINESEC) — logique pure
// (ni React, ni store, ni réseau), testable en Node.
//
// ── RÈGLE MÉTIER, DÉFINITIVE ─────────────────────────────────────────────────
//   • une SÉQUENCE est une unité de SAISIE des évaluations ;
//   • un TRIMESTRE est l'unité de BULLETIN ;
//   • l'ANNUEL est la SYNTHÈSE de T1 + T2 + T3.
//
// Il n'existe donc AUCUN bulletin de séquence. Ce n'est pas une préférence
// d'affichage : le référentiel MINESEC définit les compétences PAR TRIMESTRE
// (apc_competences.trimestre_id), héritées par les séquences de ce trimestre.
// Un « bulletin de séquence » n'exposait qu'une fraction arbitraire des
// compétences trimestrielles — un document officiellement faux.
//
// L'annuel n'est pas une quatrième période de saisie : son `trimestreId` est
// null, aucune note ne s'y écrit, et il se recalcule depuis les trois
// trimestres (cf. assembleApcAnnual).
//
// ── SOURCE UNIQUE ────────────────────────────────────────────────────────────
// Bulletins, rapports de classe et procès-verbaux puisent ICI leur rythme, pour
// qu'aucune surface ne puisse en redériver un autre. Avant ce module, six
// endroits rejouaient chacun leur version du découpage — et divergeaient.
//
// ── RATTACHEMENT SÉQUENCE → TRIMESTRE ────────────────────────────────────────
// Toujours lu du RÉFÉRENTIEL (`apc_sequences.trimestre_id`), jamais calculé.
// Aucune arithmétique du type « séquence impaire ⇒ première du trimestre » : le
// nombre de séquences par trimestre n'est pas imposé, deux trimestres peuvent en
// compter un nombre différent. `TRIM_TO_SEQ` / `SEQ_TO_TRIM` ne servent plus que
// de repli lorsque le référentiel n'est pas (encore) chargé — l'écran affiche
// alors un rythme par défaut au lieu de rien.

import { SEQ_TO_TRIM, sequencesOfTrimestre } from './apcEngine.js';

// Les trois trimestres du référentiel MINESEC — il n'y en a jamais d'autre.
// `apc_trimestres` ne contient que ces trois lignes et `apc_competences
// .trimestre_id` y est contraint par clé étrangère : un « T4 » serait refusé par
// la base avant d'atteindre le moteur.
export const APC_TRIMESTRE_IDS = ['t1', 't2', 't3'];

// Les clés de période de bulletin, et elles seules. Aucune ne commence par
// « seq » : c'est l'invariant que verrouille `_apcPeriods.test.mjs`.
export const APC_BULLETIN_PERIOD_VALUES = ['term_1', 'term_2', 'term_3', 'annuel'];

// Libellés fournis comme DONNÉES (le module reste pur — aucune dépendance i18n).
// L'anglais suit le document officiel (« FIRST TERM REPORT CARD »), d'où « Term »
// et non « Quarter » comme dans le rythme classique à six séquences.
export const APC_PERIOD_LABELS = {
  term_1: { fr: 'Trimestre 1', en: 'Term 1', es: 'Trimestre 1', short: 'T1' },
  term_2: { fr: 'Trimestre 2', en: 'Term 2', es: 'Trimestre 2', short: 'T2' },
  term_3: { fr: 'Trimestre 3', en: 'Term 3', es: 'Trimestre 3', short: 'T3' },
  annuel: { fr: 'Annuel',      en: 'Annual', es: 'Anual',       short: 'Ann.' },
};

// Squelette des périodes : trois trimestres + l'annuel dérivé.
// `kind` est le discriminant à tester dans l'UI — jamais le cardinal de `seqs`,
// qui varie avec le référentiel et ne dit rien de la nature de la période.
const APC_PERIOD_SHAPE = [
  { value: 'term_1', kind: 'trimestre', trimestreId: 't1' },
  { value: 'term_2', kind: 'trimestre', trimestreId: 't2' },
  { value: 'term_3', kind: 'trimestre', trimestreId: 't3' },
  { value: 'annuel', kind: 'annuel',    trimestreId: null },
];

// Période annuelle ? On teste la NATURE, pas le nombre de séquences couvertes.
export const isApcAnnualPeriod = (p) => p?.kind === 'annuel' || p?.value === 'annuel';

// Période trimestrielle (porte un trimestre unique et des notes à agréger).
export const isApcTrimestrePeriod = (p) => p?.kind === 'trimestre' && !!p?.trimestreId;

// Clé reconnue comme période de bulletin APC.
export const isApcBulletinPeriodValue = (v) => APC_BULLETIN_PERIOD_VALUES.includes(v);

// Le trimestre d'une clé de période ('term_2' → 't2'), null pour l'annuel.
export const apcTrimestreOfPeriodValue = (v) =>
  APC_PERIOD_SHAPE.find((p) => p.value === v)?.trimestreId ?? null;

// ── Rattachement explicite, lu du référentiel ────────────────────────────────

// Les lignes `apc_sequences` rattachées à un trimestre, triées par numéro.
// Délègue à `sequencesOfTrimestre` (moteur APC), qui lit la table fournie et ne
// retombe sur la constante que si elle est vide.
export const apcSequencesOfTrimestre = (referentiel, trimestreId) =>
  trimestreId ? sequencesOfTrimestre(referentiel?.sequences, trimestreId) : [];

// Identifiants de séquence ('s1', 's2'…) d'un trimestre — TOUTES celles qui lui
// sont rattachées, quel que soit leur nombre.
export const apcSeqIdsForTrimestre = (referentiel, trimestreId) =>
  apcSequencesOfTrimestre(referentiel, trimestreId).map((s) => s.id).filter(Boolean);

// Numéros de séquence d'un trimestre (1, 2, 3…). Sert aux surfaces qui raisonnent
// encore en numéros globaux (`grades.sequence`, rapports de classe).
export const apcSeqNumsForTrimestre = (referentiel, trimestreId) =>
  apcSequencesOfTrimestre(referentiel, trimestreId)
    .map((s) => Number(s.numero))
    .filter((n) => Number.isFinite(n));

// Trimestre d'un NUMÉRO de séquence, par rattachement explicite (`trimestre_id`
// de la ligne), repli sur la constante si le référentiel n'est pas chargé.
// Aucune parité, aucun `Math.ceil(n / 2)`.
export function apcTrimestreOfSeqNum(referentiel, num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  const row = (referentiel?.sequences || []).find((s) => Number(s.numero) === n);
  if (row) return row.trimestre_id || null;
  return SEQ_TO_TRIM[n] || null;
}

// Identifiant de séquence d'un NUMÉRO global, par rattachement explicite.
export function apcSeqIdOfSeqNum(referentiel, num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  const row = (referentiel?.sequences || []).find((s) => Number(s.numero) === n);
  if (row) return row.id || null;
  const tid = SEQ_TO_TRIM[n];
  return tid ? (apcSequencesOfTrimestre(referentiel, tid).find((s) => Number(s.numero) === n)?.id ?? null) : null;
}

// ── Les quatre périodes de bulletin, séquences résolues ──────────────────────
// Renvoie [{ value, kind, trimestreId, trimestreIds, seqs, seqIds, short, fr, en, es }].
//
// `seqs` (numéros) et `seqIds` restent exposés parce que des composants partagés
// avec le rythme classique les lisent encore (absences, conseil de classe,
// rapports). Ils sont DÉRIVÉS du rattachement, jamais posés en dur : un
// trimestre à trois séquences en porte trois.
//
// `trimestreIds` vaut [tid] pour un trimestre et les trois pour l'annuel — c'est
// ce que lisent les surfaces qui doivent assembler plusieurs trimestres.
export function apcBulletinPeriods(referentiel) {
  const seqsByTrim = {};
  const idsByTrim  = {};
  for (const tid of APC_TRIMESTRE_IDS) {
    seqsByTrim[tid] = apcSeqNumsForTrimestre(referentiel, tid);
    idsByTrim[tid]  = apcSeqIdsForTrimestre(referentiel, tid);
  }
  return APC_PERIOD_SHAPE.map((p) => {
    const trimestreIds = p.trimestreId ? [p.trimestreId] : [...APC_TRIMESTRE_IDS];
    return {
      ...p,
      trimestreIds,
      seqs:   trimestreIds.flatMap((tid) => seqsByTrim[tid] || []),
      seqIds: trimestreIds.flatMap((tid) => idsByTrim[tid] || []),
      ...APC_PERIOD_LABELS[p.value],
    };
  });
}

// Libellé d'une période selon le SYSTÈME de la classe ('FR' | 'EN' | 'ES'),
// comme le reste des documents officiels — pas selon la langue de l'interface.
export const apcPeriodLabel = (period, sys = 'FR') => {
  const l = APC_PERIOD_LABELS[period?.value];
  if (!l) return '';
  return sys === 'EN' ? l.en : sys === 'ES' ? l.es : l.fr;
};

// La période de bulletin correspondant à une clé persistée, avec repli sur le
// premier trimestre. Une clé historique « seq_3 » (bulletin de séquence, supprimé)
// retombe ainsi sur T1 au lieu de laisser l'écran sans période.
export function resolveApcPeriod(periods, periodKey) {
  const list = periods && periods.length ? periods : apcBulletinPeriods(null);
  return list.find((p) => p.value === periodKey) || list[0];
}
