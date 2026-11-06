// ─────────────────────────────────────────────────────────────────────────────
// RELEVÉ DE NOTES BÂTI SUR LE MÊME CALCUL QUE LE BULLETIN ET LE PV
// ─────────────────────────────────────────────────────────────────────────────
// Le relevé historique relit `gradeMap` avec la moyenne « classique ». C'est juste
// pour les classes qui notent ainsi, mais FAUX pour les classes dont le bulletin
// suit un autre moteur :
//   • bilingue (5eme, 6eme, FORM1, FORM2…) : coefficients du référentiel ;
//   • apc (premier cycle) : notes dans le référentiel APC ;
//   • apc_primaire (SIL–CM2) : notes par compétence et UA — `gradeMap` est VIDE,
//     d'où des centaines de relevés « bloqués » alors que les bulletins existent.
//
// Plutôt que de recopier ces calculs, on lit le PV ANNUEL de la classe
// (`buildClassPv`, qui appelle les fonctions mêmes du bulletin) et on le met à la
// forme attendue par `transcriptSheetHtml`. Une seule source de chiffres : le
// bulletin, le PV et le relevé ne peuvent plus se contredire.

import { getAppreciation } from '../core/bulletinEngine.js';
import { bilAppreciation, bilSysForSerie } from '../core/bilEngine.js';
import { bilRefKeyForClass } from './bilAutoConfig.js';
import { primCote } from '../core/primEngine.js';
import { pvPeriodLabel } from './pvEngine.js';

// Moteurs dont le relevé doit venir du PV (les autres gardent le chemin direct).
export const TRANSCRIPT_FROM_PV_ENGINES = ['bilingue', 'apc', 'apc_primaire'];
export const transcriptUsesPv = (engine) => TRANSCRIPT_FROM_PV_ENGINES.includes(engine);

// Mention d'une moyenne, dans la forme { text, col } que lit transcriptSheetHtml.
function appreciation(avg, pv, gradeScale) {
  if (avg == null) return { text: '—', col: '#6b7280' };
  if (pv.engine === 'apc_primaire') {
    return { text: primCote(avg, pv.maxScale, pv.primScale)?.libelle || '', col: '#111' };
  }
  if (pv.engine === 'bilingue') {
    return { text: bilAppreciation(avg, gradeScale, bilSysForSerie(bilRefKeyForClass(pv.cls)?.serieId)), col: '#111' };
  }
  const a = getAppreciation(avg, gradeScale, pv.sys, pv.maxScale);
  return { text: a.text ?? (a.g ? `${a.g} — ${a.txt}` : ''), col: a.col };
}

// Décision de fin d'année : même règle que le relevé direct (moyenne ≥ seuil).
function decisionOf(avg, pv) {
  if (avg == null) return { key: 'nd', fr: 'Non déterminée', en: 'Pending', es: 'Pendiente', passed: false };
  return avg >= pv.summary.pass
    ? { key: 'admis', fr: 'Admis(e) en classe supérieure', en: 'Promoted', es: 'Promociona', passed: true }
    : { key: 'redouble', fr: 'Redouble la classe', en: 'Repeats', es: 'Repite curso', passed: false };
}

// `pv` = buildClassPv({ ..., period: 'annuel' }). Renvoie un tableau de `data`
// (un par élève) au format de buildTranscript, prêt pour transcriptSheetHtml.
export function transcriptsFromPv(pv, { gradeScale: gs } = {}) {
  const gradeScale = gs ?? pv?.gradeScale;
  if (!pv) return [];
  const { cls, sys, units, cols: pvCols, rows, maxScale, summary, schoolYear } = pv;
  const cols = units.map((u, i) => ({ seq: i + 1, label: u.label, full: u.label }));
  // Barème de sortie réel de la classe : le relevé direct devinait /100 pour tout
  // l'anglophone, ce qui est faux pour le programme bilingue (/20).
  const scaleLabel = `/${maxScale}`;
  const stats = { total: rows.length, avg: summary.avg, min: summary.min, max: summary.max };

  return rows.map((r) => ({
    student: { id: r.id, name: r.name, matricule: r.matricule },
    cls, schoolYear, sys, cycle: pv.cycle, cols, scaleLabel, maxScale,
    rows: pvCols.map((c) => {
      const cell = r.cells[c.key] || { byUnit: {}, moy: null };
      const seqGrades = {};
      units.forEach((u, i) => { seqGrades[i + 1] = cell.byUnit?.[u.key] ?? null; });
      return {
        subject: { id: c.key, name: c.name, code: c.code },
        coef: c.coef, seqGrades, annual: cell.moy ?? null,
        appreciation: appreciation(cell.moy ?? null, pv, gradeScale),
      };
    }),
    generalAvg: r.avg ?? null,
    generalAppr: appreciation(r.avg ?? null, pv, gradeScale),
    rankEntry: r.rank ? { id: r.id, rankD: r.rankTxt } : null,
    stats,
    decision: decisionOf(r.avg ?? null, pv),
    totalCoef: pvCols.reduce((a, c) => a + (rows.length && r.cells[c.key]?.moy != null ? (Number(c.coef) || 0) : 0), 0),
    pass: summary.pass,
    fromPv: true,
    // Titre de période (null = année entière) : « Séquence 3 », « UA 7 »…
    periodLabel: pv.period === 'annuel' ? null : pvPeriodLabel(pv.period, sys, pv.engine === 'apc_primaire'),
  }));
}

