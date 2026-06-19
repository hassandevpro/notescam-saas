import { useState, useMemo, useCallback } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { buildRanks } from '../core/bulletinEngine';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { resolveCountryCode } from '../countries';
import { gradingOpts, geGradeMax } from '../lib/useCountry';
import '../styles/conseil.css';

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
// Guinea Ecuatorial — tres trimestres oficiales, sin terminología camerunesa.
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
  const [seq,     setSeq]     = useState(1);
  const [showAll, setShowAll] = useState(false);

  const cls      = classes.find((c) => c.id === classId) || null;
  const sys      = cls?.system || 'FR';
  const isEN     = sys === 'EN';
  const isGE     = resolveCountryCode(school) === 'guinea_eq';
  const honorMode = isGE ? 'es' : isEN ? 'en' : 'fr';
  const periods  = isGE ? SEQUENCES_GE : isEN ? SEQUENCES_EN : SEQUENCES_FR;
  const gOpts    = gradingOpts(school, cls?.cycle);
  const pass     = isGE ? geGradeMax(school) / 2 : sys === 'FR' ? 10 : 50;
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
  }, [classId, seq, studs, gradeMap, subs, sys, gOpts.maxScale, gOpts.useCoef]);

  const issueRows = useMemo(() => rows.filter((r) => hasIssue(r, pass)), [rows, pass]);
  const visibleRows = showAll ? rows : issueRows;

  const stats = useMemo(() => {
    const total     = rows.length;
    const issues    = issueRows.length;
    const admis     = rows.filter((r) => r.avg !== null && r.avg >= pass).length;
    const distincts = rows.filter((r) => honor(r.scores, honorMode) !== '—').length;
    const decisions = rows.filter((r) => (r.scores['__decision__'] || '') !== '').length;
    return { total, issues, admis, distincts, decisions };
  }, [rows, issueRows, pass, honorMode]);

  const saveDecision = useCallback(async (studentId, value) => {
    await saveGrade(classId, studentId, seq, { __decision__: value });
  }, [classId, seq, saveGrade]);

  const seqLabel = periods.find((s) => s.value === seq)?.label || '';
  const today    = new Date().toLocaleDateString(isGE ? 'es-ES' : isEN ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const classAvg = visibleRows.length > 0 && visibleRows.some((r) => r.avg !== null)
    ? (visibleRows.filter((r) => r.avg !== null).reduce((s, r) => s + r.avg, 0) / visibleRows.filter((r) => r.avg !== null).length).toFixed(2)
    : '—';

  return (
    <Layout>
      <div className="max-w-6xl">

        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isGE ? 'Acta — Junta de Evaluación' : t('Procès-verbal — Conseil de Classe', 'Class Council — Official Record')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {isGE
                ? 'Decisiones oficiales por clase y trimestre.'
                : <>{t('Décisions officielles par classe et par', 'Official decisions by class and')} {isEN ? t('terme', 'term') : t('séquence', 'sequence')}.</>}
            </p>
          </div>
          {classId && (
            <button
              onClick={() => window.print()}
              className="no-print btn-primary flex items-center gap-2"
              style={{ width: 'auto', paddingInline: '1.5rem' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              {t('Imprimer le PV', 'Print record')}
            </button>
          )}
        </div>

        {/* ── Filtres ───────────────────────────────────────────────────────── */}
        <div className="no-print bg-white rounded-xl border border-slate-100 shadow-sm px-6 py-4 mb-6 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <label className="form-label">{t('Classe', 'Class')}</label>
            <select className="form-input" value={classId} onChange={(e) => { setClassId(e.target.value); setSeq(1); setShowAll(false); }}>
              <option value="">— {t('Sélectionner', 'Select')} —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{schoolLanguage === 'bilingue' ? ` [${c.system === 'EN' ? 'EN' : 'FR'}]` : ''}
                </option>
              ))}
            </select>
          </div>
          {classId && (
            <div className="min-w-[160px]">
              <label className="form-label">{isGE ? 'Trimestre' : isEN ? 'Term' : t('Séquence', 'Sequence')}</label>
              <select className="form-input" value={seq} onChange={(e) => { setSeq(Number(e.target.value)); setShowAll(false); }}>
                {periods.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
          {classId && (
            <div className="flex items-end gap-2 ml-auto">
              <button
                onClick={() => setShowAll(false)}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  !showAll
                    ? 'bg-red-500 border-red-500 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {t('Cas à traiter', 'Cases to review')}
                {stats.issues > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${!showAll ? 'bg-red-400 text-white' : 'bg-red-100 text-red-600'}`}>
                    {stats.issues}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowAll(true)}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                  showAll
                    ? 'bg-slate-700 border-slate-700 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {t('Tous', 'All')} ({stats.total})
              </button>
            </div>
          )}
        </div>

        {!classId && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center text-gray-400">
            {t('Sélectionnez une classe pour afficher le procès-verbal.', 'Select a class to display the official record.')}
          </div>
        )}

        {classId && (
          <>
            {/* ── Stats ────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 no-print">
              {[
                { label: t('Effectif', 'Enrolment'),       value: stats.total,     color: 'bg-slate-50 border-slate-200 text-slate-700' },
                { label: `${t('Admis', 'Passed')} (≥ ${pass})`, value: stats.admis, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                { label: t('Distinctions', 'Honours'),     value: stats.distincts, color: 'bg-purple-50 border-purple-200 text-purple-700' },
                { label: t('Décisions saisies', 'Decisions entered'), value: stats.decisions, color: 'bg-brand-50 border-brand-200 text-brand-700' },
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-xl border p-4 text-center ${color}`}>
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-xs font-medium mt-1">{label}</div>
                </div>
              ))}
            </div>

            {/* ── Tableau interactif (écran uniquement) ────────────────────── */}
            <div className="pv-screen bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden pv-table">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-700 text-white">
                      <th className="px-2 py-2.5 text-left font-semibold w-6">N°</th>
                      <th className="px-3 py-2.5 text-left font-semibold min-w-[160px]">{t('Élève', 'Student')}</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-14">{t('Moy.', 'Avg.')}</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-12">{t('Rang', 'Rank')}</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-14">Abs.J<br/>(h)</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-14">Abs.NJ<br/>(h)</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-24">{t('Distinction', 'Honours')}</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-12">Av.T</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-12">Bl.T</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-12">Excl.</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-12">Av.C</th>
                      <th className="px-2 py-2.5 text-center font-semibold w-12">Bl.C</th>
                      <th className="px-2 py-2.5 text-center font-semibold min-w-[110px]">{t('Décision', 'Decision')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={13} className="px-6 py-10 text-center text-slate-400 text-sm">
                          {!showAll
                            ? (isGE
                              ? 'Ningún alumno en dificultad para este trimestre.'
                              : t(
                                `Aucun élève en difficulté pour ${isEN ? 'ce terme' : 'cette séquence'}.`,
                                `No students at risk for this ${isEN ? 'term' : 'sequence'}.`,
                              ))
                            : t('Aucun élève dans cette classe.', 'No students in this class.')}
                        </td>
                      </tr>
                    )}
                    {visibleRows.map((row, idx) => {
                      const { stu, scores, avg, rang } = row;
                      const absJ  = num(scores['__abs_j__'])  + num(scores['__abs_nj__']);
                      const absNJ = num(scores['__abs_nj__']);
                      const hon   = honor(scores, honorMode);
                      const dec   = scores['__decision__'] || '';
                      const decLabel = DECISIONS.find((d) => d.value === dec)?.label || '—';
                      const isAbove = avg !== null && avg >= pass;

                      return (
                        <tr key={stu.id} className={`transition-colors hover:bg-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-2 py-2 text-center text-gray-400 font-mono">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {stu.name}
                            {stu.matricule && <span className="block text-[10px] text-gray-400 font-mono font-normal">{stu.matricule}</span>}
                          </td>
                          <td className="px-2 py-2 text-center font-bold">
                            {avg !== null
                              ? <span className={isAbove ? 'text-emerald-600' : 'text-red-500'}>{avg}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-600">
                            {rang ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-600">{absJ || '—'}</td>
                          <td className="px-2 py-2 text-center text-gray-600">{absNJ || '—'}</td>
                          <td className="px-2 py-2 text-center">
                            {hon !== '—'
                              ? <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold text-[10px] whitespace-nowrap">{hon}</span>
                              : <span className="text-gray-200">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center text-amber-700 font-semibold">{num(scores['__aver_travail__']) || <span className="text-gray-200">—</span>}</td>
                          <td className="px-2 py-2 text-center text-red-600 font-semibold">{num(scores['__blame_travail__']) || <span className="text-gray-200">—</span>}</td>
                          <td className="px-2 py-2 text-center text-orange-600 font-semibold">{num(scores['__exclusions__']) || <span className="text-gray-200">—</span>}</td>
                          <td className="px-2 py-2 text-center text-amber-700 font-semibold">{num(scores['__aver_conduite__']) || <span className="text-gray-200">—</span>}</td>
                          <td className="px-2 py-2 text-center text-red-600 font-semibold">{num(scores['__blame_conduite__']) || <span className="text-gray-200">—</span>}</td>
                          <td className="px-2 py-2 text-center">
                            <span className="print-only text-xs font-semibold">
                              <span className={DECISION_STYLE[dec]}>{decLabel}</span>
                            </span>
                            <select
                              className="no-print text-xs border border-slate-200 rounded-lg px-1.5 py-1 bg-white w-full focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
                              value={dec}
                              onChange={(e) => saveDecision(stu.id, e.target.value)}
                            >
                              {DECISIONS.map((d) => (
                                <option key={d.value} value={d.value}>{d.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Récap pied de tableau */}
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 text-xs font-bold text-slate-600">
                      <td colSpan={2} className="px-3 py-2">
                        {showAll ? t('CLASSE ENTIÈRE', 'FULL CLASS') : `${t('CAS À TRAITER', 'CASES TO REVIEW')} (${stats.issues}/${stats.total})`}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {visibleRows.length > 0 && visibleRows.some((r) => r.avg !== null)
                          ? (visibleRows.filter((r) => r.avg !== null).reduce((s, r) => s + r.avg, 0) / visibleRows.filter((r) => r.avg !== null).length).toFixed(2)
                          : '—'}
                      </td>
                      <td colSpan={3} className="px-2 py-2 text-center">{stats.admis}/{stats.total} {t('admis', 'passed')}</td>
                      <td className="px-2 py-2 text-center text-purple-700">{stats.distincts}</td>
                      <td colSpan={5} className="px-2 py-2 text-center text-gray-400">—</td>
                      <td className="px-2 py-2 text-center">
                        {rows.filter((r) => r.scores['__decision__'] === 'admis').length} {t('admis', 'passed')},{' '}
                        {rows.filter((r) => r.scores['__decision__'] === 'redoublant').length} {t('redb.', 'rep.')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                 GABARIT D'IMPRESSION DÉDIÉ — document administratif sobre.
                 Invisible à l'écran (.pv-paper), seul élément imprimé.
                ══════════════════════════════════════════════════════════════ */}
            <div className="pv-paper">

              {/* En-tête institutionnel (République — 3 colonnes), façon bulletin APC */}
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
                      {school?.logo_url && <img src={school.logo_url} alt="Logo" className="pv-head-logo" />}
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

              {/* Barre titre */}
              <div className="pv-title-bar">
                {isGE
                  ? `ACTA DE LA JUNTA DE EVALUACIÓN — ${seqLabel.toUpperCase()}`
                  : `${t('PROCÈS-VERBAL DU CONSEIL DE CLASSE', 'CLASS COUNCIL — OFFICIAL RECORD')} — ${seqLabel.toUpperCase()}`}
              </div>

              {/* Ligne info classe */}
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

              {/* Tableau institutionnel */}
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
                    const dec   = scores['__decision__'] || '';
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
                      {showAll ? (isGE ? 'CLASE COMPLETA' : t('CLASSE ENTIÈRE', 'FULL CLASS')) : `${isGE ? 'CASOS' : t('CAS À TRAITER', 'CASES')} (${stats.issues}/${stats.total})`}
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

              {/* Signatures + cachet (cellules bordées, façon bulletin) */}
              <table className="pv-sign">
                <tbody>
                  <tr>
                    <td>{isGE ? 'El Tutor / La Tutora' : t('Le Professeur Principal', 'The Form Tutor')}</td>
                    <td>{isGE ? 'El Jefe de Estudios' : t('Le Censeur / Sous-Directeur', 'The Deputy Head')}</td>
                    <td className="pv-sign-head">
                      {isGE ? 'El Director / La Directora' : t('Le Directeur / Proviseur', 'The Principal')}
                      {school?.signature_url && <img src={school.signature_url} alt="Signature" />}
                      {school?.stamp_url && <img src={school.stamp_url} alt="Cachet" />}
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

            {/* ── Bouton bas de page ───────────────────────────────────────── */}
            <div className="mt-6 flex justify-end no-print">
              <button
                onClick={() => window.print()}
                className="btn-primary flex items-center gap-2"
                style={{ width: 'auto', paddingInline: '2rem' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                {t('Imprimer le PV', 'Print record')}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
