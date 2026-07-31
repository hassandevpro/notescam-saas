// Couche CRUD des PÉRIODES budgétaires (modèle CIBLE v3) — supabase-direct
// (aliasé vers localClient → SQLite en LAN, comme le reste du module Budgets).
//
// Les périodes sont configurées UNE SEULE FOIS par année budgétaire (nom libre,
// dates, description, ordre) puis réutilisées par toutes les lignes. Table dédiée
// `budget_periods`, découplée du calendrier de notes (academic_periods).

import { supabase } from './supabase';
import { uuid } from './uuid';

function nn(v) { return v === '' || v === undefined ? null : v; }

export async function fetchBudgetPeriods(schoolId, { yearLabel } = {}) {
  let q = supabase.from('budget_periods').select('*').eq('school_id', schoolId);
  if (yearLabel) q = q.eq('academic_year', yearLabel);
  const { data, error } = await q.order('position', { ascending: true });
  if (error) { console.error('fetchBudgetPeriods', error); return null; }
  return data;
}

export async function upsertBudgetPeriod(row) {
  const payload = {
    id: row.id || uuid(),
    school_id: row.school_id,
    academic_year: row.academic_year,
    name: (row.name || '').trim(),
    start_date: nn(row.start_date),
    end_date: nn(row.end_date),
    description: nn(row.description),
    position: Number(row.position) || 0,
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase
    .from('budget_periods').upsert(payload, { onConflict: 'id' }).select().single();
  // Remonte le message serveur (chevauchement, unicité, dates) pour un affichage précis.
  if (error) { console.error('upsertBudgetPeriod', error); return { data: null, error }; }
  return { data, error: null };
}

export async function deleteBudgetPeriod(id) {
  // Échoue (ON DELETE RESTRICT) si la période est déjà utilisée par une allocation.
  const { error } = await supabase.from('budget_periods').delete().eq('id', id);
  if (error) { console.error('deleteBudgetPeriod', error); return { ok: false, error }; }
  return { ok: true, error: null };
}
