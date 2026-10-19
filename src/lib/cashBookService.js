// Couche CRUD du JOURNAL DE CAISSE (table `cash_movements`).
// En LAN, `./supabase` est aliasé vers localClient (Vite) : mêmes appels.
import { supabase } from './supabase';
import { uuid } from './uuid';
import { MOVEMENT_KINDS } from './cashBookEngine';

function nn(v) { return v === '' || v === undefined ? null : v; }

// Mouvements de caisse de l'école, du plus ancien au plus récent : c'est l'ordre
// dans lequel un solde se lit. Les écrans qui veulent l'inverse trient eux-mêmes.
export async function fetchCashMovements(schoolId, { unitId, from, to } = {}) {
  let q = supabase.from('cash_movements').select('*').eq('school_id', schoolId);
  // `unitId === null` est un filtre LÉGITIME : c'est la caisse du complexe.
  // `undefined` ne filtre pas. Un `if (unitId)` confondrait les deux et ferait
  // disparaître la caisse du complexe de son propre écran.
  if (unitId !== undefined) {
    q = unitId === null ? q.is('school_unit_id', null) : q.eq('school_unit_id', unitId);
  }
  if (from) q = q.gte('date', from);
  if (to) q = q.lte('date', to);
  const { data, error } = await q.order('date', { ascending: true });
  if (error) { console.error('fetchCashMovements', error); return null; }
  return data;
}

export async function upsertCashMovement(row) {
  if (!MOVEMENT_KINDS.includes(row.kind)) {
    // Le CHECK de la base refuserait la ligne : autant le dire ici, où le
    // message est lisible, plutôt que de laisser remonter une erreur Postgres.
    return { data: null, error: new Error(`Nature de mouvement inconnue : ${row.kind}`) };
  }
  const payload = {
    id: row.id || uuid(),
    school_id: row.school_id,
    school_unit_id: nn(row.school_unit_id),     // NULL = caisse du complexe
    academic_year: nn(row.academic_year),
    date: row.date,
    kind: row.kind,
    amount: Number(row.amount) || 0,
    label: nn(row.label),
    reference: nn(row.reference),
    source_balance: row.source_balance === null || row.source_balance === undefined || row.source_balance === ''
      ? null : Number(row.source_balance),
    notes: nn(row.notes),
    source_file: nn(row.source_file),
    source_row: row.source_row === null || row.source_row === undefined || row.source_row === ''
      ? null : Number(row.source_row),
    import_batch: nn(row.import_batch),
    created_by: nn(row.created_by),
    updated_at: new Date().toISOString(),
    version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase
    .from('cash_movements').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertCashMovement', error); return { data: null, error }; }
  return { data, error: null };
}

export async function deleteCashMovement(id) {
  const { error } = await supabase.from('cash_movements').delete().eq('id', id);
  if (error) { console.error('deleteCashMovement', error); return false; }
  return true;
}
