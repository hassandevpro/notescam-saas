import { useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useSchoolStore } from './store/schoolStore';
import { useUiStore } from './store/uiStore';
import { flushSyncQueue, getQueueCount, pruneExpiredItems } from './lib/sync';
import { requestPersistentStorage } from './lib/db';
import { backendOnline, IS_LAN } from './lib/edition';
import { installDocumentScaleVars } from './lib/documentScaleVars';
import { installPrintStyles } from './lib/print';

// Dimensionnement des éléments graphiques (variables CSS) — installé une fois.
installDocumentScaleVars();
// Socle d'impression : les documents rendus DANS l'application (bulletins,
// conseil de classe, aperçus) héritent des mêmes règles de couleur et de saut
// de page que ceux imprimés en fenêtre séparée. La géométrie @page reste au
// document hôte (bulletin.css a la sienne).
installPrintStyles();
import ProtectedRoute, { ParentRoute } from './components/ProtectedRoute';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import ToastHost from './components/ToastHost';
import OnboardingWizard from './components/OnboardingWizard';
import LanLicenseGate from './components/LanLicenseGate';
import CloudActivationWizard from './components/CloudActivationWizard';
import CloudMigrationWizard from './components/CloudMigrationWizard';

// Auth pages — petites, chargées immédiatement
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import TeacherSignup from './pages/TeacherSignup';
import VerifyEmail from './pages/VerifyEmail';

// App pages — lazy-loaded pour réduire le bundle initial
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const Classes       = lazy(() => import('./pages/Classes'));
const Students      = lazy(() => import('./pages/Students'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Grades        = lazy(() => import('./pages/Grades'));
const Bulletins     = lazy(() => import('./pages/Bulletins'));
const Transcripts   = lazy(() => import('./pages/Transcripts'));
const VerifyTranscript = lazy(() => import('./pages/VerifyTranscript'));
const Teachers      = lazy(() => import('./pages/Teachers'));
const Personnel     = lazy(() => import('./pages/Personnel'));
const HR            = lazy(() => import('./pages/HR'));
const Signalements  = lazy(() => import('./pages/Signalements'));
const Notifications = lazy(() => import('./pages/Notifications'));
const GroupDashboard = lazy(() => import('./pages/GroupDashboard'));
const Assets        = lazy(() => import('./pages/Assets'));
const Settings      = lazy(() => import('./pages/Settings'));
const Profile       = lazy(() => import('./pages/Profile'));
// Module « Seed Data » — chargé UNIQUEMENT en mode Développement (tree-shaké en prod).
const SeedData      = import.meta.env.DEV ? lazy(() => import('./pages/SeedData')) : null;
const AcademicYear  = lazy(() => import('./pages/AcademicYear'));
const Reports        = lazy(() => import('./pages/Reports'));
const Fees           = lazy(() => import('./pages/Fees'));
const Budgets        = lazy(() => import('./pages/Budgets'));
const BudgetGlobal   = lazy(() => import('./pages/BudgetGlobal'));
const FeeCatalog     = lazy(() => import('./pages/FeeCatalog'));
const Expenses       = lazy(() => import('./pages/Expenses'));
const RemoteApprovals = lazy(() => import('./pages/RemoteApprovals'));
const TeacherMonitor    = lazy(() => import('./pages/TeacherMonitor'));
const Absences          = lazy(() => import('./pages/Absences'));
const ConseilDeClasse   = lazy(() => import('./pages/ConseilDeClasse'));
const SuperAdmin        = lazy(() => import('./pages/SuperAdmin'));
const ParentPortal      = lazy(() => import('./pages/ParentPortal'));
const Timetable         = lazy(() => import('./pages/Timetable'));
const Landing           = lazy(() => import('./pages/Landing'));
const Terms             = lazy(() => import('./pages/Terms'));
const Help              = lazy(() => import('./pages/Help'));
const History           = lazy(() => import('./pages/History'));
const SyncHistory       = lazy(() => import('./pages/SyncHistory'));
const HonorRoll         = lazy(() => import('./pages/HonorRoll'));
// Module Vie scolaire (surveillant / discipline)
const VieScolaire       = lazy(() => import('./pages/VieScolaire'));
const LateArrivals      = lazy(() => import('./pages/LateArrivals'));
const Incidents         = lazy(() => import('./pages/Incidents'));
const Sanctions         = lazy(() => import('./pages/Sanctions'));
const ParentMeetings    = lazy(() => import('./pages/ParentMeetings'));
const ExitPermissions   = lazy(() => import('./pages/ExitPermissions'));
const DisciplineCouncil = lazy(() => import('./pages/DisciplineCouncil'));
const StudentDisciplineFile = lazy(() => import('./pages/StudentDisciplineFile'));
// ESPACE PARENT — coquille et écrans SÉPARÉS de l'application du personnel.
// Chargés à part : un parent ne télécharge pas le bundle du personnel, et
// réciproquement.
const ParentLogin         = lazy(() => import('./pages/parent/ParentLogin'));
const ParentLayout        = lazy(() => import('./components/parent/ParentLayout'));
const ParentHome          = lazy(() => import('./pages/parent/ParentHome'));
const ParentChildren      = lazy(() => import('./pages/parent/ParentChildren'));
const ParentGrades        = lazy(() => import('./pages/parent/ParentGrades'));
const ParentBulletins     = lazy(() => import('./pages/parent/ParentBulletins'));
const ParentAttendance    = lazy(() => import('./pages/parent/ParentAttendance'));
const ParentFees          = lazy(() => import('./pages/parent/ParentFees'));
const ParentNotifications = lazy(() => import('./pages/parent/ParentNotifications'));
const ParentDocuments     = lazy(() => import('./pages/parent/ParentDocuments'));
const ParentProfile       = lazy(() => import('./pages/parent/ParentProfile'));

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh] text-gray-400 text-sm animate-pulse">
      Chargement…
    </div>
  );
}

// ── Gardes de route par rôle ─────────────────────────────────────────────────
// Ensembles de rôles autorisés, alignés sur la navigation de la Sidebar.
const ADMIN_ONLY  = ['admin'];                                   // gestion établissement
const ACADEMIC    = ['admin', 'censeur'];                        // pédagogie + analyses + frais
const WITH_TEACHER = ['admin', 'censeur', 'teacher'];            // notes, bulletins, emploi du temps
const DISCIPLINE  = ['admin', 'censeur', 'surveillant'];         // élèves, conseil
const ALL_STAFF   = ['admin', 'censeur', 'surveillant', 'teacher']; // absences, paramètres, aide

function HomeRoute() {
  const role   = useAuthStore((s) => s.role);
  const school = useAuthStore((s) => s.school);

  if (role === 'teacher')    return <Navigate to="/app/grades"   replace />;
  if (role === 'superadmin') return <Navigate to="/superadmin"  replace />;

  // Auth OK mais aucun school_users row — compte incomplet
  if (!school && role === null) return <NoSchoolLinked />;

  return <Dashboard />;
}

function NoSchoolLinked() {
  const logout = useAuthStore((s) => s.logout);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
      <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-xl text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Compte non configuré</h2>
        <p className="text-gray-500 text-sm mb-6">
          Ce compte n'est lié à aucun établissement.<br />
          Contactez votre administrateur ou créez un établissement.
        </p>
        <div className="flex flex-col gap-2">
          <a href="/signup" className="btn-primary text-center block">Créer un établissement</a>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500 transition-colors mt-1">
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingGate() {
  const role    = useAuthStore((s) => s.role);
  const loading = useAuthStore((s) => s.loading);
  const school  = useAuthStore((s) => s.school);

  // Show only for admins where onboarding_completed === false (explicitly set by migration)
  if (loading || role !== 'admin' || school?.onboarding_completed !== false) return null;

  return <OnboardingWizard onClose={() => useAuthStore.getState().updateSchool({ onboarding_completed: true })} />;
}

export default function App() {
  const init      = useAuthStore((s) => s.init);
  const school    = useAuthStore((s) => s.school);
  const role      = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);
  // Un parent n'a pas de file de synchronisation : il ne produit aucune écriture
  // à pousser. Neutraliser schoolId éteint le moteur de sync pour lui, sans
  // toucher à son fonctionnement pour le personnel.
  const schoolId  = role === 'parent' ? null : school?.id;
  const viewYear  = useUiStore((s) => s.viewYear);

  useEffect(() => {
    init();
    // Demande au navigateur de conserver les données IndexedDB de façon persistante,
    // pour éviter une éviction silencieuse en cas de pression mémoire/disque.
    requestPersistentStorage();
  }, [init]);

  // Synchronise <html lang="..."> avec la langue UI. Ceci force le navigateur à
  // afficher les inputs `type="date"`/`type="time"` au bon format
  // (jj/mm/aaaa en FR, dd/mm/yyyy en EN, dd/mm/aaaa en ES).
  const uiLang = useUiStore((s) => s.uiLang);
  useEffect(() => {
    const map = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' };
    document.documentElement.lang = map[uiLang] || 'fr-FR';
  }, [uiLang]);

  // Init school data layer filtered to the selected year (active or archived).
  // Re-runs when current_year changes (e.g. after promotion) or when viewYear changes.
  useEffect(() => {
    // ESPACE PARENT : ne JAMAIS amorcer schoolStore pour un parent. Ce store
    // charge l'établissement entier (élèves, notes, frais, personnel) en
    // IndexedDB pour le travail de l'école — un parent n'en a besoin de rien, et
    // le serveur le lui refuserait de toute façon. Son `school` n'est que
    // l'établissement du premier enfant, pour l'en-tête.
    if (role === 'parent') return;
    if (school?.id) {
      useSchoolStore.getState().init(school.id, viewYear ?? school.current_year, teacherId);
    }
  }, [role, school?.id, school?.current_year, viewYear, teacherId]);

  // Sync engine — flush syncQueue on startup + reconnection
  const triggerSync = useCallback(async () => {
    if (!backendOnline() || !schoolId) return;
    const count = await getQueueCount();
    if (!count) return;

    useUiStore.getState().setSyncing();
    try {
      const { failed, failedItems = [] } = await flushSyncQueue();
      if (failed === 0) {
        useUiStore.getState().setSynced();
        setTimeout(() => useUiStore.getState().setIdle(), 3000);
        // PAS de rechargement complet ici. La file vient de POUSSER des lignes
        // que l'application connaît déjà (elles sont en IndexedDB et dans le
        // store) : les re-télécharger, c'est reprendre les 144 000 notes de
        // l'établissement — ~35 s en 4G — après la saisie d'une seule note.
        // Le rafraîchissement depuis le cloud reste déclenché à l'ouverture de
        // session et au retour de connexion, là où d'autres postes ont pu
        // écrire.
      } else {
        useUiStore.getState().setSyncError(failed, failedItems);
      }
    } catch (err) {
      console.error('triggerSync', err);
      useUiStore.getState().setSyncError(1, [{ table: '?', operation: '?', error: err?.message ?? String(err) }]);
    }
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;

    // Initialize online status + pending count from IDB. En LAN, le backend est
    // le serveur local (joignable sans Internet) → toujours « en ligne ».
    useUiStore.getState().setOnlineStatus(backendOnline());
    // Purge stale/repeatedly-failed items first, then count + flush
    pruneExpiredItems().then(() => {
      getQueueCount().then((n) => useUiStore.getState().setPendingCount(n));
      triggerSync();
    });

    const onOnline = () => {
      useUiStore.getState().setOnlineStatus(true);
      triggerSync();
      // Au retour de connexion, rafraîchir depuis le cloud MÊME si la file est
      // vide : récupère les changements faits ailleurs pendant l'hors-ligne.
      // La fusion est non destructive (cf. _refreshFromSupabase : `?? get().x`),
      // donc aucune donnée locale n'est écrasée par une réponse partielle.
      useSchoolStore.getState()._refreshFromSupabase(schoolId);
    };
    const onOffline = () => {
      // En LAN on reste « en ligne » (le serveur local ne dépend pas d'Internet).
      useUiStore.getState().setOnlineStatus(backendOnline());
      if (!IS_LAN) useUiStore.getState().setIdle();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // En LAN, l'événement navigateur « online » ne se déclenche jamais (le poste
    // n'a pas d'Internet) : si le serveur local a été momentanément injoignable,
    // la file ne se viderait jamais. On rejoue donc périodiquement.
    let lanTimer = null;
    if (IS_LAN) lanTimer = setInterval(() => triggerSync(), 20000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (lanTimer) clearInterval(lanTimer);
    };
  }, [schoolId, triggerSync]);

  return (
    <LanLicenseGate>
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/teacher-signup" element={<TeacherSignup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/app" element={<ProtectedRoute><HomeRoute /></ProtectedRoute>} />
          <Route path="/app/classes"        element={<ProtectedRoute allow={ACADEMIC}><Classes /></ProtectedRoute>} />
          <Route path="/app/students"       element={<ProtectedRoute allow={DISCIPLINE}><Students /></ProtectedRoute>} />
          <Route path="/app/students/:id"   element={<ProtectedRoute allow={DISCIPLINE}><StudentProfile /></ProtectedRoute>} />
          <Route path="/app/grades"         element={<ProtectedRoute allow={WITH_TEACHER}><Grades /></ProtectedRoute>} />
          <Route path="/app/bulletins"      element={<ProtectedRoute allow={WITH_TEACHER}><Bulletins /></ProtectedRoute>} />
          <Route path="/app/releves"        element={<ProtectedRoute allow={WITH_TEACHER}><Transcripts /></ProtectedRoute>} />
          <Route path="/app/palmares"       element={<ProtectedRoute allow={ACADEMIC}><HonorRoll /></ProtectedRoute>} />
          <Route path="/app/teachers"       element={<ProtectedRoute allow={ADMIN_ONLY}><Teachers /></ProtectedRoute>} />
          <Route path="/app/personnel"      element={<ProtectedRoute allow={ADMIN_ONLY}><Personnel /></ProtectedRoute>} />
          <Route path="/app/rh"             element={<ProtectedRoute allow={ADMIN_ONLY}><HR /></ProtectedRoute>} />
          <Route path="/app/signalements"   element={<ProtectedRoute allow={ALL_STAFF}><Signalements /></ProtectedRoute>} />
          <Route path="/app/notifications"  element={<ProtectedRoute allow={ALL_STAFF}><Notifications /></ProtectedRoute>} />
          <Route path="/app/groupe"          element={<ProtectedRoute allow={ADMIN_ONLY}><GroupDashboard /></ProtectedRoute>} />
          <Route path="/app/immobilisations" element={<ProtectedRoute allow={ADMIN_ONLY}><Assets /></ProtectedRoute>} />
          {import.meta.env.DEV && SeedData && (
            <Route path="/app/seed-data"   element={<ProtectedRoute allow={ADMIN_ONLY}><SeedData /></ProtectedRoute>} />
          )}
          <Route path="/app/settings"       element={<ProtectedRoute allow={ALL_STAFF}><Settings /></ProtectedRoute>} />
          <Route path="/app/profile"        element={<ProtectedRoute allow={ALL_STAFF}><Profile /></ProtectedRoute>} />
          <Route path="/app/year"           element={<ProtectedRoute allow={ADMIN_ONLY}><AcademicYear /></ProtectedRoute>} />
          <Route path="/app/reports"        element={<ProtectedRoute allow={[...ACADEMIC, 'surveillant']}><Reports /></ProtectedRoute>} />
          <Route path="/app/fees"            element={<ProtectedRoute allow={ACADEMIC}><Fees /></ProtectedRoute>} />
          <Route path="/app/frais-catalogue" element={<ProtectedRoute allow={ACADEMIC}><FeeCatalog /></ProtectedRoute>} />
          <Route path="/app/budgets"         element={<ProtectedRoute allow={ADMIN_ONLY} budgetAccess><Budgets /></ProtectedRoute>} />
          <Route path="/app/budget-global"   element={<ProtectedRoute allow={ADMIN_ONLY} budgetAccess><BudgetGlobal /></ProtectedRoute>} />
          <Route path="/app/depenses"        element={<ProtectedRoute allow={ADMIN_ONLY} budgetAccess><Expenses /></ProtectedRoute>} />
          <Route path="/app/approbations"    element={<ProtectedRoute allow={['admin', 'censeur']}><RemoteApprovals /></ProtectedRoute>} />
          <Route path="/app/absences"         element={<ProtectedRoute allow={ALL_STAFF}><Absences /></ProtectedRoute>} />
          <Route path="/app/monitor"          element={<ProtectedRoute allow={ACADEMIC}><TeacherMonitor /></ProtectedRoute>} />
          <Route path="/app/conseil"          element={<ProtectedRoute allow={DISCIPLINE}><ConseilDeClasse /></ProtectedRoute>} />
          <Route path="/app/vie-scolaire"       element={<ProtectedRoute allow={DISCIPLINE}><VieScolaire /></ProtectedRoute>} />
          <Route path="/app/retards"            element={<ProtectedRoute allow={DISCIPLINE}><LateArrivals /></ProtectedRoute>} />
          <Route path="/app/incidents"          element={<ProtectedRoute allow={DISCIPLINE}><Incidents /></ProtectedRoute>} />
          <Route path="/app/sanctions"          element={<ProtectedRoute allow={DISCIPLINE}><Sanctions /></ProtectedRoute>} />
          <Route path="/app/convocations"       element={<ProtectedRoute allow={DISCIPLINE}><ParentMeetings /></ProtectedRoute>} />
          <Route path="/app/sorties"            element={<ProtectedRoute allow={DISCIPLINE}><ExitPermissions /></ProtectedRoute>} />
          <Route path="/app/conseil-discipline" element={<ProtectedRoute allow={DISCIPLINE}><DisciplineCouncil /></ProtectedRoute>} />
          <Route path="/app/discipline/:studentId" element={<ProtectedRoute allow={DISCIPLINE}><StudentDisciplineFile /></ProtectedRoute>} />
          <Route path="/app/timetable"        element={<ProtectedRoute allow={WITH_TEACHER}><Timetable /></ProtectedRoute>} />
          <Route path="/app/aide"             element={<ProtectedRoute allow={ALL_STAFF}><Help /></ProtectedRoute>} />
          <Route path="/app/historique"       element={<ProtectedRoute allow={ALL_STAFF}><History /></ProtectedRoute>} />
          <Route path="/app/synchronisation"  element={<ProtectedRoute allow={ADMIN_ONLY}><SyncHistory /></ProtectedRoute>} />
          <Route path="/superadmin" element={<ProtectedRoute allow={['superadmin']}><SuperAdmin /></ProtectedRoute>} />

          {/* ── ESPACE PARENT ──────────────────────────────────────────────
              /parent          : porte d'entrée générale (connexion par compte)
              /parent/:token   : portail PUBLIC par jeton, inchangé — il reste
                                 la solution des familles sans compte.
              /app/parent/*    : l'espace lui-même, gardé par ParentRoute.

              Les routes « enfant » portent l'id en suffixe. Cet id vient de
              l'utilisateur et n'est PAS filtré ici : chaque écran le passe au
              serveur, qui répond null s'il ne s'agit pas d'un de ses enfants.
              La vérification n'appartient pas au frontend (§15). */}
          <Route path="/parent" element={<ParentLogin />} />
          <Route path="/app/parent" element={<ParentRoute><ParentLayout /></ParentRoute>}>
            <Route index                        element={<ParentHome />} />
            <Route path="enfants"               element={<ParentChildren />} />
            <Route path="notes/:studentId"      element={<ParentGrades />} />
            <Route path="notes"                 element={<ParentGrades />} />
            <Route path="bulletins/:studentId"  element={<ParentBulletins />} />
            <Route path="bulletins"             element={<ParentBulletins />} />
            <Route path="absences/:studentId"   element={<ParentAttendance />} />
            <Route path="absences"              element={<ParentAttendance />} />
            <Route path="frais/:studentId"      element={<ParentFees />} />
            <Route path="frais"                 element={<ParentFees />} />
            <Route path="documents/:studentId"  element={<ParentDocuments />} />
            <Route path="documents"             element={<ParentDocuments />} />
            <Route path="notifications"         element={<ParentNotifications />} />
            <Route path="profil"                element={<ParentProfile />} />
            <Route path="*"                     element={<Navigate to="/app/parent" replace />} />
          </Route>

          <Route path="/parent/:token" element={<ParentPortal />} />
          <Route path="/verify/:code" element={<VerifyTranscript />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <PwaUpdatePrompt />
      <ToastHost />
      <OnboardingGate />
      <CloudActivationWizard />
      <CloudMigrationWizard />
    </BrowserRouter>
    </LanLicenseGate>
  );
}
