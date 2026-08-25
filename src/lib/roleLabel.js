import { GOVERNANCE_ROLES } from '../governance/roles';

// Libellé traduit d'un rôle de compte. Centralisé pour éviter la duplication
// entre la sidebar, le menu utilisateur et la page profil.
// `t` est la fonction renvoyée par useT().
export function roleLabel(role, t) {
  switch (role) {
    case 'admin':       return t('Administrateur', 'Administrator', 'Administrador');
    case 'censeur':     return t('Censeur', 'Dean of studies', 'Jefe de estudios');
    case 'surveillant': return t('Surveillant', 'Supervisor', 'Jefe de disciplina');
    case 'superadmin':  return t('Super-administrateur', 'Super admin', 'Superadministrador');
    case 'teacher':     return t('Enseignant', 'Teacher', 'Profesor');
    default:            return t('Enseignant', 'Teacher', 'Profesor');
  }
}

// Libellé RÉEL à afficher, du plus parlant au plus générique :
//   1. le rôle de GOUVERNANCE le plus élevé (fondatrice, coordonnateur…), additif
//      au rôle de base — « ajouter fondatrice » affiche bien « Fondatrice » ;
//   2. l'INTITULÉ DE POSTE du compte (staff.fonction : « Directeur »,
//      « Sous-directrice », « Caissier »…). Le rôle de base n'est qu'un conteneur
//      de droits : afficher « Censeur » à une sous-directrice n'a aucun sens pour
//      l'école, qui la connaît par sa fonction ;
//   3. à défaut, le libellé du rôle de base (comportement historique).
export function displayRoleLabel(role, governanceRoleRows, t, jobTitle = null) {
  const active = (governanceRoleRows || []).filter((r) => !r.status || r.status === 'active');
  if (active.length) {
    const top = active
      .map((r) => GOVERNANCE_ROLES.find((g) => g.id === r.role))
      .filter(Boolean)
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))[0];
    if (top?.label) return t(top.label[0], top.label[1], top.label[2]);
  }
  if (jobTitle && jobTitle.trim()) return jobTitle.trim();
  // 4. `censeur` n'est PAS une fonction : c'est le conteneur de droits dans lequel
  //    l'application range tous les comptes délégués (cf. config/capabilities.js —
  //    secrétaire, caissier, RAF et responsable informatique naissent tous
  //    censeurs). L'afficher sous le nom d'un secrétariat ne désigne personne et
  //    induit en erreur sur ce que fait la personne. Mieux vaut ne rien écrire :
  //    le nom du compte, juste au-dessus, dit déjà la fonction.
  //
  //    Les autres rôles de base, eux, DÉSIGNENT un métier — administrateur,
  //    surveillant, enseignant — et restent affichés.
  if (role === 'censeur') return '';
  return roleLabel(role, t);
}
