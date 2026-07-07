// Couche CRUD Supabase/LAN pour les unités pédagogiques (school_units).
//
// Une école (complexe scolaire) contient 0..N unités pédagogiques. Sans unité,
// l'identité des documents reste celle de l'école (cf. lib/schoolIdentity.js).

import { supabase } from './supabase';

// Colonnes texte nullables : '' invalide côté Postgres pour certaines contraintes ;
// on convertit '' → null au point d'écriture (formulaire, rejeu de sync, import).
const NULLABLE = [
  'section_key', 'short_name', 'logo_url', 'stamp_url', 'signature_url',
  'director', 'address', 'phone', 'email', 'motto', 'establishment_no',
  'color_primary', 'color_secondary',
];
function sanitizeUnit(d) {
  const out = { ...d };
  for (const k of NULLABLE) if (k in out && out[k] === '') out[k] = null;
  return out;
}

export async function fetchSchoolUnits(schoolId) {
  const { data, error } = await supabase
    .from('school_units')
    .select('*')
    .eq('school_id', schoolId)
    .order('position');
  if (error) { console.error('fetchSchoolUnits', error); return null; }
  return data;
}

export async function upsertSchoolUnit(unit) {
  const { data, error } = await supabase
    .from('school_units')
    .upsert(sanitizeUnit(unit), { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertSchoolUnit', error); return null; }
  return data;
}

export async function deleteSchoolUnit(id) {
  const { error } = await supabase.from('school_units').delete().eq('id', id);
  if (error) { console.error('deleteSchoolUnit', error); return false; }
  return true;
}

// Upload d'un asset d'unité (logo / cachet / signature) dans le bucket partagé
// `school-assets`, sous `${schoolId}/units/${unitId}/${assetType}.<ext>`.
// `file` attendu déjà redimensionné (cf. lib/image.js). `?v=` casse le cache.
export async function uploadUnitAsset(schoolId, unitId, file, assetType) {
  const ext  = file.name.split('.').pop() || 'png';
  const path = `${schoolId}/units/${unitId}/${assetType}.${ext}`;
  const { error: upError } = await supabase.storage
    .from('school-assets')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upError) { console.error('uploadUnitAsset', upError); return { url: null, error: upError }; }
  const { data } = supabase.storage.from('school-assets').getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}`, error: null };
}
