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

/**
 * Récupère l'utilisateur connecté + son école + son rôle + son nom complet.
 * Retourne { user, school, role, fullName, classId, schoolUserId } ou null.
 */
export async function getCurrentUserContext() {
  const session = await getSession();
  if (!session) return null;

  const user = session.user;

  // Vérifie superadmin en premier — indépendant de school_users
  const [saResult, schoolResult] = await Promise.all([
    supabase.from('superadmins').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('school_users').select('id, role, full_name, class_id, school_id, schools (*)').eq('user_id', user.id).eq('active', true),
  ]);

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
