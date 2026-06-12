import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSchoolStore } from '../store/schoolStore';
import { useUiStore } from '../store/uiStore';
import { useT } from '../lib/i18n';
import { computeNextYear, getNextLevel } from '../lib/yearEngine';
import { fetchDistinctYears } from '../lib/schoolService';
import { seedDemoYear, deleteDemoYear, getDemoClassIds } from '../lib/seedDemo';
import { resolveCountryCode } from '../countries';
import { initDB, classesDB } from '../lib/db';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import DataImportPanel from '../components/DataImportPanel';

// ── Promotion preview + confirmation modal ─────────────────────────────────
function PromotionModal({ currentYear, newYear, classes, students, subjects, onConfirm, onClose }) {
  const t = useT();
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);

  const rows = classes.map((cls) => {
    const nextLevel    = getNextLevel(cls.level, cls.system);
    const studs        = students.filter((s) => s.class_id === cls.id);
    const isGraduating = nextLevel === null;
    return { cls, nextLevel, isGraduating, studs };
  });

  const promotedCount  = rows.filter((r) => !r.isGraduating).reduce((n, r) => n + r.studs.length, 0);
  const graduatedCount = rows.filter((r) =>  r.isGraduating).reduce((n, r) => n + r.studs.length, 0);

  const handleConfirm = async () => {
    setRunning(true);
    const res = await onConfirm();
    setRunning(false);
    setResult(res);
  };

  return (
    <Modal title={`${t('Clôturer', 'Close year')} ${currentYear} → ${newYear}`} onClose={result ? onClose : onClose} size="lg">
      {result?.error ? (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {result.error}
          </div>
          <button onClick={onClose} className="btn-secondary w-full">{t('Fermer', 'Close')}</button>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <p className="text-emerald-800 font-semibold text-base mb-3">{t('Promotion effectuée avec succès', 'Year promotion completed successfully')}</p>
            <ul className="text-sm text-emerald-700 space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {result.newClasses} {t('nouvelles classes créées pour', 'new classes created for')} {result.newYear}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {result.promoted} {t(`élève${result.promoted !== 1 ? 's' : ''} promu${result.promoted !== 1 ? 's' : ''}`, `student${result.promoted !== 1 ? 's' : ''} promoted`)}
              </li>
              {result.graduated > 0 && (
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {result.graduated} {t(`élève${result.graduated !== 1 ? 's' : ''} diplômé${result.graduated !== 1 ? 's' : ''} (archivés)`, `student${result.graduated !== 1 ? 's' : ''} graduated (archived)`)}
                </li>
              )}
            </ul>
          </div>
          <p className="text-xs text-gray-400">{t("L'application affiche maintenant l'année", 'The app now shows year')} {result.newYear}.</p>
          <button onClick={onClose} className="btn-primary w-full">{t('Fermer', 'Close')}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 text-center">
              <div className="text-2xl font-extrabold text-brand-700">{promotedCount}</div>
              <div className="text-xs text-brand-500 mt-0.5 font-medium">{t('élèves promus', 'students promoted')}</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <div className="text-2xl font-extrabold text-amber-700">{graduatedCount}</div>
              <div className="text-xs text-amber-500 mt-0.5 font-medium">{t('diplômés (archivés)', 'graduates (archived)')}</div>
            </div>
          </div>

          {/* Class rows */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {rows.map(({ cls, nextLevel, isGraduating, studs }) => (
              <div
                key={cls.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                  isGraduating
                    ? 'bg-amber-50 border-amber-100'
                    : 'bg-gray-50 border-gray-100'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{cls.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium">{cls.level || '—'}</span>
                    {' '}→{' '}
                    <span className={`font-semibold ${isGraduating ? 'text-amber-700' : 'text-brand-700'}`}>
                      {isGraduating ? t('Diplômés', 'Graduates') : (nextLevel || cls.level || '—')}
                    </span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-medium text-gray-500">
                    {studs.length} {t('élève', 'student')}{studs.length !== 1 ? 's' : ''}
                  </span>
                  {isGraduating && (
                    <div className="text-xs text-amber-600 font-semibold mt-0.5">{t('Diplômés', 'Graduates')}</div>
                  )}
                </div>
              </div>
            ))}
            {classes.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                {t('Aucune classe dans cette année.', 'No classes in this year.')}
              </p>
            )}
          </div>

          {/* Warning */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex gap-2 items-start">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>
              {t('Cette action est', 'This action is')} <strong>{t('irréversible', 'irreversible')}</strong>. {t('Les données de', 'Data from')} <strong>{currentYear}</strong> {t('sont archivées et l\'année active deviendra', 'will be archived and the active year will become')} <strong>{newYear}</strong>.{' '}
              {t('Les matières et le programme de chaque classe sont copiés automatiquement.', 'Subjects and syllabi are automatically copied to new classes.')}
            </span>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleConfirm}
              disabled={running || classes.length === 0}
              className="btn-primary"
              style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}
            >
              {running ? t('Promotion en cours…', 'Promoting…') : `${t('Confirmer', 'Confirm')} → ${newYear}`}
            </button>
            <button onClick={onClose} disabled={running} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AcademicYear() {
  const t = useT();
  const school      = useAuthStore((s) => s.school);
  const role        = useAuthStore((s) => s.role);
  const classes     = useSchoolStore((s) => s.classes);
  const students    = useSchoolStore((s) => s.students);
  const subjects    = useSchoolStore((s) => s.subjects);
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
  const demoClassCount  = isGE ? 2 : 3;
  const demoClassList   = isGE ? '5º Primaria A, 1º ESBA A' : '6ème A FR, 5ème B FR, Form 1 A EN';
  const demoPeriodCount = isGE ? 3 : 6;
  const demoPeriodWord  = isGE
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
      if (navigator.onLine) {
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

  return (
    <Layout>
      {showModal && (
        <PromotionModal
          currentYear={currentYear}
          newYear={newYear}
          classes={classes}
          students={students}
          subjects={subjects}
          onConfirm={handlePromote}
          onClose={() => setShowModal(false)}
        />
      )}

      <div className="max-w-3xl space-y-6">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('Année scolaire', 'Academic Year')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('Gestion des années scolaires, promotion automatique et archives.', 'Academic year management, automatic promotion and archives.')}
          </p>
        </div>

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

        {/* Promotion CTA — admin only */}
        {isAdmin && currentYear && (
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
        )}

        {/* Bloc données de démo */}
        {isAdmin && (
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
        )}

        {/* Import de données historiques (migration depuis une autre app) */}
        {isAdmin && (
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
        )}

        {/* Archive list */}
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
    </Layout>
  );
}
