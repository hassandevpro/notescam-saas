import { useState, useMemo, useCallback } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { buildRanks } from '../core/bulletinEngine';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { resolveCountryCode } from '../countries';
import { gradingOpts, geGradeMax } from '../lib/useCountry';
import { createDocumentScale, pageDimsPx } from '../lib/documentScale';
import SectionFilterSelect, { inSection } from '../components/SectionFilterSelect';
import '../styles/conseil.css';

// Dimensionnement « standard » du procès-verbal (A4 portrait) — aucune taille fixe.
const PV_SCALE = createDocumentScale({ category: 'standard', orientation: 'portrait', ...pageDimsPx('portrait') });

const SEQUENCES_FR = [
  { value: 1, label: 'Séquence 1' }, { value: 2, label: 'Séquence 2' },
  { value: 3, label: 'Séquence 3' }, { value: 4, label: 'Séquence 4' },
  { value: 5, label: 'Séquence 5' }, { value: 6, label: 'Séquence 6' },
];
const SEQUENCES_EN = [
  { value: 1, label: 'Term 1' },
  { value: 2, label: 'Term 2' },
  { value: 3, label: 'Term 3' },
];
const SEQUENCES_GE = [
  { value: 1, label: 'Primer Trimestre' },
  { value: 2, label: 'Segundo Trimestre' },
  { value: 3, label: 'Tercer Trimestre' },
];

const DECISION_STYLE = {
  admis:      'text-emerald-700 font-semibold',
  redoublant: 'text-amber-700 font-semibold',
  renvoye:    'text-red-700 font-semibold',
  '':         'text-gray-300',
};

function honor(scores, mode) {
  if (scores['__felicitation__'] === 'true')
    return mode === 'es' ? 'C.H + Felicitación' : mode === 'en' ? 'H.B + Congrats.' : 'T.H + Félic.';
  if (scores['__encouragement__'] === 'true')
    return mode === 'es' ? 'C.H + Estímulo' : mode === 'en' ? 'H.B + Encour.' : 'T.H + Encour.';
  if (scores['__th__'] === 'true')
    return mode === 'es' ? 'C.H' : mode === 'en' ? 'H.B' : 'T.H';
  return '—';
}

function num(v) { return parseInt(v || '0', 10) || 0; }

// Décision effective : la décision saisie prime ; à défaut, tout élève ayant la
// moyenne est « Admis » par défaut (valeur calculée, non persistée). Les élèves
// sous la moyenne ne sont jamais auto-décidés — le conseil tranche.
function effectiveDecision(scores, avg, pass, passVal) {
  return (scores['__decision__'] || '') || (avg !== null && avg >= pass ? passVal : '');
}

function hasIssue(row, pass) {
  if (row.avg !== null && row.avg < pass) return true;
  const s = row.scores;
  return (
    num(s['__abs_nj__'])        > 0 ||
    num(s['__aver_travail__'])  > 0 ||
    num(s['__blame_travail__']) > 0 ||
    num(s['__exclusions__'])    > 0 ||
    num(s['__aver_conduite__']) > 0 ||
    num(s['__blame_conduite__'])> 0
  );
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Analyse pédagogique d'un élève — cœur du moteur d'aide à la décision ──────
// Dérive un statut (réussite / surveillance / risque / en attente), une décision
// suggérée et les motifs déclencheurs, à partir de la moyenne et des champs
// disciplinaires. Aucune écriture : pur calcul réutilisable par les KPI, les
// cartes, l'analyse automatique et l'assistant.
function analyze(row, pass, scale, honorMode, isGE) {
  const s = row.scores;
  const avg = row.avg;
  const disc =
    num(s['__abs_nj__']) > 0 || num(s['__aver_travail__']) > 0 || num(s['__blame_travail__']) > 0 ||
    num(s['__exclusions__']) > 0 || num(s['__aver_conduite__']) > 0 || num(s['__blame_conduite__']) > 0;
  const hon = honor(s, honorMode) !== '—';
  const failing = avg !== null && avg < pass;
  const excellent = avg !== null && (avg >= scale * 0.8 || s['__felicitation__'] === 'true' || s['__encouragement__'] === 'true');
  const watch = !failing && avg !== null && (disc || avg < pass + scale * 0.075);
  const struggling = avg !== null && avg < pass + scale * 0.1;

  const status = avg === null ? 'pending' : failing ? 'risk' : watch ? 'watch' : 'success';

  const passVal  = isGE ? 'aprobado' : 'admis';
  const failVal  = isGE ? 'repite'   : 'redoublant';
  const watchVal = isGE ? 'recuperacion' : passVal;
  const suggested = avg === null ? '' : failing ? failVal : watch ? watchVal : passVal;

  return { avg, disc, hon, failing, excellent, watch, struggling, status, suggested };
}

const STATUS_META = {
  success: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', ring: 'ring-emerald-100', text: 'text-emerald-600' },
  watch:   { dot: 'bg-amber-500',   bar: 'bg-amber-500',   ring: 'ring-amber-100',   text: 'text-amber-600' },
  risk:    { dot: 'bg-red-500',     bar: 'bg-red-500',     ring: 'ring-red-100',     text: 'text-red-600' },
  pending: { dot: 'bg-slate-300',   bar: 'bg-slate-200',   ring: 'ring-slate-100',   text: 'text-slate-400' },
};

// ── Switch minimaliste (style Linear/Stripe) ─────────────────────────────────
function Toggle({ on, onChange, label, hint, accent = 'brand' }) {
  const accentBg = { brand: 'bg-brand-500', amber: 'bg-amber-500', red: 'bg-red-500', purple: 'bg-purple-500', emerald: 'bg-emerald-500' }[accent];
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 transition-colors text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700 truncate">{label}</span>
        {hint && <span className="block text-[11px] text-slate-400 truncate">{hint}</span>}
      </span>
      <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? accentBg : 'bg-slate-200'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

// ── Stepper compact pour les champs comptés (avert./blâmes/exclusions/abs) ────
function Stepper({ value, onChange, label, accent = 'slate' }) {
  const n = num(value);
  const accentText = { amber: 'text-amber-600', red: 'text-red-600', orange: 'text-orange-600', slate: 'text-slate-700' }[accent];
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-200">
      <span className="text-sm font-medium text-slate-600 min-w-0 truncate">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={() => onChange(String(Math.max(0, n - 1)))} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 font-bold leading-none">−</button>
        <span className={`w-6 text-center font-bold tabular-nums ${n > 0 ? accentText : 'text-slate-300'}`}>{n}</span>
        <button type="button" onClick={() => onChange(String(n + 1))} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 font-bold leading-none">+</button>
      </div>
    </div>
  );
}

export default function ConseilDeClasse() {
  const t            = useT();
  const school         = useAuthStore((s) => s.school);
  const schoolLanguage = school?.language || 'francophone';
  const classes  = useSchoolStore((s) => s.classes);
  const subjects = useSchoolStore((s) => s.subjects);
  const students = useSchoolStore((s) => s.students);
  const gradeMap = useSchoolStore((s) => s.gradeMap);
  const saveGrade = useSchoolStore((s) => s.saveGrade);

  const [classId, setClassId] = useState('');
  const [sectionF, setSectionF] = useState('');
  const [seq,     setSeq]     = useState(1);
  const [filter,  setFilter]  = useState('issues');   // all | issues | success | watch | risk | honors
  const [view,    setView]    = useState('cards');    // cards | table
  const [showPreview, setShowPreview] = useState(false);
  const [assistId, setAssistId] = useState(null);     // élève ouvert dans l'assistant

  const cls      = classes.find((c) => c.id === classId) || null;
  const sys      = cls?.system || 'FR';
  const isEN     = sys === 'EN';
  const isGE     = resolveCountryCode(school) === 'guinea_eq';
  const honorMode = isGE ? 'es' : isEN ? 'en' : 'fr';
  const periods  = isGE ? SEQUENCES_GE : isEN ? SEQUENCES_EN : SEQUENCES_FR;
  const gOpts    = gradingOpts(school, cls?.cycle);
  const pass     = isGE ? geGradeMax(school) / 2 : sys === 'FR' ? 10 : 50;
  const passVal  = isGE ? 'aprobado' : 'admis';
  const scale    = gOpts.maxScale ?? (isGE ? geGradeMax(school) : isEN ? 100 : 20);
  const subs     = useMemo(() => subjects.filter((s) => s.class_id === classId), [subjects, classId]);
  const studs    = useMemo(() => students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)), [students, classId]);

  const DECISIONS = isGE
    ? [
        { value: '',            label: '—' },
        { value: 'aprobado',    label: 'Aprobado' },
        { value: 'recuperacion', label: 'Recuperación' },
        { value: 'repite',      label: 'Repite' },
        { value: 'expulsado',   label: 'Expulsado' },
      ]
    : [
        { value: '',           label: '—' },
        { value: 'admis',      label: t('Admis', 'Passed') },
        { value: 'redoublant', label: t('Redoublant', 'Repeating') },
        { value: 'renvoye',    label: t('Renvoyé', 'Expelled') },
      ];

  const rows = useMemo(() => {
    if (!classId) return [];
    const ranked = buildRanks(studs, gradeMap, classId, [seq], subs, sys, {}, gOpts);
    return ranked.map((r) => ({
      stu:    studs.find((s) => s.id === r.id) || r,
      scores: gradeMap[`${classId}_${r.id}_${seq}`] || {},
      avg:    r.av,
      rang:   r.rankD,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, seq, studs, gradeMap, subs, sys, gOpts.maxScale, gOpts.useCoef]);

  // Lignes enrichies de leur analyse — source unique pour KPI / cartes / analyse.
  const analyzed = useMemo(
    () => rows.map((r) => ({ ...r, a: analyze(r, pass, scale, honorMode, isGE) })),
    [rows, pass, scale, honorMode, isGE],
  );

  const stats = useMemo(() => {
    const withAvg   = analyzed.filter((r) => r.avg !== null);
    const total     = analyzed.length;
    const admis     = withAvg.filter((r) => r.avg >= pass).length;
    const surveil   = analyzed.filter((r) => r.a.status === 'watch').length;
    const risque    = analyzed.filter((r) => r.a.status === 'risk').length;
    const distincts = analyzed.filter((r) => r.a.hon).length;
    const issues    = analyzed.filter((r) => hasIssue(r, pass)).length;
    const decisions = analyzed.filter((r) => effectiveDecision(r.scores, r.avg, pass, passVal) !== '').length;
    const avgs      = withAvg.map((r) => r.avg);
    const moy       = avgs.length ? avgs.reduce((s, v) => s + v, 0) / avgs.length : null;
    const best      = withAvg.length ? withAvg.reduce((m, r) => (r.avg > m.avg ? r : m)) : null;
    const worst     = withAvg.length ? withAvg.reduce((m, r) => (r.avg < m.avg ? r : m)) : null;
    const taux      = withAvg.length ? Math.round((admis / withAvg.length) * 100) : null;
    return { total, admis, surveil, risque, distincts, issues, decisions, moy, best, worst, taux, graded: withAvg.length };
  }, [analyzed, pass, passVal]);

  // Listes de l'analyse automatique.
  const analysis = useMemo(() => ({
    difficile:    analyzed.filter((r) => r.a.struggling && !r.a.failing),
    excellents:   analyzed.filter((r) => r.a.excellent),
    discipline:   analyzed.filter((r) => r.a.disc),
    redoublement: analyzed.filter((r) => r.a.failing),
  }), [analyzed]);

  const visibleRows = useMemo(() => analyzed.filter((r) => {
    switch (filter) {
      case 'all':     return true;
      case 'issues':  return hasIssue(r, pass);
      case 'success': return r.a.status === 'success';
      case 'watch':   return r.a.status === 'watch';
      case 'risk':    return r.a.status === 'risk';
      case 'honors':  return r.a.hon;
      default:        return true;
    }
  }), [analyzed, filter, pass]);

  const setField = useCallback(
    (studentId, field, value) => saveGrade(classId, studentId, seq, { [field]: value }),
    [classId, seq, saveGrade],
  );
  const saveDecision = useCallback((studentId, value) => setField(studentId, '__decision__', value), [setField]);

  const seqLabel = periods.find((s) => s.value === seq)?.label || '';
  const today    = new Date().toLocaleDateString(isGE ? 'es-ES' : isEN ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const classAvg = stats.moy !== null ? stats.moy.toFixed(2) : '—';

  const assistRow = analyzed.find((r) => r.stu.id === assistId) || null;

  // ── KPI du tableau de bord pédagogique ─────────────────────────────────────
  const KPIS = [
    { key: 'success', emoji: '🟢', label: t('Admis', 'Passed'),               value: stats.admis,     sub: `≥ ${pass}`,                            tone: 'emerald' },
    { key: 'watch',   emoji: '🟡', label: t('Sous surveillance', 'Watchlist'), value: stats.surveil,   sub: t('à suivre', 'to monitor'),            tone: 'amber' },
    { key: 'risk',    emoji: '🔴', label: t('Redoublement', 'At risk'),        value: stats.risque,    sub: `< ${pass}`,                            tone: 'red' },
    { key: 'honors',  emoji: '🏆', label: t('Distinctions', 'Honours'),        value: stats.distincts, sub: 'T.H / Encour. / Félic.',               tone: 'purple' },
    { key: 'issues',  emoji: '⚠️', label: t('Cas particuliers', 'Flagged'),    value: stats.issues,    sub: t('à examiner', 'to review'),           tone: 'slate' },
  ];
  const TONE = {
    emerald: 'from-emerald-50 to-white border-emerald-100 text-emerald-700',
    amber:   'from-amber-50 to-white border-amber-100 text-amber-700',
    red:     'from-red-50 to-white border-red-100 text-red-700',
    purple:  'from-purple-50 to-white border-purple-100 text-purple-700',
    slate:   'from-slate-50 to-white border-slate-200 text-slate-700',
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">

        {/* ══ 1. HEADER MODERNE ══════════════════════════════════════════════ */}
        <div className="no-print mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                {isGE ? 'Junta de Evaluación' : t('Conseil de classe', 'Class council')}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                {isGE ? 'Acta — Junta de Evaluación' : t('Procès-verbal du conseil de classe', 'Class council record')}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {isGE
                  ? 'Centro de ayuda a la decisión pedagógica por clase y trimestre.'
                  : t('Centre d’aide à la décision pédagogique par classe et par séquence.',
                      'Pedagogical decision-support hub, by class and term.')}
              </p>
            </div>

            {classId && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    showPreview ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                  {isGE ? 'Vista previa' : t('Aperçu PV', 'Preview')}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white shadow-sm transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
                  </svg>
                  {isGE ? 'Imprimir / PDF' : t('Imprimer / PDF', 'Print / PDF')}
                </button>
              </div>
            )}
          </div>

          {/* Sélecteurs + barre méta */}
          <div className="mt-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex flex-wrap items-end gap-4 border-b border-slate-100">
              <SectionFilterSelect
                classes={classes}
                value={sectionF}
                onChange={(v) => { setSectionF(v); if (classId && !inSection(classes.find((c) => c.id === classId), v)) { setClassId(''); setSeq(1); setFilter('issues'); setAssistId(null); } }}
              />
              <div className="min-w-[200px]">
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t('Classe', 'Class')}</label>
                <select className="form-input" value={classId} onChange={(e) => { setClassId(e.target.value); setSeq(1); setFilter('issues'); setAssistId(null); }}>
                  <option value="">— {t('Sélectionner', 'Select')} —</option>
                  {classes.filter((c) => inSection(c, sectionF)).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{schoolLanguage === 'bilingue' ? ` [${c.system === 'EN' ? 'EN' : 'FR'}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {classId && (
                <div className="min-w-[170px]">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">{isGE ? 'Trimestre' : isEN ? 'Term' : t('Séquence', 'Sequence')}</label>
                  <select className="form-input" value={seq} onChange={(e) => { setSeq(Number(e.target.value)); setAssistId(null); }}>
                    {periods.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              )}
              {classId && (
                <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                  {[
                    { v: 'cards', label: t('Cartes', 'Cards') },
                    { v: 'table', label: t('Tableau', 'Table') },
                  ].map(({ v, label }) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {classId && (
              <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm bg-slate-50/60">
                <Meta label={t('Classe', 'Class')}    value={cls?.name || '—'} />
                <Meta label={isGE ? 'Trimestre' : isEN ? 'Term' : t('Séquence', 'Sequence')} value={seqLabel} />
                <Meta label={t('Effectif', 'Enrolment')} value={stats.total} />
                <Meta label={t('Notes saisies', 'Graded')} value={`${stats.graded}/${stats.total}`} />
                <Meta label={isGE ? 'Fecha' : t('Date du conseil', 'Council date')} value={today} />
              </div>
            )}
          </div>
        </div>

        {/* ÉTAT VIDE */}
        {!classId && (
          <div className="no-print bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-500">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">{t('Sélectionnez une classe pour ouvrir le conseil.', 'Select a class to open the council.')}</p>
            <p className="text-sm text-slate-400 mt-1">{t('Le tableau de bord et l’analyse s’afficheront automatiquement.', 'The dashboard and analysis will appear automatically.')}</p>
          </div>
        )}

        {classId && (
          <div className="no-print">

            {/* ══ 2. DASHBOARD PÉDAGOGIQUE — KPI cliquables (= filtres) ════════ */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              {KPIS.map((k) => {
                const active = filter === k.key;
                return (
                  <button
                    key={k.key}
                    onClick={() => setFilter(active ? 'all' : k.key)}
                    className={`text-left rounded-2xl border bg-gradient-to-b p-4 transition-all ${TONE[k.tone]} ${active ? 'ring-2 ring-offset-1 ring-brand-400 shadow-md' : 'hover:shadow-sm'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg leading-none">{k.emoji}</span>
                      <span className="text-2xl font-bold tabular-nums text-slate-900">{k.value}</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-700">{k.label}</div>
                    <div className="text-[11px] text-slate-400">{k.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* ══ 3. RÉSUMÉ DE CLASSE ═════════════════════════════════════════ */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <SummaryStat label={t('Moyenne générale', 'Class average')} value={classAvg} suffix={`/ ${scale}`} />
              <SummaryStat label={t('Taux de réussite', 'Pass rate')} value={stats.taux !== null ? `${stats.taux}%` : '—'}
                bar={stats.taux} barTone={stats.taux >= 50 ? 'bg-emerald-500' : 'bg-amber-500'} />
              <SummaryStat label={t('Meilleure moyenne', 'Top average')} value={stats.best ? stats.best.avg.toFixed(2) : '—'}
                hint={stats.best ? stats.best.stu.name : null} tone="text-emerald-600" />
              <SummaryStat label={t('Moyenne la plus basse', 'Lowest average')} value={stats.worst ? stats.worst.avg.toFixed(2) : '—'}
                hint={stats.worst ? stats.worst.stu.name : null} tone="text-red-500" />
            </div>

            {/* ══ 5. ANALYSE AUTOMATIQUE ══════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              <AnalysisPanel
                icon="📉" tone="amber"
                title={t('Élèves en difficulté', 'Struggling students')}
                rows={analysis.difficile} onPick={setAssistId} scale={scale}
                empty={t('Aucun', 'None')}
              />
              <AnalysisPanel
                icon="⭐" tone="emerald"
                title={t('Élèves excellents', 'Top performers')}
                rows={analysis.excellents} onPick={setAssistId} scale={scale}
                empty={t('Aucun', 'None')}
              />
              <AnalysisPanel
                icon="⚖️" tone="orange"
                title={t('Cas disciplinaires', 'Discipline cases')}
                rows={analysis.discipline} onPick={setAssistId} scale={scale}
                empty={t('Aucun', 'None')}
              />
              <AnalysisPanel
                icon="🔻" tone="red"
                title={t('Risques de redoublement', 'Repeat risk')}
                rows={analysis.redoublement} onPick={setAssistId} scale={scale}
                empty={t('Aucun', 'None')}
              />
            </div>

            {/* Barre de filtre active */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-semibold text-slate-700">
                {t('Vue élèves', 'Students')}
                <span className="ml-2 text-slate-400 font-normal">{visibleRows.length}/{stats.total}</span>
              </p>
              {filter !== 'all' && (
                <button onClick={() => setFilter('all')} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                  {t('Voir tous les élèves', 'Show all students')} ✕
                </button>
              )}
            </div>

            {/* ══ 4. VUE ÉLÈVES — CARTES ══════════════════════════════════════ */}
            {visibleRows.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                {t('Aucun élève ne correspond à ce filtre.', 'No students match this filter.')}
              </div>
            )}

            {view === 'cards' && visibleRows.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {visibleRows.map((row, idx) => (
                  <StudentCard
                    key={row.stu.id} row={row} idx={idx} pass={pass} scale={scale}
                    honorMode={honorMode} DECISIONS={DECISIONS}
                    onAssist={() => setAssistId(row.stu.id)}
                    onDecision={(v) => saveDecision(row.stu.id, v)}
                    t={t} isGE={isGE}
                  />
                ))}
              </div>
            )}

            {/* ══ 4 bis. VUE TABLEAU (scan rapide) ════════════════════════════ */}
            {view === 'table' && visibleRows.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                        <th className="px-4 py-3 text-left font-semibold">{t('Élève', 'Student')}</th>
                        <th className="px-3 py-3 text-center font-semibold">{t('Moy.', 'Avg.')}</th>
                        <th className="px-3 py-3 text-center font-semibold">{t('Rang', 'Rank')}</th>
                        <th className="px-3 py-3 text-center font-semibold">Abs.</th>
                        <th className="px-3 py-3 text-center font-semibold">{t('Distinction', 'Honours')}</th>
                        <th className="px-3 py-3 text-center font-semibold">{t('Décision', 'Decision')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleRows.map((row) => {
                        const { stu, scores, avg, rang, a } = row;
                        const m = STATUS_META[a.status];
                        const hon = honor(scores, honorMode);
                        const absT = num(scores['__abs_j__']) + num(scores['__abs_nj__']);
                        return (
                          <tr key={stu.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setAssistId(stu.id)}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <span className={`w-2 h-2 rounded-full ${m.dot}`} />
                                <Avatar stu={stu} size={28} />
                                <div className="min-w-0">
                                  <div className="font-medium text-slate-800 truncate">{stu.name}</div>
                                  {stu.matricule && <div className="text-[11px] text-slate-400 font-mono">{stu.matricule}</div>}
                                </div>
                              </div>
                            </td>
                            <td className={`px-3 py-2.5 text-center font-bold ${avg !== null ? (avg >= pass ? 'text-emerald-600' : 'text-red-500') : 'text-slate-300'}`}>{avg !== null ? avg : '—'}</td>
                            <td className="px-3 py-2.5 text-center text-slate-600">{rang ?? '—'}</td>
                            <td className="px-3 py-2.5 text-center text-slate-600">{absT || '—'}</td>
                            <td className="px-3 py-2.5 text-center">
                              {hon !== '—' ? <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold text-[10px]">{hon}</span> : <span className="text-slate-200">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <select
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
                                value={effectiveDecision(scores, avg, pass, passVal)}
                                onChange={(e) => saveDecision(stu.id, e.target.value)}
                              >
                                {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ══ 7. PRÉVISUALISATION TEMPS RÉEL DU PV ════════════════════════ */}
            {showPreview && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-700">
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  {t('Aperçu du procès-verbal', 'Record preview')}
                  <span className="text-xs font-normal text-slate-400">— {t('aperçu fidèle du document imprimé', 'true-to-print preview')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
             8 + 9. DOCUMENT OFFICIEL — gabarit d'impression / PDF premium.
             display:none à l'écran, sauf si .pv-preview-frame (aperçu live).
            ══════════════════════════════════════════════════════════════════ */}
        {classId && (
          <div className={showPreview ? 'pv-preview-frame' : ''}>
            <div className="pv-paper">

              <table className="pv-head">
                <tbody>
                  <tr>
                    <td className="pv-head-side">
                      {isGE ? (
                        <><strong>REPÚBLICA DE GUINEA ECUATORIAL</strong><br />Unidad – Paz – Justicia<br />———————<br />Ministerio de Educación<br />y Enseñanza Universitaria<br />{school?.region || '—'}</>
                      ) : (
                        <><strong>RÉPUBLIQUE DU CAMEROUN</strong><br />Paix – Travail – Patrie<br />———————<br />Ministère des Enseignements Secondaires (MINESEC)<br />Délégation Régionale {school?.region || '—'}<br />Délégation Départementale {school?.division || '—'}</>
                      )}
                    </td>
                    <td className="pv-head-center">
                      {school?.logo_url && <img src={school.logo_url} alt="Logo" className="pv-head-logo" style={{ width: PV_SCALE.logoSm, height: PV_SCALE.logoSm }} />}
                      <strong className="pv-head-school">{(school?.name || '').toUpperCase()}</strong>
                      {(school?.address || school?.phone) && (
                        <span className="pv-head-meta">{school?.address ? `${isGE ? 'Apdo.' : 'B.P.'} ${school.address}` : ''}{school?.address && school?.phone ? ' · ' : ''}{school?.phone || ''}</span>
                      )}
                      <br />
                      <span className="pv-head-meta">{isGE ? 'Año escolar' : t('Année scolaire', 'Academic year')} : <strong>{school?.current_year || '—'}</strong></span>
                    </td>
                    <td className="pv-head-side">
                      {isGE ? (
                        <><strong>MINISTERIO DE EDUCACIÓN</strong><br />Y Enseñanza Universitaria<br />———————<br />Dirección Provincial<br />{school?.region || '—'}</>
                      ) : (
                        <><strong>REPUBLIC OF CAMEROON</strong><br />Peace – Work – Fatherland<br />———————<br />Ministry of Secondary Education (MINESEC)<br />Regional Delegation {school?.region || '—'}<br />Divisional Delegation {school?.division || '—'}</>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="pv-title-bar">
                {isGE
                  ? `ACTA DE LA JUNTA DE EVALUACIÓN — ${seqLabel.toUpperCase()}`
                  : `${t('PROCÈS-VERBAL DU CONSEIL DE CLASSE', 'CLASS COUNCIL — OFFICIAL RECORD')} — ${seqLabel.toUpperCase()}`}
              </div>

              <table className="pv-info">
                <tbody>
                  <tr>
                    <td><strong>{isGE ? 'Curso' : t('Classe', 'Class')} :</strong> {cls?.name || '—'}</td>
                    <td><strong>{isGE ? 'Trimestre' : isEN ? 'Term' : t('Séquence', 'Sequence')} :</strong> {seqLabel}</td>
                    <td><strong>{isGE ? 'Efectivo' : t('Effectif', 'Enrolment')} :</strong> {stats.total}</td>
                    <td><strong>{isGE ? 'Año' : t('Année', 'Year')} :</strong> {school?.current_year || '—'}</td>
                  </tr>
                </tbody>
              </table>

              <table className="pv-doc-table">
                <thead>
                  <tr>
                    <th style={{ width: '4%' }}>N°</th>
                    <th style={{ width: '24%' }}>{isGE ? 'Alumno' : t('Élève', 'Student')}</th>
                    <th>{isGE ? 'Media' : t('Moy.', 'Avg.')}</th>
                    <th>{isGE ? 'Pto.' : t('Rang', 'Rank')}</th>
                    <th>Abs.J</th>
                    <th>Abs.NJ</th>
                    <th style={{ width: '13%' }}>{isGE ? 'Distinción' : t('Distinction', 'Honours')}</th>
                    <th>Av.T</th>
                    <th>Bl.T</th>
                    <th>{isGE ? 'Exp.' : 'Excl.'}</th>
                    <th>Av.C</th>
                    <th>Bl.C</th>
                    <th style={{ width: '13%' }}>{isGE ? 'Decisión' : t('Décision', 'Decision')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 && (
                    <tr><td colSpan={13} style={{ padding: '12px' }}>
                      {isGE ? 'Ningún alumno.' : t('Aucun élève.', 'No students.')}
                    </td></tr>
                  )}
                  {visibleRows.map((row, idx) => {
                    const { stu, scores, avg, rang } = row;
                    const absJ  = num(scores['__abs_j__']) + num(scores['__abs_nj__']);
                    const absNJ = num(scores['__abs_nj__']);
                    const hon   = honor(scores, honorMode);
                    const dec   = effectiveDecision(scores, avg, pass, passVal);
                    const decLabel = DECISIONS.find((d) => d.value === dec)?.label || '—';
                    return (
                      <tr key={stu.id}>
                        <td>{idx + 1}</td>
                        <td className="pv-name">
                          {stu.name}
                          {stu.matricule && <small>{stu.matricule}</small>}
                        </td>
                        <td>{avg !== null ? avg : '—'}</td>
                        <td>{rang ?? '—'}</td>
                        <td>{absJ || '—'}</td>
                        <td>{absNJ || '—'}</td>
                        <td>{hon}</td>
                        <td>{num(scores['__aver_travail__']) || '—'}</td>
                        <td>{num(scores['__blame_travail__']) || '—'}</td>
                        <td>{num(scores['__exclusions__']) || '—'}</td>
                        <td>{num(scores['__aver_conduite__']) || '—'}</td>
                        <td>{num(scores['__blame_conduite__']) || '—'}</td>
                        <td>{decLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="pv-name">
                      {filter === 'all' ? (isGE ? 'CLASE COMPLETA' : t('CLASSE ENTIÈRE', 'FULL CLASS')) : `${isGE ? 'CASOS' : t('CAS À TRAITER', 'CASES')} (${visibleRows.length}/${stats.total})`}
                    </td>
                    <td>{classAvg}</td>
                    <td colSpan={3}>{stats.admis}/{stats.total} {isGE ? 'apr.' : t('adm.', 'pass.')}</td>
                    <td>{stats.distincts}</td>
                    <td colSpan={5}>—</td>
                    <td>{stats.decisions}/{stats.total}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="pv-recap">
                {isGE
                  ? `Junta de Evaluación celebrada en el centro. Efectivo: ${stats.total}. Aprobados: ${stats.admis}. Distinciones: ${stats.distincts}. Decisiones registradas: ${stats.decisions}.`
                  : t(
                      `Conseil de classe tenu dans l'établissement. Effectif : ${stats.total}. Admis : ${stats.admis}. Distinctions : ${stats.distincts}. Décisions saisies : ${stats.decisions}.`,
                      `Class council held at the school. Enrolment: ${stats.total}. Passed: ${stats.admis}. Honours: ${stats.distincts}. Decisions entered: ${stats.decisions}.`,
                    )}
              </div>

              <p className="pv-date">
                {isGE
                  ? `En __________________, a ${today}.`
                  : t(`Fait à __________________, le ${today}.`, `Done at __________________, on ${today}.`)}
              </p>

              <table className="pv-sign">
                <tbody>
                  <tr>
                    <td style={{ border: 'none', width: '55%' }} />
                    <td className="pv-sign-head" style={{ width: '45%' }}>
                      {isGE ? 'El Director / La Directora' : t('Le Directeur / Proviseur', 'The Principal')}
                      {school?.signature_url && <img src={school.signature_url} alt="Signature" style={{ height: PV_SCALE.signatureHeight, mixBlendMode: 'multiply' }} />}
                      {school?.stamp_url && <img src={school.stamp_url} alt="Cachet" style={{ height: PV_SCALE.stamp, mixBlendMode: 'multiply' }} />}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="pv-notice">
                {isGE
                  ? "Esta acta solo es válida con la firma y el sello del director del centro."
                  : t(
                      "Ce procès-verbal n'est valable qu'avec la signature et le cachet du chef d'établissement.",
                      'This record is valid only with the signature and stamp of the head of school.',
                    )}
              </p>
            </div>
          </div>
        )}

        {/* ══ 6. ASSISTANT DE DÉCISION (drawer latéral) ══════════════════════ */}
        {assistRow && (
          <DecisionAssistant
            row={assistRow} pass={pass} scale={scale} honorMode={honorMode}
            DECISIONS={DECISIONS} onClose={() => setAssistId(null)}
            onField={(field, value) => setField(assistRow.stu.id, field, value)}
            t={t} isGE={isGE}
          />
        )}
      </div>
    </Layout>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   SOUS-COMPOSANTS
   ════════════════════════════════════════════════════════════════════════════ */

function Meta({ label, value }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </span>
  );
}

function SummaryStat({ label, value, suffix, hint, tone = 'text-slate-900', bar, barTone }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</span>
        {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-400 truncate mt-0.5">{hint}</div>}
      {typeof bar === 'number' && (
        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
    </div>
  );
}

function Avatar({ stu, size = 36 }) {
  const s = { width: size, height: size };
  if (stu.photo_url) {
    return <img src={stu.photo_url} alt="" style={s} className="rounded-full object-cover shrink-0 ring-1 ring-slate-200" />;
  }
  return (
    <span style={s} className="rounded-full shrink-0 bg-gradient-to-br from-brand-500 to-purple-500 text-white flex items-center justify-center font-bold" >
      <span style={{ fontSize: size * 0.36 }}>{initials(stu.name)}</span>
    </span>
  );
}

const TONE_PANEL = {
  amber:   'border-amber-100',
  emerald: 'border-emerald-100',
  orange:  'border-orange-100',
  red:     'border-red-100',
};
function AnalysisPanel({ icon, title, rows, onPick, scale, empty, tone }) {
  return (
    <div className={`bg-white rounded-2xl border ${TONE_PANEL[tone]} shadow-sm p-4 flex flex-col`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><span>{icon}</span>{title}</span>
        <span className="text-xs font-bold text-slate-400 tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-300 py-2">{empty}</p>
      ) : (
        <div className="space-y-1 -mx-1">
          {rows.slice(0, 5).map((r) => (
            <button key={r.stu.id} onClick={() => onPick(r.stu.id)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left">
              <span className="flex items-center gap-2 min-w-0">
                <Avatar stu={r.stu} size={22} />
                <span className="text-sm text-slate-700 truncate">{r.stu.name}</span>
              </span>
              <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0">{r.avg !== null ? r.avg : '—'}</span>
            </button>
          ))}
          {rows.length > 5 && <p className="text-[11px] text-slate-400 px-2 pt-1">+{rows.length - 5}…</p>}
        </div>
      )}
    </div>
  );
}

function StudentCard({ row, idx, pass, scale, honorMode, DECISIONS, onAssist, onDecision, t, isGE }) {
  const { stu, scores, avg, rang, a } = row;
  const m = STATUS_META[a.status];
  const hon = honor(scores, honorMode);
  const absJ = num(scores['__abs_j__']);
  const absNJ = num(scores['__abs_nj__']);
  const passVal = isGE ? 'aprobado' : 'admis';
  const dec = effectiveDecision(scores, avg, pass, passVal);
  const suggLabel = DECISIONS.find((d) => d.value === a.suggested)?.label;
  const showSuggest = a.suggested && dec !== a.suggested;

  const discBadges = [
    num(scores['__aver_travail__'])  > 0 && { l: 'Av.T', n: num(scores['__aver_travail__']),  c: 'bg-amber-100 text-amber-700' },
    num(scores['__blame_travail__']) > 0 && { l: 'Bl.T', n: num(scores['__blame_travail__']), c: 'bg-red-100 text-red-700' },
    num(scores['__exclusions__'])    > 0 && { l: 'Excl', n: num(scores['__exclusions__']),    c: 'bg-orange-100 text-orange-700' },
    num(scores['__aver_conduite__']) > 0 && { l: 'Av.C', n: num(scores['__aver_conduite__']), c: 'bg-amber-100 text-amber-700' },
    num(scores['__blame_conduite__'])> 0 && { l: 'Bl.C', n: num(scores['__blame_conduite__']),c: 'bg-red-100 text-red-700' },
  ].filter(Boolean);

  return (
    <div className={`relative bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${m.bar}`} />
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          <Avatar stu={stu} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
              <h3 className="font-semibold text-slate-800 truncate">{stu.name}</h3>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">{stu.matricule || `#${idx + 1}`}</p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-xl font-bold tabular-nums leading-none ${avg !== null ? (avg >= pass ? 'text-emerald-600' : 'text-red-500') : 'text-slate-300'}`}>
              {avg !== null ? avg : '—'}
            </div>
            <div className="text-[10px] text-slate-400">/ {scale}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold">{t('Rang', 'Rank')} {rang ?? '—'}</span>
          <span className={`px-2 py-0.5 rounded-md font-semibold ${absNJ > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
            {absJ + absNJ} {t('abs', 'abs')}{absNJ > 0 ? ` (${absNJ} nj)` : ''}
          </span>
          {hon !== '—' && <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 font-semibold">🏆 {hon}</span>}
          {discBadges.map((b) => (
            <span key={b.l} className={`px-1.5 py-0.5 rounded-md font-semibold ${b.c}`}>{b.l} {b.n}</span>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
          <select
            className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
            value={dec}
            onChange={(e) => onDecision(e.target.value)}
          >
            {DECISIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <button
            onClick={onAssist}
            className="shrink-0 px-3 py-2 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 text-sm font-semibold transition-colors"
            title={t('Assistant de décision', 'Decision assistant')}
          >
            ⚙︎
          </button>
        </div>

        {showSuggest && (
          <button
            onClick={() => onDecision(a.suggested)}
            className="mt-2 w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            💡 {t('Proposé', 'Suggested')} : <strong>{suggLabel}</strong> — {t('cliquer pour appliquer', 'tap to apply')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── 6. ASSISTANT DE DÉCISION — drawer ────────────────────────────────────────
function DecisionAssistant({ row, pass, scale, honorMode, DECISIONS, onClose, onField, t, isGE }) {
  const { stu, scores, avg, rang, a } = row;
  const isTrue = (f) => scores[f] === 'true';
  const passVal = isGE ? 'aprobado' : 'admis';
  const eff = effectiveDecision(scores, avg, pass, passVal);

  return (
    <div className="fixed inset-0 z-[70] no-print" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" />
      <aside
        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <Avatar stu={stu} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-800 truncate">{stu.name}</h2>
            <p className="text-xs text-slate-400">
              {t('Moyenne', 'Average')} <strong className={avg !== null ? (avg >= pass ? 'text-emerald-600' : 'text-red-500') : ''}>{avg !== null ? avg : '—'}</strong>/{scale}
              {' · '}{t('Rang', 'Rank')} {rang ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Suggestion */}
          {a.suggested && eff !== a.suggested && (
            <div className="rounded-xl bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100 p-3.5">
              <p className="text-xs font-semibold text-brand-700">💡 {t('Décision suggérée', 'Suggested decision')}</p>
              <p className="text-sm text-slate-600 mt-0.5">
                {t('Sur la base de la moyenne et des observations.', 'Based on the average and observations.')}
              </p>
              <button
                onClick={() => onField('__decision__', a.suggested)}
                className="mt-2 w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
              >
                {t('Appliquer', 'Apply')} : {DECISIONS.find((d) => d.value === a.suggested)?.label}
              </button>
            </div>
          )}

          {/* Distinctions */}
          <section>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{isGE ? 'Distinciones' : t('Distinctions', 'Honours')}</h3>
            <div className="space-y-2">
              <Toggle accent="purple" label={isGE ? 'Cuadro de Honor' : t('Tableau d’honneur', 'Honour roll')} on={isTrue('__th__')} onChange={(v) => onField('__th__', v ? 'true' : 'false')} />
              <Toggle accent="emerald" label={t('Encouragements', 'Encouragement')} on={isTrue('__encouragement__')} onChange={(v) => onField('__encouragement__', v ? 'true' : 'false')} />
              <Toggle accent="purple" label={t('Félicitations', 'Congratulations')} on={isTrue('__felicitation__')} onChange={(v) => onField('__felicitation__', v ? 'true' : 'false')} />
            </div>
          </section>

          {/* Discipline & travail */}
          <section>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('Travail & discipline', 'Work & discipline')}</h3>
            <div className="space-y-2">
              <Stepper accent="amber"  label={t('Avertissement travail', 'Work warning')}     value={scores['__aver_travail__']}  onChange={(v) => onField('__aver_travail__', v)} />
              <Stepper accent="red"    label={t('Blâme travail', 'Work reprimand')}            value={scores['__blame_travail__']} onChange={(v) => onField('__blame_travail__', v)} />
              <Stepper accent="amber"  label={t('Avertissement conduite', 'Conduct warning')}  value={scores['__aver_conduite__']} onChange={(v) => onField('__aver_conduite__', v)} />
              <Stepper accent="red"    label={t('Blâme conduite', 'Conduct reprimand')}        value={scores['__blame_conduite__']} onChange={(v) => onField('__blame_conduite__', v)} />
              <Stepper accent="orange" label={isGE ? 'Expulsiones' : t('Exclusions', 'Exclusions')} value={scores['__exclusions__']} onChange={(v) => onField('__exclusions__', v)} />
            </div>
          </section>

          {/* Assiduité */}
          <section>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t('Assiduité', 'Attendance')}</h3>
            <div className="space-y-2">
              <Stepper label={t('Absences justifiées (h)', 'Excused absences (h)')}    value={scores['__abs_j__']}  onChange={(v) => onField('__abs_j__', v)} />
              <Stepper accent="red" label={t('Absences non justifiées (h)', 'Unexcused absences (h)')} value={scores['__abs_nj__']} onChange={(v) => onField('__abs_nj__', v)} />
            </div>
          </section>

          {/* Décision finale */}
          <section>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{isGE ? 'Decisión del consejo' : t('Décision du conseil', 'Council decision')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {DECISIONS.filter((d) => d.value).map((d) => {
                const active = eff === d.value;
                return (
                  <button
                    key={d.value}
                    onClick={() => onField('__decision__', d.value)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                      active ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold">
            {t('Terminé', 'Done')}
          </button>
        </div>
      </aside>
    </div>
  );
}
