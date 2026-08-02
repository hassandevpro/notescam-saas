// BLOCS pédagogiques & frais du tableau de bord (direction : admin / censeur).
// Le calcul vit dans `useAcademicStats` ; les composants ne font que dessiner.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { clsStat } from '../../core/bulletinEngine';
import { feeDashboard } from '../../lib/feeEngine';
import { StatCard, BlockCard, CountPill, EmptyHint } from './shared';

const SEQ_LABELS_FR = { 1: 'Séq 1', 2: 'Séq 2', 3: 'Séq 3', 4: 'Séq 4', 5: 'Séq 5', 6: 'Séq 6' };
const SEQ_LABELS_EN = { 1: 'Term 1', 2: 'Term 2', 3: 'Term 3' };
const seqLabel = (sys, seq) => (sys === 'EN' ? SEQ_LABELS_EN : SEQ_LABELS_FR)[seq];

function latestSeqWithData(classId, studentIds, gradeMap) {
  for (let seq = 6; seq >= 1; seq--) {
    if (studentIds.some((id) => Object.keys(gradeMap[`${classId}_${id}_${seq}`] || {}).length > 0)) {
      return seq;
    }
  }
  return null;
}

// Agrégats académiques + frais de l'établissement (périmètre déjà appliqué par le store).
export function useAcademicStats({ classes, subjects, students, gradeMap, fees, getClassFeeGrid }) {
  const classStats = useMemo(() => classes.map((cls) => {
    const subs  = subjects.filter((s) => s.class_id === cls.id);
    const studs = students.filter((s) => s.class_id === cls.id);
    const sys   = cls.system || 'FR';
    const seq   = latestSeqWithData(cls.id, studs.map((s) => s.id), gradeMap);
    const stats = seq !== null ? clsStat(studs, gradeMap, cls.id, [seq], subs, sys) : null;
    return { cls, subs, studs, sys, seq, stats };
  }), [classes, subjects, students, gradeMap]);

  const globalPassRate = useMemo(() => {
    const all = classStats.filter((c) => c.stats !== null);
    if (!all.length) return null;
    const total  = all.reduce((s, c) => s + c.stats.total, 0);
    const passed = all.reduce((s, c) => s + c.stats.above, 0);
    return total ? Math.round((passed / total) * 100) : null;
  }, [classStats]);

  const feesStats = useMemo(() => {
    const feeMap = {};
    (fees || []).forEach((f) => { feeMap[f.student_id] = f; });
    // Moteur tarifaire : taux de recouvrement + nombre d'élèves en retard
    // (échéances passées non couvertes), grille de classe prise en compte.
    const entries = students.map((s) => ({ student: s, fee: feeMap[s.id], grid: getClassFeeGrid(s.class_id) }));
    const dash = feeDashboard(entries);
    const rate = dash.expected > 0 ? Math.round((dash.collected / dash.expected) * 100) : null;
    return { rate, late: dash.lateTotal, expected: dash.expected, collected: dash.collected };
  }, [fees, students, getClassFeeGrid]);

  const missingGrades = useMemo(() => classStats
    .filter(({ studs, subs }) => studs.length > 0 && subs.length > 0)
    .map(({ cls, subs, studs, seq }) => {
      const nextSeq = seq === null ? 1 : seq < 6 ? seq + 1 : null;
      if (nextSeq === null) return null;
      const expected = studs.length * subs.length;
      const entered = studs.reduce((count, stu) => {
        const grades = gradeMap[`${cls.id}_${stu.id}_${nextSeq}`] || {};
        return count + subs.filter((sub) => {
          const v = grades[sub.id];
          return v !== undefined && v !== null && v !== '' && v !== 'ABS';
        }).length;
      }, 0);
      return entered < expected ? { cls, nextSeq, entered, expected } : null;
    })
    .filter(Boolean), [classStats, gradeMap]);

  return { classStats, globalPassRate, feesStats, missingGrades };
}

// ── Chiffres académiques ────────────────────────────────────────────────────
export function AcademicsStats({ loading, classes, students, globalPassRate }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard icon="classes" accent="brand" to="/app/classes"
        label={t('Classes', 'Classes')} value={loading ? '—' : classes.length} sub={t('configurées', 'configured')} />
      <StatCard icon="students" accent="green" to="/app/students"
        label={t('Élèves', 'Students')} value={loading ? '—' : students.length} sub={t('inscrits', 'enrolled')} />
      <StatCard icon="pass" accent="purple" to="/app/reports"
        label={t('Taux de réussite', 'Pass rate')}
        value={loading ? '—' : globalPassRate !== null ? `${globalPassRate}%` : '—'}
        sub={t('toutes classes', 'all classes')} />
    </div>
  );
}

// ── Recouvrement des frais ──────────────────────────────────────────────────
export function FeesBlock({ loading, feesStats }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <StatCard icon="fees" accent="amber" to="/app/fees"
        label={t('Recouvrement frais', 'Fee collection')}
        value={loading ? '—' : feesStats.rate !== null ? `${feesStats.rate}%` : '—'}
        sub={t('sur les échéances dues', 'of amounts due')} />
      <StatCard icon="fees" accent={feesStats.late > 0 ? 'rose' : 'green'} to="/app/fees"
        label={t('Élèves en retard', 'Overdue students')}
        value={loading ? '—' : feesStats.late}
        sub={feesStats.late > 0 ? t('à relancer', 'to follow up') : t('À jour', 'Up to date')} />
    </div>
  );
}

// ── Notes à compléter ───────────────────────────────────────────────────────
export function GradesTodo({ items }) {
  const t = useT();
  if (!items.length) return null;
  return (
    <BlockCard
      tone="amber"
      title={<span className="inline-flex items-center gap-2">{t('Notes à compléter', 'Grades to complete')} <CountPill n={items.length} /></span>}
      subtitle={t('Séquence en cours par classe', 'Current sequence per class')}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {items.map(({ cls, nextSeq, entered, expected }) => {
          const pct = Math.round((entered / expected) * 100);
          return (
            <Link key={cls.id} to="/app/grades"
              className="bg-white rounded-lg p-3 border border-amber-200 hover:border-amber-400 hover:shadow-sm transition-all group">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-800 text-sm group-hover:text-amber-700">{cls.name}</span>
                <span className="text-xs text-amber-600 font-medium bg-amber-100 px-1.5 py-0.5 rounded">
                  {seqLabel(cls.system, nextSeq)}
                </span>
              </div>
              <div className="w-full bg-amber-100 rounded-full h-1.5 mb-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-gray-500">
                {entered}/{expected} {t('notes saisies', 'grades entered')}
                <span className="ml-1 text-amber-600 font-medium">({pct}%)</span>
              </div>
            </Link>
          );
        })}
      </div>
    </BlockCard>
  );
}

// ── Aperçu par classe ───────────────────────────────────────────────────────
export function ClassTable({ classStats }) {
  const t = useT();
  if (!classStats.length) {
    return (
      <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
        <div className="text-4xl mb-3">🏫</div>
        <p className="text-gray-600 font-medium mb-1">{t('Aucune classe configurée', 'No class configured')}</p>
        <p className="text-gray-400 text-sm mb-4">{t('Commencez par créer vos classes et matières.', 'Start by creating your classes and subjects.')}</p>
        <Link to="/app/classes" className="btn-primary text-sm">{t('Créer une classe', 'Create a class')}</Link>
      </div>
    );
  }
  return (
    <BlockCard
      title={t('Aperçu par classe', 'Class overview')}
      subtitle={t('Statistiques de la dernière période avec des notes', 'Statistics from the last period with grades')}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3">{t('Classe', 'Class')}</th>
              <th className="px-4 py-3 text-center">{t('Élèves', 'Students')}</th>
              <th className="px-4 py-3 text-center">{t('Matières', 'Subjects')}</th>
              <th className="px-4 py-3 text-center">{t('Dernière période', 'Last period')}</th>
              <th className="px-4 py-3 text-center">{t('Moy. classe', 'Class avg.')}</th>
              <th className="px-4 py-3 text-center">{t('Réussite', 'Pass rate')}</th>
              <th className="px-4 py-3 text-center">{t('Actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {classStats.map(({ cls, subs, studs, sys, seq, stats }) => {
              const pass = sys === 'FR' ? 10 : 50;
              const max  = sys === 'FR' ? 20 : 100;
              const passRate = stats ? Math.round((stats.above / stats.total) * 100) : null;
              return (
                <tr key={cls.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-gray-900">
                    {cls.name}
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-semibold ${
                      sys === 'EN' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{sys}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{studs.length}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{subs.length}</td>
                  <td className="px-4 py-3 text-center">
                    {seq ? (
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">{seqLabel(sys, seq)}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {stats?.avg !== null && stats?.avg !== undefined ? (
                      <span style={{ color: stats.avg >= pass ? '#059669' : '#ef4444' }} className="font-bold">
                        {stats.avg.toFixed(2)}<span className="text-xs font-normal text-gray-400">/{max}</span>
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {passRate !== null ? (
                      <span style={{ color: passRate >= 50 ? '#059669' : '#ef4444' }} className="font-semibold">{passRate}%</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link to="/app/grades" className="text-xs text-brand-600 hover:text-brand-800 font-medium">{t('Notes', 'Grades')}</Link>
                    <span className="text-gray-300 mx-1">·</span>
                    <Link to="/app/bulletins" className="text-xs text-brand-600 hover:text-brand-800 font-medium">{t('Bulletins', 'Report cards')}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </BlockCard>
  );
}

export { EmptyHint };
