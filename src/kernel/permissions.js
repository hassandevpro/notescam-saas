// Registre de permissions par défaut (grants « rôle -> permissions »).
//
// C'est le point d'ancrage du futur module #2 RBAC/ABAC : aujourd'hui statique,
// il pourra être remplacé par une table `permissions` + RLS sans changer l'API
// des domaines. Les rôles reprennent ceux de l'app (admin, censeur, surveillant,
// enseignant, super_admin). '*' = toutes les permissions.
//
// Les permissions propres à un domaine sont AJOUTÉES ici lors de sa migration
// (cf. signalement ci-dessous) — un domaine ne modifie jamais un autre.
export const KERNEL_PERMISSIONS = {
  EVENTS_READ:     'events.read',      // timeline d'une entité (scopée école)
  EVENTS_READ_ALL: 'events.read.all',  // journal complet de l'école
  AUDIT_READ:      'audit.read',
};

export const GRANTS = {
  super_admin: ['*'],
  admin: [
    'events.read', 'events.read.all', 'audit.read',
    // Signalement (transverse) — l'admin pilote tout le cycle.
    'signalement.raise', 'signalement.read', 'signalement.triage',
    'signalement.assign', 'signalement.resolve', 'signalement.close',
  ],
  censeur: [
    'events.read', 'audit.read',
    'signalement.raise', 'signalement.read', 'signalement.triage', 'signalement.assign',
  ],
  surveillant: [
    'events.read',
    'signalement.raise', 'signalement.read', 'signalement.resolve',
  ],
  teacher: [
    'signalement.raise', 'signalement.read',
  ],
};
