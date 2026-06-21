// Relevé de notes — logique métier pure (pas de React, pas de DOM).
//
// Un « relevé de notes » diffère d'un bulletin : c'est la synthèse ANNUELLE
// officielle d'un élève — toutes les matières × toutes les séquences, la
// moyenne annuelle, le rang et la décision de fin d'année. Il réutilise
// entièrement le moteur de bulletin (multiAvg, buildRanks, getAppreciation,
// geAnnualDecision) : aucune duplication de calcul de moyenne.
//
// Sert à trois usages :
//   1. Relevé individuel (une année)
//   2. Relevé par classe (génération en masse)
//   3. Relevé multi-années (historique 6e → Terminale)

import {
  multiAvg, buildRanks, getAppreciation, geAnnualDecision, getAvg,
} from '../core/bulletinEngine';

// ── Colonnes de séquences selon le système / cycle ───────────────────────────
// Le relevé annuel liste TOUTES les évaluations de l'année :
//   FR secondaire  : 6 séquences (groupées en 3 trimestres pour l'affichage)
//   EN secondaire  : 3 terms
//   ES (Guinée Éq.): 3 trimestres
//   Primaire FR/EN : 3 trimestres
export function transcriptColumns(sys, cycle, countryCode) {
  if (countryCode === 'guinea_eq') {
    return {
      cols: [
        { seq: 1, label: '1er Trim.', full: 'Primer Trimestre' },
        { seq: 2, label: '2e Trim.',  full: 'Segundo Trimestre' },
        { seq: 3, label: '3e Trim.',  full: 'Tercer Trimestre' },
      ],
      seqs: [1, 2, 3],
    };
  }
  if (cycle !== 'secondaire') {
    return {
      cols: [
        { seq: 1, label: 'Trim. 1', full: 'Trimestre 1' },
        { seq: 2, label: 'Trim. 2', full: 'Trimestre 2' },
        { seq: 3, label: 'Trim. 3', full: 'Trimestre 3' },
      ],
      seqs: [1, 2, 3],
    };
  }
  if (sys === 'EN') {
    return {
      cols: [
        { seq: 1, label: 'Term 1', full: 'Term 1' },
        { seq: 2, label: 'Term 2', full: 'Term 2' },
        { seq: 3, label: 'Term 3', full: 'Term 3' },
      ],
      seqs: [1, 2, 3],
    };
  }
  // FR secondaire — 6 séquences.
  return {
    cols: [1, 2, 3, 4, 5, 6].map((n) => ({ seq: n, label: `Séq ${n}`, full: `Séquence ${n}` })),
    seqs: [1, 2, 3, 4, 5, 6],
  };
}

// Seuil de réussite selon le système / barème de sortie.
export function passThresholdFor(sys, maxScale) {
  if (sys === 'EN') return (maxScale ?? 100) / 2;
  if (sys === 'ES') return (maxScale ?? 10) / 2;
  return (maxScale ?? 20) / 2;
}

// Moyenne annuelle d'une matière = moyenne des séquences notées (mêmes règles
// que le bulletin : ABS / vide ignorés).
function subjectAnnual(subjectId, classId, studentId, seqs, gradeMap) {
  const vals = seqs
    .map((seq) => {
      const v = (gradeMap[`${classId}_${studentId}_${seq}`] || {})[subjectId];
      return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
    })
    .filter((x) => x !== null && !isNaN(x));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function seqValue(subjectId, classId, studentId, seq, gradeMap) {
  const v = (gradeMap[`${classId}_${studentId}_${seq}`] || {})[subjectId];
  return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
}

// ── Décision de fin d'année ──────────────────────────────────────────────────
// Renvoie { key, fr, en, es, passed } — key ∈ admis | redouble | recuperacion | nd
export function annualDecision({ sys, avg, pass, subjects, classId, studentId, seqs, gradeMap, maxScale, override }) {
  if (override) {
    const MAP = {
      admis:        { fr: 'Admis(e) en classe supérieure', en: 'Promoted', es: 'Promociona', passed: true },
      redouble:     { fr: 'Redouble la classe',            en: 'Repeats',  es: 'Repite curso', passed: false },
      exclu:        { fr: 'Exclu(e)',                      en: 'Expelled', es: 'Expulsado',    passed: false },
      recuperacion: { fr: 'Examen de rattrapage',          en: 'Resit exam', es: 'Recuperación', passed: false },
    };
    if (MAP[override]) return { key: override, ...MAP[override] };
  }

  if (avg === null || avg === undefined) {
    return { key: 'nd', fr: 'Non déterminée', en: 'Pending', es: 'Pendiente', passed: false };
  }

  // Guinée Équatoriale : règle officielle de promotion (max 2 matières non
  // validées, sauf Matemáticas + Lengua simultanément → recuperación).
  if (sys === 'ES') {
    const scores = {};
    (subjects || []).forEach((s) => {
      scores[s.id] = subjectAnnual(s.id, classId, studentId, seqs, gradeMap);
    });
    const d = geAnnualDecision(subjects, scores, pass);
    return d === 'aprobado'
      ? { key: 'admis',        fr: 'Promociona', en: 'Promoted', es: 'Promociona', passed: true }
      : { key: 'recuperacion', fr: 'Recuperación', en: 'Resit', es: 'Recuperación', passed: false };
  }

  return avg >= pass
    ? { key: 'admis',    fr: 'Admis(e) en classe supérieure', en: 'Promoted', es: 'Promociona', passed: true }
    : { key: 'redouble', fr: 'Redouble la classe',            en: 'Repeats',  es: 'Repite curso', passed: false };
}

// ── Construction d'un relevé individuel (une année) ──────────────────────────
// Renvoie toutes les données nécessaires pour rendre une feuille A4.
//   student, cls, subjects (triées), gradeMap, sys, cycle, countryCode
//   ranks   : résultat de buildRanks pour la classe (rang annuel)
//   stats   : { min, max, avg, total } de la classe
//   opts    : { maxScale, useCoef, gradeScale } + { decisionOverride }
export function buildTranscript({
  student, cls, subjects, gradeMap, sys, cycle, countryCode,
  schoolYear, ranks = [], stats = null, opts = {}, decisionOverride = null,
}) {
  const { seqs, cols } = transcriptColumns(sys, cycle, countryCode);
  const classId = cls.id;
  const maxScale = opts.maxScale;
  const pass = passThresholdFor(sys, maxScale);

  const rows = (subjects || []).map((sub) => {
    const seqGrades = {};
    cols.forEach((c) => { seqGrades[c.seq] = seqValue(sub.id, classId, student.id, c.seq, gradeMap); });
    const annual = subjectAnnual(sub.id, classId, student.id, seqs, gradeMap);
    const appr = getAppreciation(annual, opts.gradeScale, sys, maxScale ?? 10);
    return { subject: sub, coef: sub.coef || 1, seqGrades, annual, appreciation: appr };
  });

  const generalAvg = multiAvg(gradeMap, classId, student.id, seqs, subjects, sys, opts);
  const generalAppr = getAppreciation(generalAvg, opts.gradeScale, sys, maxScale ?? 10);
  const rankEntry = ranks.find((r) => r.id === student.id) || null;

  const decision = annualDecision({
    sys, avg: generalAvg, pass, subjects, classId, studentId: student.id,
    seqs, gradeMap, maxScale, override: decisionOverride,
  });

  // Sous-total coefficients + points (pour pied de tableau type relevé officiel).
  let totalCoef = 0;
  rows.forEach((r) => { if (r.annual !== null) totalCoef += r.coef; });

  return {
    student, cls, schoolYear, sys, cycle, countryCode,
    cols, rows, generalAvg, generalAppr, rankEntry, stats, decision,
    totalCoef, pass, maxScale,
  };
}

// ── Relevés par classe (génération en masse) ─────────────────────────────────
export function buildClassTranscripts({
  classStudents, cls, subjects, gradeMap, sys, cycle, countryCode,
  schoolYear, stats = null, opts = {}, decisionOverrides = {},
}) {
  const { seqs } = transcriptColumns(sys, cycle, countryCode);
  const ranks = buildRanks(classStudents, gradeMap, cls.id, seqs, subjects, sys, {}, opts);
  return classStudents.map((student) =>
    buildTranscript({
      student, cls, subjects, gradeMap, sys, cycle, countryCode, schoolYear,
      ranks, stats, opts, decisionOverride: decisionOverrides[student.id] || null,
    })
  );
}

// ── Relevé multi-années (historique d'un élève) ──────────────────────────────
// `years` : [{ year, cls, subjects, gradeMap, sys, cycle, countryCode, ranks, opts, studentId }]
// Chaque entrée = une année académique chargée séparément. Comme la promotion
// duplique la ligne élève par année, l'`id` change d'une année à l'autre :
// chaque entrée porte donc son propre `studentId` (résolu par matricule/nom).
// On produit une ligne de synthèse par année, triée chronologiquement.
export function buildMultiYearHistory(student, years) {
  return years
    .map(({ year, cls, subjects, gradeMap, sys, cycle, countryCode, ranks = [], stats = null, opts = {}, studentId }) => {
      const sid = studentId || student.id;
      const { seqs } = transcriptColumns(sys, cycle, countryCode);
      const generalAvg = multiAvg(gradeMap, cls.id, sid, seqs, subjects, sys, opts);
      const pass = passThresholdFor(sys, opts.maxScale);
      const rankEntry = ranks.find((r) => r.id === sid) || null;
      const decision = annualDecision({
        sys, avg: generalAvg, pass, subjects, classId: cls.id, studentId: sid,
        seqs, gradeMap, maxScale: opts.maxScale, override: null,
      });
      return {
        year, className: cls.name, level: cls.level || cls.name,
        generalAvg, rank: rankEntry?.rankD || '—', total: stats?.total ?? null,
        decision, sys, maxScale: opts.maxScale,
      };
    })
    .sort((a, b) => String(a.year).localeCompare(String(b.year)));
}

// ── Vérification (QR hybride : URL auto-contenue + checksum) ──────────────────
// Le QR encode une URL `/verify/<payload>` lisible par l'app (cloud OU LAN, car
// l'origine est joignable sur le réseau). Le payload est AUTO-CONTENU (les faits
// du relevé y figurent), donc la page de vérification ne dépend d'AUCUNE base :
// elle décode, recalcule le checksum et confronte au relevé papier.

// Hash déterministe djb2 → base36 (anti-corruption / tamper-evidence du QR).
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase();
}

// Chaîne canonique des faits vérifiés (ordre figé → checksum stable).
function canonical(core) {
  return [core.sid, core.n, core.m, core.c, core.y, core.a, core.r, core.d].join('|');
}

// base64url unicode-safe (compatible navigateur).
function b64urlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecode(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return decodeURIComponent(escape(atob(b64)));
}

// Construit le payload + le code court imprimé + le texte QR (URL si origine).
//   data = { schoolId, schoolName, studentName, matricule, className, year, avg, rank, decision }
export function buildVerification(data, origin) {
  const core = {
    sid: String(data.schoolId || '').slice(0, 8),
    n:   data.studentName || '',
    m:   data.matricule || '',
    c:   data.className || '',
    y:   data.year || '',
    a:   data.avg == null ? '' : String(data.avg),
    r:   data.rank || '',
    d:   data.decision || '',
  };
  const checksum = djb2(canonical(core));
  const payloadObj = { v: 1, ...core, h: checksum, sn: data.schoolName || '' };
  const payload = b64urlEncode(JSON.stringify(payloadObj));
  // Code court lisible (sous le QR) — pour vérification manuelle / téléphonique.
  const code = `${core.sid}-${checksum}`.toUpperCase();
  const url = origin ? `${origin.replace(/\/$/, '')}/verify/${payload}` : null;
  return { code, payload, checksum, qrText: url || payload, url };
}

// Décode + vérifie l'intégrité d'un payload (utilisé par la page /verify).
export function decodeVerification(payload) {
  try {
    const obj = JSON.parse(b64urlDecode(payload));
    const core = { sid: obj.sid, n: obj.n, m: obj.m, c: obj.c, y: obj.y, a: obj.a, r: obj.r, d: obj.d };
    const expected = djb2(canonical(core));
    return { ok: true, valid: expected === obj.h, data: obj, expected };
  } catch (err) {
    return { ok: false, valid: false, error: err?.message || String(err) };
  }
}

export { getAvg };
