// Couche CRUD du JOURNAL DE CAISSE (table `cash_movements`).
// En LAN, `./supabase` est aliasé vers localClient (Vite) : mêmes appels.
import { supabase } from './supabase';
import { fetchAllRows } from '../core/pagination';
import { uuid } from './uuid';
import { MOVEMENT_KINDS } from './cashBookEngine';

function nn(v) { return v === '' || v === undefined ? null : v; }

// Mouvements de caisse de l'école, du plus ancien au plus récent : c'est l'ordre
// dans lequel un solde se lit. Les écrans qui veulent l'inverse trient eux-mêmes.
// PAGINE. PostgREST plafonne un select a 1000 lignes et repond 200 en TRONQUANT :
// au-dela, le journal serait incomplet et le solde FAUX, sans aucune erreur. C'est le
// defaut qui a coute trois semaines sur les notes du primaire le 2026-11-05 (1 873
// lignes en base, 1 000 recues). Une ligne par encaissement : ce seuil sera franchi.
//
// `makeQuery` doit rendre un builder NEUF a chaque appel — le `.range()` d'une page ne
// doit pas s'accumuler — et ordonner sur une cle unique, sinon la pagination saute ou
// duplique des lignes aux frontieres. `date` ne suffit pas : deux mouvements peuvent
// partager la meme date, d'ou `id` en second critere.
export async function fetchCashMovements(schoolId, { unitId, from, to } = {}) {
  return fetchAllRows(() => {
    let q = supabase.from('cash_movements').select('*').eq('school_id', schoolId);
    // `unitId === null` est un filtre LÉGITIME : c'est la caisse du complexe.
    // `undefined` ne filtre pas. Un `if (unitId)` confondrait les deux et ferait
    // disparaître la caisse du complexe de son propre écran.
    if (unitId !== undefined) {
      q = unitId === null ? q.is('school_unit_id', null) : q.eq('school_unit_id', unitId);
    }
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    return q.order('date', { ascending: true }).order('id', { ascending: true });
  }, 'fetchCashMovements');
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
