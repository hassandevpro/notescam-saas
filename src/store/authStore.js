import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { getCurrentUserContext } from '../lib/auth';
import { cacheUserContext, loadCachedContext, clearCachedContext } from '../lib/authContextCache';
import { resolveCountryCode, defaultLangForCountry } from '../countries';
import { touchLastLogin } from '../lib/userProfileService';

// Extrait du state les champs qui composent le contexte utilisateur, pour
// les remettre en cache (ex. après mise à jour de l'école hors-ligne).
function ctxFromState(s) {
  return {
    user: s.user, school: s.school, role: s.role, fullName: s.fullName,
    phone: s.phone, photoUrl: s.photoUrl, lastLogin: s.lastLogin,
    createdAt: s.createdAt, specialty: s.specialty,
    classId: s.classId, schoolUserId: s.schoolUserId, teacherId: s.teacherId,
    scope: s.scope, permissions: s.permissions,
  };
}

// Un contexte « vide » = compte authentifié mais aucune école ET aucun rôle
// trouvés. Ce résultat est souvent TRANSITOIRE (course de jeton / RLS lors d'un
// TOKEN_REFRESHED ou d'un re-focus d'onglet) : il ne doit JAMAIS écraser un
// contexte déjà valide en mémoire, sous peine de « déconnecter » l'utilisateur
// avec le message « Ce compte n'est lié à aucun établissement ».
function isEmptyContext(ctx) {
  return !ctx || (!ctx.school && !ctx.role);
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
  phone: null,
  photoUrl: null,
  lastLogin: null,
  createdAt: null,
  specialty: null,   // matière enseignée (role=teacher uniquement)
  classId: null,
  schoolUserId: null,
  teacherId: null,   // UUID du record teachers lié à ce compte (role=teacher uniquement)
  scope: null,       // périmètre vie scolaire (surveillant) : { sections, cycles, classIds }
  permissions: null, // capacités granulaires d'un compte délégué (null = accès par rôle)
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
          phone: ctx?.phone || null,
          photoUrl: ctx?.photoUrl || null,
          lastLogin: ctx?.lastLogin || null,
          createdAt: ctx?.createdAt || null,
          specialty: ctx?.specialty || null,
          classId: ctx?.classId || null,
          schoolUserId: ctx?.schoolUserId || null,
          teacherId: ctx?.teacherId || null,
          scope: ctx?.scope || null,
          permissions: ctx?.permissions ?? null,
          loading: false,
        });
        syncUiLangToSchool(ctx?.school);
      };

      if (cached) applyCtx(cached);

      // Rafraîchit le contexte depuis le réseau. En échec (hors-ligne / timeout),
      // on garde le contexte caché s'il existe ; sinon on remonte l'erreur.
      try {
        const ctx = await getCurrentUserContext();
        // Ne pas écraser un contexte déjà valide (caché) par un résultat vide
        // transitoire (course de jeton). On ne l'applique que s'il est réel.
        if (ctx && !(isEmptyContext(ctx) && (get().school || get().role))) {
          cacheUserContext(session.user.id, ctx);
          applyCtx(ctx);
        } else if (!cached && !ctx) {
          set({ loading: false });
        } else if (!cached) {
          // Aucun cache et contexte réellement vide → compte non configuré.
          applyCtx(ctx);
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
        phone: null,
        photoUrl: null,
        lastLogin: null,
        createdAt: null,
        specialty: null,
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
    // GARDE ANTI-DÉCONNEXION FANTÔME : si le contexte fraîchement récupéré est
    // vide (course de jeton lors d'un TOKEN_REFRESHED / re-focus d'onglet : la
    // RLS renvoie des lignes vides SANS erreur) alors qu'on tient déjà un
    // contexte valide, on NE vide PAS l'école/rôle. On rafraîchit juste la
    // session. Un vrai dé-rattachement sera corrigé à la prochaine connexion.
    const prev = get();
    if (isEmptyContext(ctx) && (prev.school || prev.role)) {
      set({ session, loading: false });
      return;
    }
    set({
      user: ctx?.user || null,
      school: ctx?.school || null,
      role: ctx?.role || null,
      fullName: ctx?.fullName || null,
      phone: ctx?.phone || null,
      photoUrl: ctx?.photoUrl || null,
      lastLogin: ctx?.lastLogin || null,
      createdAt: ctx?.createdAt || null,
      specialty: ctx?.specialty || null,
      classId: ctx?.classId || null,
      schoolUserId: ctx?.schoolUserId || null,
      teacherId: ctx?.teacherId || null,
      scope: ctx?.scope || null,
      permissions: ctx?.permissions ?? null,
      loading: false,
    });
    syncUiLangToSchool(ctx?.school);
    // Horodate la dernière connexion (best-effort, sans bloquer ni faire échouer
    // le login). Ne s'exécute que sur une connexion réelle : les re-fire de
    // SIGNED_IN au retour d'onglet court-circuitent setSession en amont.
    touchLastLogin();
  },

  /**
   * Met à jour localement le profil du compte connecté (après un appel RPC
   * réussi côté UI) et rafraîchit le cache hors-ligne. N'effectue AUCUN appel
   * réseau : la persistance est déjà faite par userProfileService.
   */
  applyProfile: (patch) => {
    set((s) => ({ ...s, ...patch }));
    const uid = get().user?.id;
    if (uid) cacheUserContext(uid, ctxFromState(get()));
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
      phone: null,
      photoUrl: null,
      lastLogin: null,
      createdAt: null,
      specialty: null,
      classId: null,
      schoolUserId: null,
      teacherId: null,
      scope: null,
      permissions: null,
    });
  },
}));

// Écoute des changements d'auth Supabase et met à jour le store
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    useAuthStore.getState().setSession(null);
    return;
  }

  if (event === 'TOKEN_REFRESHED') {
    // Rafraîchissement périodique du jeton : le contexte métier (école/rôle)
    // n'a pas changé. On NE re-fetch PAS (une course de jeton renverrait des
    // lignes vides et « déconnecterait » l'utilisateur). On met simplement à
    // jour la session pour garder le jeton frais.
    if (session) useAuthStore.setState({ session });
    return;
  }

  if (event === 'SIGNED_IN') {
    // Skip if a signup flow will call init() manually after creating school_users
    if (useAuthStore.getState()._pendingSignup) return;
    // supabase-js refire SIGNED_IN au retour de focus de l'onglet. Si on tient
    // déjà le contexte du même utilisateur, on évite un re-fetch superflu (qui
    // pourrait revenir vide transitoirement) : on rafraîchit juste la session.
    const st = useAuthStore.getState();
    if (session && st.user?.id === session.user?.id && (st.school || st.role)) {
      useAuthStore.setState({ session });
      return;
    }
    useAuthStore.getState().setSession(session);
  }
});
