// Bulletin engine — logique métier pure (pas de React, pas de DOM).
// Migré depuis NotesCam-Pro/src/react/core/bulletinEngine.js.
//
// g       = { [subjectId]: value }  — value est un string numérique ou "ABS"
// subs    = [{ id, name, coef, max }]
// sys     = "FR" | "EN"
// allGrades = { "classId_studentId_seq": g }
// excl    = { "classId_studentId": true }  — élèves exclus du classement

// --- Matières composites (sous-composantes) ---------------------------------
// Une sous-composante = matière `subjects` avec `parent_id`. La note d'une
// matière parente est CALCULÉE depuis ses enfants selon `calc_method` ; les
// enfants sont EXCLUS de la moyenne générale (seul le parent y participe).
// Tout est centralisé ici → moyennes, classements et décisions sont corrects
// partout sans modifier les appelants. Rétro-compatible : sans `parent_id`,
// resolveScores renvoie (g, subs) à l'identique.

export const topSubjects = (subs) => subs.filter((s) => !s.parent_id);
export const hasComposites = (subs) => subs.some((s) => s.parent_id);

// Calcule la note d'une matière parente (sur SON barème parent.max) à partir
// des notes de ses enfants. method : 'avg' | 'weighted_avg' (défaut) |
// 'weighted_sum' | 'formula' (repli weighted_avg en attendant l'évaluateur).
export const composeParent = (g, parent, children, method = 'weighted_avg') => {
  const pmax = parent.max || 20;
  const parts = [];
  for (const c of children) {
    const v = g?.[c.id];
    if (v === undefined || v === null || v === '' || v === 'ABS') continue;
    const n = parseFloat(v);
    if (isNaN(n)) continue;
    parts.push({ pct: n / (c.max || pmax), coef: c.coef || 1, raw: n });
  }
  if (!parts.length) return null;
  if (method === 'avg') {
    const m = parts.reduce((a, p) => a + p.pct, 0) / parts.length;
    return Math.round(m * pmax * 100) / 100;
  }
  if (method === 'weighted_sum') {
    const s = parts.reduce((a, p) => a + p.raw * p.coef, 0);
    return Math.round(Math.min(s, pmax) * 100) / 100;
  }
  const tc = parts.reduce((a, p) => a + p.coef, 0) || 1;
  const m = parts.reduce((a, p) => a + p.pct * p.coef, 0) / tc;
  return Math.round(m * pmax * 100) / 100;
};

// Remplace, dans la grille de notes, chaque parent par sa note calculée et ne
// renvoie QUE les matières de premier niveau. Sans composite : passe-plat.
export const resolveScores = (g, subs) => {
  if (!subs.some((s) => s.parent_id)) return { g: g || {}, subs };
  const top = [];
  const byParent = new Map();
  for (const s of subs) {
    if (s.parent_id) {
      if (!byParent.has(s.parent_id)) byParent.set(s.parent_id, []);
      byParent.get(s.parent_id).push(s);
    } else top.push(s);
  }
  const gEff = { ...(g || {}) };
  for (const p of top) {
    const kids = byParent.get(p.id);
    if (!kids?.length) continue;
    const v = composeParent(g, p, kids, p.calc_method);
    if (v === null) delete gEff[p.id]; else gEff[p.id] = String(v);
  }
  return { g: gEff, subs: top };
};

// --- Calcul de moyenne séquentielle ---

// maxScale = barème de sortie de la classe (défaut /20 FR, /100 EN). Chaque note
// est normalisée par le barème de sa matière (s.max) puis remise à l'échelle de
// sortie : un barème /30 n'altère donc pas les classes existantes (défaut conservé).
export const calcFR = (g, subs, maxScale = 20) => {
  ({ g, subs } = resolveScores(g, subs));
  let sw = 0, tc = 0;
  for (const s of subs) {
    const v = g?.[s.id];
    if (!v || v === 'ABS' || v === '') continue;
    sw += (parseFloat(v) / s.max) * maxScale * s.coef;
    tc += s.coef;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
};

export const calcEN = (g, subs, maxScale = 100) => {
  ({ g, subs } = resolveScores(g, subs));
  let sw = 0, tc = 0;
  for (const s of subs) {
    const v = g?.[s.id];
    if (!v || v === 'ABS' || v === '') continue;
    sw += (parseFloat(v) / s.max) * maxScale * (s.coef || 1);
    tc += s.coef || 1;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
};

// Système éducatif équato-guinéen : notes /10 par défaut (modèle espagnol),
// mais l'administrateur peut choisir /20 (maxScale) et activer/désactiver les
// coefficients (useCoef, ex. désactivés au primaire). Défauts = /10 + coef
// pour préserver le comportement existant.
export const calcES = (g, subs, maxScale = 10, useCoef = true) => {
  ({ g, subs } = resolveScores(g, subs));
  let sw = 0, tc = 0;
  for (const s of subs) {
    const v = g?.[s.id];
    if (!v || v === 'ABS' || v === '') continue;
    const coef = useCoef ? (s.coef || 1) : 1;
    sw += (parseFloat(v) / s.max) * maxScale * coef;
    tc += coef;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
};

// opts : { maxScale, useCoef } — maxScale = barème de sortie de la classe.
// Défauts par système si absent : FR /20, EN /100, ES /10.
export const getAvg = (g, subs, sys, opts = {}) => {
  if (sys === 'EN') return calcEN(g, subs, opts.maxScale ?? 100);
  if (sys === 'ES') return calcES(g, subs, opts.maxScale ?? 10, opts.useCoef ?? true);
  return calcFR(g, subs, opts.maxScale ?? 20);
};

// --- Moyenne sur plusieurs séquences ---
// seqs = [1, 2] ou [1,2,3,4,5,6] selon le trimestre voulu

export const multiAvg = (allGrades, classId, studentId, seqs, subs, sys, opts = {}) => {
  const vals = seqs
    .map((i) => getAvg(allGrades[`${classId}_${studentId}_${i}`] || {}, subs, sys, opts))
    .filter((x) => x !== null);
  return vals.length
    ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
    : null;
};

// Fusionne les notes de plusieurs séquences en une seule grille (moyenne par
// matière). Les enfants sont fusionnés AUSSI (pour l'affichage détaillé), puis
// chaque parent est recalculé depuis ses enfants fusionnés. Les moyennes via
// calc*/getAvg restent correctes (resolveScores exclut les enfants).
export const fusedG = (allGrades, classId, studentId, seqs, subs) => {
  const out = {};
  subs.forEach((s) => {
    const sc = seqs
      .map((i) => {
        const v = (allGrades[`${classId}_${studentId}_${i}`] || {})[s.id];
        return !v || v === 'ABS' || v === '' ? null : parseFloat(v);
      })
      .filter((x) => x !== null);
    if (sc.length) {
      out[s.id] = String(Math.round((sc.reduce((a, b) => a + b, 0) / sc.length) * 100) / 100);
    }
  });
  // Recompose les parents à partir des enfants fusionnés.
  if (subs.some((s) => s.parent_id)) {
    const byParent = new Map();
    subs.forEach((s) => {
      if (!s.parent_id) return;
      if (!byParent.has(s.parent_id)) byParent.set(s.parent_id, []);
      byParent.get(s.parent_id).push(s);
    });
    for (const p of subs) {
      if (p.parent_id) continue;
      const kids = byParent.get(p.id);
      if (!kids?.length) continue;
      const v = composeParent(out, p, kids, p.calc_method);
      if (v === null) delete out[p.id]; else out[p.id] = String(v);
    }
  }
  return out;
};

// --- Appréciations ---

// Barème par défaut (FR) — identique à celui affiché dans Paramètres
export const DEFAULT_GRADE_SCALE = [
  { id: '1', mention: 'Expert',                 min: 17,   max: 20,    couleur: '#10B981', ordre: 1 },
  { id: '2', mention: 'Acquis',                 min: 14,   max: 16.99, couleur: '#3B82F6', ordre: 2 },
  { id: '3', mention: "En cours d'acquisition", min: 12,   max: 13.99, couleur: '#F59E0B', ordre: 3 },
  { id: '4', mention: 'Non acquis',             min: 10,   max: 11.99, couleur: '#EF4444', ordre: 4 },
  { id: '5', mention: 'Insuffisant',            min: 0,    max: 9.99,  couleur: '#9CA3AF', ordre: 5 },
];

// Apreciaciones officielles MEC (Guinea Ecuatorial) — barème sobre 10.
export const ES_GRADE_SCALE = [
  { mention: 'Sobresaliente', min: 9,   max: 10,   couleur: '#10B981' },
  { mention: 'Notable',       min: 7,   max: 8.99, couleur: '#3B82F6' },
  { mention: 'Bien',          min: 6,   max: 6.99, couleur: '#8B5CF6' },
  { mention: 'Suficiente',    min: 5,   max: 5.99, couleur: '#F59E0B' },
  { mention: 'Insuficiente',  min: 0,   max: 4.99, couleur: '#EF4444' },
];

// maxScale = 10 (défaut) ou 20 : les bornes des apreciaciones sont mises à
// l'échelle proportionnellement (ex. Sobresaliente 9-10 → 18-20 sur /20).
export const esGrade = (avg, maxScale = 10) => {
  if (avg === null || avg === undefined) return { text: '—', col: '#6b7280' };
  const f = maxScale / 10;
  const hit = ES_GRADE_SCALE.find((s) => avg >= s.min * f && avg <= s.max * f);
  return hit ? { text: hit.mention, col: hit.couleur } : { text: '—', col: '#6b7280' };
};

// Bande du barème configurable (school.grade_scale, sinon DEFAULT_GRADE_SCALE)
// correspondant à une moyenne sur /20. Renvoie l'entrée complète
// { mention, min, max, couleur } — utile quand on a besoin de l'INTERVALLE
// [Min–Max] en plus du libellé (bulletin APC). Renvoie null si non noté.
export const gradeScaleBand = (avg, gradeScale) => {
  if (avg === null || avg === undefined) return null;
  const scale  = Array.isArray(gradeScale) && gradeScale.length ? gradeScale : DEFAULT_GRADE_SCALE;
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((e) => avg >= e.min && avg <= e.max)
    || (avg >= sorted[0].min ? sorted[0] : sorted[sorted.length - 1]);
};

// Utilise le barème personnalisé (school.grade_scale) si disponible,
// sinon DEFAULT_GRADE_SCALE. Pour EN → enGrade, pour ES → esGrade.
export const getAppreciation = (avg, gradeScale, sys, maxScale = 10) => {
  if (sys === 'EN') return enGrade(avg);
  if (sys === 'ES') return esGrade(avg, maxScale);
  if (avg === null) return { text: '—', col: '#6b7280' };
  const scale  = Array.isArray(gradeScale) && gradeScale.length ? gradeScale : DEFAULT_GRADE_SCALE;
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  const match  = sorted.find((e) => avg >= e.min && avg <= e.max);
  if (match) return { text: match.mention, col: match.couleur };
  return avg >= sorted[0].min
    ? { text: sorted[0].mention, col: sorted[0].couleur }
    : { text: sorted[sorted.length - 1].mention, col: sorted[sorted.length - 1].couleur };
};

export const frApp = (a) => {
  if (a === null) return { text: '—',              col: '#6b7280' };
  if (a >= 18)   return { text: 'Excellent',       col: '#059669' };
  if (a >= 16)   return { text: 'Très Bien',       col: '#10b981' };
  if (a >= 14)   return { text: 'Bien',            col: '#3b82f6' };
  if (a >= 12)   return { text: 'Assez Bien',      col: '#8b5cf6' };
  if (a >= 10)   return { text: 'Passable',        col: '#f59e0b' };
  if (a >= 8)    return { text: 'Insuffisant',     col: '#f97316' };
  return          { text: 'Très Insuffisant',       col: '#ef4444' };
};

export const enGrade = (p) => {
  if (p === null) return { g: '—',  col: '#6b7280', txt: 'No Grade'   };
  if (p >= 80)    return { g: 'A1', col: '#059669', txt: 'Excellent'  };
  if (p >= 75)    return { g: 'A2', col: '#10b981', txt: 'Very Good'  };
  if (p >= 70)    return { g: 'B2', col: '#3b82f6', txt: 'Good'       };
  if (p >= 65)    return { g: 'B3', col: '#6366f1', txt: 'Credit'     };
  if (p >= 60)    return { g: 'C4', col: '#8b5cf6', txt: 'Credit'     };
  if (p >= 55)    return { g: 'C5', col: '#a78bfa', txt: 'Credit'     };
  if (p >= 50)    return { g: 'C6', col: '#f59e0b', txt: 'Average'    };
  if (p >= 45)    return { g: 'D7', col: '#f97316', txt: 'Pass'       };
  if (p >= 40)    return { g: 'E8', col: '#ef4444', txt: 'Weak Pass'  };
  return           { g: 'F9', col: '#dc2626', txt: 'Fail'        };
};

// --- Statistiques de classe ---

export const clsStat = (studs, allGrades, classId, seqs, subs, sys, excl = {}, opts = {}) => {
  const vals = studs
    .filter((s) => !excl[`${classId}_${s.id}`])
    .map((s) => multiAvg(allGrades, classId, s.id, seqs, subs, sys, opts))
    .filter((x) => x !== null);

  if (!vals.length) return { min: null, max: null, avg: null, above: 0, total: studs.length };

  // Seuil de réussite = moitié du barème de sortie (FR 10/20, EN 50/100, ES 5/10).
  const defScale = sys === 'EN' ? 100 : sys === 'ES' ? 10 : 20;
  const pass = (opts.maxScale ?? defScale) / 2;
  return {
    min:   Math.round(Math.min(...vals) * 100) / 100,
    max:   Math.round(Math.max(...vals) * 100) / 100,
    avg:   Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
    above: vals.filter((a) => a >= pass).length,
    total: studs.length,
  };
};

// --- Classement ---

export const buildRanks = (studs, allGrades, classId, seqs, subs, sys, excl = {}, opts = {}) => {
  const wa = studs.map((s) => ({
    ...s,
    excluded: !!excl[`${classId}_${s.id}`],
    av: excl[`${classId}_${s.id}`]
      ? null
      : multiAvg(allGrades, classId, s.id, seqs, subs, sys, opts),
  }));

  wa.sort((a, b) => {
    if (a.av === null && b.av === null) return 0;
    if (a.av === null) return 1;
    if (b.av === null) return -1;
    return b.av - a.av;
  });

  let rk = 1;
  wa.forEach((s, i) => {
    if (s.av === null) { s.rankD = '—'; return; }
    if (i > 0 && wa[i - 1].av !== null && s.av < wa[i - 1].av) rk = i + 1;
    s.rankD = `${rk}${rk === 1 ? 'er' : 'ème'}`;
  });

  return wa;
};

// --- Décision annuelle Guinée Équatoriale (règle officielle de promotion) ---
// ESBA / Bachillerato : passage avec un maximum de 2 matières non validées,
// SAUF si ce sont simultanément Matemáticas et Lengua Española. Sinon, les
// matières non validées passent à l'examen de recuperación.
// subjects        : [{ id, name }]
// gradesOnScale    : { [subjectId]: note sur l'échelle (ou null si non noté) }
// passThreshold    : seuil de réussite (ex. 5 sur /10, 10 sur /20)
// Renvoie 'aprobado' | 'recuperacion'.
const _norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const geAnnualDecision = (subjects, gradesOnScale, passThreshold) => {
  const failed = (subjects || []).filter((s) => {
    const g = gradesOnScale?.[s.id];
    return g !== null && g !== undefined && g < passThreshold;
  });
  if (failed.length === 0) return 'aprobado';
  const hasMath   = failed.some((s) => /matematic|\bmath/.test(_norm(s.name)));
  const hasLengua = failed.some((s) => /lengua|espanol|castellano/.test(_norm(s.name)));
  if (failed.length <= 2 && !(hasMath && hasLengua)) return 'aprobado';
  return 'recuperacion';
};
