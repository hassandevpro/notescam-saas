// Couche CRUD Supabase du module Immobilisations. Registre `assets` + trois
// journaux satellites (pannes/réparations/dépenses) via une fabrique commune.
// En LAN, aliasé vers localClient ; colonnes inconnues filtrées côté serveur.
import { supabase } from './supabase';
import { uuid } from './uuid';

export async function fetchAssets(schoolId) {
  const { data, error } = await supabase.from('assets').select('*').eq('school_id', schoolId).order('name');
  if (error) { console.error('fetchAssets', error); return null; }
  return data;
}
export async function upsertAsset(row) {
  const payload = { id: row.id || uuid(), ...row, updated_at: new Date().toISOString(), version: (row.version || 0) + 1 };
  const { data, error } = await supabase.from('assets').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertAsset', error); return null; }
  return data;
}
export async function deleteAsset(id) {
  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) { console.error('deleteAsset', error); return false; }
  return true;
}

function makeEntity(table) {
  return {
    async fetch(schoolId, assetId) {
      let q = supabase.from(table).select('*').eq('school_id', schoolId);
      if (assetId) q = q.eq('asset_id', assetId);
      const { data, error } = await q.order('date', { ascending: false });
      if (error) { console.error(`fetch ${table}`, error); return null; }
      return data;
    },
    async upsert(row) {
      const payload = { id: row.id || uuid(), ...row, updated_at: new Date().toISOString(), version: (row.version || 0) + 1 };
      const { data, error } = await supabase.from(table).upsert(payload, { onConflict: 'id' }).select().single();
      if (error) { console.error(`upsert ${table}`, error); return null; }
      return data;
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) { console.error(`delete ${table}`, error); return false; }
      return true;
    },
  };
}

export const ASSET_ENTITIES = {
  breakdowns: makeEntity('asset_breakdowns'),
  repairs:    makeEntity('asset_repairs'),
  expenses:   makeEntity('asset_expenses'),
};
