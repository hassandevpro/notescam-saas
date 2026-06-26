// ── Certificat de scolarité — atelier de génération ──────────────────────────
// Document administratif simple (attestation d'inscription). Réutilise toute
// l'infrastructure de rendu des relevés : feuille A4 HTML, aperçu temps réel,
// export PDF combiné et impression. Pas de notes ni de moteur de préparation —
// seules l'identité de l'élève, la classe et l'année sont nécessaires.
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useSchoolStore } from '../../store/schoolStore';
import { useUiStore } from '../../store/uiStore';
import { qrDataUrl } from '../../lib/idCardService';
import { buildVerification } from '../../lib/transcriptEngine';
import { certificateSheetHtml, printSheets } from '../../lib/transcriptDoc';
import { exportTranscriptsPdf } from '../../lib/transcriptPdf';
import { recordGeneration, recentGenerations } from '../../lib/documentLog';
import TranscriptFilters from '../transcripts/TranscriptFilters';
import PdfPreviewPanel from '../transcripts/PdfPreviewPanel';
import GenerationHistory from '../transcripts/GenerationHistory';

const MODE_CARDS = [
  { key: 'single', icon: '👤', label: ['Un élève', 'One student', 'Un alumno'], desc: ['Certificat individuel', 'Single certificate', 'Certificado individual'] },
  { key: 'class',  icon: '👥', label: ["Une classe", 'A class', 'Una clase'],   desc: ['Toute la classe', 'Whole class', 'Toda la clase'] },
  { key: 'level',  icon: '🏫', label: ['Un niveau', 'A level', 'Un nivel'],     desc: ['Toutes les classes du niveau', 'All classes of a level', 'Todas las clases'] },
  { key: 'all',    icon: '🏛️', label: ['Tous', 'All', 'Todos'],                 desc: ['Tout l’établissement', 'Whole school', 'Todo el centro'] },
];

const todayStr = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function CertificateWorkspace({ t }) {
  const school    = useAuthStore((s) => s.school);
  const role      = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);
  const userName  = useAuthStore((s) => s.fullName || s.user?.email || '—');
  const classes   = useSchoolStore((s) => s.classes);
  const students  = useSchoolStore((s) => s.students);
  const teachers  = useSchoolStore((s) => s.teachers);
  const viewYear  = useUiStore((s) => s.viewYear);

  const myTeacher = role === 'teacher' ? teachers.find((tt) => tt.id === teacherId) : null;
  const canPrint  = role !== 'teacher' || (myTeacher?.can_print_bulletin ?? true);

  const schoolYear  = viewYear ?? school?.current_year ?? '';

  const [mode,      setMode]      = useState('single');
  const [classId,   setClassId]   = useState('');
  const [studentId, setStudentId] = useState('');
  const [level,     setLevel]     = useState('');
  const [search,    setSearch]    = useState('');
  const [place,     setPlace]     = useState('');
  const [date,      setDate]      = useState(todayStr());
  const [sheets,    setSheets]    = useState([]);
  const [building,  setBuilding]  = useState(false);
  const [pdfProg,   setPdfProg]   = useState(null);
  const [err,       setErr]       = useState(null);
  const [history,   setHistory]   = useState([]);

  const buildSeq = useRef(0);

  const nonMaternelle = useMemo(() => classes.filter((c) => (c.cycle || 'secondaire') !== 'maternelle'), [classes]);
  const levels = useMemo(
    () => [...new Set(nonMaternelle.map((c) => c.level).filter(Boolean))].sort(),
    [nonMaternelle],
  );

  const selectedClass = classes.find((c) => c.id === classId) || null;
  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId],
  );
  const studentOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? classStudents.filter((s) => s.name.toLowerCase().includes(q)) : classStudents;
  }, [classStudents, search]);
  const selectedStudent = classStudents.find((s) => s.id === studentId) || null;
  const levelClasses = useMemo(
    () => (level ? nonMaternelle.filter((c) => c.level === level) : []),
    [level, nonMaternelle],
  );

  useEffect(() => { setStudentId(''); setSearch(''); }, [classId]);
  useEffect(() => { setSheets([]); setErr(null); }, [mode]);
  useEffect(() => { if (school?.id) recentGenerations(school.id).then(setHistory); }, [school?.id]);

  // [{ cls, student }] générables selon le mode.
  const scopeTargets = useMemo(() => {
    const fromClass = (cls) => students.filter((s) => s.class_id === cls.id).map((s) => ({ cls, student: s }));
    if (mode === 'single') return selectedClass && selectedStudent ? [{ cls: selectedClass, student: selectedStudent }] : [];
    if (mode === 'class')  return selectedClass ? fromClass(selectedClass) : [];
    if (mode === 'level')  return levelClasses.flatMap(fromClass);
    if (mode === 'all')    return nonMaternelle.flatMap(fromClass);
    return [];
  }, [mode, selectedClass, selectedStudent, levelClasses, nonMaternelle, students]);

  // Construit la feuille A4 d'un certificat (avec QR de vérification).
  const buildSheet = useCallback(async (student, cls) => {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
    const sys = cls.system || 'FR';
    const verification = buildVerification({
      schoolId: school.id, schoolName: school.name, studentName: student.name,
      matricule: student.matricule, className: cls.name, year: schoolYear,
    }, origin);
    const qrSrc = await qrDataUrl(verification.qrText);
    return certificateSheetHtml(student, cls, { qrSrc, verification, school, sys, schoolYear, place, date });
  }, [school, schoolYear, place, date]);

  // Aperçu : 1re cible.
  const buildPreview = useCallback(async () => {
    setErr(null);
    const seq = ++buildSeq.current;
    setBuilding(true);
    try {
      const target = scopeTargets[0];
      const sheet = target ? await buildSheet(target.student, target.cls) : null;
      if (seq === buildSeq.current) setSheets(sheet ? [sheet] : []);
    } catch (e) {
      console.error('certificate preview', e);
      if (seq === buildSeq.current) { setErr(e?.message || String(e)); setSheets([]); }
    } finally {
      if (seq === buildSeq.current) setBuilding(false);
    }
  }, [scopeTargets, buildSheet]);

  useEffect(() => {
    if (scopeTargets.length) buildPreview(); else setSheets([]);
  }, [scopeTargets.length, place, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toutes les feuilles du périmètre.
  const buildAll = useCallback(async (onProgress) => {
    const out = [];
    let done = 0, failed = 0;
    for (const { cls, student } of scopeTargets) {
      try {
        out.push(await buildSheet(student, cls));
      } catch (e) {
        console.error('certificate sheet', student.id, e);
        failed++;
      }
      onProgress?.(++done, scopeTargets.length);
    }
    return { sheets: out, failed };
  }, [scopeTargets, buildSheet]);

  const logAndRefresh = useCallback(async (status, count, detail) => {
    const scope = mode === 'level' ? level : mode === 'class' ? selectedClass?.name : mode === 'all' ? '' : selectedStudent?.name;
    await recordGeneration({ schoolId: school.id, userName, type: `certificat-${mode}`, scope, count, status, detail });
    recentGenerations(school.id).then(setHistory);
  }, [mode, level, selectedClass, selectedStudent, school, userName]);

  const handleDownload = async () => {
    setErr(null);
    setPdfProg({ done: 0, total: scopeTargets.length || 1 });
    try {
      const { sheets: all, failed } = await buildAll((d, total) => setPdfProg({ done: d, total }));
      if (!all.length) throw new Error(t('Aucun certificat générable — choisissez une cible.', 'No generable certificate — pick a target.', 'Sin certificado generable.'));
      const fileBase = mode === 'class' ? `certificats-${selectedClass?.name || 'classe'}`
        : mode === 'level' ? `certificats-niveau-${level}`
        : mode === 'all' ? 'certificats-etablissement'
        : `certificat-${(selectedStudent?.name || 'eleve').replace(/\s+/g, '-')}`;
      const ratio = all.length > 150 ? 1.5 : all.length > 50 ? 2 : 3;
      await exportTranscriptsPdf(all, {
        fileName: `${fileBase}.pdf`.toLowerCase(), mode: 'save', pixelRatio: ratio,
        onProgress: (d, total) => setPdfProg({ done: d, total }),
      });
      if (failed) setErr(t(`${failed} certificat(s) ignoré(s).`, `${failed} certificate(s) skipped.`, `${failed} omitido(s).`));
      await logAndRefresh('success', all.length, failed ? `${failed} skipped` : '');
    } catch (e) {
      console.error('certificate download', e);
      setErr(e?.message || String(e));
      await logAndRefresh('error', 0, e?.message || String(e));
    } finally {
      setPdfProg(null);
    }
  };

  const handlePrint = async () => {
    setErr(null);
    setPdfProg({ done: 0, total: scopeTargets.length || 1 });
    try {
      const { sheets: all } = await buildAll((d, total) => setPdfProg({ done: d, total }));
      if (!all.length) throw new Error(t('Aucun certificat générable — choisissez une cible.', 'No generable certificate — pick a target.', 'Sin certificado generable.'));
      printSheets(all, `${t('Certificats de scolarité', 'Enrollment certificates', 'Certificados')} — ${school?.name || ''}`);
      await logAndRefresh('success', all.length, 'print');
    } catch (e) {
      console.error('certificate print', e);
      setErr(e?.message || String(e));
    } finally {
      setPdfProg(null);
    }
  };

  const docCount = scopeTargets.length;
  const canGenerate = docCount > 0 && canPrint;
  const busy = !!pdfProg;
  const pct = pdfProg ? Math.round((pdfProg.done / Math.max(1, pdfProg.total)) * 100) : 0;

  const left = {
    schoolName: school?.name,
    className: mode === 'level' ? `${t('Niveau', 'Level', 'Nivel')} ${level || '—'}` : mode === 'all' ? t('Toutes', 'All', 'Todas') : selectedClass?.name,
    studentName: mode === 'single' ? selectedStudent?.name : `${docCount} ${t('élève(s)', 'student(s)', 'alumno(s)')}`,
    year: schoolYear,
  };

  const includes = useMemo(() => [
    { id: 'logo',    label: t('Logo établissement', 'School logo', 'Logo'), ok: !!school?.logo_url },
    { id: 'name',    label: t('Nom établissement', 'School name', 'Nombre'), ok: !!school?.name },
    { id: 'student', label: t('Identité élève', 'Student identity', 'Identidad'), ok: mode !== 'single' || !!selectedStudent },
    { id: 'class',   label: t('Classe', 'Class', 'Clase'), ok: !!selectedClass || mode === 'all' || mode === 'level' },
    { id: 'year',    label: t('Année scolaire', 'Academic year', 'Año'), ok: !!schoolYear },
    { id: 'sign',    label: t('Signature du chef', 'Principal signature', 'Firma'), ok: !!(school?.signature_url || school?.director) },
    { id: 'stamp',   label: t('Tampon', 'Stamp', 'Sello'), ok: !!school?.stamp_url },
    { id: 'qr',      label: t('QR de vérification', 'Verification QR', 'QR'), ok: true },
  ], [mode, school, selectedStudent, selectedClass, schoolYear, t]);

  return (
    <>
      {err && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span className="flex items-start gap-2"><span className="mt-0.5">⚠</span><span>{err}</span></span>
          <button type="button" onClick={() => setErr(null)} className="shrink-0 text-red-400 hover:text-red-600" aria-label={t('Fermer', 'Close', 'Cerrar')}>✕</button>
        </div>
      )}

      {/* Type de portée */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* Filtres */}
      <TranscriptFilters
        mode={mode}
        levels={levels} level={level} onLevelChange={setLevel}
        classOptions={nonMaternelle} classId={classId} onClassChange={setClassId}
        studentOptions={studentOptions} studentId={studentId} onStudentChange={setStudentId}
        search={search} onSearch={setSearch}
        year={schoolYear} t={t}
      />

      {/* Lieu et date */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="form-label">{t('Fait à (lieu)', 'Done at (place)', 'Hecho en (lugar)')}</label>
            <input type="text" className="form-input" value={place} onChange={(e) => setPlace(e.target.value)}
              placeholder={t('Ville…', 'City…', 'Ciudad…')} style={{ minWidth: 200 }} />
          </div>
          <div>
            <label className="form-label">{t('Date', 'Date', 'Fecha')}</label>
            <input type="text" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} style={{ minWidth: 160 }} />
          </div>
        </div>
      </div>

      {/* Aperçu */}
      <PdfPreviewPanel left={left} includes={includes} building={building} sheets={sheets} multiCount={docCount} t={t} />

      {/* Génération */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">{t('Génération', 'Generation', 'Generación')}</p>
            <p className="text-[12px] text-slate-500">{docCount} {t('certificat(s)', 'certificate(s)', 'certificado(s)')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!canPrint && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
                🔒 {t('Impression non autorisée', 'Printing not authorized', 'Impresión no autorizada')}
              </span>
            )}
            {canPrint && (
              <button type="button" onClick={handlePrint} disabled={!canGenerate || busy}
                className="btn-secondary disabled:opacity-50" style={{ width: 'auto' }}>
                🖨 {t('Imprimer', 'Print', 'Imprimir')}
              </button>
            )}
            <button type="button" onClick={handleDownload} disabled={!canGenerate || busy}
              className="btn-primary disabled:opacity-50" style={{ width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
              {busy ? `${t('Génération', 'Generating', 'Generando')} ${pdfProg.done}/${pdfProg.total}…` : `📄 ${t('Télécharger tout', 'Download all', 'Descargar todo')}`}
            </button>
          </div>
        </div>
        {busy && (
          <div className="mt-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-right text-[11px] font-semibold text-slate-500">{pct}%</p>
          </div>
        )}
      </div>

      {/* Historique */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-800">{t('Historique des générations', 'Generation history', 'Historial')}</h2>
        <GenerationHistory entries={history} t={t} />
      </div>
    </>
  );
}
