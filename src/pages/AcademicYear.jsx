import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import { useT } from '../lib/i18n';
import { computeNextYear, getNextLevel, isRepeater } from '../lib/yearEngine';
import { fetchDistinctYears } from '../lib/schoolService';
import { backendOnline } from '../lib/edition';
import { seedDemoYear, deleteDemoYear, getDemoClassIds } from '../lib/seedDemo';
import { seedPeriods } from '../lib/academicPeriodsService';
import { resolveCountryCode, getCountry } from '../countries';
import { isOfficialEngine } from '../core/engineResolver';
import { initDB, classesDB } from '../lib/db';
import { gradingOpts, geGradeMax } from '../lib/useCountry';
import { buildRanks, clsStat, multiAvg, getAppreciation } from '../core/bulletinEngine';
import { transcriptColumns } from '../lib/transcriptEngine';
import { palmaresClassSheet } from '../lib/palmaresDoc';
import { printSheets } from '../lib/transcriptDoc';
import { exportTranscriptsPdf } from '../lib/transcriptPdf';
import Layout from '../components/Layout';
import HubTabs from '../components/hubs/HubTabs';
import Modal from '../components/Modal';
import DataImportPanel from '../components/DataImportPanel';

// ── Assistant de promotion sécurisé (étapes + confirmation forte) ───────────
// Parcours en 5 étapes : Vérifications → Règles → Aperçu → Confirmation forte
// (saisie du nom de l'établissement) → Exécution. L'action irréversible n'est
// jamais accessible en un seul clic.
function StepDots({ step, total }) {
  return (
    <div className="flex items-center gap-1.5 mb-5">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-brand-600' : i < step ? 'w-3 bg-brand-300' : 'w-3 bg-gray-200'}`} />
      ))}
    </div>
  );
}

function PromotionWizard({ currentYear, newYear, schoolName, classes, students, subjects, gradeMap, onConfirm, onClose }) {
  const t = useT();
  const TOTAL = 5;
  const [step,    setStep]    = useState(0);
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);
  const [confirmText, setConfirmText] = useState('');

  const rows = classes.map((cls) => {
    const nextLevel    = getNextLevel(cls.level, cls.system);
    const studs        = students.filter((s) => s.class_id === cls.id);
    const repeaters    = studs.filter((s) => isRepeater(s, classes, gradeMap));
    const isGraduating = nextLevel === null;
    return { cls, nextLevel, isGraduating, studs, repeaters: repeaters.length };
  });

  const promotedCount  = rows.filter((r) => !r.isGraduating).reduce((n, r) => n + (r.studs.length - r.repeaters), 0);
  const graduatedCount = rows.filter((r) =>  r.isGraduating).reduce((n, r) => n + (r.studs.length - r.repeaters), 0);
  const totalStudents  = students.length;

  // ── Vérifications préalables (bloquantes vs avertissements) ────────────────
  const emptyClasses    = rows.filter((r) => r.studs.length === 0).map((r) => r.cls.name);

  const blockers = [];
  if (classes.length === 0) blockers.push(t('Aucune classe dans cette année.', 'No classes in this year.', 'Sin clases.'));
  if (totalStudents === 0)  blockers.push(t('Aucun élève à promouvoir.', 'No students to promote.', 'Sin alumnos.'));
  const canProceedChecks = blockers.length === 0;

  // Confirmation forte : saisir exactement le nom de l'établissement.
  const confirmOk = confirmText.trim().toLowerCase() === (schoolName || '').trim().toLowerCase() && !!schoolName;

  const handleConfirm = async () => {
    setRunning(true);
    const res = await onConfirm();
    setRunning(false);
    setResult(res);
    setStep(TOTAL - 1);
  };

  const title = result
    ? t('Promotion', 'Promotion', 'Promoción')
    : `${t('Promotion', 'Promotion', 'Promoción')} ${currentYear} → ${newYear}`;

  return (
    <Modal title={title} onClose={onClose} size="lg">
      {/* Résultat final */}
      {result ? (
        result.error ? (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{result.error}</div>
            <button onClick={onClose} className="btn-secondary w-full">{t('Fermer', 'Close')}</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
              <p className="text-emerald-800 font-semibold text-base mb-3">{t('Promotion effectuée avec succès', 'Year promotion completed successfully')}</p>
              <ul className="text-sm text-emerald-700 space-y-1.5">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{result.newClasses} {t('nouvelles classes créées pour', 'new classes created for')} {result.newYear}</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />{result.promoted} {t(`élève${result.promoted !== 1 ? 's' : ''} promu${result.promoted !== 1 ? 's' : ''}`, `student${result.promoted !== 1 ? 's' : ''} promoted`)}</li>
                {result.repeated > 0 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />{result.repeated} {t(`élève${result.repeated !== 1 ? 's' : ''} redoublant${result.repeated !== 1 ? 's' : ''}`, `student${result.repeated !== 1 ? 's' : ''} repeating`)}</li>}
                {result.graduated > 0 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />{result.graduated} {t(`élève${result.graduated !== 1 ? 's' : ''} diplômé${result.graduated !== 1 ? 's' : ''} (archivés)`, `student${result.graduated !== 1 ? 's' : ''} graduated (archived)`)}</li>}
              </ul>
            </div>
            <p className="text-xs text-gray-400">{t("L'application affiche maintenant l'année", 'The app now shows year')} {result.newYear}.</p>
            <button onClick={onClose} className="btn-primary w-full">{t('Fermer', 'Close')}</button>
          </div>
        )
      ) : (
        <div>
          <StepDots step={step} total={TOTAL - 1} />

          {/* Étape 1 — Vérifications */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-800">{t('Étape 1 — Vérifications', 'Step 1 — Checks', 'Paso 1 — Verificaciones')}</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><span className="text-emerald-600">✓</span>{classes.length} {t('classe(s)', 'class(es)', 'clase(s)')} · {totalStudents} {t('élève(s)', 'student(s)', 'alumno(s)')}</div>
                {emptyClasses.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800 text-xs">⚠ {emptyClasses.length} {t('classe(s) sans élève', 'empty class(es)', 'clase(s) vacía(s)')} : {emptyClasses.join(', ')}</div>
                )}
                {blockers.map((b, i) => (
                  <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-red-700 text-xs">✕ {b}</div>
                ))}
              </div>
              <p className="text-xs text-gray-400">{t('Pensez à clôturer/verrouiller les périodes avant de promouvoir.', 'Remember to close/lock the periods before promoting.', 'Recuerde cerrar/bloquear los periodos antes de promocionar.')}</p>
            </div>
          )}

          {/* Étape 2 — Règles de passage */}
          {step === 1 && (
            <div className="space-y-3 text-sm text-gray-700">
              <p className="text-sm font-semibold text-gray-800">{t('Étape 2 — Règles de passage', 'Step 2 — Promotion rules', 'Paso 2 — Reglas')}</p>
              <ul className="space-y-2">
                <li className="flex gap-2"><span className="text-brand-600">→</span>{t('Chaque élève monte au niveau suivant (6ème→5ème, Form 1→Form 2…).', 'Each student moves to the next level (6th→5th, Form 1→Form 2…).', 'Cada alumno sube de nivel.')}</li>
                <li className="flex gap-2"><span className="text-amber-500">🎓</span>{t('Les niveaux terminaux (Tle, Upper Sixth…) sont archivés comme diplômés.', 'Final levels (Tle, Upper Sixth…) are archived as graduates.', 'Los niveles finales se archivan como graduados.')}</li>
                <li className="flex gap-2"><span className="text-brand-600">📋</span>{t('Les matières et le programme sont copiés dans les nouvelles classes.', 'Subjects and syllabi are copied to the new classes.', 'Las asignaturas se copian a las nuevas clases.')}</li>
              </ul>
            </div>
          )}

          {/* Étape 3 — Aperçu */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-800">{t('Étape 3 — Aperçu', 'Step 3 — Preview', 'Paso 3 — Vista previa')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-center"><div className="text-2xl font-extrabold text-brand-700">{promotedCount}</div><div className="text-xs text-brand-500 mt-0.5 font-medium">{t('élèves promus', 'students promoted')}</div></div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center"><div className="text-2xl font-extrabold text-amber-700">{graduatedCount}</div><div className="text-xs text-amber-500 mt-0.5 font-medium">{t('diplômés (archivés)', 'graduates (archived)')}</div></div>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {rows.map(({ cls, nextLevel, isGraduating, studs, repeaters }) => (
                  <div key={cls.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${isGraduating ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{cls.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5"><span className="font-medium">{cls.level || '—'}</span> → <span className={`font-semibold ${isGraduating ? 'text-amber-700' : 'text-brand-700'}`}>{isGraduating ? t('Diplômés', 'Graduates') : (nextLevel || cls.level || '—')}</span></p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-medium text-gray-500">{studs.length} {t('élève', 'student')}{studs.length !== 1 ? 's' : ''}</span>
                      {repeaters > 0 && <div className="text-xs text-orange-600 font-semibold mt-0.5">{repeaters} {t('redoublant', 'repeating')}{repeaters !== 1 ? 's' : ''}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Étape 4 — Confirmation forte */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-800">{t('Étape 4 — Confirmation', 'Step 4 — Confirmation', 'Paso 4 — Confirmación')}</p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex gap-2 items-start">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{t('Cette action est', 'This action is')} <strong>{t('irréversible', 'irreversible')}</strong>. {t('Les données de', 'Data from')} <strong>{currentYear}</strong> {t("sont archivées et l'année active deviendra", 'will be archived and the active year will become')} <strong>{newYear}</strong>.</span>
              </div>
              <div>
                <label className="form-label">{t('Pour confirmer, saisissez le nom de l\'établissement :', 'To confirm, type the school name:', 'Para confirmar, escriba el nombre del centro:')}</label>
                <p className="text-xs text-gray-400 mb-1.5 font-mono">{schoolName}</p>
                <input type="text" className="form-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={schoolName} autoFocus />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3 pt-5 mt-4 border-t border-gray-100">
            <button onClick={step === 0 ? onClose : () => setStep((s) => s - 1)} disabled={running} className="btn-secondary">
              {step === 0 ? t('Annuler', 'Cancel') : t('← Retour', '← Back', '← Atrás')}
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 0 && !canProceedChecks}
                className="btn-primary disabled:opacity-40"
                style={{ width: 'auto', paddingInline: '1.75rem' }}
              >
                {t('Suivant →', 'Next →', 'Siguiente →')}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={running || !confirmOk}
                className="btn-primary disabled:opacity-40"
                style={{ width: 'auto', paddingInline: '1.75rem' }}
              >
                {running ? t('Promotion en cours…', 'Promoting…') : `${t('Lancer la promotion', 'Run promotion', 'Promocionar')} →`}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Palmarès (tableau d'honneur classé, imprimable) ─────────────────────────
function PalmaresPanel() {
  const t        = useT();
  const school   = useAuthStore((s) => s.school);
  const classes  = useSchoolStore((s) => s.classes);
  const students  = useSchoolStore((s) => s.students);
  const subjects  = useSchoolStore((s) => s.subjects);
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const viewYear  = useUiStore((s) => s.viewYear);
  const year      = viewYear ?? school?.current_year ?? '';

  const [pdfProg, setPdfProg] = useState(null);
  const cc = resolveCountryCode(school);

  const buildSheets = () => {
    const eligible = classes.filter((c) => c.cycle !== 'maternelle');
    const sheets = [];
    for (const cls of eligible) {
      const sys = cls.system || 'FR';
      const cycle = cls.cycle || 'secondaire';
      const opts = gradingOpts(school, cycle);
      const seqs = transcriptColumns(sys, cycle, cc).seqs;
      const subs = subjects.filter((s) => s.class_id === cls.id);
      const studs = students.filter((s) => s.class_id === cls.id);
      if (!studs.length || !subs.length) continue;
      const ranks = buildRanks(studs, gradeMap, cls.id, seqs, subs, sys, {}, opts);
      const stats = clsStat(studs, gradeMap, cls.id, seqs, subs, sys, {}, opts);
      const rows = ranks.map((r) => {
        const appr = getAppreciation(r.av, school?.grade_scale, sys, geGradeMax(school));
        return {
          rank: r.rankD, name: r.name, avg: r.av,
          mention: appr.text || appr.txt || appr.g || '—',
          mentionCol: appr.col,
          isMajor: r.av !== null && r.rankD === '1er',
        };
      });
      sheets.push(palmaresClassSheet(school, year, { className: cls.name, sys, rows, stats }));
    }
    return sheets;
  };

  const handlePrint = () => {
    const sheets = buildSheets();
    if (!sheets.length) { alert(t('Aucune donnée à classer.', 'No data to rank.', 'Sin datos.')); return; }
    printSheets(sheets, `${t('Palmarès', 'Honour roll', 'Cuadro de honor')} — ${school?.name || ''} — ${year}`);
  };

  const handlePdf = async () => {
    const sheets = buildSheets();
    if (!sheets.length) { alert(t('Aucune donnée à classer.', 'No data to rank.', 'Sin datos.')); return; }
    setPdfProg({ done: 0, total: sheets.length });
    try {
      await exportTranscriptsPdf(sheets, {
        fileName: `palmares-${year}.pdf`,
        onProgress: (done, total) => setPdfProg({ done, total }),
      });
    } finally {
      setPdfProg(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-base">🏆 {t('Palmarès', 'Honour roll', 'Cuadro de honor')}</h3>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {t("Tableau d'honneur classé par classe (majors mis en avant), établi sur la moyenne générale annuelle. Imprimez-le ou exportez-le en PDF.",
               'Honour roll ranked by class (top students highlighted), based on the annual general average. Print it or export to PDF.',
               'Cuadro de honor por clase según la media anual.')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handlePrint} className="btn-secondary">🖨 {t('Imprimer', 'Print', 'Imprimir')}</button>
          <button onClick={handlePdf} disabled={!!pdfProg} className="btn-primary disabled:opacity-50"
            style={{ width: 'auto', paddingLeft: '1.25rem', paddingRight: '1.25rem' }}>
            {pdfProg ? `PDF ${pdfProg.done}/${pdfProg.total}…` : `📄 ${t('PDF', 'PDF', 'PDF')}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AcademicYear() {
  const t = useT();
  const school      = useAuthStore((s) => s.school);
  const role        = useAuthStore((s) => s.role);
  const user        = useAuthStore((s) => s.user);
  const academicPeriods  = useSchoolStore((s) => s.academicPeriods);
  const refreshPeriods   = useSchoolStore((s) => s._refreshAcademicPeriods);
  const classes     = useSchoolStore((s) => s.classes);
  const students    = useSchoolStore((s) => s.students);
  const subjects    = useSchoolStore((s) => s.subjects);
  const gradeMap    = useSchoolStore((s) => s.gradeMap);
  const promoteYear = useSchoolStore((s) => s.promoteYear);

  const navigate      = useNavigate();
  const setViewYear   = useUiStore((s) => s.setViewYear);
  const viewYear      = useUiStore((s) => s.viewYear);

  const [showModal,    setShowModal]    = useState(false);
  const [pastYears,    setPastYears]    = useState([]);
  const [loadingYears, setLoadingYears] = useState(true);
  const [seeding,      setSeeding]      = useState(false);
  const [seedResult,   setSeedResult]   = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(false);
  const [demoExists,   setDemoExists]   = useState(false);
  const [genPeriods,   setGenPeriods]   = useState(false);
  const [periodMsg,    setPeriodMsg]    = useState(null);

  const handleConsult = (year) => {
    setViewYear(year);
    navigate('/app');
  };

  const currentYear = school?.current_year || '';
  const newYear     = computeNextYear(currentYear);
  const isAdmin     = role === 'admin';

  // La démo est générée dans l'année active ; son existence se lit dans le registre
  // localStorage rempli par le seed (cf. seedDemo.js), pas dans la liste des années.
  useEffect(() => {
    if (school?.id) setDemoExists(getDemoClassIds(school.id).length > 0);
  }, [school?.id]);

  // Description de la démo adaptée au pays : Guinée Éq. = 2 classes ES / 3 trimestres,
  // Cameroun = 3 classes FR+EN / 6 séquences.
  const isGE            = resolveCountryCode(school) === 'guinea_eq';
  const isOfficiel      = isOfficialEngine(school?.bulletin_engine);
  const demoClassCount  = isOfficiel ? 4 : isGE ? 2 : 3;
  const demoClassList   = isOfficiel
    ? 'Petite Section, CM2, 6ème A, Terminale C'
    : isGE ? '5º Primaria A, 1º ESBA A' : '6ème A FR, 5ème B FR, Form 1 A EN';
  const demoPeriodCount = isOfficiel ? 4 : isGE ? 3 : 6;
  const demoPeriodWord  = isOfficiel
    ? t('cycles maternelle→lycée, avec décisions de passage', 'cycles nursery→high school, with promotion decisions', 'ciclos, con decisiones de promoción')
    : isGE
      ? t('trimestres', 'terms', 'trimestres')
      : t('séquences', 'sequences', 'secuencias');

  const handleSeedDemo = async () => {
    if (!school?.id) return;
    setSeeding(true);
    setSeedResult(null);
    try {
      // Génère dans l'année active : les classes/élèves/notes démo apparaissent
      // aussitôt dans le tableau de bord, à côté des vraies données.
      const result = await seedDemoYear(school.id, currentYear);
      setSeedResult({ ok: true, ...result });
      setDemoExists(true);
    } catch (err) {
      setSeedResult({ ok: false, error: err.message });
    } finally {
      setSeeding(false);
    }
  };

  // Trimestres (périodes de niveau supérieur) configurés pour l'année active.
  const yearTrimesters = academicPeriods.filter((p) => p.school_year === currentYear && p.type === 'trimestre');

  // Génère les périodes académiques (trimestres + séquences) de l'année depuis la
  // configuration du pays. Idempotent (ne recrée rien si déjà présentes). Requis
  // pour les bulletins ET pour les enveloppes budgétaires par période (module Budgets).
  const handleGeneratePeriods = async () => {
    if (!school?.id) return;
    setGenPeriods(true); setPeriodMsg(null);
    try {
      const country = getCountry(school);
      const res = await seedPeriods({ school, country, userId: user?.id, periodMode: school.period_mode || 'auto' });
      await refreshPeriods();
      if (res?.error) setPeriodMsg({ ok: false, text: res.error });
      else if (res?.skipped) setPeriodMsg({ ok: true, text: t('Périodes déjà présentes.', 'Periods already present.', 'Períodos ya presentes.') });
      else setPeriodMsg({ ok: true, text: t(`${res.trimesters} trimestre(s) et ${res.sequences} séquence(s) générés.`, `${res.trimesters} term(s) and ${res.sequences} sequence(s) created.`, `${res.trimesters} trimestre(s) y ${res.sequences} secuencia(s).`) });
    } catch (e) {
      setPeriodMsg({ ok: false, text: e.message });
    } finally {
      setGenPeriods(false);
    }
  };

  const handleDeleteDemo = async () => {
    if (!school?.id) return;
    setDeleting(true);
    setSeedResult(null);
    try {
      // Supprime uniquement les classes démo enregistrées (pas les vraies).
      const result = await deleteDemoYear(school.id);
      setSeedResult({ deleted: true, ...result });
      setDemoExists(false);
    } catch (err) {
      setSeedResult({ ok: false, error: err.message });
    } finally {
      setDeleting(false);
      setConfirmDel(false);
    }
  };

  // Charge la liste de toutes les années présentes en base (archives).
  // Réutilisable : rappelée après un import pour afficher aussitôt les années reprises.
  const loadYears = useCallback(async () => {
    if (!school?.id) return;
    setLoadingYears(true);
    let years = [];
    try {
      if (backendOnline()) {
        years = await fetchDistinctYears(school.id);
      } else {
        await initDB();
        const all = await classesDB.getAll();
        years = [...new Set(
          all.filter((c) => c.school_id === school.id).map((c) => c.current_year).filter(Boolean)
        )].sort().reverse();
      }
      setPastYears(years.filter((y) => y !== currentYear));
    } catch (err) {
      // Ne jamais rester bloqué sur « Chargement… » : on log et on affiche vide.
      console.error('loadYears', err);
      setPastYears([]);
    } finally {
      setLoadingYears(false);
    }
  }, [school?.id, currentYear]);

  useEffect(() => { loadYears(); }, [loadYears]);

  const handlePromote = async () => {
    const res = await promoteYear();
    // After success, reload year list
    if (!res?.error && school?.id) {
      const years = await fetchDistinctYears(school.id).catch(() => []);
      setPastYears(years.filter((y) => y !== res.newYear));
    }
    return res;
  };

  const tabs = [
    { id: 'dashboard',  label: t('Tableau de bord', 'Dashboard', 'Panel'),                          render: renderDashboard },
    { id: 'promotion',  label: t('Promotion', 'Promotion', 'Promoción'), render: renderPromotion,  hidden: !(isAdmin && currentYear) },
    { id: 'archive',    label: t('Archivage & historique', 'Archive & history', 'Archivo'),          render: renderArchive },
    { id: 'migration',  label: t('Migration', 'Migration', 'Migración'),                             render: renderMigration,  hidden: !isAdmin },
    { id: 'tools',      label: t('Outils avancés', 'Advanced tools', 'Herramientas'),                render: renderTools,      hidden: !isAdmin },
  ];

  return (
    <Layout>
      {showModal && (
        <PromotionWizard
          currentYear={currentYear}
          newYear={newYear}
          schoolName={school?.name || ''}
          classes={classes}
          students={students}
          subjects={subjects}
          gradeMap={gradeMap}
          onConfirm={handlePromote}
          onClose={() => setShowModal(false)}
        />
      )}
      <HubTabs
        title={t('Année scolaire', 'Academic Year', 'Año escolar')}
        subtitle={t('Périodes, promotion sécurisée, archives et migration.', 'Periods, secure promotion, archives and migration.', 'Periodos, promoción segura, archivos y migración.')}
        tabs={tabs}
        storageKey="nc_year_tab"
      />
    </Layout>
  );

  // ── Render des onglets ─────────────────────────────────────────────────────
  function renderDashboard() {
    return (
      <div className="max-w-3xl space-y-6">
        {/* Active year card */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-2xl px-8 py-7 text-white shadow-card-lg">
          <p className="text-brand-200 text-xs font-semibold uppercase tracking-widest mb-1">{t('Année active', 'Active year')}</p>
          <h2 className="text-4xl font-extrabold tracking-tight">{currentYear || '—'}</h2>
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-white/10">
            {[
              { label: t('Classes', 'Classes'),   value: classes.length },
              { label: t('Élèves', 'Students'),   value: students.length },
              { label: t('Matières', 'Subjects'), value: subjects.length },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-brand-200 text-xs uppercase tracking-wider">{label}</div>
                <div className="font-extrabold text-2xl text-white mt-0.5">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Périodes académiques — requises pour bulletins + enveloppes budgétaires */}
        {isAdmin && currentYear && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-base">{t('Périodes académiques', 'Academic periods', 'Períodos académicos')}</h3>
                {yearTrimesters.length > 0 ? (
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    ✓ <strong>{yearTrimesters.length}</strong> {t('trimestre(s) configuré(s)', 'term(s) configured', 'trimestre(s) configurado(s)')} — {yearTrimesters.map((p) => p.name).join(', ')}.
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    {t('Aucune période configurée pour cette année. Génère les trimestres et séquences — requis pour les bulletins ET pour répartir le budget annuel par période.',
                       'No period configured for this year. Generate the terms and sequences — required for report cards AND to split the annual budget by period.',
                       'Ningún período configurado. Genera los trimestres y secuencias — requerido para boletines y presupuesto por período.')}
                  </p>
                )}
                {periodMsg && <p className={`text-xs mt-2 ${periodMsg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{periodMsg.text}</p>}
              </div>
              {yearTrimesters.length === 0 && (
                <button
                  onClick={handleGeneratePeriods}
                  disabled={genPeriods}
                  className="text-sm font-semibold px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 shrink-0"
                >
                  {genPeriods ? t('Génération…', 'Generating…', 'Generando…') : t('Générer les périodes', 'Generate periods', 'Generar períodos')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Palmarès — tableau d'honneur imprimable */}
        {isAdmin && currentYear && <PalmaresPanel />}
      </div>
    );
  }

  function renderPromotion() {
    return (
      <div className="max-w-3xl space-y-6">
        {/* Promotion CTA — assistant sécurisé */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-base">
                  {t('Passer à l\'année suivante', 'Move to next year')}
                </h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  {t('Clôture', 'Closes')} <strong className="text-gray-700">{currentYear}</strong> {t('et démarre', 'and starts')}{' '}
                  <strong className="text-gray-700">{newYear}</strong>. {t('Chaque élève est automatiquement promu dans la classe suivante (6ème→5ème, Form 1→Form 2, etc.). Les élèves de Terminale et d\'Upper Sixth sont archivés comme diplômés. Les matières sont copiées dans les nouvelles classes.', 'Each student is automatically promoted to the next class (6th→5th, Form 1→Form 2, etc.). Terminale and Upper Sixth students are archived as graduates. Subjects are copied to the new classes.')}
                </p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="btn-primary shrink-0"
                style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
              >
                {t('Lancer la promotion →', 'Run promotion →')}
              </button>
            </div>
          </div>
      </div>
    );
  }

  function renderTools() {
    return (
      <div className="max-w-3xl space-y-6">
        {/* Bloc données de démo */}
          <div className="bg-white rounded-2xl border border-dashed border-indigo-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded">{t('Données de démo', 'Demo data', 'Datos de demostración')}</span>
                </div>
                <h3 className="font-semibold text-gray-900 text-base">
                  {t('Générer des données de test', 'Generate test data', 'Generar datos de prueba')} — {currentYear}
                </h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  {t('Crée', 'Creates', 'Crea')} <strong>{demoClassCount} {t('classes', 'classes', 'clases')}</strong> ({demoClassList}),{' '}
                  {t('matières, élèves et notes', 'subjects, students and grades', 'asignaturas, alumnos y notas')} (<strong>{demoPeriodCount} {demoPeriodWord}</strong>) {t('pour tester les bulletins.', 'to test report cards.', 'para probar los boletines.')}
                </p>
                {seedResult?.ok && (
                  <p className="text-sm text-emerald-700 font-medium mt-2">
                    ✓ {seedResult.totalClasses} {t('classes', 'classes')} · {seedResult.totalStudents} {t('élèves', 'students')} · {seedResult.totalSubjects} {t('matières', 'subjects')} · {seedResult.totalGrades} {t('notes créées', 'grades created')}
                  </p>
                )}
                {seedResult?.ok === false && (
                  <p className="text-sm text-red-600 mt-2">{t('Erreur', 'Error')} : {seedResult.error}</p>
                )}
                {seedResult?.deleted && (
                  <p className="text-sm text-emerald-700 font-medium mt-2">
                    ✓ {t('Données de démo supprimées', 'Demo data deleted', 'Datos de demostración eliminados')}
                    {seedResult.deletedClasses ? ` (${seedResult.deletedClasses} ${t('classes', 'classes', 'clases')})` : ''}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {demoExists ? (
                  confirmDel ? (
                    <div className="flex flex-col items-end gap-2">
                      <p className="text-xs text-gray-500 max-w-[180px] text-right">
                        {t('Supprimer définitivement les données de démo ?', 'Permanently delete the demo data?', '¿Eliminar definitivamente los datos de demostración?')}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteDemo}
                          disabled={deleting}
                          className="text-sm font-semibold px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                        >
                          {deleting ? t('Suppression…', 'Deleting…', 'Eliminando…') : t('Confirmer', 'Confirm', 'Confirmar')}
                        </button>
                        <button
                          onClick={() => setConfirmDel(false)}
                          disabled={deleting}
                          className="text-sm font-semibold px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                        >
                          {t('Annuler', 'Cancel', 'Cancelar')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                        ✓ {t('Créé', 'Created', 'Creado')}
                      </span>
                      <button
                        onClick={() => { setConfirmDel(true); setSeedResult(null); }}
                        className="text-sm font-semibold px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                      >
                        {t('Supprimer', 'Delete', 'Eliminar')}
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    onClick={handleSeedDemo}
                    disabled={seeding}
                    className="text-sm font-semibold px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                  >
                    {seeding ? t('Génération…', 'Generating…') : t('Générer →', 'Generate →')}
                  </button>
                )}
              </div>
            </div>
          </div>
      </div>
    );
  }

  function renderMigration() {
    return (
      <div className="max-w-3xl space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
            <h3 className="font-semibold text-gray-900 text-base mb-1">
              {t('Importer des années antérieures', 'Import previous years')}
            </h3>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              {t("Reprenez l'historique (élèves, notes, frais…) depuis un autre logiciel. Chaque année importée devient une archive consultable ci-dessous.",
                 'Migrate history (students, grades, fees…) from another software. Each imported year becomes an archive you can view below.')}
            </p>
            <DataImportPanel onImported={loadYears} />
          </div>
      </div>
    );
  }

  function renderArchive() {
    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {t('Années archivées', 'Archived years')}
          </h2>

          {loadingYears ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-sm text-gray-400 text-center animate-pulse">
              {t('Chargement des archives…', 'Loading archives…')}
            </div>
          ) : pastYears.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {pastYears.map((year) => (
                <div key={year} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="font-semibold text-gray-800">{year}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('Données archivées — classes, élèves, notes et bulletins', 'Archived data — classes, students, grades and report cards')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {viewYear === year ? (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">
                        {t('En consultation', 'Viewing')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConsult(year)}
                        className="text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {t('Consulter →', 'View →')}
                      </button>
                    )}
                    <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                      {t('Archive', 'Archive')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-gray-100">
              <div className="text-3xl mb-3">📅</div>
              <p className="text-gray-500 text-sm font-medium">{t('Aucune année précédente', 'No previous years')}</p>
              <p className="text-gray-400 text-xs mt-1">
                {t('La première promotion créera une archive de', 'The first promotion will create an archive of')} {currentYear || t("l'année actuelle", 'the current year')}.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
}
