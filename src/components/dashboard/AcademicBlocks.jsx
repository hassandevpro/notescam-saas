// BLOCS pédagogiques & frais du tableau de bord (direction : admin / censeur).
// Le calcul vit dans `useAcademicStats` ; les composants ne font que dessiner.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { clsStat } from '../../core/bulletinEngine';
import { resolveClassEngine } from '../../core/engineResolver';
import { feeDashboard } from '../../lib/feeEngine';
import { TRACKS, trackKeyForClass, currentPeriodOfTrack, periodAt } from '../../lib/calendarTracks';
import { classEntryProgress, latestPeriodWithData, indexPrimNotes } from '../../lib/gradeEntryProgress';
import { StatCard, BlockCard, CountPill, EmptyHint } from './shared';

// Moteurs dont les notes vivent dans `gradeMap` : les seuls pour lesquels une
// moyenne de classe a un sens (l'APC et le fondamental évaluent par cotes).
const isNumericEngine = (engine) => engine === 'classic' || engine === 'sc';

/**
 * Agrégats académiques + frais de l'établissement (périmètre déjà appliqué par
 * le store).
 *
 * La PÉRIODE suivie n'est plus devinée depuis les notes déjà saisies : c'est
 * celle qu'ouvre le CALENDRIER SCOLAIRE, sur la piste propre à chaque classe
 * (séquences MINESEC, UA du primaire MINEDUB, trimestres de maternelle, terms
 * anglophones). Tant que le calendrier n'est pas rempli, on retombe sur
 * l'heuristique historique « dernière période saisie + 1 ».
 */
export function useAcademicStats({
  school, countryCode, classes, subjects, students,
  gradeMap, apcNotes, primNotes, matObservations, apcReferentiel,
  seqDates, fees, getClassFeeGrid, today,
}) {
  // Index des notes primaires construit UNE fois : sans lui, chaque (classe × UA)
  // rebalaierait tout `primNotes`.
  const sources = useMemo(
    () => ({ gradeMap, apcNotes, primNotes, matObservations, apcReferentiel,
             primIndex: indexPrimNotes(primNotes) }),
    [gradeMap, apcNotes, primNotes, matObservations, apcReferentiel],
  );

  const classStats = useMemo(() => classes.map((cls) => {
    const subs   = subjects.filter((s) => s.class_id === cls.id);
    const studs  = students.filter((s) => s.class_id === cls.id);
    const sys    = cls.system || 'FR';
    const engine = resolveClassEngine(school, cls);
    const trackKey = trackKeyForClass(school, cls, countryCode);
    const track    = TRACKS[trackKey];

    // Période de référence des statistiques : la dernière RÉELLEMENT saisie.
    const seq = latestPeriodWithData({
      engine, cls, subs, studs, maxOrder: track.periods.length, ...sources,
    });
    // Période à compléter : le calendrier fait autorité.
    const cal = currentPeriodOfTrack(trackKey, seqDates, today);

    const stats = seq !== null && isNumericEngine(engine)
      ? clsStat(studs, gradeMap, cls.id, [seq], subs, sys)
      : null;
    return { cls, subs, studs, sys, engine, trackKey, track, seq, cal, stats };
  }), [classes, subjects, students, school, countryCode, seqDates, today, gradeMap, sources]);

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
    .map(({ cls, subs, studs, engine, trackKey, track, seq, cal }) => {
      // Période attendue : celle qu'ouvre le calendrier ; à défaut, la suivante
      // après la dernière saisie (comportement d'avant le calendrier).
      const order = cal?.order
        ?? (seq === null ? 1 : seq < track.periods.length ? seq + 1 : null);
      if (order == null) return null;

      const { expected, entered } = classEntryProgress({
        engine, cls, subs, studs, order, ...sources,
      });
      // `expected: null` = attendu non calculable (référentiel APC pas chargé) :
      // on n'invente pas un pourcentage.
      if (!expected || entered >= expected) return null;
      return {
        cls, order, entered, expected,
        period:       periodAt(trackKey, order),
        fromCalendar: !!cal,
        overdue:      cal?.overdue ?? false,
        atRisk:       cal?.atRisk ?? false,
        daysLeft:     cal?.daysLeft ?? null,
        deadline:     cal?.deadline ?? null,
      };
    })
    .filter(Boolean), [classStats, sources]);

  // Aucune date renseignée sur AUCUNE piste utilisée : le suivi tourne alors à
  // l'heuristique, ce que le bloc signale à l'administrateur.
  const calendarSet = useMemo(
    () => classStats.some((c) => c.cal !== null),
    [classStats],
  );

  return { classStats, globalPassRate, feesStats, missingGrades, calendarSet };
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
// Une carte par classe, sur la période que le CALENDRIER SCOLAIRE tient pour
// ouverte — d'où des unités différentes sur le même écran (Séq 4 en 3e, UA 5 en
// CM2, Trim 2 en Petite Section), chacune conforme à sa tutelle.
export function GradesTodo({ items, calendarSet = true }) {
  const t = useT();
  if (!items.length) return null;
  const anyOverdue = items.some((i) => i.overdue);
  return (
    <BlockCard
      tone="amber"
      title={<span className="inline-flex items-center gap-2">{t('Notes à compléter', 'Grades to complete')} <CountPill n={items.length} /></span>}
      subtitle={calendarSet
        ? t('Période ouverte au calendrier scolaire, par classe', 'Period open in the school calendar, per class', 'Periodo abierto en el calendario, por clase')
        : t('Période estimée — calendrier scolaire non renseigné', 'Estimated period — school calendar not filled in', 'Periodo estimado — calendario sin fechas')}
    >
      {!calendarSet && (
        <div className="mx-4 mt-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          {t('Renseignez les dates limites de saisie pour suivre les retards automatiquement.',
             'Fill in the grade-entry deadlines to track delays automatically.',
             'Introduzca las fechas límite para seguir los retrasos automáticamente.')}{' '}
          <Link to="/app/settings" className="font-semibold underline">
            {t('Calendrier scolaire', 'School calendar', 'Calendario escolar')}
          </Link>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
        {items.map(({ cls, period, entered, expected, overdue, atRisk, daysLeft }) => {
          const pct = Math.round((entered / expected) * 100);
          const tone = overdue ? 'red' : atRisk ? 'orange' : 'amber';
          const chip = {
            red:    'text-red-700 bg-red-100',
            orange: 'text-orange-700 bg-orange-100',
            amber:  'text-amber-600 bg-amber-100',
          }[tone];
          return (
            <Link key={cls.id} to="/app/grades"
              className={`bg-white rounded-lg p-3 border hover:shadow-sm transition-all group ${
                overdue ? 'border-red-300 hover:border-red-400' : 'border-amber-200 hover:border-amber-400'}`}>
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="font-semibold text-gray-800 text-sm group-hover:text-amber-700 truncate">{cls.name}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${chip}`}>
                  {t(period?.fr, period?.en, period?.es)}
                </span>
              </div>
              <div className="w-full bg-amber-100 rounded-full h-1.5 mb-1.5">
                <div className={`h-1.5 rounded-full transition-all ${overdue ? 'bg-red-500' : 'bg-amber-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-gray-500">
                {entered}/{expected} {t('notes saisies', 'grades entered')}
                <span className="ml-1 text-amber-600 font-medium">({pct}%)</span>
              </div>
              {daysLeft !== null && (
                <div className={`text-xs mt-1 font-medium ${overdue ? 'text-red-600' : atRisk ? 'text-orange-600' : 'text-gray-400'}`}>
                  {overdue
                    ? t(`Échéance dépassée de ${-daysLeft} j`, `Deadline passed ${-daysLeft} d ago`, `Plazo vencido hace ${-daysLeft} d`)
                    : t(`Limite de saisie · J-${daysLeft}`, `Entry deadline · D-${daysLeft}`, `Cierre · D-${daysLeft}`)}
                </div>
              )}
            </Link>
          );
        })}
      </div>
      {anyOverdue && (
        <div className="px-4 pb-4 -mt-1">
          <Link to="/app/monitor" className="text-xs font-semibold text-brand-600 hover:text-brand-800">
            {t('Voir la surveillance des saisies →', 'Open grade-entry monitoring →', 'Ver supervisión de capturas →')}
          </Link>
        </div>
      )}
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
            {classStats.map(({ cls, subs, studs, sys, seq, trackKey, stats }) => {
              const pass = sys === 'FR' ? 10 : 50;
              const max  = sys === 'FR' ? 20 : 100;
              const passRate = stats ? Math.round((stats.above / stats.total) * 100) : null;
              const period = periodAt(trackKey, seq);
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
                    {period ? (
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">{t(period.fr, period.en, period.es)}</span>
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
