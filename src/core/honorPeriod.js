// PÉRIODE D'UN TABLEAU D'HONNEUR → PÉRIODE DE CHAQUE CLASSE — logique pure.
//
// Le palmarès se tire pour UNE période choisie (séquence 1 à 6, trimestre 1 à 3, année),
// mais chaque moteur de bulletin découpe l'année à sa façon. On traduit la période
// demandée vers la période QUE LE BULLETIN DE LA CLASSE UTILISE, pour que la moyenne
// imprimée sur le tableau d'honneur soit celle du bulletin (calcul : classReportRun).
//
//   classique FR/EN   seq n → [n] · trimestre n → [2n-1, 2n] · année → 1…6
//   Guinée Éq.        trimestre n → [n] · année → 1…3 · pas de séquence
//   collège APC       trimestre n → trimestre du référentiel · année → annuel ·
//                     pas de séquence (l'APC restitue au trimestre)
//   primaire APC      école en trimestres : trimestre n → [n] · année → 1…3 · pas de séquence
//                     école en séquences  : séquence n → UA n · trimestre n → UA du trimestre ·
//                     année → UA 1…8
//   maternelle        jamais (pas de moyenne)
//
// Une classe pour laquelle la période n'existe pas est SIGNALÉE (null + raison), jamais
// remplie avec une autre période en silence.

import { apcBulletinPeriods } from './apcPeriods.js';

export const HONOR_PERIODS = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ key: `seq_${n}`, kind: 'seq', n })),
  ...[1, 2, 3].map((n) => ({ key: `term_${n}`, kind: 'term', n })),
  { key: 'annual', kind: 'annual', n: null },
];

const ORD_FR = (n, fem) => (n === 1 ? (fem ? '1ère' : '1er') : `${n}e`);
const ORD_EN = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** Libellé d'une période d'honneur : « 1ère séquence » / « 1st Sequence », « 2e trimestre » / « 2nd Term ». */
export function libellePeriode(key, langue = 'fr') {
  const p = HONOR_PERIODS.find((x) => x.key === key);
  if (!p) return '';
  if (p.kind === 'annual') return langue === 'en' ? 'Academic Year' : 'Année scolaire';
  if (p.kind === 'seq') return langue === 'en' ? `${ORD_EN(p.n)} Sequence` : `${ORD_FR(p.n, true)} séquence`;
  return langue === 'en' ? `${ORD_EN(p.n)} Term` : `${ORD_FR(p.n, false)} trimestre`;
}

/**
 * @param {string} key  clé d'HONOR_PERIODS
 * @param {object} c    { engine, isGE, primSeqMode, apcReferentiel }
 * @returns {{ period: object|null, raison: string|null }}
 */
export function periodePourClasse(key, { engine, isGE = false, primSeqMode = false, apcReferentiel = null } = {}) {
  const p = HONOR_PERIODS.find((x) => x.key === key);
  if (!p) return { period: null, raison: 'periode' };
  if (engine === 'maternelle') return { period: null, raison: 'maternelle' };

  if (engine === 'apc') {
    if (p.kind === 'seq') return { period: null, raison: 'apc_sequence' };
    const list = apcBulletinPeriods(apcReferentiel);
    const found = p.kind === 'annual' ? list.find((x) => x.kind === 'annuel') : list.find((x) => x.value === `term_${p.n}`);
    return found ? { period: found, raison: null } : { period: null, raison: 'periode' };
  }

  if (engine === 'apc_primaire') {
    if (primSeqMode) {
      if (p.kind === 'seq') return { period: { value: `s${p.n}`, seqs: [p.n], uas: [p.n] }, raison: null };
      if (p.kind === 'annual') return { period: { value: 'annual', seqs: [1, 2, 3, 4, 5, 6, 7, 8], uas: [1, 2, 3, 4, 5, 6, 7, 8] }, raison: null };
      return { period: { value: `t${p.n}`, seqs: [p.n] }, raison: null };
    }
    if (p.kind === 'seq') return { period: null, raison: 'primaire_trimestres' };
    if (p.kind === 'annual') return { period: { value: 'annual', seqs: [1, 2, 3] }, raison: null };
    return { period: { value: `t${p.n}`, seqs: [p.n] }, raison: null };
  }

  if (isGE) {
    if (p.kind === 'seq') return { period: null, raison: 'ge_sequence' };
    if (p.kind === 'annual') return { period: { value: 'anual', seqs: [1, 2, 3] }, raison: null };
    return { period: { value: `trim_${p.n}`, seqs: [p.n] }, raison: null };
  }

  // Classique FR / EN : six séquences, deux par trimestre.
  if (p.kind === 'seq') return { period: { value: `seq_${p.n}`, seqs: [p.n] }, raison: null };
  if (p.kind === 'term') return { period: { value: `term_${p.n}`, seqs: [2 * p.n - 1, 2 * p.n] }, raison: null };
  return { period: { value: 'annual', seqs: [1, 2, 3, 4, 5, 6] }, raison: null };
}
