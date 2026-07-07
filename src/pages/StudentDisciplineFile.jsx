// FICHE DISCIPLINE individuelle d'un élève — absences, retards, incidents,
// sanctions reçues, avertissements, sorties + frise chronologique
// (« évolution comportementale »). Accessible depuis le tableau de bord.

import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { fetchStudentDisciplineFile } from '../lib/vieScolaireService';
import {
  INCIDENT_TYPES, INCIDENT_SEVERITY, ACTION_TYPES, EXIT_TYPES, labelOf, colorOf,
} from '../core/disciplineTerms';
import { fmtDate } from '../components/vieScolaire/vsCommon';

function Stat({ value, label, tone }) {
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${tone}`}>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs font-semibold text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export default function StudentDisciplineFile() {
  const t = useT();
  const { studentId } = useParams();
  const school   = useAuthStore((s) => s.school);
  const schoolId = school?.id;
  const students = useSchoolStore((s) => s.students);
  const classes  = useSchoolStore((s) => s.classes);

  const student = students.find((s) => s.id === studentId) || null;
  const className = classes.find((c) => c.id === student?.class_id)?.name || '';

  const [file, setFile] = useState(null);
  const [absCount, setAbsCount] = useState({ absent: 0, retard: 0, excused: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!schoolId || !studentId) return;
      setLoading(true);
      const [f, att] = await Promise.all([
        fetchStudentDisciplineFile(schoolId, studentId),
        supabase.from('attendance').select('status').eq('school_id', schoolId).eq('student_id', studentId),
      ]);
      if (!alive) return;
      const counts = { absent: 0, retard: 0, excused: 0 };
      for (const a of att?.data || []) counts[a.status] = (counts[a.status] || 0) + 1;
      setFile(f);
      setAbsCount(counts);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [schoolId, studentId]);

  // Frise chronologique fusionnée (tous événements datés, plus récent d'abord).
  const timeline = useMemo(() => {
    if (!file) return [];
    const ev = [];
    for (const r of file.incidents) ev.push({ date: r.date, kind: 'incident', color: colorOf(INCIDENT_SEVERITY, r.severity), text: labelOf(INCIDENT_TYPES, r.incident_type, t), extra: r.description });
    for (const r of file.actions) ev.push({ date: r.date, kind: 'sanction', color: '#7c3aed', text: labelOf(ACTION_TYPES, r.action_type, t), extra: r.reason });
    for (const r of file.warnings) ev.push({ date: r.date, kind: 'warning', color: '#d97706', text: t('Avertissement', 'Warning'), extra: r.reason });
    for (const r of file.lateArrivals) ev.push({ date: r.date, kind: 'late', color: '#f59e0b', text: t('Retard', 'Late'), extra: r.reason });
    for (const r of file.exitPermissions) ev.push({ date: r.date, kind: 'exit', color: '#0891b2', text: labelOf(EXIT_TYPES, r.exit_type, t), extra: r.reason });
    return ev.filter((e) => e.date).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [file, t]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">
        <Link to="/app/vie-scolaire" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
          ← {t('Retour au tableau de bord', 'Back to dashboard')}
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">{student?.name || t('Élève', 'Student')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{className} · {t('Fiche discipline', 'Discipline file')}</p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm animate-pulse">{t('Chargement…', 'Loading…')}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat value={absCount.absent} label={t('Absences', 'Absences')} tone="border-red-400" />
              <Stat value={absCount.retard + (file?.lateArrivals.length || 0)} label={t('Retards', 'Late')} tone="border-amber-400" />
              <Stat value={file?.incidents.length || 0} label={t('Incidents', 'Incidents')} tone="border-orange-400" />
              <Stat value={file?.actions.length || 0} label={t('Sanctions', 'Sanctions')} tone="border-violet-400" />
              <Stat value={file?.warnings.length || 0} label={t('Avertissements', 'Warnings')} tone="border-gray-300" />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('Évolution comportementale', 'Behavioural timeline')}
              </div>
              {timeline.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-sm">{t('Aucun événement disciplinaire. 👍', 'No disciplinary event. 👍')}</div>
              ) : (
                <ol className="p-5 space-y-3">
                  {timeline.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800">{e.text}
                          <span className="text-xs text-gray-400 ml-2">{fmtDate(e.date)}</span>
                        </div>
                        {e.extra && <div className="text-xs text-gray-500 truncate">{e.extra}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
