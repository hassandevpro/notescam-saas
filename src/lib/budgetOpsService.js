// Opérations budgétaires tracées (P5) : réallocation & révision annuelle.
// Les MUTATIONS passent EXCLUSIVEMENT par des RPC serveur (Cloud : fonctions
// SECURITY DEFINER ; LAN : server/budgetOps.js via /api/rpc) → l'écriture directe
// des tables est refusée. La lecture (listes/historique) se fait en SELECT (RLS).
import { supabase } from './supabase';
import { emitFinanceEvent } from '../domains/finance/emit';
import { AGGREGATE, EVT, REVISION_EVT_BY_DECISION, REALLOCATION_EVT_BY_DECISION } from '../domains/finance/events';
import { financeRemoteMode, emitBudgetIntent } from './budgetRemote';

// (E8) createReallocation/decideReallocation/fetchReallocations (réallocation entre
// nœuds period/sector, P5 legacy) SUPPRIMÉES → remplacées par createLineReallocation
// & fetchLineReallocations (v3).

export async function createRevision({ annualId, newAmount, reason, receipt, schoolId, expectedVersion = null }) {
  // H3b-4 — gouvernance distante : intention 'revise' (le LAN applique via budget_create_revision).
  if (await financeRemoteMode(schoolId)) {
    return emitBudgetIntent({
      schoolId, op: 'revise', target: 'budget', aggregateId: annualId,
      expectedVersion, data: { new_amount: newAmount, reason, receipt: receipt || null },
    });
  }
  const res = await supabase.rpc('budget_create_revision', {
    p_annual_budget_id: annualId, p_new_amount: newAmount, p_reason: reason, p_receipt: receipt || null,
  });
  if (!res?.error) emitFinanceEvent({ // H2 observation
    aggregateType: AGGREGATE.BUDGET_REVISION, aggregateId: res?.data?.id || annualId, correlationId: annualId,
    eventType: EVT.REVISION_REQUESTED, payload: { annual_budget_id: annualId, new_amount: newAmount },
  });
  return res;
}
export async function decideRevision({ id, decision, note }) {
  const res = await supabase.rpc('budget_decide_revision', { p_id: id, p_decision: decision, p_note: note || null });
  if (!res?.error) emitFinanceEvent({ // H2 observation
    aggregateType: AGGREGATE.BUDGET_REVISION, aggregateId: id, correlationId: id,
    eventType: REVISION_EVT_BY_DECISION[decision] || EVT.REVISION_REJECTED,
    // `requested_by` sert à notifier le demandeur du verdict. Il n'est présent que
    // si la RPC renvoie la ligne ; sinon le mapper n'a pas de destinataire et se
    // tait (dégradation silencieuse assumée, jamais de diffusion à toute l'école).
    payload: { decision, requested_by: res?.data?.requested_by ?? null },
  });
  return res;
}

// ── Modèle CIBLE v3 : réallocation entre LIGNES (transfert de montant annuel) ──
export async function createLineReallocation({ sourceChapterId, destChapterId, amount, reason, receipt, schoolId, expectedVersion = null }) {
  // H3b-4 — gouvernance distante : intention 'reallocate' (le LAN applique via budget_create_line_realloc).
  if (await financeRemoteMode(schoolId)) {
    return emitBudgetIntent({
      schoolId, op: 'reallocate', target: 'line', aggregateId: sourceChapterId,
      expectedVersion, data: { source_chapter_id: sourceChapterId, dest_chapter_id: destChapterId, amount, reason, receipt: receipt || null },
    });
  }
  const res = await supabase.rpc('budget_create_line_realloc', {
    p_source_chapter_id: sourceChapterId, p_dest_chapter_id: destChapterId, p_amount: amount, p_reason: reason, p_receipt: receipt || null,
  });
  if (!res?.error) emitFinanceEvent({ // H2 observation
    aggregateType: AGGREGATE.BUDGET_REALLOCATION, aggregateId: res?.data?.id || sourceChapterId, correlationId: sourceChapterId,
    eventType: EVT.REALLOCATION_REQUESTED, payload: { source_chapter_id: sourceChapterId, dest_chapter_id: destChapterId, amount },
  });
  return res;
}
export async function decideLineReallocation({ id, decision, note }) {
  const res = await supabase.rpc('budget_decide_line_realloc', { p_id: id, p_decision: decision, p_note: note || null });
  if (!res?.error) emitFinanceEvent({ // H2 observation
    aggregateType: AGGREGATE.BUDGET_REALLOCATION, aggregateId: id, correlationId: id,
    eventType: REALLOCATION_EVT_BY_DECISION[decision] || EVT.REALLOCATION_REJECTED,
    payload: { decision, requested_by: res?.data?.requested_by ?? null },
  });
  return res;
}
export async function fetchLineReallocations(schoolId, year) {
  let q = supabase.from('budget_line_reallocations').select('*').eq('school_id', schoolId);
  if (year) q = q.eq('academic_year', year);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('fetchLineReallocations', error); return null; }
  return data;
}

export async function fetchRevisions(schoolId, year) {
  let q = supabase.from('budget_revisions').select('*').eq('school_id', schoolId);
  if (year) q = q.eq('academic_year', year);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('fetchRevisions', error); return null; }
  return data;
}
