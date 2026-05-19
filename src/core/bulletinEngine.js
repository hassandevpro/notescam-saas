// Bulletin engine — logique métier pure (pas de React, pas de DOM).
// Migré depuis NotesCam-Pro/src/react/core/bulletinEngine.js.
//
// g       = { [subjectId]: value }  — value est un string numérique ou "ABS"
// subs    = [{ id, name, coef, max }]
// sys     = "FR" | "EN"
// allGrades = { "classId_studentId_seq": g }
// excl    = { "classId_studentId": true }  — élèves exclus du classement

// --- Calcul de moyenne séquentielle ---

export const calcFR = (g, subs) => {
  let sw = 0, tc = 0;
  for (const s of subs) {
    const v = g?.[s.id];
    if (!v || v === 'ABS' || v === '') continue;
    sw += (parseFloat(v) / s.max) * 20 * s.coef;
    tc += s.coef;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
};

export const calcEN = (g, subs) => {
  let sw = 0, tc = 0;
  for (const s of subs) {
    const v = g?.[s.id];
    if (!v || v === 'ABS' || v === '') continue;
    sw += (parseFloat(v) / s.max) * 100 * (s.coef || 1);
    tc += s.coef || 1;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
};

export const getAvg = (g, subs, sys) =>
  sys === 'FR' ? calcFR(g, subs) : calcEN(g, subs);

// --- Moyenne sur plusieurs séquences ---
// seqs = [1, 2] ou [1,2,3,4,5,6] selon le trimestre voulu

export const multiAvg = (allGrades, classId, studentId, seqs, subs, sys) => {
  const vals = seqs
    .map((i) => getAvg(allGrades[`${classId}_${studentId}_${i}`] || {}, subs, sys))
    .filter((x) => x !== null);
  return vals.length
    ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
    : null;
};

// Fusionne les notes de plusieurs séquences en une seule grille (moyenne par matière)
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

// Utilise le barème personnalisé (school.grade_scale) si disponible,
// sinon DEFAULT_GRADE_SCALE. Pour EN, toujours enGrade.
export const getAppreciation = (avg, gradeScale, sys) => {
  if (sys === 'EN') return enGrade(avg);
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

export const clsStat = (studs, allGrades, classId, seqs, subs, sys, excl = {}) => {
  const vals = studs
    .filter((s) => !excl[`${classId}_${s.id}`])
    .map((s) => multiAvg(allGrades, classId, s.id, seqs, subs, sys))
    .filter((x) => x !== null);

  if (!vals.length) return { min: null, max: null, avg: null, above: 0, total: studs.length };

  const pass = sys === 'FR' ? 10 : 50;
  return {
    min:   Math.round(Math.min(...vals) * 100) / 100,
    max:   Math.round(Math.max(...vals) * 100) / 100,
    avg:   Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
    above: vals.filter((a) => a >= pass).length,
    total: studs.length,
  };
};

// --- Classement ---

export const buildRanks = (studs, allGrades, classId, seqs, subs, sys, excl = {}) => {
  const wa = studs.map((s) => ({
    ...s,
    excluded: !!excl[`${classId}_${s.id}`],
    av: excl[`${classId}_${s.id}`]
      ? null
      : multiAvg(allGrades, classId, s.id, seqs, subs, sys),
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
