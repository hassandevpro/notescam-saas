// Couche Supabase des BARÈMES DE SAISIE personnalisés (`bareme_notes`).
//
// Une ligne = « dans cette école, au niveau <niveau_slug>, cette compétence (APC)
// ou ce critère (primaire) se saisit sur <points_max> points ». L'absence de
// ligne vaut barème OFFICIEL : on ne stocke donc jamais une surcharge qui
// redonne le barème officiel — on supprime la ligne (cf. schoolStore.saveBareme).
//
// Identité d'une surcharge = (engine, niveau_slug, competence_id, critere_id).
// Côté client on en dérive `bkey` pour retrouver / écraser la ligne, exactement
// comme `nkey` pour une note. L'écriture cloud upsert sur ce quadruplet.

import { supabase } from './supabase';
import { uuid } from './uuid';

// Clé locale d'unicité d'une surcharge. `critere_id` est vide en APC.
export const baremeBkey = (engine, niveauSlug, competenceId, critereId) =>
  `${engine}_${niveauSlug}_${competenceId}_${critereId || ''}`;

export async function fetchBaremes(schoolId) {
  const { data, error } = await supabase.from('bareme_notes').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchBaremes', error); return null; }
  return data;
}

// Record canonique d'une surcharge (colonnes cloud + bkey local).
export function buildBaremeRecord({ id, schoolId, engine, niveauSlug, competenceId, critereId, pointsMax, enseignantId }) {
  return {
    id: id || uuid(),
    school_id: schoolId,
    engine,
    niveau_slug: niveauSlug,
    competence_id: competenceId,
    critere_id: critereId || '',
    points_max: Number(pointsMax),
    enseignant_id: enseignantId || null,
    created_at: new Date().toISOString(),
    bkey: baremeBkey(engine, niveauSlug, competenceId, critereId),
  };
}

// `bkey` est local : on l'ôte avant l'envoi (colonne inexistante côté Postgres).
// L'upsert cible le quadruplet, pas l'id : deux enseignants du même niveau qui
// fixent le barème chacun de son côté ne créent pas deux lignes concurrentes.
export async function upsertBareme(record) {
  const { bkey, ...row } = record;
  const { error } = await supabase
    .from('bareme_notes')
    .upsert(row, { onConflict: 'school_id,engine,niveau_slug,competence_id,critere_id' });
  if (error) { console.error('upsertBareme', error); return false; }
  return true;
}

export async function deleteBareme(id) {
  const { error } = await supabase.from('bareme_notes').delete().eq('id', id);
  if (error) { console.error('deleteBareme', error); return false; }
  return true;
}
