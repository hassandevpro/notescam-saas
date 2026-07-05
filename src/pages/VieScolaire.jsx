// Tableau de bord VIE SCOLAIRE — vue d'ensemble du surveillant.
// Absences/retards du jour, incidents & sanctions, récidivistes, statistiques
// mensuelles, classes les plus / moins disciplinées, taux d'absentéisme.
// Tout est déjà restreint au PÉRIMÈTRE du surveillant (schoolStore).

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { fetchVieScolaireSnapshot } from '../lib/vieScolaireService';
import { INCIDENT_TYPES, labelOf } from '../core/disciplineTerms';
import { useVsContext, VsHeader, fmtDate, todayISO } from '../components/vieScolaire/vsCommon';

function StatCard({ label, value, tone = 'gray', to }) {
  const tones = {
    gray:   'border-gray-300',
    red:    'border-red-400',
    amber:  'border-amber-400',
    blue:   'border-blue-400',
    green:  'border-emerald-400',
    violet: 'border-violet-400',
  };
  const inner = (
    <div className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${tones[tone]} h-full`}>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs font-semibold text-gray-500 mt-1">{label}</div>
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-90 transition-opacity">{inner}</Link> : inner;
}

export default function VieScolaire() {
  const t = useT();
  const { schoolId, yearLabel, classes, students } = useVsContext();
  const [snapshot, setSnapshot] = useState(null);
  const [attToday, setAttToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const classById   = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!schoolId) return;
      setLoading(true);
      const [snap, att] = await Promise.all([
        fetchVieScolaireSnapshot(schoolId, yearLabel),
        classIds.length
          ? supabase.from('attendance').select('student_id, class_id, status, date')
              .eq('school_id', schoolId).eq('date', today).in('class_id', classIds)
          : Promise.resolve({ data: [] }),
      ]);
      if (!alive) return;
      setSnapshot(snap);
      setAttToday(att?.data || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [schoolId, yearLabel, today, classIds]);

  // Ne garder que ce qui concerne le périmètre (classes visibles).
  const inScope = (row) => !row.class_id || classById.has(row.class_id) || studentById.has(row.student_id);

  const lateToday   = (snapshot?.lateArrivals || []).filter((r) => r.date === today && inScope(r));
  const absentToday = attToday.filter((a) => a.status === 'absent');
  const retardAtt   = attToday.filter((a) => a.status === 'retard');

  const incidents = (snapshot?.incidents || []).filter(inScope);
  const actions   = (snapshot?.actions   || []).filter(inScope);
  const meetings  = (snapshot?.parentMeetings || []).filter(inScope);

  // Récidivistes : élèves avec ≥ 3 faits (incidents + sanctions) sur l'année.
  const recidivists = useMemo(() => {
    const count = {};
    for (const r of [...incidents, ...actions]) count[r.student_id] = (count[r.student_id] || 0) + 1;
    return Object.entries(count).filter(([, n]) => n >= 3)
      .map(([sid, n]) => ({ student: studentById.get(sid), n }))
      .sort((a, b) => b.n - a.n);
  }, [incidents, actions, studentById]);

  // Statistiques du mois courant.
  const monthPrefix = today.slice(0, 7);
  const monthCount = (list) => list.filter((r) => (r.date || '').startsWith(monthPrefix)).length;

  // Sanctions par classe (classes les plus / moins sanctionnées).
  const byClass = useMemo(() => {
    const map = {};
    for (const c of classes) map[c.id] = { cls: c, incidents: 0, actions: 0 };
    for (const r of incidents) if (map[r.class_id]) map[r.class_id].incidents++;
    for (const r of actions)   if (map[r.class_id]) map[r.class_id].actions++;
    return Object.values(map).map((x) => ({ ...x, total: x.incidents + x.actions }));
  }, [classes, incidents, actions]);

  const mostSanctioned  = [...byClass].sort((a, b) => b.total - a.total).filter((x) => x.total > 0).slice(0, 5);
  const bestBehaved     = [...byClass].sort((a, b) => a.total - b.total).slice(0, 5);

  // Convoqués / sanctionnés (élèves distincts, année).
  const convokedCount    = new Set(meetings.map((m) => m.student_id)).size;
  const sanctionedCount  = new Set(actions.map((a) => a.student_id)).size;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-5">
        <VsHeader
          title={t('Vie scolaire', 'School life')}
          subtitle={yearLabel}
        />

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm animate-pulse">
            {t('Chargement…', 'Loading…')}
          </div>
        ) : (
          <>
            {/* Cartes du jour */}
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("Aujourd'hui", 'Today')} · {fmtDate(today)}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={t('Absents du jour', 'Absent today')} value={absentToday.length} tone="red" to="/app/absences" />
                <StatCard label={t('Retards du jour', 'Late today')} value={lateToday.length + retardAtt.length} tone="amber" to="/app/retards" />
                <StatCard label={t('Élèves convoqués', 'Summoned students')} value={convokedCount} tone="blue" to="/app/convocations" />
                <StatCard label={t('Élèves sanctionnés', 'Sanctioned students')} value={sanctionedCount} tone="violet" to="/app/sanctions" />
              </div>
            </div>

            {/* Statistiques du mois */}
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('Ce mois-ci', 'This month')}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label={t('Incidents', 'Incidents')} value={monthCount(incidents)} tone="red" to="/app/incidents" />
                <StatCard label={t('Sanctions', 'Sanctions')} value={monthCount(actions)} tone="violet" to="/app/sanctions" />
                <StatCard label={t('Retards', 'Late arrivals')} value={monthCount(snapshot?.lateArrivals || [])} tone="amber" to="/app/retards" />
                <StatCard label={t('Récidivistes', 'Repeat offenders')} value={recidivists.length} tone="gray" />
              </div>
            </div>

            {/* Récidivistes */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('Élèves récidivistes', 'Repeat offenders')} ({t('≥ 3 faits sur l’année', '≥ 3 records this year')})
              </div>
              {recidivists.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">{t('Aucun élève récidiviste. 👍', 'No repeat offenders. 👍')}</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recidivists.slice(0, 10).map(({ student, n }) => student && (
                    <Link key={student.id} to={`/app/discipline/${student.id}`}
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/50">
                      <span className="text-sm font-medium text-gray-800">{student.name}
                        <span className="text-xs text-gray-400 ml-2">{classById.get(student.class_id)?.name || ''}</span>
                      </span>
                      <span className="text-xs font-bold text-red-600">{n} {t('faits', 'records')}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Classes : plus sanctionnées / plus disciplinées */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ClassRanking title={t('Classes les plus sanctionnées', 'Most sanctioned classes')} rows={mostSanctioned} empty={t('Aucune sanction.', 'No sanctions.')} tone="text-red-600" />
              <ClassRanking title={t('Classes les plus disciplinées', 'Best-behaved classes')} rows={bestBehaved} empty={t('Aucune classe.', 'No classes.')} tone="text-emerald-600" />
            </div>

            {/* Derniers incidents */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('Derniers incidents', 'Latest incidents')}</span>
                <Link to="/app/incidents" className="text-xs font-semibold text-brand-600 hover:text-brand-700">{t('Voir tout', 'See all')}</Link>
              </div>
              {incidents.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">{t('Aucun incident enregistré.', 'No incident recorded.')}</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {incidents.slice(0, 6).map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-5 py-2.5">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-800">{studentById.get(r.student_id)?.name || '—'}</span>
                        <span className="text-xs text-gray-400 ml-2">{labelOf(INCIDENT_TYPES, r.incident_type, t)}</span>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{fmtDate(r.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function ClassRanking({ title, rows, empty, tone }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm">{empty}</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(({ cls, total }) => (
            <div key={cls.id} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-sm font-medium text-gray-800">{cls.name}</span>
              <span className={`text-sm font-bold ${tone}`}>{total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
