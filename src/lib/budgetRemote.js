// H3b-4 — MODE ÉMISSION D'INTENTION (édition Cloud, gouvernance financière distante).
//
// Quand l'édition CLOUD gère une école en mode « finance LAN-first + gouvernance
// distante » (deployment_policy : finance.execution=lan, finance.governance=cloud),
// les écritures budgétaires ne touchent PLUS directement la base : elles ÉMETTENT une
// INTENTION (submit_budget_operation). Le serveur LAN reste l'UNIQUE autorité : il
// re-vérifie (école, accès distant, permission, version, plafonds, idempotence, ordre)
// puis applique ou rejette, et confirme (H3b-3). Tant que la confirmation n'est pas
// revenue, l'UI affiche « en attente d'application par le serveur de l'école » (#6).
//
// En édition LAN, ou pour une école Cloud/hybride, `financeRemoteMode` renvoie false →
// les services écrivent en direct comme avant (aucun changement de comportement).
import { IS_LAN } from './edition';
import { governanceChannel } from './policyEngine';
import { supabase } from './supabase';
import { submitBudgetOperation } from './budgetOperationService';
import { uuid } from './uuid';

const _policyCache = new Map(); // schoolId -> deployment_policy (brut)

// L'école est-elle pilotée en gouvernance financière distante depuis le Cloud ?
export async function financeRemoteMode(schoolId) {
  if (IS_LAN || !schoolId) return false;              // LAN = autorité locale directe
  if (!_policyCache.has(schoolId)) {
    const { data } = await supabase.from('schools').select('deployment_policy').eq('id', schoolId).maybeSingle();
    _policyCache.set(schoolId, data?.deployment_policy ?? null);
  }
  return governanceChannel(_policyCache.get(schoolId), 'finance') === 'cloud';
}
export function clearFinanceModeCache() { _policyCache.clear(); }

// Type d'opération DÉDUIT d'un payload d'upsert budget/ligne (source unique).
//   status 'active'  → activate (autorité budget.approve exigée au LAN)
//   status 'closed'  → close    (HORS périmètre distant v1 : clôture = LAN)
//   sinon            → create (pas d'id) | modify (id présent)
export function classifyBudgetOp(row) {
  if (row?.status === 'active') return 'activate';
  if (row?.status === 'closed') return 'close';
  return row?.id ? 'modify' : 'create';
}

// Résultat homogène avec le contrat { data, error } des services, + `pending`.
function pending(aggregateId, data, eventId) {
  return { data: { id: aggregateId, ...data }, error: null, pending: true, eventId };
}

// Émet une intention budgétaire et renvoie un résultat « en attente » (ou { error }).
// `data` = champs métier (SANS version/updated_at : le LAN les gère). Pour 'activate',
// data vide (le LAN active l'agrégat existant). Identité `aggregateId` AUTORITAIRE (I5).
export async function emitBudgetIntent({ schoolId, op, target, aggregateId, data = {}, expectedVersion = null }) {
  const id = aggregateId || uuid();
  const { data: eventId, error } = await submitBudgetOperation({
    schoolId, op, target, aggregateId: id, data, expectedVersion,
  });
  if (error) return { data: null, error, pending: false };
  return pending(id, data, eventId);
}

// Erreur explicite pour une opération non déléguée à distance (clôture, périodes…).
export function localOnlyError(message) {
  return { data: null, error: new Error(message), pending: false };
}
