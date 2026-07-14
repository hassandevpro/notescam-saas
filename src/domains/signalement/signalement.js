// Domaine SIGNALEMENT — entité + machine à états, PURE (aucune I/O).
//
// Un signalement est générique et ROUTABLE vers n'importe quel domaine de
// l'ERP (vie scolaire, maintenance, patrimoine, RH, finances…). C'est le
// patron de référence des futurs modules : ils réutilisent cette machine à
// états plutôt que d'en réinventer une.

export const STATUS = {
  NEW:         'new',          // créé, non trié
  TRIAGED:     'triaged',      // qualifié (domaine + priorité confirmés)
  ASSIGNED:    'assigned',     // affecté à un responsable
  IN_PROGRESS: 'in_progress',  // traitement en cours
  RESOLVED:    'resolved',     // résolu, en attente de clôture
  CLOSED:      'closed',       // clôturé (terminal)
  REJECTED:    'rejected',     // rejeté (terminal)
};

// Transitions autorisées. La machine à états garantit qu'aucun saut illégal
// n'est possible (ex. passer de NEW à CLOSED sans traitement).
export const TRANSITIONS = {
  new:         ['triaged', 'rejected'],
  triaged:     ['assigned', 'rejected'],
  assigned:    ['in_progress', 'rejected'],
  in_progress: ['resolved', 'rejected'],
  resolved:    ['closed', 'in_progress'], // réouverture possible
  closed:      [],
  rejected:    [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}
export function isTerminal(status) {
  return (TRANSITIONS[status] || []).length === 0;
}

// Domaines cibles reconnus (extensible sans refonte).
export const DOMAINS = [
  'academique', 'vie_scolaire', 'rh', 'finances', 'maintenance', 'patrimoine', 'autre',
];
export const PRIORITIES = ['low', 'normal', 'high', 'critical'];

// Fabrique d'une entité valide (sans I/O). `id`/`clock` injectés → testable.
export function newSignalement({
  id, schoolId, reporterId, reporterName = null,
  domain, title, description = '', priority = 'normal', clock = () => new Date().toISOString(),
}) {
  if (!id)        throw new Error('signalement: id requis');
  if (!schoolId)  throw new Error('signalement: schoolId requis');
  if (!title)     throw new Error('signalement: title requis');
  if (!DOMAINS.includes(domain))       throw new Error(`signalement: domaine inconnu « ${domain} »`);
  if (!PRIORITIES.includes(priority))  throw new Error(`signalement: priorité inconnue « ${priority} »`);
  const now = clock();
  return {
    id,
    school_id: schoolId,
    reporter_id: reporterId ?? null,
    reporter_name: reporterName,
    domain,
    title,
    description,
    priority,
    status: STATUS.NEW,
    assignee_id: null,
    resolution: null,
    correlation_id: id, // relie tous les events du cycle de ce signalement
    created_at: now,
    updated_at: now,
  };
}
