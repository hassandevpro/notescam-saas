// RAPPORT D'UNE CLASSE POUR UNE PÉRIODE, QUEL QUE SOIT SON MOTEUR — adaptateur partagé.
//
// COPIE CONFORME de apprFor + computeClassReport de pages/Reports.jsx (origin/main 970b986),
// pour que les TABLEAUX D'HONNEUR lisent exactement les moyennes et les rangs des rapports de
// classe : classique, lycée, collège APC, primaire MINEDUB. Reports.jsx garde sa propre copie
// dans cette livraison (non modifié) ; toute évolution de l'une doit être reportée dans l'autre.
import { masquesCriteresPour } from '../core/primCriteresMasques';
import { frApp, enGrade, esGrade } from '../core/bulletinEngine';
import { resolveCountryCode } from '../countries';
import { gradingOpts, geGradeMax } from './useCountry';
import { bulletinScale, convertirEchelle } from '../core/bulletinScale';
import { resolveClassEngine } from '../core/engineResolver';
import { buildClassReport } from './classReportEngine';
import { bySubjectOrder } from '../core/subjectOrder';

export function apprFor(row, sys, maxScale) {
  if (row.avg === null || row.avg === undefined) return null;
  if (row.cote) return { text: row.appreciation || row.cote, g: row.cote, col: null };
  return sys === 'ES' ? esGrade(row.avg, maxScale) : sys === 'FR' ? frApp(row.avg) : enGrade(convertirEchelle(row.avg, maxScale, 100));
}
export function computeClassReport(cls, period, ctx) {
  const { school, students, subjects } = ctx;
  const sys   = cls?.system || 'FR';
  const isGE  = resolveCountryCode(school) === 'guinea_eq';
  const gOpts = { ...gradingOpts(school, cls?.cycle), ...(sys === 'EN' ? { maxScale: bulletinScale(cls, sys, geGradeMax(school)).maxScale } : {}) };
  const engine = resolveClassEngine(school, cls);

  const classSubjects = subjects.filter((s) => s.class_id === cls.id)
    .sort(bySubjectOrder);
  const classStudents = students.filter((s) => s.class_id === cls.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!classStudents.length) return null;

  const report = buildClassReport({
    engine, cls, students: classStudents, subjects: classSubjects, period,
    gradeMap:        ctx.gradeMap,
    apcNotes:        ctx.apcNotes,
    apcReferentiel:  ctx.apcReferentiel,
    primNotes:       ctx.primNotes,
    primReferentiel: ctx.primReferentiel,
    matObservations: ctx.matObservations,
    apcMasques:      ctx.apcMasques,
    primMasques:     ctx.primMasques,
    primMasquesClasse: ctx.primMasquesClasse,
    primCriteresMasques: masquesCriteresPour(ctx.primCriteresMasques, ctx.critMasquesParClasse, cls?.id),
    primNonEvaluees: ctx.primNonEvaluees,
    zeroSiManquante: ctx.zeroSiManquante,
    moyennePoints: ctx.moyennePoints,
    sys, gOpts,
    scaleMax:      bulletinScale(cls, sys, geGradeMax(school)).maxScale,
    passThreshold: bulletinScale(cls, sys, geGradeMax(school)).passThreshold,
    gradeScale:    school?.grade_scale,
  });
  if (!report.ready || !report.columns.length) {
    return { engine, report, classStudents, classSubjects, isGE, sys, notReady: true };
  }

  const maxScale      = report.scaleMax;
  const passThreshold = report.passThreshold;

  // Forme historique consommée par l'écran et le document imprimé. Les colonnes
  // d'un moteur officiel (matières APC, compétences MINEDUB) y prennent la place
  // des matières : mêmes clés (`id`, `name`, `coef`, `max`), même rendu.
  const studentResults = report.rows
    .map((r) => ({ ...r, appr: apprFor(r, sys, maxScale) }))
    .sort((a, b) => (a.avg === null && b.avg === null) ? 0 : a.avg === null ? 1 : b.avg === null ? -1 : b.avg - a.avg);
  const subjectStats = report.columnStats.map(({ col, ...rest }) => ({ sub: col, ...rest }));

  return {
    engine, report, notReady: false,
    kind: report.kind,
    stats: report.classStats, studentResults, subjectStats,
    classStudents, classSubjects: report.columns,
    distribution: report.distribution,
    maxScale, passThreshold, sys, isGE,
  };
}