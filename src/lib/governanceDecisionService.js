// Interface CLIENT de la gouvernance financière distante (H3-b).
// Côté Cloud, la Fondatrice/le Coordonnateur soumet une décision → RPC
// submit_governance_decision (le Cloud N'ÉCRIT PAS la finance : il émet un
// événement de décision ; le serveur LAN vérifie et applique).
//
// L'UI d'approbation (écran « Décisions à approuver ») consomme ces fonctions ;
// elle reste un mince consommateur — la sécurité vit dans la RPC + le LAN.
import { supabase } from './supabase';

// Soumet une décision distante. `expectedVersion` = version de la dépense au moment
// de la demande (vérifiée AUTORITAIREMENT par le LAN : conflit ⇒ décision rejetée).
export async function submitGovernanceDecision({ expenseId, decision, expectedVersion, note = null }) {
  return supabase.rpc('submit_governance_decision', {
    p_expense_id: expenseId,
    p_decision: decision,               // 'approve' | 'refuse'
    p_expected_version: expectedVersion,
    p_note: note,
  });
}

// Demandes d'approbation EN ATTENTE (événements de demande sans décision ni
// confirmation associée). Lecture du journal (RLS : membres de l'école). Le
// filtrage « en attente » se fait côté client sur des volumes faibles.
export async function fetchPendingApprovalRequests(schoolId) {
  const { data, error } = await supabase
    .from('domain_events').select('*').eq('school_id', schoolId)
    .eq('aggregate_type', 'expense')
    .order('seq', { ascending: false }).limit(500);
  if (error) { console.error('fetchPendingApprovalRequests', error); return []; }
  const events = data || [];
  const decidedExpenseIds = new Set(
    events.filter((e) => ['ExpenseApprovalGranted', 'ExpenseApprovalRefused'].includes(e.event_type))
          .map((e) => e.aggregate_id),
  );
  // Une demande est « en attente » si aucune décision n'a encore été émise pour sa dépense.
  return events.filter((e) =>
    e.event_type === 'ExpenseRemoteApprovalRequested' && !decidedExpenseIds.has(e.aggregate_id));
}

// État d'application d'une décision (pour l'invariant « appliqué ⇒ confirmé LAN ») :
// une décision n'est « appliquée » que si une CONFIRMATION LAN (ExpenseApproved/
// ExpenseRejected liée par decision_event_id) est présente dans le journal.
export function decisionStatus(events, decisionEventId) {
  const confirmed = (events || []).some((e) =>
    ['ExpenseApproved', 'ExpenseRejected'].includes(e.event_type) &&
    (typeof e.payload === 'object' ? e.payload : safeParse(e.payload))?.decision_event_id === decisionEventId);
  const rejected = (events || []).some((e) =>
    e.event_type === 'ExpenseDecisionRejected' &&
    (typeof e.payload === 'object' ? e.payload : safeParse(e.payload))?.decision_event_id === decisionEventId);
  return confirmed ? 'applied' : (rejected ? 'rejected' : 'pending'); // pending = transmise, pas encore appliquée
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
