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
  let saResult, schoolResult;
  for (let attempt = 0; attempt < 4; attempt++) {
    [saResult, schoolResult] = await Promise.all([
      supabase.from('superadmins').select('user_id').eq('user_id', user.id).maybeSingle(),
      supabase.from('school_users').select('id, role, full_name, class_id, school_id, schools (*)').eq('user_id', user.id).eq('active', true),
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
  let teacherId = null;
  if (data.role === 'teacher') {
    const { data: teacherRow } = await supabase
      .from('teachers')
      .select('id')
      .eq('school_id', data.school_id)
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (teacherRow) teacherId = teacherRow.id;
  }

  return {
    user,
    school:       data.schools,
    role:         data.role,
    fullName:     data.full_name,
    classId:      data.class_id,
    schoolUserId: data.id,
    teacherId,
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
