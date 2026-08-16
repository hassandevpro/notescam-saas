// ── Procès-verbal de délibération — atelier de génération ────────────────────
// Un PV par CLASSE (le conseil délibère classe par classe), ou pour tout
// l'établissement — dans ce cas une page de synthèse récapitule les classes puis
// chaque PV suit. Le document s'adapte au moteur de bulletin de chaque classe
// ([[pvEngine]]) : séquences /20 en classique et second cycle, séquences APC au
// premier cycle, Unités d'Apprentissage /10 au primaire APC.
//
// Impression uniquement (A4 paysage) : le PV est un document de séance, signé et
// archivé sur papier.
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useSchoolStore } from '../../store/schoolStore';
import { useUiStore } from '../../store/uiStore';
import { pvSheetHtml, pvSchoolSummarySheetHtml } from '../../lib/pvDoc';
import usePrintJob from './usePrintJob';
import { buildClassPv, pvApplicable, PV_PERIODS, pvPeriodLabel } from '../../lib/pvEngine';
import { classIdentity } from '../../lib/schoolIdentity';
import { recentGenerations } from '../../lib/documentLog';
import { resolveClassEngine, firstCycleClasseSlug, primaireNiveauSlug, classSectionKey } from '../../core/engineResolver';
import { gradingOpts, primaryPeriodMode } from '../../lib/useCountry';
import { resolveCountryCode } from '../../countries';
import TranscriptFilters from '../transcripts/TranscriptFilters';
import PdfPreviewPanel from '../transcripts/PdfPreviewPanel';
import GenerationHistory from '../transcripts/GenerationHistory';

const MODE_CARDS = [
  { key: 'class', icon: '👥', label: ['Une classe', 'One class', 'Una clase'],        desc: ['PV de délibération de la classe', 'Class deliberation minutes', 'Acta de la clase'] },
  { key: 'level', icon: '🏫', label: ['Un niveau', 'One level', 'Un nivel'],          desc: ['Toutes les classes du niveau', 'All classes of a level', 'Todas las clases del nivel'] },
  { key: 'all',   icon: '🏛️', label: ['Établissement', 'Whole school', 'Todo el centro'], desc: ['Synthèse + PV de chaque classe', 'Summary + every class', 'Resumen + cada clase'] },
];

export default function PvWorkspace({ t }) {
  const school      = useAuthStore((s) => s.school);
  const role        = useAuthStore((s) => s.role);
  const teacherId   = useAuthStore((s) => s.teacherId);
  const userName    = useAuthStore((s) => s.fullName || s.user?.email || '—');
  const classes     = useSchoolStore((s) => s.classes);
  const schoolUnits = useSchoolStore((s) => s.schoolUnits);
  const subjects    = useSchoolStore((s) => s.subjects);
  const students    = useSchoolStore((s) => s.students);
  const gradeMap    = useSchoolStore((s) => s.gradeMap);
  const teachers    = useSchoolStore((s) => s.teachers);
  const apcReferentiel  = useSchoolStore((s) => s.apcReferentiel);
  const apcNotes        = useSchoolStore((s) => s.apcNotes);
  const loadApc         = useSchoolStore((s) => s.loadApc);
  const primReferentiel = useSchoolStore((s) => s.primReferentiel);
  const primNotes       = useSchoolStore((s) => s.primNotes);
  const loadPrim        = useSchoolStore((s) => s.loadPrim);
  const viewYear    = useUiStore((s) => s.viewYear);

  const myTeacher = role === 'teacher' ? teachers.find((tt) => tt.id === teacherId) : null;
  const canPrint  = role !== 'teacher' || (myTeacher?.can_print_bulletin ?? true);

  const schoolYear  = viewYear ?? school?.current_year ?? '';
  const countryCode = resolveCountryCode(school);

  const [mode,     setMode]     = useState('class');
  const [classId,  setClassId]  = useState('');
  const [level,    setLevel]    = useState('');
  const [period,   setPeriod]   = useState('t1');
  const [sheets,   setSheets]   = useState([]);
  const [building, setBuilding] = useState(false);
  const [err,      setErr]      = useState(null);
  const [history,  setHistory]  = useState([]);

  const buildSeq = useRef(0);

  // Classes délibérables : tout sauf la maternelle (évaluation par domaines,
  // sans moyenne à délibérer) — que son moteur soit officiel ou classique.
  const pvClasses = useMemo(
    () => classes.filter((c) => (c.cycle || 'secondaire') !== 'maternelle'
      && classSectionKey(c) !== 'maternelle'
      && pvApplicable(resolveClassEngine(school, c))),
    [classes, school],
  );
  const levels = useMemo(
    () => [...new Set(pvClasses.map((c) => c.level).filter(Boolean))].sort(),
    [pvClasses],
  );
  const selectedClass = pvClasses.find((c) => c.id === classId) || null;
  const levelClasses = useMemo(
    () => (level ? pvClasses.filter((c) => c.level === level) : []),
    [level, pvClasses],
  );

  // Classes du périmètre courant.
  const targets = useMemo(() => {
    if (mode === 'class') return selectedClass ? [selectedClass] : [];
    if (mode === 'level') return levelClasses;
    return pvClasses;
  }, [mode, selectedClass, levelClasses, pvClasses]);

  // Les référentiels APC / primaire ne sont chargés que si le périmètre en a besoin.
  const needsApc  = useMemo(() => targets.some((c) => resolveClassEngine(school, c) === 'apc'), [targets, school]);
  const needsPrim = useMemo(() => targets.some((c) => resolveClassEngine(school, c) === 'apc_primaire'), [targets, school]);
  useEffect(() => { if (needsApc) loadApc(); }, [needsApc, loadApc]);
  useEffect(() => { if (needsPrim) loadPrim(); }, [needsPrim, loadPrim]);

  useEffect(() => { if (school?.id) recentGenerations(school.id).then(setHistory); }, [school?.id]);

  // ── Assemblage du PV d'une classe ──────────────────────────────────────────
  const pvForClass = useCallback((cls) => {
    const engine = resolveClassEngine(school, cls);
    const sys    = cls.system || 'FR';
    const cycle  = cls.cycle || 'secondaire';
    const section = classSectionKey(cls);
    return buildClassPv({
      cls, engine, sys, cycle, countryCode, schoolYear, period,
      students: students.filter((s) => s.class_id === cls.id).sort((a, b) => a.name.localeCompare(b.name)),
      subjects: subjects.filter((s) => s.class_id === cls.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)),
      gradeMap,
      opts: gradingOpts(school, cycle),
      gradeScale: school?.grade_scale,
      apcReferentiel, apcNotes, apcClasseSlug: firstCycleClasseSlug(cls.level, cls.name),
      primReferentiel, primNotes, primNiveauSlug: primaireNiveauSlug(cls.level, cls.name),
      primBareme: primReferentiel?.bareme,
      primSequences: section === 'primaire' && primaryPeriodMode(school) === 'sequences',
      teacherName: teachers.find((tc) => tc.id === cls.teacher_id)?.name || '',
    });
  }, [school, countryCode, schoolYear, period, students, subjects, gradeMap,
      apcReferentiel, apcNotes, primReferentiel, primNotes, teachers]);

  // Feuille HTML d'une classe (identité surchargée par l'unité pédagogique).
  const sheetForClass = useCallback((cls) => {
    const pv = pvForClass(cls);
    if (!pv) return null;
    const section = classSectionKey(cls);
    return pvSheetHtml(pv, {
      school: classIdentity(school, cls, schoolUnits),
      basic: section === 'maternelle' || section === 'primaire',
    });
  }, [pvForClass, school, schoolUnits]);

  // Feuilles d'une liste de classes (synthèse d'établissement en tête).
  // Une classe dont le référentiel officiel n'est pas encore chargé n'est pas
  // imprimée en silence : elle est comptée, signalée, et la génération est
  // journalisée en PARTIEL.
  const buildAll = useCallback(async (items, onProgress) => {
    const pvs = [], out = [];
    let skipped = 0, done = 0;
    for (const cls of items) {
      const pv = pvForClass(cls);
      if (!pv) { skipped++; } else {
        pvs.push(pv);
        out.push(pvSheetHtml(pv, {
          school: classIdentity(school, cls, schoolUnits),
          basic: ['maternelle', 'primaire'].includes(classSectionKey(cls)),
        }));
      }
      onProgress?.(++done, items.length);
      // Laisse respirer l'interface entre deux classes (une classe = un calcul).
      if (done % 5 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if ((mode === 'all' || mode === 'level') && pvs.length > 1) {
      out.unshift(pvSchoolSummarySheetHtml(pvs, {
        school, sys: pvs[0].sys, periodLabel: pvs[0].periodLabel, schoolYear,
      }));
    }
    return { sheets: out, skipped };
  }, [pvForClass, school, schoolUnits, schoolYear, mode]);

  // ── Aperçu : la PREMIÈRE classe du périmètre seulement ─────────────────────
  // (assembler tout l'établissement pour n'en montrer qu'une page serait long ;
  // la page de synthèse est ajoutée au moment de l'impression.)
  useEffect(() => {
    const seq = ++buildSeq.current;
    if (!targets.length) { setSheets([]); return; }
    setBuilding(true);
    // Laisse le navigateur peindre l'état « génération » avant le calcul.
    const id = setTimeout(() => {
      try {
        const first = sheetForClass(targets[0]);
        if (seq === buildSeq.current) { setSheets(first ? [first] : []); setErr(null); }
      } catch (e) {
        console.error('pv preview', e);
        if (seq === buildSeq.current) { setErr(e?.message || String(e)); setSheets([]); }
      } finally {
        if (seq === buildSeq.current) setBuilding(false);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [targets, period, sheetForClass]);

  // Impression : progression, lots, statuts et journal sont tenus par le socle.
  const job = usePrintJob({
    targets,
    buildSheets: buildAll,
    title: () => `${t('Procès-verbaux', 'Deliberation minutes', 'Actas')} — ${school?.name || ''}`,
    printOpts: { profile: 'large' },
    logType: `pv-${mode}`,
    scope: () => (mode === 'level' ? level : mode === 'class' ? selectedClass?.name || '' : ''),
    schoolId: school?.id,
    userName,
    t,
    onLogged: () => { if (school?.id) recentGenerations(school.id).then(setHistory); },
  });

  useEffect(() => { job.reset(); }, [mode, classId, level, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = job.busy;

  const docCount = targets.length;
  const canGenerate = docCount > 0 && canPrint;
  const sys = selectedClass?.system || 'FR';

  const left = {
    schoolName: school?.name,
    className: mode === 'level' ? `${t('Niveau', 'Level', 'Nivel')} ${level || '—'}`
      : mode === 'all' ? t('Toutes les classes', 'All classes', 'Todas las clases')
      : selectedClass?.name,
    itemLabel: t('Périmètre', 'Scope', 'Alcance'),
    studentName: `${docCount} ${t('classe(s)', 'class(es)', 'clase(s)')}`,
    year: schoolYear,
  };

  const includes = useMemo(() => [
    { id: 'logo',    label: t('Logo établissement', 'School logo', 'Logo'), ok: !!school?.logo_url },
    { id: 'off',     label: t('En-tête officiel du pays', 'Official country header', 'Encabezado oficial'), ok: true },
    { id: 'class',   label: t('Identification de la classe', 'Class identification', 'Identificación de la clase'), ok: docCount > 0 },
    { id: 'grid',    label: t('Tableau de délibération', 'Deliberation table', 'Tabla de deliberación'), ok: docCount > 0 },
    { id: 'rank',    label: t('Rang et mention', 'Rank and remark', 'Puesto y mención'), ok: true },
    { id: 'summary', label: t('Résumé (admis / taux)', 'Summary (passed / rate)', 'Resumen'), ok: true },
    { id: 'sign',    label: t('Trois signatures', 'Three signatures', 'Tres firmas'), ok: !!(school?.signature_url || school?.director) },
    { id: 'stamp',   label: t('Cachet', 'Stamp', 'Sello'), ok: !!school?.stamp_url },
  ], [school, docCount, t]);

  return (
    <>
      {job.notice && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="flex items-start gap-2"><span className="mt-0.5">⚠</span><span>{job.notice}</span></span>
          <button type="button" onClick={() => job.setNotice(null)} className="shrink-0 text-amber-400 hover:text-amber-600" aria-label={t('Fermer', 'Close', 'Cerrar')}>✕</button>
        </div>
      )}
      {(err || job.error) && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span className="flex items-start gap-2"><span className="mt-0.5">⚠</span><span>{err || job.error}</span></span>
          <button type="button" onClick={() => { setErr(null); job.setError(null); }} className="shrink-0 text-red-400 hover:text-red-600" aria-label={t('Fermer', 'Close', 'Cerrar')}>✕</button>
        </div>
      )}

      {/* Portée de la délibération */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODE_CARDS.map((c) => {
          const active = mode === c.key;
          return (
            <button key={c.key} type="button" onClick={() => setMode(c.key)} aria-pressed={active}
              className={`relative flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left shadow-sm transition-all hover:shadow-md ${
                active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-300' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${active ? 'bg-brand-100' : 'bg-slate-100'}`}>{c.icon}</span>
              <span className={`mt-1 text-[13px] font-bold leading-tight ${active ? 'text-brand-800' : 'text-slate-800'}`}>{t(...c.label)}</span>
              <span className="text-[11px] text-slate-400 leading-tight">{t(...c.desc)}</span>
              {active && <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Classe / niveau */}
      <TranscriptFilters
        mode={mode}
        levels={levels} level={level} onLevelChange={setLevel}
        classOptions={pvClasses} classId={classId} onClassChange={setClassId}
        year={schoolYear} t={t}
      />

      {/* Période de délibération */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="form-label">{t('Période de délibération', 'Deliberation period', 'Periodo de deliberación')}</label>
            <select className="form-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ minWidth: 200 }}>
              {PV_PERIODS.map((p) => (
                <option key={p.key} value={p.key}>{pvPeriodLabel(p.key, sys)}</option>
              ))}
            </select>
          </div>
          <p className="flex-1 min-w-[240px] text-[12px] text-slate-500">
            {t(
              'Chaque classe est délibérée selon son propre système de bulletin : séquences en classique et second cycle, séquences APC au premier cycle, unités d’apprentissage au primaire.',
              'Each class is deliberated according to its own report-card system: sequences for classic and second cycle, APC sequences for first cycle, learning units for primary.',
              'Cada clase se delibera según su propio sistema de boletín.',
            )}
          </p>
        </div>
        {classes.length > pvClasses.length && (
          <p className="mt-2 text-[12px] text-amber-700">
            {t(
              `${classes.length - pvClasses.length} classe(s) de maternelle exclue(s) : l’évaluation par domaines ne se délibère pas sur une moyenne.`,
              `${classes.length - pvClasses.length} nursery class(es) excluded: domain-based assessment has no average to deliberate.`,
              `${classes.length - pvClasses.length} clase(s) de preescolar excluida(s).`,
            )}
          </p>
        )}
      </div>

      {/* Aperçu */}
      <PdfPreviewPanel
        left={left} includes={includes} building={building} sheets={sheets}
        multiCount={docCount} profile="large"
        previewLabel={t('Aperçu du PV de la 1re classe', 'Preview of the 1st class minutes', 'Vista del acta de la 1.ª clase')}
        t={t}
      />

      {/* Impression */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">{t('Impression du procès-verbal', 'Print the minutes', 'Impresión del acta')}</p>
            <p className="text-[12px] text-slate-500">
              {docCount} {t('procès-verbal(aux)', 'minutes document(s)', 'acta(s)')}
              {(mode === 'all' || mode === 'level') && docCount > 1 && ` · ${t('avec page de synthèse', 'with summary page', 'con página de resumen')}`}
              {' · '}{t('A4 paysage', 'A4 landscape', 'A4 horizontal')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!canPrint && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
                🔒 {t('Impression non autorisée', 'Printing not authorized', 'Impresión no autorizada')}
              </span>
            )}
            {canPrint && (
              <button type="button" onClick={() => job.run()} disabled={!canGenerate || busy || (job.batched && job.batchIndex >= job.batches.length)}
                className="btn-primary disabled:opacity-50" style={{ width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
                {busy
                  ? `${t('Préparation', 'Preparing', 'Preparando')} ${job.progress.done}/${job.progress.total}…`
                  : job.batched
                    ? `🖨 ${t('Imprimer le lot', 'Print batch', 'Imprimir lote')} ${Math.min(job.batchIndex + 1, job.batches.length)}/${job.batches.length}`
                    : `🖨 ${t('Imprimer', 'Print', 'Imprimir')}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Historique */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-800">{t('Historique des générations', 'Generation history', 'Historial')}</h2>
        <GenerationHistory entries={history} t={t} />
      </div>
    </>
  );
}
