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
import { financeRemoteMode, classifyBudgetOp, emitBudgetIntent, localOnlyError } from './budgetRemote';

// Vide -> null pour les colonnes nullables (Postgres rejette '' sur int/date).
function nn(v) { return v === '' || v === undefined ? null : v; }

// Champs métier d'une intention (payload d'upsert SANS id/version/updated_at :
// le LAN régénère version/updated_at ; l'id est passé comme aggregateId autoritaire).
function intentData({ id, version, updated_at, ...data }) { return data; }

// ── Budgets (entête) ──────────────────────────────────────────────────────────

export async function fetchBudgets(schoolId, { yearLabel } = {}) {
  let q = supabase.from('budgets').select('*').eq('school_id', schoolId);
  if (yearLabel) q = q.eq('academic_year', yearLabel);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) { console.error('fetchBudgets', error); return null; }
  return data;
}

// Nombre nullable : '' / undefined / null → null ; sinon Number.
function nnNum(v) { return v === '' || v === undefined || v === null ? null : Number(v); }

export async function upsertBudget(row) {
  const hierarchical = !!row.tier; // nœud du modèle CIBLE (annual|period|sector)
  const payload = {
    id: row.id || uuid(),
    school_id: row.school_id,
    academic_year: row.academic_year,
    // ── Hiérarchie (modèle cible) ──
    tier: nn(row.tier),
    parent_budget_id: nn(row.parent_budget_id),
    academic_period_id: nn(row.academic_period_id),
    school_unit_id: nn(row.school_unit_id),
    envelope_amount: nnNum(row.envelope_amount),
    allocation_pct: nnNum(row.allocation_pct),
    sector_amount: nnNum(row.sector_amount),
    // ── Legacy « à plat » : non renseigné pour un nœud hiérarchique ──
    period_type: hierarchical ? null : (row.period_type || 'annuel'),
    period_ref: nn(row.period_ref),
    sector: hierarchical ? null : (row.sector || 'general'),
    label: row.label,
    status: row.status || 'draft',
    // Dates réelles d'exercice (Phase D) — nullables.
    start_date: nn(row.start_date),
    end_date: nn(row.end_date),
    notes: nn(row.notes),
    closed_at: nn(row.closed_at),
    closed_by: nn(row.closed_by),
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  // H3b-4 — gouvernance distante : émettre une INTENTION au lieu d'écrire (le LAN applique).
  if (await financeRemoteMode(row.school_id)) {
    const op = classifyBudgetOp(row);
    if (op === 'close') return localOnlyError('La clôture s’effectue sur le serveur de l’école (LAN).');
    return emitBudgetIntent({
      schoolId: row.school_id, op, target: 'budget', aggregateId: payload.id,
      expectedVersion: row.version ?? null, data: op === 'activate' ? {} : intentData(payload),
    });
  }
  const { data, error } = await supabase
    .from('budgets').upsert(payload, { onConflict: 'id' }).select().single();
  // Remonte le message serveur (gardes d'intégrité P1/P3) pour un affichage précis.
  if (error) { console.error('upsertBudget', error); return { data: null, error }; }
  return { data, error: null };
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
    // ── Modèle CIBLE v3 : portée + cycle de vie de la ligne (feuille) ──
    // `scope` défini (complex|sectors) = LIGNE ; NULL = rubrique d'agrégation.
    scope: nn(row.scope),
    status: row.status || 'draft',
    position: Number(row.position) || 0,
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  // H3b-4 — gouvernance distante : émettre une INTENTION (activation → op 'activate',
  // donc autorité budget.approve re-vérifiée au LAN ; jamais une simple modification).
  if (await financeRemoteMode(row.school_id)) {
    const op = classifyBudgetOp(row);
    if (op === 'close') return localOnlyError('La clôture de ligne s’effectue sur le serveur de l’école (LAN).');
    return emitBudgetIntent({
      schoolId: row.school_id, op, target: 'line', aggregateId: payload.id,
      expectedVersion: row.version ?? null, data: op === 'activate' ? {} : intentData(payload),
    });
  }
  const { data, error } = await supabase
    .from('budget_chapters').upsert(payload, { onConflict: 'id' }).select().single();
  // Remonte le message serveur (gel/activation/plafond annuel — E3) pour l'UI.
  if (error) { console.error('upsertBudgetChapter', error); return { data: null, error }; }
  return { data, error: null };
}

export async function deleteBudgetChapter(id) {
  // Les sous-chapitres sont supprimés en cascade côté base (FK ON DELETE CASCADE).
  const { error } = await supabase.from('budget_chapters').delete().eq('id', id);
  if (error) { console.error('deleteBudgetChapter', error); return false; }
  return true;
}

// (P7) `applyDefaultStructure` retiré : superseded par le constructeur hiérarchique
// P4 (annuel → période → secteur → chapitres). Plus aucun appelant. Le générateur
// de structure par défaut (budgetDefaults.js) est également supprimé.
