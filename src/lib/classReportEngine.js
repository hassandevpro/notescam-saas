// RAPPORT DE CLASSE, TOUS MOTEURS — logique PURE (ni React, ni store, ni réseau).
//
// La page Rapports ne calculait que le moteur historique : moyennes /20 lues dans
// `gradeMap`. Or les deux systèmes de bulletin ne rangent pas les évaluations au
// même endroit ni sous la même forme :
//
//   moteur        | colonnes du rapport   | source            | forme
//   --------------|-----------------------|-------------------|------------------
//   classic / sc  | matières              | gradeMap          | note /20 (ou /100, /10)
//   apc           | matières MINESEC      | apcNotes + réf.   | moyenne /20 + cote
//   apc_primaire  | compétences MINEDUB   | primNotes + réf.  | moyenne /10 + cote
//   maternelle    | domaines MINEDUB      | matObservations   | A / ECA / NA (aucune moyenne)
//
// Ce module ramène les quatre à UNE forme unique, pour que la page ait une seule
// façon de dessiner un rapport :
//
//   { kind, ready, reason, scaleMax, passThreshold, columns, rows,
//     columnStats, classStats, distribution }
//
//   kind 'numeric'     → tout ce qui produit une moyenne (classic, sc, apc, apc_primaire)
//   kind 'acquisition' → maternelle : le préscolaire n'a NI moyenne, NI rang.
//                        Le rapport y compte des niveaux d'acquisition.
//
// Test : `node src/lib/_classReportEngine.test.mjs`

import { getAvg } from '../core/bulletinEngine.js';
import {
  SEQ_TO_TRIM, sequencesOfTrimestre, competencesFor, matiereAverage, coefFor,
  generalAverage as apcGeneralAverage, apcCoteFromScale,
} from '../core/apcEngine.js';
import {
  competencesForNiveau, criteresForCompetence, competencePointsTotal,
  generalAverage as primGeneralAverage, primCote, PRIM_COTE_DEFAULT, UA_PAR_TRIMESTRE,
} from '../core/primEngine.js';
import { MAT_ACQUIS_CODES, MAT_ACQUIS_LABELS, dominantAcquis } from '../core/matEngine.js';
import { firstCycleClasseSlug, primaireNiveauSlug } from '../core/engineResolver.js';

// Clés transactionnelles locales. Définitions canoniques : `apcService.noteNkey`,
// `primService.primNkey`, `matService.obsNkey` — reprises ici parce que ces
// services importent le client Supabase, ce qui rendrait ce module (et son test)
// impossible à charger hors navigateur. Même parti pris que `gradeEntryProgress`.
const apcKey  = (eleveId, competenceId, sequenceId) => `${eleveId}_${competenceId}_${sequenceId}`;
const primKey = (eleveId, competenceId, critereId, ua) => `${eleveId}_${competenceId}_${critereId}_${ua}`;
const matKey  = (eleveId, domaineId, trimestreId) => `${eleveId}_${domaineId}_${trimestreId}`;

export const REPORT_KIND = { NUMERIC: 'numeric', ACQUISITION: 'acquisition' };

// Échelle du primaire APC : le carnet officiel note /10.
export const PRIM_GRADE_MAX = 10;

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'ABS') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

// ── Classement commun ───────────────────────────────────────────────────────
// Une seule règle de rang pour tous les moteurs : tri décroissant, ex æquo au
// même rang, élèves sans moyenne hors classement. Renvoie { [id]: {rankN, rankD} }.
// (`buildRanks` du moteur historique ne produisait que `rankD` — la page en
// affichait `rankN`, donc une pastille de rang vide.)
export function rankByAverage(students, avgById, ordinal = (n) => `${n}${n === 1 ? 'er' : 'ème'}`) {
  const sorted = (students || [])
    .map((s) => ({ id: s.id, av: avgById?.[s.id] ?? null }))
    .sort((a, b) => {
      if (a.av === null && b.av === null) return 0;
      if (a.av === null) return 1;
      if (b.av === null) return -1;
      return b.av - a.av;
    });
  const out = {};
  let rk = 1;
  sorted.forEach((s, i) => {
    if (s.av === null) { out[s.id] = null; return; }
    if (i > 0 && sorted[i - 1].av !== null && s.av < sorted[i - 1].av) rk = i + 1;
    out[s.id] = { rankN: rk, rankD: ordinal(rk) };
  });
  return out;
}

// ── Statistiques dérivées, communes aux moteurs numériques ──────────────────
function numericColumnStats(columns, rows, passOf) {
  return columns.map((col) => {
    const vals = rows.map((r) => r.scores[col.id]).filter((v) => v != null);
    if (!vals.length) return { col, avg: null, min: null, max: null, passCount: 0, total: 0 };
    const pass = passOf(col);
    return {
      col,
      avg: round2(vals.reduce((a, b) => a + b, 0) / vals.length),
      min: Math.min(...vals),
      max: Math.max(...vals),
      passCount: vals.filter((v) => v >= pass).length,
      total: vals.length,
    };
  });
}

function numericClassStats(rows, passThreshold, total) {
  const avgs = rows.map((r) => r.avg).filter((v) => v != null);
  if (!avgs.length) return { total, avg: null, min: null, max: null, above: 0 };
  return {
    total,
    avg:   round2(avgs.reduce((a, b) => a + b, 0) / avgs.length),
    min:   Math.min(...avgs),
    max:   Math.max(...avgs),
    above: avgs.filter((v) => v >= passThreshold).length,
  };
}

// Quatre bandes proportionnelles au barème : lisibles quelle que soit l'échelle
// (/20 MINESEC, /10 primaire APC ou Guinée Éq., /100 anglophone).
function numericDistribution(rows, scaleMax) {
  const q = scaleMax / 4;
  const fmt = (v) => (Number.isInteger(v) ? String(v) : String(round2(v)));
  const bands = [
    { label: `< ${fmt(q)}`,                 min: 0,     max: q },
    { label: `${fmt(q)}–${fmt(2 * q)}`,     min: q,     max: 2 * q },
    { label: `${fmt(2 * q)}–${fmt(3 * q)}`, min: 2 * q, max: 3 * q },
    { label: `${fmt(3 * q)}–${fmt(scaleMax)}`, min: 3 * q, max: scaleMax + 0.01 },
  ];
  const avgs = rows.map((r) => r.avg).filter((v) => v != null);
  const peak = avgs.length || 1;
  return bands.map((b) => {
    const count = avgs.filter((v) => v >= b.min && v < b.max).length;
    return { ...b, count, pct: Math.round((count / peak) * 100) };
  });
}

// ══ Moteur historique : notes numériques dans gradeMap ═══════════════════════

// Moyenne d'une matière pour un élève sur les séquences de la période.
export function subjectAvgForStudent(subjectId, studentId, classId, seqs, gradeMap) {
  const vals = (seqs || []).map((seq) => num((gradeMap?.[`${classId}_${studentId}_${seq}`] || {})[subjectId]))
    .filter((v) => v !== null);
  return vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

function classicReport({ cls, students, subjects, period, gradeMap, sys, gOpts, scaleMax, passThreshold }) {
  const columns = subjects.map((s) => ({ id: s.id, name: s.name, coef: s.coef, max: s.max, sub: s }));
  const avgById = {};
  const rows = students.map((student) => {
    const scores = {};
    const scoreStrings = {};
    for (const col of columns) {
      const v = subjectAvgForStudent(col.id, student.id, cls.id, period.seqs, gradeMap);
      if (v !== null) { scores[col.id] = v; scoreStrings[col.id] = String(v); }
    }
    const avg = getAvg(scoreStrings, subjects, sys, gOpts);
    avgById[student.id] = avg;
    return { student, scores, cotes: {}, avg, cote: null };
  });
  const ranks = rankByAverage(students, avgById);
  rows.forEach((r) => { r.rank = ranks[r.student.id]; });

  // Chaque matière garde son propre barème (`sub.max`) : le seuil se ramène au
  // prorata du seuil de la classe.
  const passOf = (col) => (col.max ? (passThreshold / scaleMax) * col.max : passThreshold);
  return {
    kind: REPORT_KIND.NUMERIC, ready: true, reason: null, scaleMax, passThreshold, columns, rows,
    columnStats: numericColumnStats(columns, rows, passOf),
    classStats:  numericClassStats(rows, passThreshold, students.length),
    distribution: numericDistribution(rows, scaleMax),
  };
}

// ══ APC premier cycle (collège MINESEC) : compétences → moyennes de matière ══

// Les identifiants de séquence du référentiel couverts par la période (mêmes
// règles que le bulletin APC : numéro global si présent, sinon position dans le
// trimestre).
function apcSeqIdsForPeriod(referentiel, seqNums) {
  const all = referentiel?.sequences || [];
  return (seqNums || []).map((n) => {
    const trimSeqs = sequencesOfTrimestre(all, SEQ_TO_TRIM[n]);
    const byGlobal = trimSeqs.find((s) => s.numero === n);
    if (byGlobal) return byGlobal.id;
    return (trimSeqs[n % 2 === 1 ? 0 : 1] || trimSeqs[0])?.id;
  }).filter(Boolean);
}

// Moyenne d'UNE matière pour un élève sur la période : moyenne des compétences
// notées (pondérée par leur coefficient), chaque compétence prenant la moyenne de
// ses notes sur les séquences couvertes. Règle identique au bulletin APC.
function apcMatiereAvg({ referentiel, apcNotes, classeSlug, trimestreId, seqIds, studentId, matiereId }) {
  const comps = competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId });
  if (!comps.length) return { moyenne: null, comps };
  const notesByComp = {};
  for (const c of comps) {
    const vals = seqIds.map((sid) => num(apcNotes?.[apcKey(studentId, c.id, sid)]?.note)).filter((v) => v !== null);
    if (vals.length) notesByComp[c.id] = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return { moyenne: matiereAverage(notesByComp, comps), comps };
}

function apcReport({ cls, students, period, apcNotes, apcReferentiel, gradeScale, scaleMax, passThreshold }) {
  const classeSlug = firstCycleClasseSlug(cls?.level, cls?.name);
  if (!apcReferentiel) return notReady(REPORT_KIND.NUMERIC, 'referentiel', scaleMax, passThreshold);
  if (!classeSlug)     return notReady(REPORT_KIND.NUMERIC, 'classe', scaleMax, passThreshold);

  // Une période peut couvrir plusieurs trimestres (annuel) : on assemble chaque
  // trimestre concerné, puis la matière prend la moyenne de ses trimestres notés.
  const seqNums   = period.seqs || [1];
  const trimIds   = [...new Set(seqNums.map((n) => SEQ_TO_TRIM[n]).filter(Boolean))];
  const seqIdsFor = (tid) => apcSeqIdsForPeriod(apcReferentiel, seqNums.filter((n) => SEQ_TO_TRIM[n] === tid));

  // Colonnes = matières que le référentiel porte pour cette classe sur la période.
  const colById = new Map();
  for (const tid of trimIds) {
    for (const m of apcReferentiel.matieres || []) {
      if (colById.has(m.id)) continue;
      if (!competencesFor(apcReferentiel.competences, { classeId: classeSlug, trimestreId: tid, matiereId: m.id }).length) continue;
      colById.set(m.id, {
        id: m.id, name: m.nom, max: scaleMax,
        coef: coefFor(apcReferentiel.classeMatieres, classeSlug, m),
      });
    }
  }
  const columns = [...colById.values()];

  const avgById = {};
  const rows = students.map((student) => {
    const scores = {}, cotes = {};
    for (const col of columns) {
      const perTrim = trimIds
        .map((tid) => apcMatiereAvg({
          referentiel: apcReferentiel, apcNotes, classeSlug,
          trimestreId: tid, seqIds: seqIdsFor(tid), studentId: student.id, matiereId: col.id,
        }).moyenne)
        .filter((v) => v != null);
      if (perTrim.length) {
        const m = round2(perTrim.reduce((a, b) => a + b, 0) / perTrim.length);
        scores[col.id] = m;
        cotes[col.id]  = apcCoteFromScale(m, gradeScale).code;
      }
    }
    const avg = apcGeneralAverage(columns.map((c) => ({ moyenne: scores[c.id] ?? null, coef: c.coef })));
    avgById[student.id] = avg;
    return { student, scores, cotes, avg, cote: avg != null ? apcCoteFromScale(avg, gradeScale).code : null };
  });
  const ranks = rankByAverage(students, avgById);
  rows.forEach((r) => { r.rank = ranks[r.student.id]; });

  return {
    kind: REPORT_KIND.NUMERIC, ready: true, reason: null, scaleMax, passThreshold, columns, rows,
    columnStats: numericColumnStats(columns, rows, () => passThreshold),
    classStats:  numericClassStats(rows, passThreshold, students.length),
    distribution: numericDistribution(rows, scaleMax),
  };
}

// ══ Primaire APC (MINEDUB) : compétences × critères, notées par UA ═══════════

// Moyenne /10 d'une compétence sur la période : moyenne des pourcentages
// (points obtenus / points du barème officiel) de chaque UA notée. Même règle
// que le bulletin primaire, pour que rapport et bulletin ne divergent jamais.
function primCompetenceAvg({ referentiel, niveauSlug, student, competenceId, uas, primNotes }) {
  const aptitude = competenceId === '6a' && student?.sport_aptitude === 'inapte' ? 'inapte' : 'apte';
  const criteres = criteresForCompetence(referentiel, niveauSlug, competenceId, aptitude);
  if (!criteres.length) return null;
  const pcts = uas.map((ua) => {
    const notesByCritere = {};
    for (const cr of criteres) {
      const r = primNotes?.[primKey(student.id, competenceId, cr.id, ua)];
      if (r?.note != null && r.note !== '') notesByCritere[cr.id] = r.note;
    }
    const { achieved, possible } = competencePointsTotal(notesByCritere, criteres);
    return achieved != null && possible ? (achieved / possible) * 100 : null;
  }).filter((v) => v != null);
  if (!pcts.length) return null;
  return round2((pcts.reduce((a, b) => a + b, 0) / pcts.length) / 100 * PRIM_GRADE_MAX);
}

function primReport({ cls, students, period, primNotes, primReferentiel }) {
  const scaleMax = PRIM_GRADE_MAX;
  const passThreshold = PRIM_GRADE_MAX / 2;
  const niveauSlug = primaireNiveauSlug(cls?.level, cls?.name);
  if (!primReferentiel) return notReady(REPORT_KIND.NUMERIC, 'referentiel', scaleMax, passThreshold);
  if (!niveauSlug)      return notReady(REPORT_KIND.NUMERIC, 'classe', scaleMax, passThreshold);

  // La période du rapport est trimestrielle (PERIODS_FUND) ; la saisie, elle, se
  // fait par unité d'apprentissage → on couvre les UA du trimestre.
  const annual = (period.seqs || []).length > 1;
  const uas = annual ? [1, 2, 3, 4, 5, 6, 7, 8] : (UA_PAR_TRIMESTRE[period.seqs?.[0] || 1] || [1, 2, 3]);
  const bareme = primReferentiel?.bareme?.length ? primReferentiel.bareme : PRIM_COTE_DEFAULT;

  const comps = competencesForNiveau(primReferentiel, niveauSlug);
  const columns = comps.map((c) => ({
    id: c.id,
    name: c.code ? `${c.code} — ${c.intitule}` : c.intitule,
    coef: c.coefficient == null ? 1 : Number(c.coefficient) || 1,
    max: scaleMax,
  }));

  const avgById = {};
  const rows = students.map((student) => {
    const scores = {}, cotes = {};
    const compRows = [];
    for (const col of columns) {
      const moyenne = primCompetenceAvg({
        referentiel: primReferentiel, niveauSlug, student, competenceId: col.id, uas, primNotes,
      });
      if (moyenne != null) {
        scores[col.id] = moyenne;
        cotes[col.id]  = primCote(moyenne, scaleMax, bareme)?.cote ?? null;
      }
      compRows.push({ moyenne, coef: col.coef });
    }
    const avg = primGeneralAverage(compRows);
    avgById[student.id] = avg;
    const cg = avg != null ? primCote(avg, scaleMax, bareme) : null;
    return { student, scores, cotes, avg, cote: cg?.cote ?? null, appreciation: cg?.libelle ?? '' };
  });
  const ranks = rankByAverage(students, avgById);
  rows.forEach((r) => { r.rank = ranks[r.student.id]; });

  return {
    kind: REPORT_KIND.NUMERIC, ready: true, reason: null, scaleMax, passThreshold, columns, rows,
    columnStats: numericColumnStats(columns, rows, () => passThreshold),
    classStats:  numericClassStats(rows, passThreshold, students.length),
    distribution: numericDistribution(rows, scaleMax),
  };
}

// ══ Maternelle (MINEDUB) : domaines évalués A / ECA / NA ════════════════════
//
// Le préscolaire n'a NI note, NI moyenne, NI rang (cf. matEngine). Le rapport de
// classe y répond à une autre question : « où en est l'acquisition ? ». On compte
// donc des niveaux, par domaine et pour la classe.
function maternelleReport({ students, subjects, period, matObservations }) {
  const columns = subjects
    .filter((s) => s.mat_domaine_id)
    .map((s) => ({ id: s.mat_domaine_id, name: s.name, coef: s.coef, max: null, sub: s }));

  // Période fondamentale : `seqs` porte le(s) trimestre(s) (1..3).
  const trims = (period.seqs || [1]);

  const tally = () => ({ A: 0, ECA: 0, NA: 0 });
  const classCounts = tally();
  let rated = 0;

  const rows = students.map((student) => {
    const cotes = {};
    const observed = [];
    for (const col of columns) {
      // Sur une période multi-trimestres (annuel), le niveau le plus RÉCENT
      // renseigné fait foi : l'acquisition progresse, elle ne se moyenne pas.
      let level = null;
      for (const tr of trims) {
        const o = matObservations?.[matKey(student.id, col.id, `t${tr}`)];
        if (o?.niveau_acquis && MAT_ACQUIS_CODES.includes(o.niveau_acquis)) level = o.niveau_acquis;
      }
      if (level) {
        cotes[col.id] = level;
        observed.push({ niveau_acquis: level });
        classCounts[level] += 1;
        rated += 1;
      }
    }
    const dominant = dominantAcquis(observed);
    return {
      student, scores: {}, cotes, avg: null, rank: null,
      cote: dominant,
      appreciation: dominant ? MAT_ACQUIS_LABELS[dominant] : '',
      ratedCount: observed.length,
    };
  });

  const columnStats = columns.map((col) => {
    const counts = tally();
    let colRated = 0;
    for (const r of rows) {
      const lvl = r.cotes[col.id];
      if (lvl) { counts[lvl] += 1; colRated += 1; }
    }
    return { col, counts, rated: colRated, total: students.length };
  });

  const expected = students.length * columns.length;
  return {
    kind: REPORT_KIND.ACQUISITION, ready: true, reason: null,
    scaleMax: null, passThreshold: null, columns, rows, columnStats,
    classStats: { total: students.length, counts: classCounts, rated, expected },
    distribution: MAT_ACQUIS_CODES.map((code) => ({
      label: code,
      libelle: MAT_ACQUIS_LABELS[code],
      count: classCounts[code],
      pct: rated ? Math.round((classCounts[code] / rated) * 100) : 0,
    })),
  };
}

// Rapport non calculable : référentiel officiel pas encore chargé, ou classe dont
// le niveau ne correspond à aucun référentiel. On le DIT plutôt que d'afficher un
// tableau de zéros.
function notReady(kind, reason, scaleMax, passThreshold) {
  return {
    kind, ready: false, reason, scaleMax, passThreshold,
    columns: [], rows: [], columnStats: [],
    classStats: null, distribution: [],
  };
}

/**
 * Rapport de classe normalisé, quel que soit le moteur de bulletin.
 *
 * @param engine  moteur résolu de la classe (resolveClassEngine)
 * @param period  { seqs: number[] } — séquences 1-6 (secondaire) ou trimestres
 *                1-3 (fondamental), comme les listes de périodes de la page.
 */
export function buildClassReport({
  engine, cls, students = [], subjects = [], period,
  gradeMap, apcNotes, apcReferentiel, primNotes, primReferentiel, matObservations,
  sys = 'FR', gOpts = {}, scaleMax = 20, passThreshold = 10, gradeScale,
}) {
  const ctx = { cls, students, subjects, period, sys, gOpts, scaleMax, passThreshold };
  switch (engine) {
    case 'maternelle':   return maternelleReport({ ...ctx, matObservations });
    case 'apc_primaire': return primReport({ ...ctx, primNotes, primReferentiel });
    case 'apc':          return apcReport({ ...ctx, apcNotes, apcReferentiel, gradeScale });
    default:             return classicReport({ ...ctx, gradeMap });
  }
}
