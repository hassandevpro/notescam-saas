import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getCurrentUserContext } from '../lib/auth';

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
      const ctx = await getCurrentUserContext();
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
    const ctx = await getCurrentUserContext();
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
    return { data };
  },

  /**
   * Déconnexion + nettoyage du store.
   */
  logout: async () => {
    await supabase.auth.signOut();
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
