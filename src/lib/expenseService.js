// Couche CRUD Supabase du module DÉPENSES (table `budget_expenses`).
// En LAN, `./supabase` est aliasé vers localClient (Vite) : mêmes appels.
import { supabase } from './supabase';
import { uuid } from './uuid';

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
    budget_id: row.budget_id,                    // rattachement obligatoire au budget
    budget_chapter_id: nn(row.budget_chapter_id),
    category: nn(row.category),
    subcategory: nn(row.subcategory),
    sector: nn(row.sector),
    supplier: nn(row.supplier),
    amount: Number(row.amount) || 0,
    requester: nn(row.requester),
    receipt: nn(row.receipt),
    status: row.status || 'draft',
    expense_date: nn(row.expense_date),
    notes: nn(row.notes),
    created_by: nn(row.created_by),
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase
    .from('budget_expenses').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertExpense', error); return null; }
  return data;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('budget_expenses').delete().eq('id', id);
  if (error) { console.error('deleteExpense', error); return false; }
  return true;
}
