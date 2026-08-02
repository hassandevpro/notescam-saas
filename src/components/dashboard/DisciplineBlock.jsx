// BLOC « vie scolaire » — ce que le surveillant (et la direction) doit voir en
// arrivant : les faits du JOUR, puis les élèves qui reviennent trop souvent.
// Périmètre : les classes visibles du store (déjà restreintes au surveillant).

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { BlockCard, CountPill, LoadingCard } from './shared';
import { todayISO } from './useDashboardData';

function DayStat({ label, value, tone, to }) {
  const tones = {
    rose:   'border-rose-400 text-rose-700',
    amber:  'border-amber-400 text-amber-700',
    violet: 'border-violet-400 text-violet-700',
    slate:  'border-slate-300 text-slate-700',
  };
  return (
    <Link to={to} className="block hover:opacity-90 transition-opacity">
      <div className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${tones[tone] || tones.slate} h-full`}>
        <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
        <div className="text-xs font-semibold text-gray-500 mt-1">{label}</div>
      </div>
    </Link>
  );
}

export default function DisciplineBlock({ loading, snapshot, attendanceToday, classes, students }) {
  const t = useT();
  const today = todayISO();

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const classById   = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const data = useMemo(() => {
    const inScope = (row) => !row.class_id || classById.has(row.class_id) || studentById.has(row.student_id);
    const incidents = (snapshot?.incidents || []).filter(inScope);
    const actions   = (snapshot?.actions || []).filter(inScope);
    const lateToday = (snapshot?.lateArrivals || []).filter((r) => r.date === today && inScope(r));
    const absentToday = (attendanceToday || []).filter((a) => a.status === 'absent');

    const monthPrefix = today.slice(0, 7);
    const inMonth = (list) => list.filter((r) => (r.date || '').startsWith(monthPrefix)).length;

    // Récidivistes : ≥ 3 faits (incidents + sanctions) sur l'année.
    const count = {};
    for (const r of [...incidents, ...actions]) count[r.student_id] = (count[r.student_id] || 0) + 1;
    const recidivists = Object.entries(count)
      .filter(([, n]) => n >= 3)
      .map(([sid, n]) => ({ student: studentById.get(sid), n }))
      .filter((r) => r.student)
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);

    return {
      lateToday: lateToday.length,
      absentToday: absentToday.length,
      incidentsMonth: inMonth(incidents),
      actionsMonth: inMonth(actions),
      recidivists,
    };
  }, [snapshot, attendanceToday, classById, studentById, today]);

  if (loading) return <LoadingCard />;

  return (
    <BlockCard
      title={t('Vie scolaire — aujourd’hui', 'School life — today', 'Vida escolar — hoy')}
      subtitle={t('Faits du jour et récidives de l’année', 'Today’s events and repeat cases this year', 'Hechos del día y reincidencias')}
      action={
        <Link to="/app/vie-scolaire" className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline whitespace-nowrap">
          {t('Ouvrir le tableau →', 'Open the board →', 'Abrir el panel →')}
        </Link>
      }
    >
      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DayStat to="/app/absences" tone="rose"   value={data.absentToday}    label={t('Absents aujourd’hui', 'Absent today', 'Ausentes hoy')} />
        <DayStat to="/app/retards"  tone="amber"  value={data.lateToday}      label={t('Retards aujourd’hui', 'Late today', 'Retrasos hoy')} />
        <DayStat to="/app/incidents" tone="violet" value={data.incidentsMonth} label={t('Incidents ce mois', 'Incidents this month', 'Incidentes este mes')} />
        <DayStat to="/app/sanctions" tone="slate"  value={data.actionsMonth}   label={t('Sanctions ce mois', 'Sanctions this month', 'Sanciones este mes')} />
      </div>

      <div className="px-6 py-4 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          {t('Élèves à suivre', 'Students to watch', 'Alumnos a seguir')}
          {data.recidivists.length > 0 && <CountPill n={data.recidivists.length} tone="rose" />}
        </p>
        {data.recidivists.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            {t('Aucun élève avec 3 faits ou plus cette année.', 'No student with 3 or more events this year.', 'Ningún alumno con 3 hechos o más este año.')}
          </p>
        ) : (
          <div className="space-y-1.5">
            {data.recidivists.map(({ student, n }) => (
              <div key={student.id} className="flex items-center justify-between gap-2">
                <Link to={`/app/discipline/${student.id}`} className="text-sm text-gray-700 truncate hover:text-brand-700 hover:underline">
                  {student.name}
                </Link>
                <span className="shrink-0 px-2 py-0.5 bg-rose-50 border border-rose-100 rounded text-xs font-bold text-rose-600">
                  {n} {t('faits', 'events', 'hechos')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </BlockCard>
  );
}
