// Permissions du domaine signalement. Déclarées ici, référencées dans le
// registre kernel (src/kernel/permissions.js GRANTS). Un domaine possède ses
// permissions ; il ne modifie jamais celles d'un autre.
export const PERM = {
  RAISE:   'signalement.raise',   // créer un signalement
  READ:    'signalement.read',    // consulter
  TRIAGE:  'signalement.triage',  // qualifier (new -> triaged)
  ASSIGN:  'signalement.assign',  // affecter (triaged -> assigned)
  RESOLVE: 'signalement.resolve', // traiter / résoudre
  CLOSE:   'signalement.close',   // clôturer (resolved -> closed)
};
