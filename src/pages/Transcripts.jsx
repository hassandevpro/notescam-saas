import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import { useT } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import { clsStat, buildRanks, resolveScores } from '../core/bulletinEngine';

// Matières composites : rend un gradeMap « effectif » où chaque matière parente
// porte sa note calculée (depuis ses enfants), pour la classe donnée. Combiné à
// une liste de matières top-level, les relevés affichent la matière principale
// et la moyenne reste correcte — sans modifier le moteur de relevés.
function compositeView(gradeMap, classId, fullSubs) {
  if (!fullSubs.some((s) => s.parent_id)) return { subs: fullSubs, gm: gradeMap };
  const subs = fullSubs.filter((s) => !s.parent_id);
  const gm = {};
  for (const [k, v] of Object.entries(gradeMap)) {
    gm[k] = k.startsWith(classId + '_') ? resolveScores(v, fullSubs).g : v;
  }
  return { subs, gm };
}
import { resolveCountryCode } from '../countries';
import { gradingOpts } from '../lib/useCountry';
import { qrDataUrl } from '../lib/idCardService';
import {
  buildClassTranscripts, buildMultiYearHistory, transcriptColumns, buildVerification,
} from '../lib/transcriptEngine';
import {
  classContext, evaluateClass, evaluateSchool, collectAnomalies, buildChecklist,
} from '../lib/transcriptReadiness';
import { recordGeneration, recentGenerations } from '../lib/documentLog';
import { buildParentLinks } from '../lib/parentLinks';
import { transcriptSheetHtml, multiYearSheetHtml, printSheets } from '../lib/transcriptDoc';
import { classIdentity } from '../lib/schoolIdentity';
import { exportTranscriptsPdf } from '../lib/transcriptPdf';
import { loadYearAcademics, matchStudent, listYears } from '../lib/transcriptHistory';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import TranscriptDashboard from '../components/transcripts/TranscriptDashboard';
import GenerationCards from '../components/transcripts/GenerationCards';
import TranscriptFilters from '../components/transcripts/TranscriptFilters';
import ControlPanel from '../components/transcripts/ControlPanel';
import ValidationChecklist from '../components/transcripts/ValidationChecklist';
import AnomaliesPanel from '../components/transcripts/AnomaliesPanel';
import PdfPreviewPanel from '../components/transcripts/PdfPreviewPanel';
import MassGenerationBar from '../components/transcripts/MassGenerationBar';
import PdfDiagnostic from '../components/transcripts/PdfDiagnostic';
import GenerationHistory from '../components/transcripts/GenerationHistory';
import ParentLinksModal from '../components/transcripts/ParentLinksModal';
import CertificateWorkspace from '../components/documents/CertificateWorkspace';

const decisionText = (sys, d) => (sys === 'EN' ? d.en : sys === 'ES' ? (d.es || d.fr) : d.fr);

// Types de document proposés par le hub « Documents ».
const DOC_TYPES = [
  { key: 'transcript',  icon: '📄', label: ['Relevé de notes', 'Transcript', 'Certificación'],     desc: ['Notes, moyennes, rang', 'Grades, averages, rank', 'Notas y media'] },
  { key: 'certificate', icon: '📜', label: ['Certificat de scolarité', 'Enrollment certificate', 'Certificado de escolaridad'], desc: ["Attestation d'inscription", 'Proof of enrollment', 'Comprobante de matrícula'] },
];

function TranscriptWorkspace() {
  const t = useT();
  const navigate = useNavigate();
  const { plan } = usePlan();

  const school    = useAuthStore((s) => s.school);
  const role      = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);
  const userName  = useAuthStore((s) => s.fullName || s.user?.email || '—');
  const classes   = useSchoolStore((s) => s.classes);
  const schoolUnits = useSchoolStore((s) => s.schoolUnits);
  const subjects  = useSchoolStore((s) => s.subjects);
  const students  = useSchoolStore((s) => s.students);
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const teachers  = useSchoolStore((s) => s.teachers);
  const viewYear  = useUiStore((s) => s.viewYear);

  const myTeacher = role === 'teacher' ? teachers.find((tt) => tt.id === teacherId) : null;
  const canPrint  = role !== 'teacher' || (myTeacher?.can_print_bulletin ?? true);

  const schoolYear  = viewYear ?? school?.current_year ?? '';
  const countryCode = resolveCountryCode(school);

  // Contexte partagé du moteur de préparation.
  const ctx = useMemo(
    () => ({ classes, subjects, students, gradeMap, school, countryCode, schoolYear }),
    [classes, subjects, students, gradeMap, school, countryCode, schoolYear],
  );

  // ── État UI ─────────────────────────────────────────────────────────────────
  const [mode,      setMode]      = useState('single'); // single|class|level|multi|all
  const [classId,   setClassId]   = useState('');
  const [studentId, setStudentId] = useState('');
  const [level,     setLevel]     = useState('');
  const [search,    setSearch]    = useState('');
  const [sheets,    setSheets]    = useState([]);  // aperçu (1 feuille représentative)
  const [building,  setBuilding]  = useState(false);
  const [pdfProg,   setPdfProg]   = useState(null);
  const [err,       setErr]       = useState(null);
  const [history,   setHistory]   = useState([]);
  const [parentLinks, setParentLinks] = useState(null);

  const buildSeq = useRef(0);

  // ── Évaluations (état de production) ─────────────────────────────────────────
  const schoolSummary = useMemo(() => evaluateSchool(ctx), [ctx]);

  const nonMaternelle = useMemo(() => classes.filter((c) => (c.cycle || 'secondaire') !== 'maternelle'), [classes]);
  const levels = useMemo(
    () => [...new Set(nonMaternelle.map((c) => c.level).filter(Boolean))].sort(),
    [nonMaternelle],
  );

  const selectedClass = classes.find((c) => c.id === classId) || null;
  const classEval = useMemo(
    () => (selectedClass ? evaluateClass(selectedClass, ctx) : null),
    [selectedClass, ctx],
  );

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

  // Réinitialisations contextuelles.
  useEffect(() => { setStudentId(''); setSearch(''); setSheets([]); setErr(null); }, [classId]);
  useEffect(() => { setSheets([]); setErr(null); }, [mode]);

  // Charge l'historique local au montage.
  useEffect(() => {
    if (school?.id) recentGenerations(school.id).then(setHistory);
  }, [school?.id]);

  // ── Cibles du périmètre (élèves générables) ──────────────────────────────────
  const classEvalById = useMemo(() => {
    const m = new Map();
    for (const e of schoolSummary.byClass) m.set(e.cls.id, e);
    if (classEval) m.set(classEval.cls.id, classEval);
    return m;
  }, [schoolSummary, classEval]);

  // [{ cls, studentId }] générables selon le mode.
  const scopeTargets = useMemo(() => {
    const fromEval = (e) => (e?.students || []).filter((s) => s.status !== 'blocked').map((s) => ({ cls: e.cls, studentId: s.id }));
    if (mode === 'single') return selectedClass && selectedStudent ? [{ cls: selectedClass, studentId: selectedStudent.id }] : [];
    if (mode === 'multi')  return selectedClass && selectedStudent ? [{ cls: selectedClass, studentId: selectedStudent.id }] : [];
    if (mode === 'class')  return fromEval(classEvalById.get(classId));
    if (mode === 'level')  return levelClasses.flatMap((c) => fromEval(classEvalById.get(c.id)));
    if (mode === 'all')    return schoolSummary.byClass.flatMap((e) => fromEval(e));
    return [];
  }, [mode, selectedClass, selectedStudent, classId, classEvalById, levelClasses, schoolSummary]);

  // Anomalies du périmètre courant.
  const scopeAnomalies = useMemo(() => {
    if (mode === 'single' || mode === 'multi') {
      const ref = classEval?.students.find((s) => s.id === studentId);
      return ref && ref.status !== 'ready' ? [ref] : [];
    }
    if (mode === 'class') return collectAnomalies(classEval ? [classEval] : []);
    if (mode === 'level') return collectAnomalies(levelClasses.map((c) => classEvalById.get(c.id)).filter(Boolean));
    if (mode === 'all')   return collectAnomalies(schoolSummary.byClass);
    return [];
  }, [mode, classEval, studentId, levelClasses, classEvalById, schoolSummary]);

  // Diagnostic du relevé ciblé (mode individuel/multi bloqué).
  const targetIssues = useMemo(() => {
    if (mode !== 'single' && mode !== 'multi') return [];
    const ref = classEval?.students.find((s) => s.id === studentId);
    return ref && ref.status === 'blocked' ? ref.issues : [];
  }, [mode, classEval, studentId]);

  // Checklist de validation.
  const checklist = useMemo(
    () => buildChecklist({ mode, cls: selectedClass, classEval, student: selectedStudent }, ctx),
    [mode, selectedClass, classEval, selectedStudent, ctx],
  );

  // ── Construction d'une feuille à partir des données d'un relevé ──────────────
  const sheetFromData = useCallback(async (data, cls, sys) => {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
    const verification = buildVerification({
      schoolId: school.id, schoolName: school.name, studentName: data.student.name,
      matricule: data.student.matricule, className: cls.name, year: schoolYear,
      avg: data.generalAvg, rank: data.rankEntry?.rankD, decision: decisionText(sys, data.decision),
    }, origin);
    const qrSrc = await qrDataUrl(verification.qrText);
    const docSchool = classIdentity(school, cls, schoolUnits);
    return transcriptSheetHtml(data, { qrSrc, verification, school: docSchool });
  }, [school, schoolUnits, schoolYear]);

  // Transcripts d'une classe (avec stats + rangs).
  const classTranscripts = useCallback((cls) => {
    const { sys, cycle, classSubjects, classStudents: cs, opts } = classContext(cls, ctx);
    const { seqs } = transcriptColumns(sys, cycle, countryCode);
    const { subs, gm } = compositeView(gradeMap, cls.id, classSubjects);
    const stats = clsStat(cs, gm, cls.id, seqs, subs, sys, {}, opts);
    const data = buildClassTranscripts({
      classStudents: cs, cls, subjects: subs, gradeMap: gm, sys, cycle,
      countryCode, schoolYear, stats, opts,
    });
    return { sys, data };
  }, [ctx, countryCode, gradeMap, schoolYear]);

  // Construit le relevé multi-années d'un élève (parcourt les archives).
  const buildMultiSheet = useCallback(async (refStudent, cls) => {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
    const sys = cls.system || 'FR';
    const years = await listYears(school.id);
    const entries = [];
    for (const y of years) {
      const ac = await loadYearAcademics(school.id, y);
      const st = matchStudent(refStudent, ac.students);
      if (!st) continue;
      const yCls = ac.classes.find((c) => c.id === st.class_id);
      if (!yCls) continue;
      const sysY = yCls.system || 'FR', cycleY = yCls.cycle || 'secondaire';
      const subsAll = ac.subjects.filter((s) => s.class_id === yCls.id);
      const studsY = ac.students.filter((s) => s.class_id === yCls.id);
      const optsY = { ...gradingOpts(school, cycleY), gradeScale: school?.grade_scale };
      const { seqs } = transcriptColumns(sysY, cycleY, countryCode);
      const { subs: subsY, gm: gmY } = compositeView(ac.gradeMap, yCls.id, subsAll);
      const ranksY = buildRanks(studsY, gmY, yCls.id, seqs, subsY, sysY, {}, optsY);
      const statsY = clsStat(studsY, gmY, yCls.id, seqs, subsY, sysY, {}, optsY);
      entries.push({ year: y, cls: yCls, subjects: subsY, gradeMap: gmY, sys: sysY, cycle: cycleY, countryCode, ranks: ranksY, stats: statsY, opts: optsY, studentId: st.id });
    }
    if (!entries.length) throw new Error(t('Aucun historique trouvé pour cet élève.', 'No history found for this student.', 'Sin historial.'));
    const hist = buildMultiYearHistory(refStudent, entries);
    const last = hist[hist.length - 1];
    const verification = buildVerification({
      schoolId: school.id, schoolName: school.name, studentName: refStudent.name,
      matricule: refStudent.matricule, className: last?.className,
      year: `${hist[0]?.year}…${last?.year}`, avg: last?.generalAvg, rank: last?.rank,
      decision: last?.decision ? decisionText(sys, last.decision) : '',
    }, origin);
    const qrSrc = await qrDataUrl(verification.qrText);
    const docSchool = classIdentity(school, cls, schoolUnits);
    return multiYearSheetHtml(refStudent, hist, { qrSrc, verification, school: docSchool, sys });
  }, [school, schoolUnits, countryCode, t]);

  // ── Aperçu : construit UNE feuille représentative (rapide) ───────────────────
  const buildPreview = useCallback(async () => {
    setErr(null);
    const seq = ++buildSeq.current;
    setBuilding(true);
    try {
      let sheet = null;
      if (mode === 'multi') {
        if (!selectedClass || !selectedStudent) { setSheets([]); setBuilding(false); return; }
        sheet = await buildMultiSheet(selectedStudent, selectedClass);
      } else {
        const target = scopeTargets[0];
        if (!target) { setSheets([]); setBuilding(false); return; }
        const { sys, data } = classTranscripts(target.cls);
        const d = data.find((x) => x.student.id === target.studentId);
        if (d) sheet = await sheetFromData(d, target.cls, sys);
      }
      if (seq === buildSeq.current) setSheets(sheet ? [sheet] : []);
    } catch (e) {
      console.error('preview', e);
      if (seq === buildSeq.current) { setErr(e?.message || String(e)); setSheets([]); }
    } finally {
      if (seq === buildSeq.current) setBuilding(false);
    }
  }, [mode, selectedClass, selectedStudent, scopeTargets, classTranscripts, sheetFromData, buildMultiSheet]);

  // Regénère l'aperçu dès qu'une sélection valide change.
  useEffect(() => {
    if (mode === 'single' || mode === 'multi') {
      if (selectedClass && selectedStudent) buildPreview(); else setSheets([]);
    } else if (scopeTargets.length) {
      buildPreview();
    } else {
      setSheets([]);
    }
  }, [mode, classId, studentId, level, scopeTargets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Construit TOUTES les feuilles du périmètre (téléchargement / impression) ──
  const buildAll = useCallback(async (onProgress) => {
    if (mode === 'multi') {
      const s = await buildMultiSheet(selectedStudent, selectedClass);
      onProgress?.(1, 1);
      return { sheets: [s], failed: 0 };
    }
    const cache = new Map();
    const out = [];
    let done = 0, failed = 0;
    for (const { cls, studentId: sid } of scopeTargets) {
      try {
        if (!cache.has(cls.id)) cache.set(cls.id, classTranscripts(cls));
        const { sys, data } = cache.get(cls.id);
        const d = data.find((x) => x.student.id === sid);
        if (d && d.generalAvg !== null) out.push(await sheetFromData(d, cls, sys));
      } catch (e) {
        // Un élève en erreur ne doit pas faire échouer tout le lot.
        console.error('buildAll sheet', sid, e);
        failed++;
      }
      onProgress?.(++done, scopeTargets.length);
    }
    return { sheets: out, failed };
  }, [mode, selectedStudent, selectedClass, scopeTargets, classTranscripts, sheetFromData, buildMultiSheet]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const logAndRefresh = useCallback(async (status, count, detail) => {
    const scope = mode === 'level' ? level : mode === 'class' ? selectedClass?.name : mode === 'all' ? '' : selectedStudent?.name;
    await recordGeneration({ schoolId: school.id, userName, type: mode, scope, count, status, detail });
    recentGenerations(school.id).then(setHistory);
  }, [mode, level, selectedClass, selectedStudent, school, userName]);

  const handleDownload = async () => {
    setErr(null);
    setPdfProg({ done: 0, total: scopeTargets.length || 1 });
    try {
      const { sheets: all, failed } = await buildAll((done, total) => setPdfProg({ done, total }));
      if (!all.length) throw new Error(t('Aucun relevé générable — vérifiez les notes et les moyennes.', 'No generable transcript — check grades and averages.', 'Sin certificaciones generables — verifique notas.'));
      const fileBase = mode === 'class' ? `releves-${selectedClass?.name || 'classe'}`
        : mode === 'level' ? `releves-niveau-${level}`
        : mode === 'all' ? 'releves-etablissement'
        : `releve-${(selectedStudent?.name || 'eleve').replace(/\s+/g, '-')}`;
      // Au-delà d'une centaine de pages, on réduit la résolution pour éviter de
      // saturer la mémoire du navigateur (rasterisation A4 plein écran).
      const ratio = all.length > 150 ? 1.5 : all.length > 50 ? 2 : 3;
      await exportTranscriptsPdf(all, {
        fileName: `${fileBase}.pdf`.toLowerCase(), mode: 'save', pixelRatio: ratio,
        onProgress: (done, total) => setPdfProg({ done, total }),
      });
      if (failed) setErr(t(`${failed} relevé(s) ignoré(s) (données incomplètes).`, `${failed} transcript(s) skipped (incomplete data).`, `${failed} omitida(s).`));
      await logAndRefresh('success', all.length, failed ? `${failed} skipped` : '');
    } catch (e) {
      console.error('download', e);
      setErr(e?.message || String(e));
      await logAndRefresh('error', 0, e?.message || String(e));
    } finally {
      setPdfProg(null);
    }
  };

  const handlePrintAll = async () => {
    setErr(null);
    setPdfProg({ done: 0, total: scopeTargets.length || 1 });
    try {
      const { sheets: all } = await buildAll((done, total) => setPdfProg({ done, total }));
      if (!all.length) throw new Error(t('Aucun relevé générable — vérifiez les notes et les moyennes.', 'No generable transcript — check grades and averages.', 'Sin certificaciones generables — verifique notas.'));
      printSheets(all, `${t('Relevés', 'Transcripts', 'Certificaciones')} — ${school?.name || ''}`);
      await logAndRefresh('success', all.length, 'print');
    } catch (e) {
      console.error('print', e);
      setErr(e?.message || String(e));
    } finally {
      setPdfProg(null);
    }
  };

  const handleParents = () => {
    const ids = new Set(scopeTargets.map((x) => x.studentId));
    const gen = students.filter((s) => ids.has(s.id));
    setParentLinks(buildParentLinks(gen, school, schoolYear));
  };

  // Navigue vers la saisie des notes (correction d'une anomalie).
  const goCorrect = (target) => {
    if (target?.classId && target.classId !== classId) setClassId(target.classId);
    navigate('/app/grades');
  };

  // KPI → raccourcis.
  const onKpiClick = (kind) => {
    if (kind === 'classes') setMode('class');
    else setMode('all');
  };

  // Éléments inclus dans le document (aperçu « contenu »).
  const includes = useMemo(() => {
    const needsStudent = mode === 'single' || mode === 'multi';
    return [
      { id: 'logo',  label: t('Logo établissement', 'School logo', 'Logo'), ok: !!school?.logo_url },
      { id: 'name',  label: t('Nom établissement', 'School name', 'Nombre'), ok: !!school?.name },
      { id: 'student', label: t('Nom élève', 'Student name', 'Alumno'), ok: needsStudent ? !!selectedStudent : true },
      { id: 'class', label: t('Classe', 'Class', 'Clase'), ok: !!selectedClass || mode === 'all' || mode === 'level' },
      { id: 'year',  label: t('Année scolaire', 'Academic year', 'Año'), ok: !!schoolYear },
      { id: 'subjects', label: t('Matières & moyennes', 'Subjects & averages', 'Asignaturas'), ok: true },
      { id: 'rank',  label: t('Rang', 'Rank', 'Puesto'), ok: true },
      { id: 'mention', label: t('Mention / décision', 'Decision', 'Mención'), ok: true },
      { id: 'sign',  label: t('Signature', 'Signature', 'Firma'), ok: !!(school?.signature_url || school?.director) },
      { id: 'stamp', label: t('Tampon', 'Stamp', 'Sello'), ok: !!school?.stamp_url },
    ];
  }, [mode, school, selectedStudent, selectedClass, schoolYear, t]);

  const docCount = scopeTargets.length;
  const canGenerate = docCount > 0 && canPrint;
  const estimateSeconds = docCount ? Math.max(1, Math.round(docCount * 0.5)) : 0;

  const left = {
    schoolName: school?.name,
    className: mode === 'level' ? `${t('Niveau', 'Level', 'Nivel')} ${level || '—'}` : mode === 'all' ? t('Toutes', 'All', 'Todas') : selectedClass?.name,
    studentName: (mode === 'single' || mode === 'multi') ? selectedStudent?.name : `${docCount} ${t('élève(s)', 'student(s)', 'alumno(s)')}`,
    year: schoolYear,
  };

  return (
    <>
        {!canPrint && (
          <div className="flex justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-700">
              🔒 {t('Impression non autorisée', 'Printing not authorized', 'Impresión no autorizada')}
            </span>
          </div>
        )}

        {/* Bandeau d'erreur global (toujours visible) */}
        {err && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span className="flex items-start gap-2">
              <span className="mt-0.5">⚠</span>
              <span>{err}</span>
            </span>
            <button type="button" onClick={() => setErr(null)} className="shrink-0 text-red-400 hover:text-red-600" aria-label={t('Fermer', 'Close', 'Cerrar')}>✕</button>
          </div>
        )}

        {/* SECTION 2 — Dashboard */}
        <TranscriptDashboard summary={schoolSummary} onKpiClick={onKpiClick} t={t} />

        {/* SECTION 3 — Cartes de génération */}
        <GenerationCards mode={mode} onChange={setMode} t={t} />

        {/* SECTION 4 — Filtres */}
        <TranscriptFilters
          mode={mode}
          levels={levels} level={level} onLevelChange={setLevel}
          classOptions={nonMaternelle} classId={classId} onClassChange={setClassId}
          studentOptions={studentOptions} studentId={studentId} onStudentChange={setStudentId}
          search={search} onSearch={setSearch}
          year={schoolYear} t={t}
        />

        {/* SECTION 5 — Panneau de contrôle (classe) */}
        {(mode === 'single' || mode === 'class' || mode === 'multi') && classEval && (
          <ControlPanel classEval={classEval} onCorrect={goCorrect} t={t} />
        )}

        {/* SECTION 6 — Validation automatique */}
        <ValidationChecklist items={checklist} t={t} />

        {/* SECTION 7 — Alertes */}
        <AnomaliesPanel anomalies={scopeAnomalies} onCorrect={goCorrect} t={t} />

        {/* SECTION 8 — Prévisualisation PDF */}
        <PdfPreviewPanel
          left={left}
          includes={includes}
          building={building}
          sheets={sheets}
          multiCount={docCount}
          blockedNode={targetIssues.length ? (
            <PdfDiagnostic issues={targetIssues} onCorrect={() => goCorrect(selectedStudent ? { classId, studentId } : null)} t={t} />
          ) : null}
          t={t}
        />

        {/* SECTION 9 — Génération de masse */}
        <MassGenerationBar
          count={docCount}
          progress={pdfProg}
          estimateSeconds={estimateSeconds}
          canGenerate={canGenerate}
          canPrint={canPrint}
          onDownload={handleDownload}
          onPrint={handlePrintAll}
          onParentLinks={handleParents}
          t={t}
        />

        {/* SECTION 11 — Historique */}
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-800">{t('Historique des générations', 'Generation history', 'Historial')}</h2>
          <GenerationHistory entries={history} t={t} />
        </div>

        {plan === 'starter' && (
          <p className="text-xs text-gray-400">
            {t('Astuce : passez au plan supérieur pour la génération en masse illimitée.', 'Tip: upgrade for unlimited batch generation.', 'Consejo: actualice para generación masiva ilimitada.')}
          </p>
        )}

      {/* Modale liens parents */}
      {parentLinks && (
        <Modal title={t('Envoyer aux parents', 'Send to parents', 'Enviar a padres')} onClose={() => setParentLinks(null)}>
          <ParentLinksModal links={parentLinks} t={t} />
        </Modal>
      )}
    </>
  );
}

// ── Hub Documents : relevé de notes + certificat de scolarité ─────────────────
// Un seul écran regroupe les documents scolaires. Un sélecteur en haut bascule
// entre les ateliers ; chacun garde son propre état et sa propre logique.
export default function Documents() {
  const t = useT();
  const [docType, setDocType] = useState('transcript');

  return (
    <Layout>
      <div className="max-w-6xl space-y-5">
        {/* En-tête */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📂 {t('Documents', 'Documents', 'Documentos')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Produisez les documents scolaires officiels de vos élèves.', 'Produce official school documents for your students.', 'Genere los documentos escolares oficiales de sus alumnos.')}
          </p>
        </div>

        {/* Sélecteur de type de document */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DOC_TYPES.map((d) => {
            const active = docType === d.key;
            return (
              <button key={d.key} type="button" onClick={() => setDocType(d.key)} aria-pressed={active}
                className={`relative flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition-all hover:shadow-md ${
                  active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-300' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${active ? 'bg-brand-100' : 'bg-slate-100'}`}>{d.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold leading-tight ${active ? 'text-brand-800' : 'text-slate-800'}`}>{t(...d.label)}</span>
                  <span className="block text-[12px] text-slate-400 leading-tight">{t(...d.desc)}</span>
                </span>
                {active && <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">✓</span>}
              </button>
            );
          })}
        </div>

        {docType === 'transcript' ? <TranscriptWorkspace /> : <CertificateWorkspace t={t} />}
      </div>
    </Layout>
  );
}
