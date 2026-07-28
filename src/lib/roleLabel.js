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

// Libellé RÉEL à afficher : les rôles de gouvernance (fondatrice, coordonnateur…)
// sont ADDITIFS au rôle de base (admin/censeur/…). Pour l'affichage, on montre le
// rôle de gouvernance le PLUS ÉLEVÉ (rang max) quand il existe — sinon le rôle de
// base. Ainsi « ajouter fondatrice » affiche bien « Fondatrice » et non le défaut.
export function displayRoleLabel(role, governanceRoleRows, t) {
  const active = (governanceRoleRows || []).filter((r) => !r.status || r.status === 'active');
  if (active.length) {
    const top = active
      .map((r) => GOVERNANCE_ROLES.find((g) => g.id === r.role))
      .filter(Boolean)
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))[0];
    if (top?.label) return t(top.label[0], top.label[1], top.label[2]);
  }
  return roleLabel(role, t);
}
