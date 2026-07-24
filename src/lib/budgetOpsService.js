// Opérations budgétaires tracées (P5) : réallocation & révision annuelle.
// Les MUTATIONS passent EXCLUSIVEMENT par des RPC serveur (Cloud : fonctions
// SECURITY DEFINER ; LAN : server/budgetOps.js via /api/rpc) → l'écriture directe
// des tables est refusée. La lecture (listes/historique) se fait en SELECT (RLS).
import { supabase } from './supabase';

// (E8) createReallocation/decideReallocation/fetchReallocations (réallocation entre
// nœuds period/sector, P5 legacy) SUPPRIMÉES → remplacées par createLineReallocation
// & fetchLineReallocations (v3).

export async function createRevision({ annualId, newAmount, reason, receipt }) {
  return supabase.rpc('budget_create_revision', {
    p_annual_budget_id: annualId, p_new_amount: newAmount, p_reason: reason, p_receipt: receipt || null,
  });
}
export async function decideRevision({ id, decision, note }) {
  return supabase.rpc('budget_decide_revision', { p_id: id, p_decision: decision, p_note: note || null });
}

// ── Modèle CIBLE v3 : réallocation entre LIGNES (transfert de montant annuel) ──
export async function createLineReallocation({ sourceChapterId, destChapterId, amount, reason, receipt }) {
  return supabase.rpc('budget_create_line_realloc', {
    p_source_chapter_id: sourceChapterId, p_dest_chapter_id: destChapterId, p_amount: amount, p_reason: reason, p_receipt: receipt || null,
  });
}
export async function decideLineReallocation({ id, decision, note }) {
  return supabase.rpc('budget_decide_line_realloc', { p_id: id, p_decision: decision, p_note: note || null });
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
