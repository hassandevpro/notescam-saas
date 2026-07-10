// Couche CRUD Supabase du module BUDGETS (prévisionnel).
//
// Tables (cf. supabase_budgets.sql / server/schema.sql) :
//   budgets           -> enveloppe prévisionnelle (période + secteur + statut)
//   budget_chapters   -> chapitres & sous-chapitres (parent_id), montants prévus
//
// Pattern d'appel en page, comme Vie scolaire / Personnel : Supabase direct.
// Au build LAN, `./supabase` est aliasé vers localClient (vite.config.js) : ces
// appels passent alors par le serveur Fastify -> SQLite, sans changement de code.
// (Les deux tables sont whitelistées et synchronisées côté LAN — server/db.js.)

import { supabase } from './supabase';
import { uuid } from './uuid';

// Vide -> null pour les colonnes nullables (Postgres rejette '' sur int/date).
function nn(v) { return v === '' || v === undefined ? null : v; }

// ── Budgets (entête) ──────────────────────────────────────────────────────────

export async function fetchBudgets(schoolId, { yearLabel } = {}) {
  let q = supabase.from('budgets').select('*').eq('school_id', schoolId);
  if (yearLabel) q = q.eq('academic_year', yearLabel);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('fetchBudgets', error); return null; }
  return data;
}

export async function upsertBudget(row) {
  const payload = {
    id: row.id || uuid(),
    school_id: row.school_id,
    academic_year: row.academic_year,
    period_type: row.period_type || 'annuel',
    period_ref: nn(row.period_ref),
    sector: row.sector || 'general',
    label: row.label,
    status: row.status || 'draft',
    notes: nn(row.notes),
    closed_at: nn(row.closed_at),
    closed_by: nn(row.closed_by),
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase
    .from('budgets').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertBudget', error); return null; }
  return data;
}

export async function deleteBudget(id) {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) { console.error('deleteBudget', error); return false; }
  return true;
}

// ── Chapitres / sous-chapitres ────────────────────────────────────────────────

export async function fetchBudgetChapters(schoolId, { budgetId } = {}) {
  let q = supabase.from('budget_chapters').select('*').eq('school_id', schoolId);
  if (budgetId) q = q.eq('budget_id', budgetId);
  const { data, error } = await q.order('position', { ascending: true });
  if (error) { console.error('fetchBudgetChapters', error); return null; }
  return data;
}

export async function upsertBudgetChapter(row) {
  const payload = {
    id: row.id || uuid(),
    school_id: row.school_id,
    budget_id: row.budget_id,
    parent_id: nn(row.parent_id),
    level: nn(row.level),
    code: nn(row.code),
    label: row.label,
    kind: row.kind || 'depense',
    planned_amount: Number(row.planned_amount) || 0,
    position: Number(row.position) || 0,
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase
    .from('budget_chapters').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertBudgetChapter', error); return null; }
  return data;
}

export async function deleteBudgetChapter(id) {
  // Les sous-chapitres sont supprimés en cascade côté base (FK ON DELETE CASCADE).
  const { error } = await supabase.from('budget_chapters').delete().eq('id', id);
  if (error) { console.error('deleteBudgetChapter', error); return false; }
  return true;
}

// Génère la structure budgétaire par DÉFAUT (5 catégories + chapitres) pour un
// budget. Insère les lignes en une passe ; l'établissement peut ensuite les
// personnaliser (créer / modifier / supprimer / réorganiser).
export async function applyDefaultStructure(schoolId, budgetId) {
  const { instantiateDefaultStructure } = await import('./budgetDefaults.js');
  const rows = instantiateDefaultStructure({ schoolId, budgetId, uid: uuid })
    .map((r) => ({ ...r, updated_at: new Date().toISOString(), version: 1 }));
  const { error } = await supabase.from('budget_chapters').insert(rows);
  if (error) { console.error('applyDefaultStructure', error); return false; }
  return true;
}
