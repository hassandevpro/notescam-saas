import { supabase } from './supabase';
import { activeAssignments } from '../governance/governanceEngine';

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
  // Ajoute les PERMISSIONS granulaires (migration supabase_staff_permissions.sql).
  const PERM_COLS    = SCOPE_COLS.replace('schools (*)', 'permissions, schools (*)');
  // Le plus riche : ajoute le périmètre GLOBAL EXPLICITE (supabase_sector_isolation.sql).
  // Sans lui, l'interface retombe sur la règle implicite « trois tableaux vides =
  // tout l'établissement » et croit global un compte que le serveur, lui, borne à
  // rien. Le décalage ne crée pas de faille (la donnée reste filtrée en base) mais
  // il fausse l'affichage — d'où cette lecture, avec repli si la migration n'est
  // pas appliquée sur ce déploiement.
  const GLOBAL_COLS  = PERM_COLS.replace('schools (*)', 'scope_global, schools (*)');
  const selectSchoolUsers = async () => {
    const withGlobal = await supabase.from('school_users').select(GLOBAL_COLS).eq('user_id', user.id).eq('active', true);
    if (!withGlobal.error) return withGlobal;
    const withPerm = await supabase.from('school_users').select(PERM_COLS).eq('user_id', user.id).eq('active', true);
    if (!withPerm.error) return withPerm;
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

    // REPLI — compte enseignant dont la fiche n'a pas été rattachée (fiche créée
    // après le compte, ou nom saisi différemment lors du provisioning). Sans
    // `teacherId`, le store n'applique AUCUN filtre : l'enseignant se retrouve
    // devant toute l'école, et en mode « enseignant de matière » sans aucune
    // matière. On retrouve donc une fiche LIBRE portant exactement son nom.
    if (!teacherId && data.full_name) {
      const { data: byName } = await supabase
        .from('teachers')
        .select('id, specialty')
        .eq('school_id', data.school_id)
        .is('auth_user_id', null)
        .ilike('name', data.full_name.trim())
        .limit(1);
      if (byName?.length === 1) {
        teacherId = byName[0].id;
        specialty = byName[0].specialty ?? null;
      }
    }
  }

  // INTITULÉ DE POSTE du compte (« Directeur », « Sous-directrice », « Caissier »…).
  // Le rôle de base (admin/censeur/surveillant) n'est qu'un conteneur de droits :
  // afficher « Censeur » à une sous-directrice ne veut rien dire pour l'école. On
  // reprend donc la fonction saisie dans Personnel (staff.fonction) quand le compte
  // y est rattaché. Best-effort : table absente / hors-ligne → libellé par rôle.
  let jobTitle = null;
  try {
    const { data: staffRow } = await supabase
      .from('staff')
      .select('fonction')
      .eq('school_id', data.school_id)
      .eq('auth_user_id', user.id)
      .maybeSingle();
    jobTitle = staffRow?.fonction || null;
  } catch { /* module Personnel absent → libellé par rôle */ }

  // Gouvernance (additive) : CATALOGUE de rôles de l'école + AFFECTATIONS de ce
  // compte (avec secteur/dates/statut). Le moteur en dérive permissions, menus,
  // routes, dashboards et validations. Best-effort : tableaux vides si migration
  // absente / hors-ligne (le moteur retombe alors sur le catalogue par défaut).
  let governanceCatalog = [];
  let governanceAssignments = [];
  try {
    const [cat, asg] = await Promise.all([
      supabase.from('governance_roles').select('*').eq('school_id', data.school_id),
      supabase.from('user_governance_roles')
        .select('role, sector, start_date, end_date, status')
        .eq('school_id', data.school_id).eq('user_id', user.id),
    ]);
    if (Array.isArray(cat.data)) governanceCatalog = cat.data;
    if (Array.isArray(asg.data)) governanceAssignments = asg.data.filter((r) => r && r.role);
  } catch { /* tables absentes / hors-ligne → gouvernance par défaut */ }
  // Compat : lignes/ids des rôles ACTIFS maintenant (dates + statut respectés).
  const governanceRoleRows = activeAssignments(governanceAssignments);

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
    jobTitle,
    classId:      data.class_id,
    schoolUserId: data.id,
    teacherId,
    // Gouvernance : catalogue de l'école + affectations (toutes) + dérivés actifs.
    governanceCatalog,
    governanceAssignments,
    governanceRoles:    governanceRoleRows.map((r) => r.role),
    governanceRoleRows,
    // Périmètre vie scolaire (null si migration non appliquée → accès global).
    scope: {
      sections: data.scope_sections  ?? null,
      cycles:   data.scope_cycles    ?? null,
      classIds: data.scope_class_ids ?? null,
      // undefined = colonne non lue (migration absente) : on laisse la règle
      // implicite décider, comme avant. true/false = périmètre global EXPLICITE.
      global:   data.scope_global ?? undefined,
    },
    // Permissions granulaires du compte délégué (null = accès par rôle, inchangé).
    permissions: parsePermissions(data.permissions),
  };
}

// permissions stocké en JSON (texte). null/invalide → null (accès par rôle).
function parsePermissions(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.length ? raw : null;
  try { const p = JSON.parse(raw); return Array.isArray(p) && p.length ? p : null; } catch { return null; }
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
