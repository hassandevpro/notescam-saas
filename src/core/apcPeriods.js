// Périodes de BULLETIN du secondaire APC (premier cycle MINESEC) — logique pure
// (ni React, ni store, ni réseau), testable en Node.
//
// ── RÈGLE MÉTIER ─────────────────────────────────────────────────────────────
//   • un TRIMESTRE est l'unité de BULLETIN de référence ;
//   • l'ANNUEL est la SYNTHÈSE de T1 + T2 + T3 ;
//   • une SÉQUENCE est d'abord l'unité de SAISIE des évaluations, et peut AUSSI
//     être tirée en bulletin — c'est la pratique des établissements.
//
// ── LE BULLETIN DE SÉQUENCE, ET CE QU'IL NE DIT PAS ──────────────────────────
// Le référentiel MINESEC définit les compétences PAR TRIMESTRE
// (`apc_competences.trimestre_id`), héritées par les séquences de ce trimestre.
// Une séquence n'en couvre donc qu'une PARTIE, et le bulletin de séquence ne
// liste QUE les compétences réellement évaluées dans cette séquence : il ne
// signale pas celles du trimestre qui restent à évaluer.
//
// C'est un choix produit assumé (demandé le 2026-10-06), pas un oubli. Le
// document trimestriel reste la seule vue complète du référentiel, et la
// moyenne d'une séquence ne porte que sur l'évalué — `matiereAverage` ignore
// les compétences sans note, jamais comptées 0.
//
// Les périodes de séquence ne sont servies qu'À LA DEMANDE
// (`apcBulletinPeriods(ref, { withSequences: true })`), afin que les surfaces
// trimestrielles par nature — rapports de classe, procès-verbaux de conseil —
// gardent exactement le rythme qu'elles avaient.
//
// L'annuel n'est pas une période de saisie : son `trimestreId` est null, aucune
// note ne s'y écrit, et il se recalcule depuis les trois trimestres (cf.
// assembleApcAnnual).
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

// Les clés de période FIXES : les trois trimestres et l'annuel. Les périodes de
// séquence n'y figurent pas — leur nombre est lu du référentiel, elles sont donc
// DÉRIVÉES (cf. `apcBulletinPeriods(ref, { withSequences: true })`).
export const APC_BULLETIN_PERIOD_VALUES = ['term_1', 'term_2', 'term_3', 'annuel'];

// ── Clés de période de SÉQUENCE ──────────────────────────────────────────────
// Forme 'seq_<numéro global>' ('seq_3'). Le numéro, et non l'identifiant de
// ligne, parce que c'est lui que l'utilisateur voit et que persiste `uiStore`.

export const apcSequencePeriodValue = (num) => `seq_${num}`;

// Le numéro porté par une clé 'seq_N', null si ce n'en est pas une.
export const apcSeqNumOfPeriodValue = (v) => {
  const m = /^seq_(\d+)$/.exec(String(v ?? ''));
  return m ? Number(m[1]) : null;
};

export const isApcSequencePeriodValue = (v) => apcSeqNumOfPeriodValue(v) !== null;

// Libellés d'une séquence — fournis comme DONNÉES, comme ceux des trimestres,
// pour que le module reste pur. L'anglais suit le document officiel.
export const apcSequenceLabels = (num) => ({
  fr: `Séquence ${num}`, en: `Sequence ${num}`, es: `Secuencia ${num}`, short: `S${num}`,
});

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

// Période de séquence : UNE séquence du trimestre qu'elle porte. On teste la
// NATURE, jamais `seqs.length === 1` — un trimestre peut n'avoir qu'une séquence.
export const isApcSequencePeriod = (p) => p?.kind === 'sequence';

// Clé reconnue comme période de bulletin APC — fixe ou de séquence.
export const isApcBulletinPeriodValue = (v) =>
  APC_BULLETIN_PERIOD_VALUES.includes(v) || isApcSequencePeriodValue(v);

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

// ── Les périodes de bulletin, séquences résolues ─────────────────────────────
// Renvoie [{ value, kind, trimestreId, trimestreIds, seqs, seqIds, short, fr, en, es }].
//
// `seqs` (numéros) et `seqIds` restent exposés parce que des composants partagés
// avec le rythme classique les lisent encore (absences, conseil de classe,
// rapports). Ils sont DÉRIVÉS du rattachement, jamais posés en dur : un
// trimestre à trois séquences en porte trois.
//
// `trimestreIds` vaut [tid] pour un trimestre et les trois pour l'annuel — c'est
// ce que lisent les surfaces qui doivent assembler plusieurs trimestres.
// `withSequences` insère, AVANT chaque trimestre, ses propres séquences — l'ordre
// dans lequel le travail se fait : S1, S2, T1, S3, S4, T2, S5, S6, T3, Annuel.
// Par défaut elles ne sont PAS servies : les surfaces trimestrielles par nature
// (rapports de classe, procès-verbaux) appellent sans option et ne voient rien
// changer.
export function apcBulletinPeriods(referentiel, { withSequences = false } = {}) {
  // Les LIGNES de séquence par trimestre, source unique de `seqs` et `seqIds` :
  // on ne fait jamais correspondre deux tableaux par leur index.
  const rowsByTrim = {};
  for (const tid of APC_TRIMESTRE_IDS) rowsByTrim[tid] = apcSequencesOfTrimestre(referentiel, tid);

  // Numéro exploitable d'une ligne. `Number(null)` vaut 0 et `Number('')` aussi :
  // une ligne sans numéro produirait donc une « Séquence 0 ». On écarte le vide
  // AVANT de convertir.
  const seqNum = (row) => {
    if (row?.numero == null || row.numero === '') return null;
    const n = Number(row.numero);
    return Number.isFinite(n) ? n : null;
  };

  const numsOf = (tid) => (rowsByTrim[tid] || []).map(seqNum).filter((n) => n !== null);
  const idsOf  = (tid) => (rowsByTrim[tid] || []).map((s) => s.id).filter(Boolean);

  const out = [];
  for (const p of APC_PERIOD_SHAPE) {
    if (withSequences && p.kind === 'trimestre') {
      for (const row of rowsByTrim[p.trimestreId] || []) {
        const num = seqNum(row);
        // Une ligne sans numéro exploitable ou sans identifiant ne peut pas être
        // tirée en bulletin : ni libellé à afficher, ni note à retrouver.
        if (num === null || !row.id) continue;
        out.push({
          value: apcSequencePeriodValue(num),
          kind: 'sequence',
          trimestreId: p.trimestreId,
          trimestreIds: [p.trimestreId],
          seqs: [num],
          seqIds: [row.id],
          ...apcSequenceLabels(num),
        });
      }
    }
    const trimestreIds = p.trimestreId ? [p.trimestreId] : [...APC_TRIMESTRE_IDS];
    out.push({
      ...p,
      trimestreIds,
      seqs:   trimestreIds.flatMap(numsOf),
      seqIds: trimestreIds.flatMap(idsOf),
      ...APC_PERIOD_LABELS[p.value],
    });
  }
  return out;
}

// Libellé d'une période selon le SYSTÈME de la classe ('FR' | 'EN' | 'ES'),
// comme le reste des documents officiels — pas selon la langue de l'interface.
export const apcPeriodLabel = (period, sys = 'FR') => {
  // Les trimestres ont leurs libellés en table ; une séquence porte les siens,
  // posés à la construction (son numéro n'est pas connu d'avance).
  const l = APC_PERIOD_LABELS[period?.value] || (period?.fr ? period : null);
  if (!l) return '';
  return sys === 'EN' ? l.en : sys === 'ES' ? l.es : l.fr;
};

// La période de bulletin correspondant à une clé persistée, avec repli sur la
// PREMIÈRE période servie. Une clé « seq_3 » retrouve sa séquence quand la liste
// en contient (écran Bulletins) et retombe sur T1 quand elle n'en contient pas
// (rapports, procès-verbaux) — au lieu de laisser l'écran sans période.
export function resolveApcPeriod(periods, periodKey) {
  const list = periods && periods.length ? periods : apcBulletinPeriods(null);
  const found = list.find((p) => p.value === periodKey);
  if (found) return found;
  // Repli sur le PREMIER TRIMESTRE, pas sur `list[0]` : quand les séquences sont
  // servies, la première entrée est S1 — or une clé inconnue doit retomber sur le
  // document de référence, le trimestre.
  return list.find((p) => p.value === 'term_1') || list[0];
}
