// BLOC « mes classes » — vue de l'enseignant. Déplacé depuis Dashboard.jsx sans
// changement de comportement : progression des saisies, matières, élèves en
// difficulté. Le store est déjà filtré sur les classes de l'enseignant.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { clsStat } from '../../core/bulletinEngine';

function latestSeqWithData(classId, studentIds, gradeMap) {
  for (let seq = 6; seq >= 1; seq--) {
    if (studentIds.some((id) => Object.keys(gradeMap[`${classId}_${id}_${seq}`] || {}).length > 0)) {
      return seq;
    }
  }
  return null;
}

export default function TeacherClasses({ classes, students, subjects, gradeMap }) {
  const t = useT();

  const data = useMemo(() => classes.map((cls) => {
    const studs = students.filter((s) => s.class_id === cls.id);
    const subs  = subjects.filter((s) => s.class_id === cls.id);
    const sys   = cls.system || 'FR';
    const pass  = sys === 'FR' ? 10 : 50;
    const max   = sys === 'FR' ? 20 : 100;
    const seqs  = cls.cycle !== 'secondaire' ? [1, 2, 3] : sys === 'EN' ? [1, 2, 3] : [1, 2, 3, 4, 5, 6];

    const latestSeq = latestSeqWithData(cls.id, studs.map((s) => s.id), gradeMap);

    const stats = latestSeq !== null && studs.length && subs.length
      ? clsStat(studs, gradeMap, cls.id, [latestSeq], subs, sys)
      : null;

    const seqProgress = subs.length && studs.length ? seqs.map((seq) => {
      const total   = studs.length * subs.length;
      const entered = studs.reduce((n, stu) => {
        const g = gradeMap[`${cls.id}_${stu.id}_${seq}`] || {};
        return n + subs.filter((sub) => { const v = g[sub.id]; return v !== undefined && v !== null && v !== '' && v !== 'ABS'; }).length;
      }, 0);
      return { seq, entered, total, pct: total > 0 ? Math.round((entered / total) * 100) : 0 };
    }) : [];

    // Élèves en difficulté dans la dernière séquence avec données
    const struggling = latestSeq !== null ? studs
      .map((stu) => {
        const stat = clsStat([stu], gradeMap, cls.id, [latestSeq], subs, sys);
        return { stu, avg: stat?.avg ?? null };
      })
      .filter(({ avg }) => avg !== null && avg < pass)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 5)
      : [];

    return { cls, studs, subs, sys, pass, max, latestSeq, stats, seqProgress, struggling };
  }), [classes, students, subjects, gradeMap]);

  const seqLabel = (sys, seq) => (sys === 'EN' ? `Term ${seq}` : t(`Séquence ${seq}`, `Sequence ${seq}`));

  if (data.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-10 text-center">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-amber-800 font-semibold mb-1">{t('Aucune classe assignée', 'No class assigned')}</p>
        <p className="text-amber-600 text-sm">{t("L'administrateur doit vous assigner des matières / classes.", 'The administrator needs to assign you subjects and classes.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {data.map(({ cls, studs, subs, sys, pass, max, latestSeq, stats, seqProgress, struggling }) => (
        <div key={cls.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* En-tête classe */}
          <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-5 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-brand-200 text-xs font-semibold uppercase tracking-wider mb-1">
                  {data.length > 1 ? t('Classe', 'Class') : t('Votre classe', 'Your class')}
                </p>
                <h2 className="text-2xl font-bold">{cls.name}</h2>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="bg-white/20 rounded-lg px-3 py-1 text-xs font-semibold">
                    {studs.length} {t('élève', 'student')}{studs.length !== 1 ? 's' : ''}
                  </span>
                  <span className="bg-white/20 rounded-lg px-3 py-1 text-xs font-semibold">
                    {subs.length} {t('matière', 'subject')}{subs.length !== 1 ? 's' : ''}
                  </span>
                  <span className="bg-white/20 rounded-lg px-3 py-1 text-xs font-semibold">
                    {sys === 'FR' ? 'FR /20' : 'EN /100'}
                  </span>
                </div>
              </div>
              {stats && (
                <div className="text-right shrink-0">
                  <p className="text-brand-200 text-xs mb-1">
                    {sys === 'EN' ? `Term ${latestSeq}` : `${t('Séq', 'Seq')} ${latestSeq}`} — {t('Moy. classe', 'Class avg.')}
                  </p>
                  <p className={`text-3xl font-bold ${stats.avg >= pass ? 'text-emerald-300' : 'text-red-300'}`}>
                    {stats.avg?.toFixed(2)}
                    <span className="text-base font-normal text-white/50">/{max}</span>
                  </p>
                  <p className="text-brand-200 text-xs mt-1">
                    {stats.above}/{stats.total} {t('admis', 'passed')}
                    {stats.total > 0 && ` (${Math.round((stats.above / stats.total) * 100)}%)`}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4 pt-4 border-t border-white/20">
              <Link
                to="/app/grades"
                className="inline-flex items-center gap-1.5 bg-white text-brand-700 font-semibold text-xs px-4 py-2 rounded-lg hover:bg-brand-50 transition-colors shadow-sm"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                {t('Saisir les notes', 'Enter grades')}
              </Link>
              <Link
                to="/app/bulletins"
                className="inline-flex items-center gap-1.5 bg-white/20 text-white font-semibold text-xs px-4 py-2 rounded-lg hover:bg-white/30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                {t('Bulletins', 'Report cards')}
              </Link>
            </div>
          </div>

          {/* Progression des saisies */}
          {seqProgress.some((s) => s.total > 0) && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('Progression des saisies', 'Entry progress')}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {seqProgress.map(({ seq, entered, total, pct }) => (
                  <div key={seq} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-500">{seqLabel(sys, seq)}</span>
                      <span className={`font-bold text-xs ${pct === 100 ? 'text-emerald-600' : pct > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                        {pct > 0 ? `${pct}%` : '—'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-200'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">{entered}/{total}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matières + Élèves en difficulté côte à côte */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">

            {subs.length > 0 && (
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('Mes matières', 'My subjects')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {subs.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 border border-brand-100 rounded-lg text-xs text-brand-800">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-brand-400">·{s.coef}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {t('Élèves en difficulté', 'Struggling students')}
                {latestSeq && <span className="ml-1 font-normal normal-case text-gray-400">— {seqLabel(sys, latestSeq)}</span>}
              </p>
              {struggling.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  {latestSeq === null
                    ? t('Aucune note saisie.', 'No grades entered yet.')
                    : t('Tous les élèves sont au-dessus du seuil.', 'All students are above the threshold.')}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {struggling.map(({ stu, avg }) => (
                    <div key={stu.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700 truncate">{stu.name}</span>
                      <span className="shrink-0 px-2 py-0.5 bg-red-50 border border-red-100 rounded text-xs font-bold text-red-600">
                        {avg?.toFixed(2)}/{max}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      ))}
    </div>
  );
}
