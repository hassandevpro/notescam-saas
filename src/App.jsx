import { useEffect, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useSchoolStore } from './store/schoolStore';
import { useUiStore } from './store/uiStore';
import { flushSyncQueue, getQueueCount, pruneExpiredItems } from './lib/sync';
import { requestPersistentStorage } from './lib/db';
import ProtectedRoute from './components/ProtectedRoute';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import OnboardingWizard from './components/OnboardingWizard';
import LanLicenseGate from './components/LanLicenseGate';

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
const Subjects      = lazy(() => import('./pages/Subjects'));
const Students      = lazy(() => import('./pages/Students'));
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const Grades        = lazy(() => import('./pages/Grades'));
const Bulletins     = lazy(() => import('./pages/Bulletins'));
const Teachers      = lazy(() => import('./pages/Teachers'));
const Settings      = lazy(() => import('./pages/Settings'));
const AcademicYear  = lazy(() => import('./pages/AcademicYear'));
const Reports        = lazy(() => import('./pages/Reports'));
const Fees           = lazy(() => import('./pages/Fees'));
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
  const teacherId = useAuthStore((s) => s.teacherId);
  const schoolId  = school?.id;
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
    if (school?.id) {
      useSchoolStore.getState().init(school.id, viewYear ?? school.current_year, teacherId);
    }
  }, [school?.id, school?.current_year, viewYear, teacherId]);

  // Sync engine — flush syncQueue on startup + reconnection
  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || !schoolId) return;
    const count = await getQueueCount();
    if (!count) return;

    useUiStore.getState().setSyncing();
    try {
      const { synced, failed, failedItems = [] } = await flushSyncQueue();
      if (failed === 0) {
        useUiStore.getState().setSynced();
        setTimeout(() => useUiStore.getState().setIdle(), 3000);
        if (synced > 0) useSchoolStore.getState()._refreshFromSupabase(schoolId);
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

    // Initialize online status + pending count from IDB
    useUiStore.getState().setOnlineStatus(navigator.onLine);
    // Purge stale/repeatedly-failed items first, then count + flush
    pruneExpiredItems().then(() => {
      getQueueCount().then((n) => useUiStore.getState().setPendingCount(n));
      triggerSync();
    });

    const onOnline = () => {
      useUiStore.getState().setOnlineStatus(true);
      triggerSync();
    };
    const onOffline = () => {
      useUiStore.getState().setOnlineStatus(false);
      useUiStore.getState().setIdle();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
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
          <Route path="/app/subjects"       element={<ProtectedRoute allow={ACADEMIC}><Subjects /></ProtectedRoute>} />
          <Route path="/app/students"       element={<ProtectedRoute allow={DISCIPLINE}><Students /></ProtectedRoute>} />
          <Route path="/app/students/:id"   element={<ProtectedRoute allow={DISCIPLINE}><StudentProfile /></ProtectedRoute>} />
          <Route path="/app/grades"         element={<ProtectedRoute allow={WITH_TEACHER}><Grades /></ProtectedRoute>} />
          <Route path="/app/bulletins"      element={<ProtectedRoute allow={WITH_TEACHER}><Bulletins /></ProtectedRoute>} />
          <Route path="/app/teachers"       element={<ProtectedRoute allow={ADMIN_ONLY}><Teachers /></ProtectedRoute>} />
          <Route path="/app/settings"       element={<ProtectedRoute allow={ALL_STAFF}><Settings /></ProtectedRoute>} />
          <Route path="/app/year"           element={<ProtectedRoute allow={ADMIN_ONLY}><AcademicYear /></ProtectedRoute>} />
          <Route path="/app/reports"        element={<ProtectedRoute allow={ACADEMIC}><Reports /></ProtectedRoute>} />
          <Route path="/app/fees"            element={<ProtectedRoute allow={ACADEMIC}><Fees /></ProtectedRoute>} />
          <Route path="/app/absences"         element={<ProtectedRoute allow={ALL_STAFF}><Absences /></ProtectedRoute>} />
          <Route path="/app/monitor"          element={<ProtectedRoute allow={ACADEMIC}><TeacherMonitor /></ProtectedRoute>} />
          <Route path="/app/conseil"          element={<ProtectedRoute allow={DISCIPLINE}><ConseilDeClasse /></ProtectedRoute>} />
          <Route path="/app/timetable"        element={<ProtectedRoute allow={WITH_TEACHER}><Timetable /></ProtectedRoute>} />
          <Route path="/app/aide"             element={<ProtectedRoute allow={ALL_STAFF}><Help /></ProtectedRoute>} />
          <Route path="/app/historique"       element={<ProtectedRoute allow={ADMIN_ONLY}><History /></ProtectedRoute>} />
          <Route path="/superadmin" element={<ProtectedRoute allow={['superadmin']}><SuperAdmin /></ProtectedRoute>} />
          <Route path="/parent/:token" element={<ParentPortal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <PwaUpdatePrompt />
      <OnboardingGate />
    </BrowserRouter>
    </LanLicenseGate>
  );
}
