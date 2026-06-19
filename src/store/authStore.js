import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getCurrentUserContext } from '../lib/auth';
import { cacheUserContext, loadCachedContext, clearCachedContext } from '../lib/authContextCache';
import { resolveCountryCode, defaultLangForCountry } from '../countries';

// Extrait du state les champs qui composent le contexte utilisateur, pour
// les remettre en cache (ex. après mise à jour de l'école hors-ligne).
function ctxFromState(s) {
  return {
    user: s.user, school: s.school, role: s.role, fullName: s.fullName,
    classId: s.classId, schoolUserId: s.schoolUserId, teacherId: s.teacherId,
  };
}

// Aligne la langue de l'interface sur la langue par défaut du pays de l'école
// UNIQUEMENT si l'utilisateur n'a jamais choisi de langue manuellement.
// Une fois que l'utilisateur a basculé via la sidebar, son choix est respecté.
function syncUiLangToSchool(school) {
  if (!school) return;
  try {
    const userPick = localStorage.getItem('notescam_ui_lang_user_set');
    if (userPick === 'true') return;
    const lang = defaultLangForCountry(resolveCountryCode(school));
    localStorage.setItem('notescam_ui_lang', lang);
    // Notifie le store UI sans introduire un import circulaire dur :
    import('./uiStore').then(({ useUiStore }) => useUiStore.getState().setLang?.(lang));
  } catch (_) { /* ignored */ }
}

/**
 * Store global pour l'authentification.
 * - session : session Supabase Auth
 * - user, school, role, fullName : contexte métier
 * - loading : état de chargement initial
 * - error : erreur éventuelle
 */
export const useAuthStore = create((set, get) => ({
  session: null,
  user: null,
  school: null,
  role: null,
  fullName: null,
  classId: null,
  schoolUserId: null,
  teacherId: null,   // UUID du record teachers lié à ce compte (role=teacher uniquement)
  loading: true,
  error: null,
  _pendingSignup: false, // true pendant le flux signup pour bloquer onAuthStateChange

  /**
   * Initialise le store : récupère la session et le contexte.
   * À appeler au démarrage de l'app.
   */
  init: async () => {
    set({ loading: true, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        set({ loading: false, session: null });
        return;
      }

      // OFFLINE-FIRST : si un contexte est déjà en cache pour cet utilisateur,
      // on l'applique IMMÉDIATEMENT et on lève `loading`. L'app démarre alors
      // sans dépendre du réseau (l'écran « Chargement… » de ProtectedRoute ne
      // reste plus bloqué pendant un fetch qui pend). Le rafraîchissement cloud
      // ci-dessous corrige le store en arrière-plan si quelque chose a changé.
      const cached = loadCachedContext(session.user.id);
      const applyCtx = (ctx) => {
        set({
          session,
          user: ctx?.user || null,
          school: ctx?.school || null,
          role: ctx?.role || null,
          fullName: ctx?.fullName || null,
          classId: ctx?.classId || null,
          schoolUserId: ctx?.schoolUserId || null,
          teacherId: ctx?.teacherId || null,
          loading: false,
        });
        syncUiLangToSchool(ctx?.school);
      };

      if (cached) applyCtx(cached);

      // Rafraîchit le contexte depuis le réseau. En échec (hors-ligne / timeout),
      // on garde le contexte caché s'il existe ; sinon on remonte l'erreur.
      try {
        const ctx = await getCurrentUserContext();
        if (ctx) {
          cacheUserContext(session.user.id, ctx);
          applyCtx(ctx);
        } else if (!cached) {
          set({ loading: false });
        }
      } catch (netErr) {
        if (!cached) throw netErr;        // pas de cache → comportement historique
        console.warn('AuthStore.init : réseau indisponible, contexte servi depuis le cache.');
      }
    } catch (err) {
      console.error('AuthStore.init error:', err);
      set({ loading: false, error: err.message });
    }
  },

  /**
   * Met à jour le store après login/signup réussi.
   */
  setSession: async (session) => {
    if (!session) {
      set({
        session: null,
        user: null,
        school: null,
        role: null,
        fullName: null,
        classId: null,
        schoolUserId: null,
        teacherId: null,
      });
      return;
    }
    // Set session immediately so ProtectedRoute never sees session=null during context load
    set({ session, loading: true });
    let ctx;
    try {
      ctx = await getCurrentUserContext();
      if (ctx) cacheUserContext(session.user.id, ctx);
    } catch (netErr) {
      // Réseau indisponible : repli sur le cache pour ne pas vider le contexte.
      ctx = loadCachedContext(session.user.id);
      if (!ctx) { set({ loading: false }); return; }  // on conserve la session
      console.warn('AuthStore.setSession : contexte chargé depuis le cache (hors-ligne).');
    }
    set({
      user: ctx?.user || null,
      school: ctx?.school || null,
      role: ctx?.role || null,
      fullName: ctx?.fullName || null,
      classId: ctx?.classId || null,
      schoolUserId: ctx?.schoolUserId || null,
      teacherId: ctx?.teacherId || null,
      loading: false,
    });
    syncUiLangToSchool(ctx?.school);
  },

  /**
   * Met à jour les informations de l'école (nom, type, région, etc. + assets URL).
   * Persiste dans Supabase puis met à jour le store localement.
   */
  updateSchool: async (updates) => {
    const { school } = get();
    if (!school?.id) return { error: 'École introuvable' };
    const { data, error } = await supabase
      .from('schools')
      .update(updates)
      .eq('id', school.id)
      .select()
      .single();
    if (error) {
      console.error('updateSchool', error);
      return { error: error.message };
    }
    set({ school: { ...school, ...data } });
    // Met à jour le cache hors-ligne pour refléter l'école modifiée.
    const uid = get().user?.id;
    if (uid) cacheUserContext(uid, ctxFromState(get()));
    return { data };
  },

  /**
   * Déconnexion + nettoyage du store.
   */
  logout: async () => {
    const uid = get().user?.id;
    await supabase.auth.signOut();
    clearCachedContext(uid);   // ne pas laisser de contexte en cache après déconnexion
    set({
      session: null,
      user: null,
      school: null,
      role: null,
      fullName: null,
      classId: null,
      schoolUserId: null,
      teacherId: null,
    });
  },
}));

// Écoute des changements d'auth Supabase et met à jour le store
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    useAuthStore.getState().setSession(null);
  } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    // Skip if a signup flow will call init() manually after creating school_users
    if (useAuthStore.getState()._pendingSignup) return;
    useAuthStore.getState().setSession(session);
  }
});
