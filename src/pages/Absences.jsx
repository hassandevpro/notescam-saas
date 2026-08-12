import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import UpgradeBanner from '../components/UpgradeBanner';
import SectionFilterSelect, { inSection } from '../components/SectionFilterSelect';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function initials(name = '') {
  return (name || '?').split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

const STATUS_CFG = {
  absent:  { label: 'Absent', en: 'Absent', es: 'Ausente',     short: 'A', active: 'bg-red-500 text-white border-red-500',    passive: 'text-gray-400 border-gray-200 hover:border-red-300' },
  retard:  { label: 'Retard', en: 'Late',   es: 'Retraso',     short: 'R', active: 'bg-amber-500 text-white border-amber-500', passive: 'text-gray-400 border-gray-200 hover:border-amber-300' },
  excused: { label: 'Excusé', en: 'Excused', es: 'Justificado', short: 'E', active: 'bg-blue-500 text-white border-blue-500',   passive: 'text-gray-400 border-gray-200 hover:border-blue-300' },
};

const SESSIONS = [
  { value: '',           label: 'Journée entière', en: 'Full day',   es: 'Jornada completa' },
  { value: 'matin',     label: 'Matin',           en: 'Morning',    es: 'Mañana' },
  { value: 'apres-midi',label: 'Après-midi',      en: 'Afternoon',  es: 'Tarde' },
  { value: 'H1',        label: 'Heure 1',         en: 'Period 1',   es: 'Hora 1' },
  { value: 'H2',        label: 'Heure 2',         en: 'Period 2',   es: 'Hora 2' },
  { value: 'H3',        label: 'Heure 3',         en: 'Period 3',   es: 'Hora 3' },
  { value: 'H4',        label: 'Heure 4',         en: 'Period 4',   es: 'Hora 4' },
  { value: 'H5',        label: 'Heure 5',         en: 'Period 5',   es: 'Hora 5' },
  { value: 'H6',        label: 'Heure 6',         en: 'Period 6',   es: 'Hora 6' },
];

// Module-level caches — survive component unmount/remount so navigation back is instant
const _saisieCache = {};
const _statsCache  = {};

// ── Onglet Saisie ─────────────────────────────────────────────────────────────

function SaisieTab({ schoolId, yearLabel, classes, students, subjects }) {
  const t          = useT();
  const userId     = useAuthStore((s) => s.userId);

  const classId    = useUiStore((s) => s.absencesClassId);
  const setClassId    = useUiStore((s) => s.setAbsencesClassId);
  const [sectionF, setSectionF] = useState('');
  const subjectId  = useUiStore((s) => s.absencesSubjectId);
  const setSubjectId  = useUiStore((s) => s.setAbsencesSubjectId);
  const date       = useUiStore((s) => s.absencesDate) || todayISO();
  const setDate    = useUiStore((s) => s.setAbsencesDate);
  const session    = useUiStore((s) => s.absencesSession);
  const setSession    = useUiStore((s) => s.setAbsencesSession);

  const [marks,     setMarks]     = useState({});   // studentId → 'absent'|'retard'|'excused'|null
  const [existing,  setExisting]  = useState({});   // studentId → attendance id
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  const classStudents = useMemo(() =>
    !classId ? [] : students.filter((s) => s.class_id === classId),
  [students, classId]);

  const classSubjects = useMemo(() =>
    subjects.filter((s) => !s.class_id || s.class_id === classId),
  [subjects, classId]);

  const loadExisting = useCallback(async () => {
    if (!classId || !date) return;
    const key = `${classId}|${date}|${session}|${subjectId}`;
    if (_saisieCache[key]) {
      setMarks(_saisieCache[key].marks);
      setExisting(_saisieCache[key].existing);
      return;
    }
    setLoading(true);

    let q = supabase
      .from('attendance')
      .select('id, student_id, status')
      .eq('school_id', schoolId)
      .eq('class_id',  classId)
      .eq('date',      date)
      .eq('year_label', yearLabel);

    q = session   ? q.eq('session',    session)   : q.is('session',    null);
    q = subjectId ? q.eq('subject_id', subjectId) : q.is('subject_id', null);

    const { data } = await q;
    const m = {}, ex = {};
    (data ?? []).forEach((a) => { m[a.student_id] = a.status; ex[a.student_id] = a.id; });
    _saisieCache[key] = { marks: m, existing: ex };
    setMarks(m);
    setExisting(ex);
    setLoading(false);
  }, [classId, date, session, subjectId, schoolId, yearLabel]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  const toggleMark = (studentId, status) => {
    setMarks((prev) => ({ ...prev, [studentId]: prev[studentId] === status ? null : status }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!classId) return;
    setSaving(true);

    const ops = [];
    const newlyAbsent = []; // élèves nouvellement marqués 'absent' (pas une correction) → SMS parent
    for (const student of classStudents) {
      const newStatus  = marks[student.id] ?? null;
      const existingId = existing[student.id];

      if (!newStatus && existingId) {
        ops.push(supabase.from('attendance').delete().eq('id', existingId));
      } else if (newStatus && existingId) {
        ops.push(supabase.from('attendance').update({ status: newStatus }).eq('id', existingId));
      } else if (newStatus && !existingId) {
        ops.push(supabase.from('attendance').insert({
          school_id:   schoolId,
          student_id:  student.id,
          class_id:    classId,
          subject_id:  subjectId || null,
          year_label:  yearLabel,
          date,
          session:     session || null,
          status:      newStatus,
          recorded_by: userId,
        }));
        if (newStatus === 'absent') newlyAbsent.push(student);
      }
    }

    await Promise.all(ops);
    delete _saisieCache[`${classId}|${date}|${session}|${subjectId}`];
    await loadExisting();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);

    // SMS parent — uniquement pour une absence NOUVELLE (pas une correction de
    // marque déjà existante) : évite de renotifier à chaque re-sauvegarde.
    if (newlyAbsent.length) {
      import('../lib/notificationProducers').then(({ notifyParent }) => {
        for (const student of newlyAbsent) {
          notifyParent({
            schoolId, studentId: student.id, priority: 'important', type: 'absence',
            title: 'Absence signalée',
            body: `${student.name} a été marqué(e) absent(e) le ${date}${session ? ` (${session})` : ''}.`,
          });
        }
      }).catch(() => { /* notification best-effort */ });
    }
  };

  const markedCount = Object.values(marks).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SectionFilterSelect
            classes={classes}
            value={sectionF}
            onChange={(v) => { setSectionF(v); if (classId && !inSection(classes.find((c) => c.id === classId), v)) { setClassId(''); setSubjectId(''); setMarks({}); setExisting({}); } }}
            label={t('Section', 'Section')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Classe *', 'Class *', 'Clase *')}</label>
            <select
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setSubjectId(''); setMarks({}); setExisting({}); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">{t('— Choisir —', '— Select —', '— Elegir —')}</option>
              {classes.filter((c) => inSection(c, sectionF)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Date *', 'Date *', 'Fecha *')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Période', 'Period', 'Período')}</label>
            <select
              value={session}
              onChange={(e) => setSession(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              {SESSIONS.map((s) => <option key={s.value} value={s.value}>{t(s.label, s.en, s.es)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Matière', 'Subject', 'Asignatura')}</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">{t('— Toutes —', '— All —', '— Todas —')}</option>
              {classSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Liste élèves */}
      {!classId ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm text-gray-500">{t('Sélectionnez une classe pour saisir les absences.', 'Select a class to record attendance.', 'Seleccione una clase para registrar las faltas.')}</p>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm animate-pulse">
          {t('Chargement…', 'Loading…', 'Cargando…')}
        </div>
      ) : classStudents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
          {t('Aucun élève dans cette classe.', 'No students in this class.', 'No hay alumnos en esta clase.')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {classStudents.length} {t('élève', 'student', 'alumno')}{classStudents.length > 1 ? 's' : ''}
              {markedCount > 0 && (
                <span className="ml-2 text-red-600">· {markedCount} {t('signalé', 'flagged', 'señalado')}{markedCount > 1 ? 's' : ''}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-emerald-600 font-semibold">✓ {t('Enregistré', 'Saved', 'Guardado')}</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
              </button>
            </div>
          </div>

          {/* Légende */}
          <div className="px-5 py-2 border-b border-gray-50 flex items-center gap-4 text-xs text-gray-400">
            {Object.entries(STATUS_CFG).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1">
                <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center border ${cfg.active}`}>{cfg.short}</span>
                {t(cfg.label, cfg.en, cfg.es)}
              </span>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {classStudents.map((student, idx) => {
              const currentStatus = marks[student.id] ?? null;
              return (
                <div key={student.id} className={`flex items-center gap-3 px-5 py-2.5 transition-colors ${currentStatus ? 'bg-red-50/30' : 'hover:bg-gray-50/50'}`}>
                  <span className="text-xs text-gray-300 w-5 text-right shrink-0">{idx + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {initials(student.name)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                    {student.name || '—'}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => toggleMark(student.id, key)}
                        title={t(cfg.label, cfg.en, cfg.es)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold border transition-colors ${
                          currentStatus === key ? cfg.active : `bg-gray-50 border ${cfg.passive}`
                        }`}
                      >
                        {cfg.short}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Statistiques ────────────────────────────────────────────────────────

function StatsTab({ schoolId, yearLabel, classes, students }) {
  const t              = useT();
  const filterClass    = useUiStore((s) => s.absencesStatsClassId);
  const setFilterClass = useUiStore((s) => s.setAbsencesStatsClassId);
  const [sectionF, setSectionF] = useState('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    const key = `${schoolId}|${yearLabel}|${filterClass}|${dateFrom}|${dateTo}`;
    if (_statsCache[key]) {
      setRecords(_statsCache[key].records);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('attendance')
      .select('student_id, class_id, date, status')
      .eq('school_id',  schoolId)
      .eq('year_label', yearLabel);

    if (filterClass) q = q.eq('class_id', filterClass);
    if (dateFrom)    q = q.gte('date', dateFrom);
    if (dateTo)      q = q.lte('date', dateTo);

    const { data } = await q;
    _statsCache[key] = { records: data ?? [] };
    setRecords(data ?? []);
    setLoading(false);
  }, [schoolId, yearLabel, filterClass, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const map = {};
    for (const r of records) {
      if (!map[r.student_id]) map[r.student_id] = { absent: 0, retard: 0, excused: 0 };
      map[r.student_id][r.status] = (map[r.student_id][r.status] || 0) + 1;
    }
    return Object.entries(map)
      .map(([studentId, counts]) => {
        const student = students.find((s) => s.id === studentId);
        const cls     = classes.find((c) => c.id === student?.class_id);
        return { studentId, student, cls, ...counts, total: counts.absent + counts.retard + counts.excused };
      })
      .sort((a, b) => b.total - a.total);
  }, [records, students, classes]);

  const totals = useMemo(() => ({
    absent:  records.filter((r) => r.status === 'absent').length,
    retard:  records.filter((r) => r.status === 'retard').length,
    excused: records.filter((r) => r.status === 'excused').length,
  }), [records]);

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SectionFilterSelect
            classes={classes}
            value={sectionF}
            onChange={(v) => { setSectionF(v); if (filterClass && !inSection(classes.find((c) => c.id === filterClass), v)) setFilterClass(''); }}
            label={t('Section', 'Section')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Classe', 'Class', 'Clase')}</label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">{t('Toutes les classes', 'All classes', 'Todas las clases')}</option>
              {classes.filter((c) => inSection(c, sectionF)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Du', 'From', 'Desde')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Au', 'To', 'Hasta')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
      </div>

      {/* Cartes résumé */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-400">
            <div className="text-2xl font-bold text-gray-900">{totals.absent}</div>
            <div className="text-xs font-semibold text-gray-500 mt-1">{t('Absences', 'Absences', 'Ausencias')}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-amber-400">
            <div className="text-2xl font-bold text-gray-900">{totals.retard}</div>
            <div className="text-xs font-semibold text-gray-500 mt-1">{t('Retards', 'Late', 'Retrasos')}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-blue-400">
            <div className="text-2xl font-bold text-gray-900">{totals.excused}</div>
            <div className="text-xs font-semibold text-gray-500 mt-1">{t('Excusées', 'Excused', 'Justificadas')}</div>
          </div>
        </div>
      )}

      {/* Tableau */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm animate-pulse">
          {t('Chargement…', 'Loading…', 'Cargando…')}
        </div>
      ) : stats.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-sm text-gray-500">{t('Aucune absence enregistrée sur cette période.', 'No absences recorded for this period.', 'No hay faltas registradas en este período.')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {stats.length} {t('élève', 'student', 'alumno')}{stats.length > 1 ? 's' : ''} {t('avec absences', 'with absences', 'con faltas')}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">{t('Élève', 'Student', 'Alumno')}</th>
                  <th className="px-4 py-3 text-left">{t('Classe', 'Class', 'Clase')}</th>
                  <th className="px-4 py-3 text-center text-red-500">{t('Abs.', 'Abs.', 'Aus.')}</th>
                  <th className="px-4 py-3 text-center text-amber-500">{t('Retard', 'Late', 'Retraso')}</th>
                  <th className="px-4 py-3 text-center text-blue-500">{t('Excusé', 'Excused', 'Justif.')}</th>
                  <th className="px-4 py-3 text-center">{t('Total', 'Total', 'Total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.map(({ studentId, student, cls, absent, retard, excused, total }) => (
                  <tr key={studentId} className={`hover:bg-gray-50/50 transition-colors ${total >= 10 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{student?.name || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{cls?.name || '—'}</td>
                    <td className="px-4 py-3 text-center font-bold text-red-600">{absent}</td>
                    <td className="px-4 py-3 text-center font-semibold text-amber-600">{retard}</td>
                    <td className="px-4 py-3 text-center text-blue-600">{excused}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${total >= 10 ? 'text-red-700' : 'text-gray-700'}`}>{total}</span>
                      {total >= 10 && <span className="ml-1 text-xs text-red-400">⚠</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Absences() {
  const { f } = usePlan();
  const t     = useT();

  const school   = useAuthStore((s) => s.school);
  const viewYear = useUiStore((s) => s.viewYear);
  const { classes, students, subjects } = useSchoolStore();

  const tab    = useUiStore((s) => s.absencesTab);
  const setTab = useUiStore((s) => s.setAbsencesTab);

  const yearLabel = viewYear ?? school?.current_year ?? '';
  const schoolId  = school?.id;

  if (!f.hasAbsences) {
    return (
      <Layout>
        <UpgradeBanner requiredPlan="ecole" featureName={t('Suivi des absences', 'Attendance tracking')} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Absences', 'Attendance')}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{yearLabel}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { id: 'saisie', label: t('Saisie', 'Record') },
            { id: 'stats',  label: t('Statistiques', 'Statistics') },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'saisie' ? (
          <SaisieTab
            schoolId={schoolId}
            yearLabel={yearLabel}
            classes={classes}
            students={students}
            subjects={subjects}
          />
        ) : (
          <StatsTab
            schoolId={schoolId}
            yearLabel={yearLabel}
            classes={classes}
            students={students}
          />
        )}
      </div>
    </Layout>
  );
}
