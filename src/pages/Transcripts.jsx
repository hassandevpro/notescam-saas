import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import { useT } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import { clsStat, buildRanks } from '../core/bulletinEngine';
import { resolveCountryCode } from '../countries';
import { gradingOpts } from '../lib/useCountry';
import { qrDataUrl } from '../lib/idCardService';
import {
  buildClassTranscripts, buildMultiYearHistory, transcriptColumns, buildVerification,
} from '../lib/transcriptEngine';
import {
  transcriptSheetHtml, multiYearSheetHtml, printSheets,
} from '../lib/transcriptDoc';
import { exportTranscriptsPdf } from '../lib/transcriptPdf';
import { loadYearAcademics, matchStudent, listYears } from '../lib/transcriptHistory';
import Layout from '../components/Layout';

// Ordre d'affichage des matières : `position` puis (coef, nom) — rétrocompatible.
function bySubjectOrder(a, b) {
  const ha = a.position != null, hb = b.position != null;
  if (ha && hb) return a.position - b.position;
  if (ha) return -1;
  if (hb) return 1;
  return (b.coef || 0) - (a.coef || 0) || a.name.localeCompare(b.name);
}

const decisionText = (sys, d) => (sys === 'EN' ? d.en : sys === 'ES' ? (d.es || d.fr) : d.fr);

export default function Transcripts() {
  const t = useT();
  const { plan } = usePlan();

  const school    = useAuthStore((s) => s.school);
  const role      = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);
  const classes   = useSchoolStore((s) => s.classes);
  const subjects  = useSchoolStore((s) => s.subjects);
  const students  = useSchoolStore((s) => s.students);
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const teachers  = useSchoolStore((s) => s.teachers);
  const viewYear  = useUiStore((s) => s.viewYear);

  const myTeacher = role === 'teacher' ? teachers.find((tt) => tt.id === teacherId) : null;
  const canPrint  = role !== 'teacher' || (myTeacher?.can_print_bulletin ?? true);

  const [mode,     setMode]     = useState('single'); // single | class | multi
  const [classId,  setClassId]  = useState('');
  const [studentId, setStudentId] = useState('');
  const [sheets,   setSheets]   = useState([]);       // HTML A4 prêtes
  const [building, setBuilding] = useState(false);
  const [pdfProg,  setPdfProg]  = useState(null);     // { done, total } | null
  const [err,      setErr]      = useState(null);

  const buildSeq = useRef(0); // évite les courses entre builds asynchrones

  const schoolYear = viewYear ?? school?.current_year ?? '';
  const countryCode = resolveCountryCode(school);

  const selectedClass = classes.find((c) => c.id === classId) || null;
  const classSubjects = useMemo(
    () => subjects.filter((s) => s.class_id === classId).sort(bySubjectOrder),
    [subjects, classId]
  );
  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );
  const selectedStudent = classStudents.find((s) => s.id === studentId) || null;

  // Réinitialise l'élève quand la classe change.
  useEffect(() => { setStudentId(''); setSheets([]); }, [classId]);
  useEffect(() => { setSheets([]); }, [mode]);

  // ── Construction d'une ou plusieurs feuilles (asynchrone : QR + multi-années)
  const build = useCallback(async () => {
    setErr(null);
    if (!selectedClass) return;
    const cls = selectedClass;
    const sys = cls.system || 'FR';
    const cycle = cls.cycle || 'secondaire';

    if (cycle === 'maternelle') {
      setErr(t("Les relevés ne s'appliquent pas au cycle maternelle.",
               'Transcripts do not apply to the kindergarten cycle.',
               'Las certificaciones no aplican al ciclo infantil.'));
      return;
    }

    const opts = { ...gradingOpts(school, cycle), gradeScale: school?.grade_scale };
    const origin = (typeof window !== 'undefined' && window.location?.origin) || '';
    const seq = ++buildSeq.current;
    setBuilding(true);

    try {
      const newSheets = [];

      if (mode === 'multi') {
        const ref = selectedStudent;
        if (!ref) { setErr(t('Choisissez un élève.', 'Select a student.', 'Elija un alumno.')); setBuilding(false); return; }

        const years = await listYears(school.id);
        const entries = [];
        for (const y of years) {
          const ac = await loadYearAcademics(school.id, y);
          const st = matchStudent(ref, ac.students);
          if (!st) continue;
          const yCls = ac.classes.find((c) => c.id === st.class_id);
          if (!yCls) continue;
          const sysY   = yCls.system || 'FR';
          const cycleY = yCls.cycle || 'secondaire';
          const subsY  = ac.subjects.filter((s) => s.class_id === yCls.id).sort(bySubjectOrder);
          const studsY = ac.students.filter((s) => s.class_id === yCls.id);
          const optsY  = { ...gradingOpts(school, cycleY), gradeScale: school?.grade_scale };
          const { seqs } = transcriptColumns(sysY, cycleY, countryCode);
          const ranksY = buildRanks(studsY, ac.gradeMap, yCls.id, seqs, subsY, sysY, {}, optsY);
          const statsY = clsStat(studsY, ac.gradeMap, yCls.id, seqs, subsY, sysY, {}, optsY);
          entries.push({
            year: y, cls: yCls, subjects: subsY, gradeMap: ac.gradeMap, sys: sysY,
            cycle: cycleY, countryCode, ranks: ranksY, stats: statsY, opts: optsY, studentId: st.id,
          });
        }

        if (!entries.length) {
          setErr(t('Aucun historique trouvé pour cet élève.', 'No history found for this student.', 'Sin historial para este alumno.'));
          setBuilding(false); return;
        }

        const history = buildMultiYearHistory(ref, entries);
        const lastAvg = history[history.length - 1]?.generalAvg ?? null;
        const lastDec = history[history.length - 1]?.decision;
        const verification = buildVerification({
          schoolId: school.id, schoolName: school.name, studentName: ref.name,
          matricule: ref.matricule, className: history[history.length - 1]?.className,
          year: `${history[0]?.year}…${history[history.length - 1]?.year}`,
          avg: lastAvg, rank: history[history.length - 1]?.rank,
          decision: lastDec ? decisionText(sys, lastDec) : '',
        }, origin);
        const qrSrc = await qrDataUrl(verification.qrText);
        newSheets.push(multiYearSheetHtml(ref, history, { qrSrc, verification, school, sys }));
      } else {
        const stats = clsStat(classStudents, gradeMap, cls.id, transcriptColumns(sys, cycle, countryCode).seqs, classSubjects, sys, {}, opts);
        const allData = buildClassTranscripts({
          classStudents, cls, subjects: classSubjects, gradeMap, sys, cycle,
          countryCode, schoolYear, stats, opts,
        });
        const list = mode === 'class' ? allData : allData.filter((d) => d.student.id === studentId);
        if (!list.length) { setErr(t('Choisissez un élève.', 'Select a student.', 'Elija un alumno.')); setBuilding(false); return; }

        for (const data of list) {
          const verification = buildVerification({
            schoolId: school.id, schoolName: school.name, studentName: data.student.name,
            matricule: data.student.matricule, className: cls.name, year: schoolYear,
            avg: data.generalAvg, rank: data.rankEntry?.rankD,
            decision: decisionText(sys, data.decision),
          }, origin);
          const qrSrc = await qrDataUrl(verification.qrText);
          newSheets.push(transcriptSheetHtml(data, { qrSrc, verification, school }));
        }
      }

      if (seq === buildSeq.current) setSheets(newSheets);
    } catch (e) {
      console.error('build transcripts', e);
      setErr(e?.message || String(e));
    } finally {
      if (seq === buildSeq.current) setBuilding(false);
    }
  }, [selectedClass, selectedStudent, mode, studentId, classStudents, classSubjects, gradeMap, school, schoolYear, countryCode, t]);

  // Génération automatique en un clic dès qu'une sélection valide est prête.
  useEffect(() => {
    if (!selectedClass) { setSheets([]); return; }
    if ((mode === 'single' || mode === 'multi') && !studentId) { setSheets([]); return; }
    build();
  }, [build, selectedClass, mode, studentId]);

  const handlePrint = () => {
    if (!sheets.length) return;
    printSheets(sheets, `${t('Relevés', 'Transcripts', 'Certificaciones')} — ${school?.name || ''}`);
  };

  const handlePdf = async () => {
    if (!sheets.length) return;
    setPdfProg({ done: 0, total: sheets.length });
    try {
      const fileBase = mode === 'class'
        ? `releves-${selectedClass?.name || 'classe'}`
        : `releve-${(selectedStudent?.name || 'eleve').replace(/\s+/g, '-')}`;
      await exportTranscriptsPdf(sheets, {
        fileName: `${fileBase}.pdf`.toLowerCase(),
        mode: 'save',
        onProgress: (done, total) => setPdfProg({ done, total }),
      });
    } catch (e) {
      console.error('pdf', e);
      setErr(e?.message || String(e));
    } finally {
      setPdfProg(null);
    }
  };

  const MODES = [
    { key: 'single', label: t('Individuel', 'Individual', 'Individual'), icon: '👤' },
    { key: 'class',  label: t('Par classe', 'By class', 'Por clase'),    icon: '👥' },
    { key: 'multi',  label: t('Multi-années', 'Multi-year', 'Plurianual'), icon: '📚' },
  ];

  const needsStudent = mode === 'single' || mode === 'multi';
  const ready = !!selectedClass && (!needsStudent || !!studentId) && sheets.length > 0;

  return (
    <Layout>
      <div className="max-w-5xl">
        {/* En-tête */}
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Relevés de notes', 'Transcripts', 'Certificaciones')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('Production automatique des relevés scolaires de fin d’année — en un clic.',
                 'Automatic end-of-year transcript production — one click.',
                 'Producción automática de certificaciones de fin de curso — un clic.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canPrint ? (
              <>
                <button onClick={handlePrint} disabled={!ready || building} className="btn-secondary disabled:opacity-50">
                  🖨 {mode === 'class' ? t('Imprimer la classe', 'Print class') : t('Imprimer', 'Print')}
                  {mode === 'class' && sheets.length ? ` (${sheets.length})` : ''}
                </button>
                <button onClick={handlePdf} disabled={!ready || building || !!pdfProg}
                  className="btn-primary disabled:opacity-50" style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
                  {pdfProg ? `PDF ${pdfProg.done}/${pdfProg.total}…` : `📄 ${t('Télécharger PDF', 'Download PDF', 'Descargar PDF')}`}
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm border border-amber-200">
                🔒 {t("Impression non autorisée", 'Printing not authorized', 'Impresión no autorizada')}
              </span>
            )}
          </div>
        </div>

        {/* Mode */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm font-medium text-gray-500">{t('Type de relevé :', 'Transcript type:', 'Tipo:')}</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {MODES.map(({ key, label, icon }) => (
              <button key={key} onClick={() => setMode(key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${mode === key ? 'bg-brand-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {icon} {label}
              </button>
            ))}
          </div>
          {mode === 'multi' && (
            <span className="text-xs text-gray-400 italic">
              {t('Historique complet : 6ème → Terminale (toutes les archives).',
                 'Full history: across all archived years.',
                 'Historial completo de todos los años.')}
            </span>
          )}
        </div>

        {/* Sélecteurs */}
        <div className="flex flex-wrap gap-4 mb-5">
          <div>
            <label className="form-label">{t('Classe', 'Class', 'Clase')}</label>
            <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">{t('— Choisir une classe —', '— Select a class —', '— Elegir clase —')}</option>
              {classes.filter((c) => c.cycle !== 'maternelle').map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {needsStudent && (
            <div>
              <label className="form-label">{t('Élève', 'Student', 'Alumno')}</label>
              <select className="form-input" value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ minWidth: 240 }} disabled={!selectedClass}>
                <option value="">{t('— Choisir un élève —', '— Select a student —', '— Elegir alumno —')}</option>
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">{err}</div>
        )}

        {/* Aperçu */}
        <div className="bg-gray-100 rounded-2xl border border-gray-200 p-4 min-h-[300px]">
          {building ? (
            <div className="text-center py-16 text-gray-400 text-sm animate-pulse">
              {t('Génération du relevé…', 'Generating transcript…', 'Generando…')}
            </div>
          ) : sheets.length ? (
            <>
              {mode === 'class' && (
                <p className="text-xs text-gray-500 mb-3 text-center">
                  {t('Aperçu du 1er relevé', 'Preview of 1st transcript', 'Vista del 1º')} · {sheets.length} {t('relevés au total', 'transcripts total', 'en total')}
                </p>
              )}
              <div className="overflow-auto flex justify-center">
                {/* Aperçu de la 1re feuille (même HTML que l'impression / le PDF). */}
                <div style={{ transform: 'scale(0.92)', transformOrigin: 'top center' }}
                     dangerouslySetInnerHTML={{ __html: sheets[0] }} />
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📜</div>
              <p className="text-gray-500 text-sm font-medium">
                {!selectedClass
                  ? t('Choisissez une classe pour commencer.', 'Select a class to begin.', 'Elija una clase.')
                  : needsStudent
                    ? t('Choisissez un élève — le relevé se génère automatiquement.', 'Select a student — the transcript generates automatically.', 'Elija un alumno.')
                    : t('Le relevé de chaque élève sera généré.', 'Each student transcript will be generated.', 'Se generará cada certificación.')}
              </p>
            </div>
          )}
        </div>

        {plan === 'starter' && (
          <p className="text-xs text-gray-400 mt-3">
            {t('Astuce : passez au plan supérieur pour la génération en masse illimitée.',
               'Tip: upgrade for unlimited batch generation.',
               'Consejo: actualice para generación masiva ilimitada.')}
          </p>
        )}
      </div>
    </Layout>
  );
}
