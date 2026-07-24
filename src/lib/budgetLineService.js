// Couche CRUD des ALLOCATIONS d'une ligne budgétaire (modèle CIBLE v3) —
// supabase-direct (aliasé vers localClient → SQLite en LAN).
//
//   budget_line_periods  → répartition TEMPORELLE (% par période) ;
//   budget_line_sectors  → répartition SECTORIELLE (% par secteur, portée 'sectors').
//
// L'utilisateur saisit les POURCENTAGES ; le montant est DÉRIVÉ (tracé ici, mais le
// % reste la source de vérité). Le serveur (E3) gèle les allocations d'une ligne
// active/clôturée : ces écritures ne concernent donc que des lignes en BROUILLON.

import { supabase } from './supabase';
import { uuid } from './uuid';

export async function fetchLinePeriods(schoolId) {
  const { data, error } = await supabase.from('budget_line_periods').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchLinePeriods', error); return null; }
  return data;
}
export async function fetchLineSectors(schoolId) {
  const { data, error } = await supabase.from('budget_line_sectors').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchLineSectors', error); return null; }
  return data;
}

function allocPayload(row, key) {
  return {
    id: row.id || uuid(),
    school_id: row.school_id,
    budget_chapter_id: row.budget_chapter_id,
    [key]: row[key],
    pct: Number(row.pct) || 0,
    amount: row.amount == null ? null : Number(row.amount),
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
}

export async function upsertLinePeriod(row) {
  const { data, error } = await supabase
    .from('budget_line_periods').upsert(allocPayload(row, 'budget_period_id'), { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertLinePeriod', error); return { data: null, error }; }
  return { data, error: null };
}
export async function upsertLineSector(row) {
  const { data, error } = await supabase
    .from('budget_line_sectors').upsert(allocPayload(row, 'school_unit_id'), { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertLineSector', error); return { data: null, error }; }
  return { data, error: null };
}

export async function deleteLinePeriod(id) {
  const { error } = await supabase.from('budget_line_periods').delete().eq('id', id);
  if (error) { console.error('deleteLinePeriod', error); return { ok: false, error }; }
  return { ok: true, error: null };
}
export async function deleteLineSector(id) {
  const { error } = await supabase.from('budget_line_sectors').delete().eq('id', id);
  if (error) { console.error('deleteLineSector', error); return { ok: false, error }; }
  return { ok: true, error: null };
}
