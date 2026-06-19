import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useMessagesStore } from '../store/messagesStore';
import { getDaysUntilLicenseExpires } from '../lib/auth';
import { clsStat } from '../core/bulletinEngine';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';

function feeStatus(fee) {
  if (!fee || fee.frais_annuels === 0) return 'none';
  if (fee.frais_payes >= fee.frais_annuels) return 'paid';
  if (fee.frais_payes > 0) return 'partial';
  return 'unpaid';
}

const SEQ_LABELS_FR = { 1: 'Séq 1', 2: 'Séq 2', 3: 'Séq 3', 4: 'Séq 4', 5: 'Séq 5', 6: 'Séq 6' };
const SEQ_LABELS_EN = { 1: 'Term 1', 2: 'Term 2', 3: 'Term 3' };

function latestSeqWithData(classId, studentIds, gradeMap) {
  for (let seq = 6; seq >= 1; seq--) {
    if (studentIds.some((id) => Object.keys(gradeMap[`${classId}_${id}_${seq}`] || {}).length > 0)) {
      return seq;
    }
  }
  return null;
}

const SETUP_STEPS = [
  { key: 'year',      label: 'Année scolaire renseignée',   check: (s)         => !!s.school?.current_year,  to: '/app/settings', hint: 'Ex : 2025-2026' },
  { key: 'type',      label: "Type d'établissement défini",  check: (s)         => !!s.school?.type,          to: '/app/settings', hint: 'Public, Privé…' },
  { key: 'region',    label: 'Région / Département saisis',  check: (s)         => !!s.school?.region,        to: '/app/settings', hint: 'Localisation officielle' },
  { key: 'director',  label: 'Directeur / Proviseur renseigné', check: (s)      => !!s.school?.director,      to: '/app/settings', hint: 'Apparaît sur les bulletins' },
  { key: 'logo',      label: 'Logo de l\'école téléversé',  check: (s)         => !!s.school?.logo_url,      to: '/app/settings', hint: 'PNG ou SVG recommandé' },
  { key: 'class',     label: 'Au moins une classe créée',    check: (s)         => s.classes.length > 0,      to: '/app/classes',  hint: 'Ex : 6ème A, Form 1…' },
  { key: 'subject',   label: 'Au moins une matière ajoutée', check: (s)         => s.subjects.length > 0,     to: '/app/subjects', hint: 'Ex : Mathématiques' },
  { key: 'student',   label: 'Au moins un élève inscrit',    check: (s)         => s.students.length > 0,     to: '/app/students', hint: 'Importer ou ajouter manuellement' },
];

function SetupChecklist({ school, classes, subjects, students }) {
  const t = useT();
  const ctx = { school, classes, subjects, students };

  const STEPS_EN = [
    { label: 'Academic year set',         hint: 'E.g. 2025-2026' },
    { label: 'Institution type defined',  hint: 'Public, Private…' },
    { label: 'Region / Department filled',hint: 'Official location' },
    { label: 'Principal / Director set',  hint: 'Appears on report cards' },
    { label: 'School logo uploaded',      hint: 'PNG or SVG recommended' },
    { label: 'At least one class created',hint: 'E.g. 6th A, Form 1…' },
    { label: 'At least one subject added',hint: 'E.g. Mathematics' },
    { label: 'At least one student enrolled', hint: 'Import or add manually' },
  ];

  const results = SETUP_STEPS.map((step, i) => ({
    ...step,
    labelT: t(step.label, STEPS_EN[i].label),
    hintT:  t(step.hint,  STEPS_EN[i].hint),
    done: step.check(ctx),
  }));
  const done  = results.filter((r) => r.done).length;
  const total = results.length;
  if (done === total) return null;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="bg-white rounded-xl border border-brand-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{t('Guide de démarrage', 'Getting started')}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{done} {t('sur', 'of')} {total} {t('étapes complétées', 'steps completed')}</p>
        </div>
        <div className="flex items-center gap-3 min-w-[140px]">
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-bold text-brand-600 w-8 text-right">{pct}%</span>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {results.map((step) => (
          <div key={step.key} className={`flex items-center gap-4 px-6 py-3 ${step.done ? 'opacity-50' : 'hover:bg-slate-50'} transition-colors`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${step.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>
              {step.done && (
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-medium ${step.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{step.labelT}</span>
              {!step.done && <p className="text-xs text-gray-400 mt-0.5">{step.hintT}</p>}
            </div>
            {!step.done && (
              <Link to={step.to} className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline">
                {t('Configurer →', 'Set up →')}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SchoolBadge({ school }) {
  return (
    <div className="flex items-center gap-3">
      {school?.logo_url && (
        <img
          src={school.logo_url}
          alt={school?.name || 'Logo'}
          className="w-11 h-11 rounded-lg object-contain shrink-0 border border-slate-100"
        />
      )}
      <div className="leading-tight">
        <p className="font-semibold text-gray-800">{school?.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{school?.current_year || '—'}</p>
      </div>
    </div>
  );
}

const STAT_ICONS = {
  classes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 14v3M16 14v3M12 14v3"/>
    </svg>
  ),
  students: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  pass: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  fees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
};

function StatCard({ label, value, sub, accent = 'brand', icon }) {
  const themes = {
    brand:  'bg-brand-50 text-brand-600',
    green:  'bg-emerald-50 text-emerald-600',
    amber:  'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${themes[accent]}`}>
        {icon ? STAT_ICONS[icon] : null}
      </div>
      <div className="text-3xl font-bold text-gray-900 mt-4 tracking-tight tabular-nums">{value}</div>
      <div className="text-sm font-semibold text-gray-700 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function LicenseBadge({ school }) {
  const t = useT();
  const daysLeft = getDaysUntilLicenseExpires(school?.license_expires_at);
  const status = school?.license_status;

  if (status === 'trial' && daysLeft > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
        {t(`Essai gratuit — ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`,
           `Free trial — ${daysLeft} day${daysLeft > 1 ? 's' : ''} left`)}
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        {t('Licence active', 'Active license')}
      </span>
    );
  }
  if (daysLeft !== null && daysLeft <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        {t('Licence expirée', 'License expired')}
      </span>
    );
  }
  return null;
}

export default function Dashboard() {
  const t = useT();
  const { school, role, fullName } = useAuthStore();
  const isTeacher = role === 'teacher';
  const classes     = useSchoolStore((s) => s.classes);
  const subjects    = useSchoolStore((s) => s.subjects);
  const students    = useSchoolStore((s) => s.students);
  const gradeMap    = useSchoolStore((s) => s.gradeMap);
  const fees        = useSchoolStore((s) => s.fees);
  const loading     = useSchoolStore((s) => s.loading);

  const gradeCount = useMemo(() => {
    return Object.values(gradeMap).reduce((total, scores) =>
      total + Object.values(scores).filter((v) => v !== '' && v !== null).length, 0
    );
  }, [gradeMap]);

  const classStats = useMemo(() => {
    return classes.map((cls) => {
      const subs  = subjects.filter((s) => s.class_id === cls.id);
      const studs = students.filter((s) => s.class_id === cls.id);
      const sys   = cls.system || 'FR';
      const seq   = latestSeqWithData(cls.id, studs.map((s) => s.id), gradeMap);
      const stats = seq !== null
        ? clsStat(studs, gradeMap, cls.id, [seq], subs, sys)
        : null;
      return { cls, subs, studs, sys, seq, stats };
    });
  }, [classes, subjects, students, gradeMap]);

  const feesStats = useMemo(() => {
    const feeMap = {};
    fees.forEach((f) => { feeMap[f.student_id] = f; });
    const withFees = students.map((s) => feeMap[s.id]).filter(Boolean);
    const totalDu  = withFees.reduce((n, f) => n + (f.frais_annuels || 0), 0);
    const totalPaye= withFees.reduce((n, f) => n + (f.frais_payes   || 0), 0);
    const rate     = totalDu > 0 ? Math.round((totalPaye / totalDu) * 100) : null;
    const unpaid   = students.filter((s) => ['unpaid', 'none'].includes(feeStatus(feeMap[s.id]))).length;
    return { rate, unpaid };
  }, [fees, students]);

  const globalPassRate = useMemo(() => {
    const all = classStats.filter((c) => c.stats !== null);
    if (!all.length) return null;
    const total  = all.reduce((s, c) => s + c.stats.total, 0);
    const passed = all.reduce((s, c) => s + c.stats.above, 0);
    return total ? Math.round((passed / total) * 100) : null;
  }, [classStats]);

  const missingGradesAlerts = useMemo(() => {
    return classStats
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
        if (entered < expected) return { cls, nextSeq, entered, expected };
        return null;
      })
      .filter(Boolean);
  }, [classStats, gradeMap]);

  // Vue enseignant — toutes ses classes (schoolStore est déjà filtré par teacherId)
  const teacherClassData = useMemo(() => {
    if (!isTeacher) return [];
    return classes.map((cls) => {
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
    });
  }, [isTeacher, classes, students, subjects, gradeMap]);

  if (!school) {
    return (
      <Layout>
        <div className="bg-white rounded-xl p-8 shadow-sm">
          <p className="text-red-600">{t('Erreur : aucune école liée à ce compte.', 'Error: no school linked to this account.')}</p>
        </div>
      </Layout>
    );
  }

  // ── Vue enseignant ───────────────────────────────────────────────────────────
  if (isTeacher) {
    const firstName    = fullName ? fullName.split(' ')[0] : '';
    const unreadMsgs   = useMessagesStore.getState().unreadCount;
    const noClasses    = teacherClassData.length === 0;

    const seqLabel = (sys, seq) =>
      sys === 'EN' ? `Term ${seq}` : t(`Séquence ${seq}`, `Sequence ${seq}`);

    return (
      <Layout>
        <div className="space-y-5">

          {/* Bandeau bienvenue */}
          <div className="bg-white rounded-xl px-6 py-5 shadow-sm border border-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="leading-tight">
                <h1 className="text-xl font-bold text-gray-900">
                  {t('Bienvenue', 'Welcome')}{fullName ? `, ${fullName}` : ''}
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">{t('Enseignant', 'Teacher')}</p>
              </div>
              {/* Établissement + année + infos */}
              <div className="flex items-center gap-4">
                <SchoolBadge school={school} />
                {unreadMsgs > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-700">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                    {unreadMsgs} {t('message', 'message')}{unreadMsgs > 1 ? 's' : ''}
                  </span>
                )}
                <LicenseBadge school={school} />
              </div>
            </div>
          </div>

          {/* Aucune classe assignée */}
          {noClasses && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-10 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-amber-800 font-semibold mb-1">{t('Aucune classe assignée', 'No class assigned')}</p>
              <p className="text-amber-600 text-sm">{t("L'administrateur doit vous assigner des matières / classes.", 'The administrator needs to assign you subjects and classes.')}</p>
            </div>
          )}

          {/* Une carte par classe */}
          {teacherClassData.map(({ cls, studs, subs, sys, pass, max, latestSeq, stats, seqProgress, struggling }) => (
            <div key={cls.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

              {/* En-tête classe */}
              <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-5 text-white">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-brand-200 text-xs font-semibold uppercase tracking-wider mb-1">
                      {teacherClassData.length > 1 ? t('Classe', 'Class') : t('Votre classe', 'Your class')}
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

                {/* Matières */}
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

                {/* Élèves en difficulté */}
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

          {/* Accès rapide */}
          {!noClasses && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('Accès rapide', 'Quick access')}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { to: '/app/grades',    icon: '✏️', label: t('Notes', 'Grades'),         desc: t('Saisir / modifier', 'Enter / edit') },
                  { to: '/app/bulletins', icon: '📋', label: t('Bulletins', 'Report cards'), desc: t('Générer & imprimer', 'Generate & print') },
                  { to: '/app/conseil',   icon: '🗣️', label: t('Conseil de classe', 'Class council'), desc: t('Décisions & mentions', 'Decisions & remarks') },
                  { to: '/app/settings',  icon: '⚙️', label: t('Paramètres', 'Settings'),   desc: t('Mon profil', 'My profile') },
                ].map(({ to, icon, label, desc }) => (
                  <Link key={to} to={to}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-brand-300 hover:shadow-md transition-all group text-left"
                  >
                    <div className="text-xl mb-2">{icon}</div>
                    <div className="font-semibold text-gray-800 text-sm group-hover:text-brand-700">{label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </Layout>
    );
  }

  // ── Vue administrateur ────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-6">

        {/* Header école */}
        <div className="bg-white rounded-xl px-8 py-6 shadow-sm border border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {t('Bonjour', 'Hello')}{fullName ? `, ${fullName.split(' ')[0]}` : ''}
            </h1>
            {/* Établissement + année */}
            <div className="flex items-center gap-4">
              <SchoolBadge school={school} />
              <LicenseBadge school={school} />
            </div>
          </div>
        </div>

        {/* Guide de démarrage */}
        {!loading && (
          <SetupChecklist school={school} classes={classes} subjects={subjects} students={students} />
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon="classes"
            label={t('Classes', 'Classes')}
            value={loading ? '—' : classes.length}
            sub={t('configurées', 'configured')}
            accent="brand"
          />
          <StatCard
            icon="students"
            label={t('Élèves', 'Students')}
            value={loading ? '—' : students.length}
            sub={t('inscrits', 'enrolled')}
            accent="green"
          />
          <StatCard
            icon="pass"
            label={t('Taux de réussite', 'Pass rate')}
            value={loading ? '—' : globalPassRate !== null ? `${globalPassRate}%` : '—'}
            sub={t('toutes classes', 'all classes')}
            accent="purple"
          />
          <StatCard
            icon="fees"
            label={t('Recouvrement frais', 'Fee collection')}
            value={loading ? '—' : feesStats.rate !== null ? `${feesStats.rate}%` : '—'}
            sub={feesStats.unpaid > 0 ? `${feesStats.unpaid} ${t('impayé', 'unpaid')}${feesStats.unpaid > 1 ? 's' : ''}` : t('À jour', 'Up to date')}
            accent="amber"
          />
        </div>

        {/* Alertes — notes à compléter */}
        {!loading && missingGradesAlerts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-600 font-bold text-sm">{t('Notes à compléter', 'Grades to complete')}</span>
              <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
                {missingGradesAlerts.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {missingGradesAlerts.map(({ cls, nextSeq, entered, expected }) => {
                const pct = Math.round((entered / expected) * 100);
                return (
                  <Link
                    key={cls.id}
                    to="/app/grades"
                    className="bg-white rounded-lg p-3 border border-amber-200 hover:border-amber-400 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-800 text-sm group-hover:text-amber-700">
                        {cls.name}
                      </span>
                      <span className="text-xs text-amber-600 font-medium bg-amber-100 px-1.5 py-0.5 rounded">
                        {(cls.system === 'EN' ? SEQ_LABELS_EN : SEQ_LABELS_FR)[nextSeq]}
                      </span>
                    </div>
                    <div className="w-full bg-amber-100 rounded-full h-1.5 mb-1.5">
                      <div
                        className="bg-amber-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      {entered}/{expected} {t('notes saisies', 'grades entered')}
                      <span className="ml-1 text-amber-600 font-medium">({pct}%)</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Aperçu par classe */}
        {!loading && classes.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">{t('Aperçu par classe', 'Class overview')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('Statistiques de la dernière période avec des notes', 'Statistics from the last period with grades')}</p>
            </div>
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
                            sys === 'EN' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                            {sys}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{studs.length}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{subs.length}</td>
                        <td className="px-4 py-3 text-center">
                          {seq ? (
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
                              {(sys === 'EN' ? SEQ_LABELS_EN : SEQ_LABELS_FR)[seq]}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {stats?.avg !== null && stats?.avg !== undefined ? (
                            <span style={{ color: stats.avg >= pass ? '#059669' : '#ef4444' }} className="font-bold">
                              {stats.avg.toFixed(2)}
                              <span className="text-xs font-normal text-gray-400">/{max}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {passRate !== null ? (
                            <span style={{ color: passRate >= 50 ? '#059669' : '#ef4444' }} className="font-semibold">
                              {passRate}%
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            to="/app/grades"
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                          >
                            {t('Notes', 'Grades')}
                          </Link>
                          <span className="text-gray-300 mx-1">·</span>
                          <Link
                            to="/app/bulletins"
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                          >
                            {t('Bulletins', 'Report cards')}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state — aucune classe */}
        {!loading && classes.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-3">🏫</div>
            <p className="text-gray-600 font-medium mb-1">{t('Aucune classe configurée', 'No class configured')}</p>
            <p className="text-gray-400 text-sm mb-4">{t('Commencez par créer vos classes et matières.', 'Start by creating your classes and subjects.')}</p>
            <Link to="/app/classes" className="btn-primary text-sm">
              {t('Créer une classe', 'Create a class')}
            </Link>
          </div>
        )}

        {/* Raccourcis */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('Accès rapide', 'Quick access')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { to: '/app/grades',    icon: '✏️', label: t('Saisir les notes', 'Enter grades'),       desc: t('Par classe et période', 'By class and period') },
              { to: '/app/bulletins', icon: '📋', label: t('Bulletins', 'Report cards'),               desc: t('Générer et imprimer', 'Generate and print') },
              { to: '/app/students',  icon: '👥', label: t('Élèves', 'Students'),                      desc: t('Gérer les inscriptions', 'Manage enrollments') },
              { to: '/app/fees',      icon: '💰', label: t('Frais scolaires', 'School fees'),           desc: t('Paiements & recouvrement', 'Payments & collection') },
              { to: '/app/reports',   icon: '📊', label: t('Rapports', 'Reports'),                      desc: t('Résultats & classements', 'Results & rankings') },
              { to: '/app/classes',   icon: '🏫', label: t('Classes & Matières', 'Classes & Subjects'), desc: t('Configuration', 'Configuration') },
            ].map(({ to, icon, label, desc }) => (
              <Link
                key={to}
                to={to}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-brand-300 hover:shadow-md transition-all group"
              >
                <div className="text-2xl mb-2">{icon}</div>
                <div className="font-semibold text-gray-800 text-sm group-hover:text-brand-700">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
