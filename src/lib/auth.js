import { supabase } from './supabase';

/**
 * Récupère la session active (ou null).
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Erreur récupération session :', error);
    return null;
  }
  return data.session;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Récupère l'utilisateur connecté + son école + son rôle + son nom complet.
 * Retourne { user, school, role, fullName, classId, schoolUserId } ou null.
 */
export async function getCurrentUserContext() {
  const session = await getSession();
  if (!session) return null;

  const user = session.user;

  // Course de jeton (token race) : juste après un sign-in, la requête PostgREST
  // peut partir AVANT que le nouveau jeton d'accès soit attaché au client. La
  // RLS filtre alors toutes les lignes et `school_users` revient VIDE (pas une
  // erreur), ce qui faisait afficher « Compte non configuré » à la 1re connexion.
  // On retente donc quelques fois tant que les lignes sont vides ET sans erreur.
  // Sélection des lignes school_users avec les champs de profil. Si la migration
  // supabase_user_profile.sql n'a pas ENCORE été exécutée sur ce déploiement, les
  // colonnes phone/photo_url/last_login_at/created_at n'existent pas et PostgREST
  // renvoie une erreur : on retombe alors sur la sélection historique pour ne
  // JAMAIS casser la connexion (rétro-compatibilité). Les champs de profil sont
  // simplement absents (→ null) tant que la migration n'est pas appliquée.
  const LEGACY_COLS  = 'id, role, full_name, class_id, school_id, schools (*)';
  const PROFILE_COLS = 'id, role, full_name, phone, photo_url, last_login_at, created_at, class_id, school_id, schools (*)';
  // Le plus riche : ajoute le PÉRIMÈTRE du surveillant (migration supabase_vie_scolaire.sql).
  const SCOPE_COLS   = 'id, role, full_name, phone, photo_url, last_login_at, created_at, class_id, school_id, scope_sections, scope_cycles, scope_class_ids, schools (*)';
  const selectSchoolUsers = async () => {
    const withScope = await supabase.from('school_users').select(SCOPE_COLS).eq('user_id', user.id).eq('active', true);
    if (!withScope.error) return withScope;
    const rich = await supabase.from('school_users').select(PROFILE_COLS).eq('user_id', user.id).eq('active', true);
    if (!rich.error) return rich;
    return supabase.from('school_users').select(LEGACY_COLS).eq('user_id', user.id).eq('active', true);
  };

  let saResult, schoolResult;
  for (let attempt = 0; attempt < 4; attempt++) {
    [saResult, schoolResult] = await Promise.all([
      supabase.from('superadmins').select('user_id').eq('user_id', user.id).maybeSingle(),
      selectSchoolUsers(),
    ]);

    // Contexte trouvé (superadmin ou au moins une école) → on sort.
    if (saResult.data || (schoolResult.data && schoolResult.data.length > 0)) break;
    // Erreur réseau/RLS explicite → inutile de boucler, on laisse le repli gérer.
    if (saResult.error || schoolResult.error) break;
    // Dernière tentative atteinte : le compte est probablement réellement non lié.
    if (attempt === 3) break;
    await sleep(300 * (attempt + 1)); // 300ms, 600ms, 900ms
  }

  if (saResult.data) {
    // Compte superadmin — peut ou non avoir un school_users
    const schoolRow = schoolResult.data?.[0] ?? null;
    return {
      user,
      school:       schoolRow?.schools ?? null,
      role:         'superadmin',
      fullName:     schoolRow?.full_name ?? user.email,
      phone:        schoolRow?.phone ?? null,
      photoUrl:     schoolRow?.photo_url ?? null,
      lastLogin:    schoolRow?.last_login_at ?? null,
      createdAt:    schoolRow?.created_at ?? null,
      specialty:    null,
      classId:      null,
      schoolUserId: schoolRow?.id ?? null,
      teacherId:    null,
    };
  }

  const { data: rows, error } = schoolResult;

  if (error) {
    console.error('Erreur récupération contexte utilisateur :', error);
    return { user, school: null, role: null, fullName: null, schoolUserId: null };
  }

  if (!rows || rows.length === 0) {
    return { user, school: null, role: null, fullName: null, schoolUserId: null };
  }

  // Si plusieurs lignes (ne devrait pas arriver), préférer admin sur teacher
  const data = rows.find((r) => r.role === 'admin') ?? rows[0];

  // Pour les enseignants, récupère l'ID du record teachers lié au compte auth
  // + sa matière/spécialité (affichée dans le profil).
  let teacherId = null;
  let specialty = null;
  if (data.role === 'teacher') {
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id, specialty')
      .eq('school_id', data.school_id)
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (teacherRow) { teacherId = teacherRow.id; specialty = teacherRow.specialty ?? null; }
  }

  return {
    user,
    school:       data.schools,
    role:         data.role,
    fullName:     data.full_name,
    phone:        data.phone ?? null,
    photoUrl:     data.photo_url ?? null,
    lastLogin:    data.last_login_at ?? null,
    createdAt:    data.created_at ?? null,
    specialty,
    classId:      data.class_id,
    schoolUserId: data.id,
    teacherId,
    // Périmètre vie scolaire (null si migration non appliquée → accès global).
    scope: {
      sections: data.scope_sections  ?? null,
      cycles:   data.scope_cycles    ?? null,
      classIds: data.scope_class_ids ?? null,
    },
  };
}

/**
 * Déconnexion.
 */
export async function logout() {
  await supabase.auth.signOut();
}

/**
 * Calcule les jours restants avant expiration de la licence.
 */
export function getDaysUntilLicenseExpires(licenseExpiresAt) {
  if (!licenseExpiresAt) return null;
  const endDate = new Date(licenseExpiresAt);
  const now = new Date();
  return Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
}
