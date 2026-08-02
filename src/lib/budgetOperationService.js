// Interface CLIENT de la gouvernance BUDGÉTAIRE distante (H3b-2).
// Côté Cloud, la Fondatrice / le Coordonnateur général émet une INTENTION d'opération
// budgétaire → RPC submit_budget_operation. Le Cloud N'ÉCRIT PAS la finance : il émet
// un événement ; le serveur LAN vérifie (permission + périmètre école + version + cap
// annuel + idempotence + cohérence) puis APPLIQUE ou REJETTE (H3b-3). Mince
// consommateur — toute la sécurité vit dans la RPC + le LAN.
import { supabase } from './supabase';
import { isBudgetOp, isBudgetOpTarget, budgetOpPermission } from '../domains/finance/events.js';

export { budgetOpPermission }; // pré-vol UI ; le LAN ré-impose la permission.

// Génère une identité d'agrégat AUTORITAIRE (I5) pour une création : le même id est
// réutilisé par les op suivantes (activer/allouer la ligne qu'on vient de créer) et
// matérialisé tel quel par le LAN (jamais régénéré).
export function newAggregateId() {
  return (globalThis.crypto?.randomUUID?.()) || undefined;
}

// Émet une intention. `aggregateId` requis (identité autoritaire). `expectedVersion` =
// version vue par le gestionnaire au moment de l'op (le LAN exige l'EXACTE — conflit ⇒
// rejet). `correlationId` lie les op d'un même workflow (créer → activer). Renvoie
// { data: eventId, error } (contrat supabase.rpc).
export async function submitBudgetOperation({
  schoolId, op, target, aggregateId,
  expectedVersion = null, data = {}, correlationId = null, note = null,
}) {
  if (!isBudgetOp(op)) return { data: null, error: new Error(`op budgétaire invalide: ${op}`) };
  if (!isBudgetOpTarget(target)) return { data: null, error: new Error(`cible invalide: ${target}`) };
  if (!aggregateId) return { data: null, error: new Error('aggregateId requis (identité autoritaire — I5)') };
  return supabase.rpc('submit_budget_operation', {
    p_school: schoolId,
    p_op: op,
    p_target: target,
    p_aggregate_id: aggregateId,
    p_expected_version: expectedVersion,
    p_data: data,
    p_correlation_id: correlationId,
    p_note: note,
  });
}

// Intentions budgétaires du journal (RLS : membres de l'école). Volumes faibles.
export async function fetchBudgetOperations(schoolId, { limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('domain_events').select('*').eq('school_id', schoolId)
    .eq('aggregate_type', 'budget')
    .order('seq', { ascending: false }).limit(limit);
  if (error) { console.error('fetchBudgetOperations', error); return []; }
  return data || [];
}

// Lecture du journal (statut, verdict, durée de vie d'affichage) : logique pure,
// isolée dans budgetIntents.js pour rester testable en Node — ce fichier-ci importe
// `supabase` et n'est donc pas importable hors navigateur. Ré-exporté ici pour que
// les appelants gardent un point d'entrée unique.
export {
  budgetOperationOutcome, budgetOperationStatus, visibleIntents, INTENT_NOTICE_MS,
} from './budgetIntents.js';
