// Couche CRUD Supabase des DEMANDES DE DÉBLOCAGE (table budget_unlock_requests).
// Chaque demande porte sa décision -> historique. « Augmenter le budget » modifie
// en plus le planifié du chapitre (via budgetService).
import { supabase } from './supabase';
import { uuid } from './uuid';
import { upsertBudgetChapter } from './budgetService';

function nn(v) { return v === '' || v === undefined ? null : v; }

export async function fetchUnlockRequests(schoolId, { budgetId } = {}) {
  let q = supabase.from('budget_unlock_requests').select('*').eq('school_id', schoolId);
  if (budgetId) q = q.eq('budget_id', budgetId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('fetchUnlockRequests', error); return null; }
  return data;
}

// Création d'une demande de déblocage (statut pending).
export async function createUnlockRequest(row) {
  const payload = {
    id: row.id || uuid(),
    school_id: row.school_id,
    budget_id: row.budget_id,
    budget_chapter_id: nn(row.budget_chapter_id),
    requested_amount: Number(row.requested_amount) || 0,
    reason: nn(row.reason),
    requester: nn(row.requester),
    requested_by: nn(row.requested_by),
    status: 'pending',
    updated_at: new Date().toISOString(),
    version: 1,
  };
  const { data, error } = await supabase
    .from('budget_unlock_requests').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('createUnlockRequest', error); return null; }
  return data;
}

// Décision d'un déblocage : 'refused' | 'authorized' | 'increased'.
// `chapter` (facultatif) requis pour 'increased' afin de bumper le planifié.
export async function decideUnlockRequest(request, decision, {
  grantedAmount, note, decidedBy, decidedById, decidedRole, chapter,
} = {}) {
  const granted = decision === 'refused' ? null : (Number(grantedAmount) || Number(request.requested_amount) || 0);

  // « Augmenter le budget » : relève DÉFINITIVEMENT le planifié du chapitre.
  if (decision === 'increased' && chapter) {
    const bumped = await upsertBudgetChapter({
      ...chapter,
      planned_amount: (Number(chapter.planned_amount) || 0) + granted,
    });
    if (!bumped) return null;
  }

  const patch = {
    ...request,
    status: decision,
    granted_amount: granted,
    decision_note: nn(note),
    decided_by: nn(decidedBy),
    decided_by_id: nn(decidedById),
    decided_role: nn(decidedRole),
    decided_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: (request.version || 0) + 1,
  };
  const { data, error } = await supabase
    .from('budget_unlock_requests').upsert(patch, { onConflict: 'id' }).select().single();
  if (error) { console.error('decideUnlockRequest', error); return null; }
  return data;
}
