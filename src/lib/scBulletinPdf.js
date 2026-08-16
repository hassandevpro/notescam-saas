// Impression des bulletins SECOND CYCLE MINESEC (un ou plusieurs élèves).
// Passe par le SOCLE D'IMPRESSION (lib/print) — sortie vectorielle, mêmes marges
// et mêmes règles de saut que tous les autres documents — et par le moteur de
// notes classique pour les rangs, statistiques et moyennes.

import { printSheets, PRINT_RESULT, chunk, BATCH_SIZE } from './print';
import { fusedG, multiAvg, buildRanks, clsStat } from '../core/bulletinEngine';
import { scDisciplineConseil } from '../core/scEngine';
import { teacherIndexById } from './teacherNames';
import { buildScBulletinSheet } from './scBulletinDoc';

const ord = (n) => `${n}${n === 1 ? 'er' : 'e'}`;

// Rangs PAR MATIÈRE sur la classe : subjectRanks[subjectId][studentId] = "3e".
// + stats par matière (min/max) pour la colonne [Min–Max].
// Exporté aussi pour l'aperçu écran (BulletinScOfficial), pas seulement le PDF.
export function perSubjectRanksAndStats(subjects, allGrades, classId, seqs, students, excl = {}) {
  const ranks = {}; const stats = {};
  for (const s of (subjects || [])) {
    if (s.parent_id) continue;
    const arr = [];
    for (const st of students) {
      if (excl[`${classId}_${st.id}`]) continue;
      const fg = fusedG(allGrades, classId, st.id, seqs, [s]);
      const v = fg[s.id];
      if (v != null && v !== '') arr.push({ id: st.id, av: Number(v) });
    }
    if (!arr.length) continue;
    arr.sort((a, b) => b.av - a.av);
    const r = {}; let rk = 1;
    arr.forEach((e, i) => {
      if (i > 0 && e.av < arr[i - 1].av) rk = i + 1;
      r[e.id] = ord(rk);
    });
    ranks[s.id] = r;
    stats[s.id] = { min: arr[arr.length - 1].av, max: arr[0].av };
  }
  return { ranks, stats };
}

// Profil de classe (moyennes générales) pour le trimestre. Exporté pour l'aperçu écran.
export function classProfile(subjects, allGrades, classId, seqs, students, sys, opts, excl = {}) {
  const st = clsStat(students, allGrades, classId, seqs, subjects, sys, excl, opts);
  if (st.avg == null) return null;
  return { min: st.min, max: st.max, avg: st.avg, count: st.above + (st.total - st.above), rate: st.total ? Math.round((st.above / st.total) * 100) : 0 };
}

// ctx : { subjects, allGrades, classId, seqs, students, targetStudents, school,
//   sys, trimestreId, classLabel, serieLabel, effectif, profPrincipal, opts,
//   gradeScale, excl, decisions, teachers, title, onProgress, batchIndex }
// Renvoie { result, pages, batches } — l'appelant traduit le résultat.
export async function exportScTrimesterBulletins(ctx = {}) {
  const {
    subjects, allGrades, classId, seqs, students, targetStudents,
    school, sys = 'FR', trimestreId = 't1', classLabel, serieLabel, effectif,
    profPrincipal, opts = {}, gradeScale, excl = {}, decisions = {}, teachers = [],
    title, onProgress, batchIndex = 0,
  } = ctx;

  const teachersById = teacherIndexById(teachers);
  const { ranks: subjectRanks, stats: subjectStats } =
    perSubjectRanksAndStats(subjects, allGrades, classId, seqs, students, excl);
  const classStats = classProfile(subjects, allGrades, classId, seqs, students, sys, opts, excl);

  // Rang général (classement de la classe sur la moyenne générale).
  const ranked = buildRanks(students, allGrades, classId, seqs, subjects, sys, excl, opts);
  const generalRankById = Object.fromEntries(ranked.map((s) => [s.id, s.rankD]));

  // Seuil de réussite (FR /20 → 10) pour la décision dérivée par défaut.
  const pass = (opts.maxScale ?? (sys === 'EN' ? 100 : 20)) / 2;
  const isAnnual = (seqs?.length || 0) >= 4;

  // Découpage sur les ÉLÈVES : les pages d'un même bulletin ne sont jamais
  // séparées entre deux lots.
  const all = targetStudents?.length ? targetStudents : students;
  const batches = chunk(all || [], Math.max(1, Math.floor(BATCH_SIZE / 2)));
  const list = batches[batchIndex] || [];
  if (!list.length) return { result: PRINT_RESULT.EMPTY, pages: 0, batches: batches.length };

  let built = 0;
  const sheets = list.map((student) => {
    const discipline = scDisciplineConseil(allGrades, classId, student.id, seqs);
    // Décision : saisie explicite > décision lue (conseil) > déduction annuelle.
    const avg = multiAvg(allGrades, classId, student.id, seqs, subjects, sys, opts);
    const fallback = isAnnual && avg != null ? (avg >= pass ? 'Admis(e)' : '') : '';
    return buildScBulletinSheet({
      subjects, allGrades, classId, student, seqs, sys, opts, gradeScale,
      subjectRanks, subjectStats, classStats, teachersById,
      generalRank: generalRankById[student.id],
      school, trimestreId, classLabel, serieLabel,
      effectif: effectif ?? students.length, profPrincipal,
      discipline,
      decision: decisions[student.id] || discipline.decision || fallback,
    });
  });
  built = sheets.length;
  onProgress?.(built, list.length);

  if (!sheets.length) return { result: PRINT_RESULT.EMPTY, pages: 0, batches: batches.length };
  // `fit` : le bulletin officiel tient sur UNE page ; une feuille qui dépasse de
  // peu est ajustée proportionnellement plutôt que coupée.
  const result = printSheets(sheets, title || `Bulletins — ${classLabel || classId} — ${trimestreId}`, { profile: 'bulletin', fit: true });
  return { result, pages: sheets.length, batches: batches.length };
}

// Petit helper exporté pour les vues : moyenne générale d'un élève (trimestre).
export const scStudentAverage = (allGrades, classId, studentId, seqs, subjects, sys, opts) =>
  multiAvg(allGrades, classId, studentId, seqs, subjects, sys, opts);
