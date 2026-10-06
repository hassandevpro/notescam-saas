// Couche Supabase du moteur MATERNELLE (MINEDUB).
//
// Deux familles :
//   • Référentiel officiel (global, lecture seule) : mat_niveaux, mat_domaines.
//     Chargé en bloc et mis en cache IDB (`matRefDB`).
//   • Transactionnel (par école) : mat_observations.
//
// Identité d'une observation = (eleve_id, domaine_id, trimestre_id). Côté client
// on dérive `nkey = ${eleve_id}_${domaine_id}_${trimestre_id}`. L'écriture cloud
// upsert sur ce triplet (anti-doublon).

import { supabase } from './supabase';
import { refreshReferentiel, countFingerprint } from './referentielFingerprint';
import { uuid } from './uuid';

export const obsNkey = (eleveId, domaineId, trimestreId) =>
  `${eleveId}_${domaineId}_${trimestreId}`;

// --- Référentiel --------------------------------------------------------------
export async function fetchMatReferentiel() {
  try {
    const [niveaux, domaines] = await Promise.all([
      supabase.from('mat_niveaux').select('*').order('ordre'),
      supabase.from('mat_domaines').select('*').eq('actif', true).order('ordre'),
    ]);
    const err = niveaux.error || domaines.error;
    if (err) { console.error('fetchMatReferentiel', err); return null; }
    return {
      niveaux: niveaux.data || [],
      domaines: domaines.data || [],
    };
  } catch (e) {
    console.error('fetchMatReferentiel', e);
    return null;
  }
}

// Tables du référentiel maternelle, dans l'ordre de `fetchMatReferentiel`.
// `mat_referentiel_versions` existe mais n'a AUCUNE ligne et n'est pas
// interrogée : l'empreinte repose donc sur les comptes, avec la même limite
// assumée que le primaire (cf. referentielFingerprint.js).
const MAT_REF_TABLES = ['mat_niveaux', 'mat_domaines'];

export function refreshMatReferentiel(cachedFingerprint) {
  return refreshReferentiel({
    cachedFingerprint,
    fingerprint: () => countFingerprint(MAT_REF_TABLES),
    fetchAll: fetchMatReferentiel,
  });
}

// --- Observations -------------------------------------------------------------
export async function fetchMatObservations(schoolId) {
  const { data, error } = await supabase.from('mat_observations').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchMatObservations', error); return null; }
  return data;
}

// Record canonique d'une observation (colonnes cloud + nkey local).
export function buildObsRecord({ id, schoolId, eleveId, domaineId, trimestreId, enseignantId, niveauAcquis, observation }) {
  return {
    id: id || uuid(),
    school_id: schoolId,
    eleve_id: eleveId,
    domaine_id: domaineId,
    trimestre_id: trimestreId,
    enseignant_id: enseignantId || null,
    niveau_acquis: niveauAcquis || null,
    observation: observation || null,
    date_saisie: new Date().toISOString(),
    nkey: obsNkey(eleveId, domaineId, trimestreId),
  };
}

export async function upsertMatObservation(record) {
  const { nkey, ...row } = record;
  const { error } = await supabase
    .from('mat_observations')
    .upsert(row, { onConflict: 'eleve_id,domaine_id,trimestre_id' });
  if (error) { console.error('upsertMatObservation', error); return false; }
  return true;
}
