// Couche Supabase du PROGRAMME D'ÉDUCATION BILINGUE SPÉCIAL (premier cycle).
//
// Référentiel global (lecture authentifiée) : bil_series, bil_groupes,
// bil_matieres, bil_serie_matieres (version active). Chargé en bloc et mis en
// cache IDB (bilRefDB), exactement comme le second cycle — mais sur ses PROPRES
// tables : les deux arrêtés ont des cycles de vie indépendants.
//
// Le programme bilingue réutilise le stockage de notes existant (subjects /
// grades) : aucune table de notes dédiée ici.

import { supabase } from './supabase';
import { refreshReferentiel, versionFingerprint } from './referentielFingerprint';

// Référentiel officiel, retéléchargé SEULEMENT si la version active a changé.
export function refreshBilReferentiel(cachedFingerprint) {
  return refreshReferentiel({
    cachedFingerprint,
    fingerprint: () => versionFingerprint('bil_referentiel_versions'),
    fetchAll: fetchBilReferentiel,
  });
}

export async function fetchBilReferentiel() {
  try {
    const [series, groupes, matieres, versions] = await Promise.all([
      supabase.from('bil_series').select('*').order('ordre'),
      supabase.from('bil_groupes').select('*').order('ordre'),
      supabase.from('bil_matieres').select('*').order('ordre'),
      supabase.from('bil_referentiel_versions').select('*').eq('actif', true),
    ]);
    const err = series.error || groupes.error || matieres.error || versions.error;
    if (err) { console.error('fetchBilReferentiel', err); return null; }

    const activeVersionIds = (versions.data || []).map((v) => v.id);
    let smQ = supabase.from('bil_serie_matieres').select('*').eq('actif', true);
    if (activeVersionIds.length) smQ = smQ.in('referentiel_version_id', activeVersionIds);
    const serieMatieres = await smQ;
    if (serieMatieres.error) { console.error('fetchBilReferentiel sm', serieMatieres.error); return null; }

    return {
      series: series.data || [],
      groupes: groupes.data || [],
      matieres: matieres.data || [],
      serieMatieres: serieMatieres.data || [],
      versions: versions.data || [],
    };
  } catch (e) {
    console.error('fetchBilReferentiel', e);
    return null;
  }
}
