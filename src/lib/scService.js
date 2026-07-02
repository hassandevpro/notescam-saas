// Couche Supabase du moteur SECOND CYCLE MINESEC.
//
// Référentiel global (lecture authentifiée) : sc_series, sc_groupes, sc_matieres,
// sc_serie_matieres (version active). Chargé en bloc et mis en cache IDB (scRefDB).
// Le second cycle réutilise le moteur de notes classique : pas de table de notes
// dédiée ici.

import { supabase } from './supabase';

export async function fetchScReferentiel() {
  try {
    const [series, groupes, matieres, versions] = await Promise.all([
      supabase.from('sc_series').select('*').order('ordre'),
      supabase.from('sc_groupes').select('*').order('ordre'),
      supabase.from('sc_matieres').select('*').order('ordre'),
      supabase.from('sc_referentiel_versions').select('*').eq('actif', true),
    ]);
    const err = series.error || groupes.error || matieres.error || versions.error;
    if (err) { console.error('fetchScReferentiel', err); return null; }

    const activeVersionIds = (versions.data || []).map((v) => v.id);
    let smQ = supabase.from('sc_serie_matieres').select('*').eq('actif', true);
    if (activeVersionIds.length) smQ = smQ.in('referentiel_version_id', activeVersionIds);
    const serieMatieres = await smQ;
    if (serieMatieres.error) { console.error('fetchScReferentiel sm', serieMatieres.error); return null; }

    return {
      series: series.data || [],
      groupes: groupes.data || [],
      matieres: matieres.data || [],
      serieMatieres: serieMatieres.data || [],
      versions: versions.data || [],
    };
  } catch (e) {
    console.error('fetchScReferentiel', e);
    return null;
  }
}
