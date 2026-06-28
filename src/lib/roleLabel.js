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
