// Couche CRUD Supabase du module DÉPENSES (table `budget_expenses`).
// En LAN, `./supabase` est aliasé vers localClient (Vite) : mêmes appels.
import { supabase } from './supabase';
import { uuid } from './uuid';
import { emitFinanceEvent } from '../domains/finance/emit';
import { AGGREGATE, EVT, expenseEventType } from '../domains/finance/events';

function nn(v) { return v === '' || v === undefined ? null : v; }

// Dépenses d'un budget (ou de toute l'école si budgetId omis), plus récentes d'abord.
export async function fetchExpenses(schoolId, { budgetId } = {}) {
  let q = supabase.from('budget_expenses').select('*').eq('school_id', schoolId);
  if (budgetId) q = q.eq('budget_id', budgetId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('fetchExpenses', error); return null; }
  return data;
}

export async function upsertExpense(row) {
  const payload = {
    id: row.id || uuid(),
    school_id: row.school_id,
    budget_id: row.budget_id,                    // rattachement obligatoire au budget (annuel en v3)
    budget_chapter_id: nn(row.budget_chapter_id),
    // ── Modèle CIBLE v3 : imputation RÉELLE (période + secteur, NULL = Complexe/Global) ──
    budget_period_id: nn(row.budget_period_id),
    school_unit_id: nn(row.school_unit_id),
    category: nn(row.category),
    subcategory: nn(row.subcategory),
    sector: nn(row.sector),                       // LEGACY (libellé dénormalisé)
    supplier: nn(row.supplier),
    amount: Number(row.amount) || 0,
    requester: nn(row.requester),
    receipt: nn(row.receipt),
    status: row.status || 'draft',
    expense_date: nn(row.expense_date),
    notes: nn(row.notes),
    created_by: nn(row.created_by),
    // Annulation tracée (statut `cancelled`) — conservée, jamais supprimée.
    cancel_reason: nn(row.cancel_reason),
    cancelled_by: nn(row.cancelled_by),
    cancelled_at: nn(row.cancelled_at),
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase
    .from('budget_expenses').upsert(payload, { onConflict: 'id' }).select().single();
  // Remonte le message serveur (enforcement E3 : imputation, chaîne, permissions).
  if (error) { console.error('upsertExpense', error); return { data: null, error }; }
  // H2 (observation) : émet le fait accompli — statut résultant → type d'événement.
  // Best-effort, n'altère ni ne retarde le retour ci-dessous.
  emitFinanceEvent({
    aggregateType: AGGREGATE.EXPENSE, aggregateId: data.id, correlationId: data.id,
    schoolId: data.school_id, eventType: expenseEventType(data.status),
    payload: {
      status: data.status, amount: data.amount, budget_id: data.budget_id,
      budget_chapter_id: data.budget_chapter_id, version: data.version,
    },
  });
  return { data, error: null };
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('budget_expenses').delete().eq('id', id);
  if (error) { console.error('deleteExpense', error); return false; }
  // H2 (observation) : suppression d'un brouillon tracée comme fait.
  emitFinanceEvent({ aggregateType: AGGREGATE.EXPENSE, aggregateId: id, correlationId: id, eventType: EVT.EXPENSE_DELETED });
  return true;
}
