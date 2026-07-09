// Moteur PUR du module Reports (Signalements). RÉUTILISE la machine à états
// committée du domaine signalement (src/domains/signalement/signalement.js) —
// on ne réinvente ni statuts ni transitions. On y ajoute : la gravité ordonnée
// et l'AFFECTATION AUTOMATIQUE par catégorie. Aucune I/O -> testable en Node.
import {
  STATUS, TRANSITIONS, canTransition, isTerminal, DOMAINS, PRIORITIES,
} from '../domains/signalement/signalement.js';

// Ré-exports sous le vocabulaire « Reports » (catégorie / gravité).
export { STATUS, TRANSITIONS, canTransition, isTerminal };
export const REPORT_CATEGORIES = DOMAINS;     // academique|vie_scolaire|rh|finances|maintenance|patrimoine|autre
export const REPORT_SEVERITIES = PRIORITIES;  // low|normal|high|critical

// Gravité ordonnée (tri / mise en avant des critiques).
export const SEVERITY_RANK = { low: 1, normal: 2, high: 3, critical: 4 };
export function severityRank(s) { return SEVERITY_RANK[s] || 0; }

// Affectation AUTOMATIQUE : catégorie -> département de traitement (staff).
// Carte par défaut (données) ; surchargeable par établissement plus tard.
export const DEFAULT_ASSIGNMENT = {
  academique:   'administration',
  vie_scolaire: 'surveillance',
  rh:           'administration',
  finances:     'comptabilite',
  maintenance:  'support',
  patrimoine:   'support',
  autre:        'administration',
};
export function resolveAssignment(category, map = DEFAULT_ASSIGNMENT) {
  return map[category] || null;
}

// Statut initial à la création : « assigned » si l'affectation auto trouve une
// cible (création = choix d'état initial, pas une transition), sinon « new ».
export function initialStatus(category, map = DEFAULT_ASSIGNMENT) {
  return resolveAssignment(category, map) ? STATUS.ASSIGNED : STATUS.NEW;
}

// Actions historisées.
export const REPORT_HISTORY_ACTIONS = ['created', 'assigned', 'status_changed', 'reassigned', 'commented'];

// Prochaines transitions possibles depuis un statut (pour l'UI).
export function nextStatuses(status) { return TRANSITIONS[status] || []; }
