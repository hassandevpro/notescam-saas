// Couche Supabase du moteur PRIMAIRE APC (MINEDUB).
//
// Deux familles :
//   • Référentiel officiel (global, lecture seule) : prim_cycles, prim_niveaux,
//     prim_competences, prim_niveau_competences, prim_criteres, prim_cote_bareme.
//     Chargé en bloc et mis en cache IDB (`primRefDB`).
//   • Transactionnel (par école) : prim_notes (+ RPC de calcul de bulletins).
//
// Identité d'une note = (eleve_id, competence_id, critere_id, ua). Côté client
// `nkey = ${eleve_id}_${competence_id}_${critere_id}_${ua}`. L'écriture cloud
// upsert sur ce quadruplet (anti-doublon).

import { supabase } from './supabase';
import { uuid } from './uuid';
// UA (Unité d'Apprentissage, 1-8) remplace trimestre_id comme clé de saisie —
// le carnet officiel MINEDUB note par UA, pas par trimestre. Définition
// canonique dans le moteur pur (lisible sans la couche Supabase).
import { trimestreOfUA, primNkey } from '../core/primEngine';

export { primNkey };

// --- Référentiel --------------------------------------------------------------
export async function fetchPrimReferentiel() {
  try {
    const [cycles, niveaux, competences, niveauCompetences, criteres, bareme, baremeCriteres] = await Promise.all([
      supabase.from('prim_cycles').select('*').order('ordre'),
      supabase.from('prim_niveaux').select('*').order('ordre'),
      supabase.from('prim_competences').select('*').eq('actif', true).order('ordre'),
      supabase.from('prim_niveau_competences').select('*'),
      supabase.from('prim_criteres').select('*').order('ordre'),
      supabase.from('prim_cote_bareme').select('*').order('seuil_min', { ascending: false }),
      supabase.from('prim_bareme_criteres').select('*').order('ordre'),
    ]);
    const err = cycles.error || niveaux.error || competences.error
      || niveauCompetences.error || criteres.error || bareme.error || baremeCriteres.error;
    if (err) { console.error('fetchPrimReferentiel', err); return null; }
    return {
      cycles: cycles.data || [],
      niveaux: niveaux.data || [],
      competences: competences.data || [],
      niveauCompetences: niveauCompetences.data || [],
      criteres: criteres.data || [],
      bareme: bareme.data || [],
      baremeCriteres: baremeCriteres.data || [],
    };
  } catch (e) {
    console.error('fetchPrimReferentiel', e);
    return null;
  }
}

// --- Notes --------------------------------------------------------------------
export async function fetchPrimNotes(schoolId) {
  const { data, error } = await supabase.from('prim_notes').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchPrimNotes', error); return null; }
  return data;
}

// Record canonique d'une note (colonnes cloud + nkey local).
//   trimestre_id : dérivé de `ua`, envoyé UNIQUEMENT pour satisfaire la contrainte
//   NOT NULL héritée de prim_notes côté Supabase (colonne vestige, plus utilisée
//   en lecture — cf. trimestreOfUA). Ignoré silencieusement côté LAN (colonne
//   absente du schéma récent, filtrée par pickColumns).
export function buildPrimNoteRecord({ id, schoolId, eleveId, competenceId, critereId, ua, enseignantId, note }) {
  return {
    id: id || uuid(),
    school_id: schoolId,
    eleve_id: eleveId,
    competence_id: competenceId,
    critere_id: critereId,
    ua,
    trimestre_id: `t${trimestreOfUA(ua)}`,
    enseignant_id: enseignantId || null,
    note: note === '' || note === undefined ? null : note,
    date_saisie: new Date().toISOString(),
    nkey: primNkey(eleveId, competenceId, critereId, ua),
  };
}

export async function upsertPrimNote(record) {
  const { nkey, ...row } = record;
  const { error } = await supabase
    .from('prim_notes')
    .upsert(row, { onConflict: 'eleve_id,competence_id,critere_id,ua' });
  if (error) { console.error('upsertPrimNote', error); return false; }
  return true;
}

// RPC : calcul des bulletins trimestriels d'une classe (moyennes + cotes + rangs).
// Renvoie le nombre d'élèves traités, ou null en cas d'échec.
export async function computePrimBulletin({ schoolId, classId, trimestreId, gradeMax = 10 }) {
  const { data, error } = await supabase.rpc('compute_prim_bulletin', {
    p_school_id: schoolId, p_class_id: classId, p_trimestre_id: trimestreId, p_grade_max: gradeMax,
  });
  if (error) { console.error('computePrimBulletin', error); return null; }
  return data;
}

// RPC : résultats annuels d'une classe.
export async function computePrimAnnual({ schoolId, classId, annee, gradeMax = 10 }) {
  const { data, error } = await supabase.rpc('compute_prim_annual', {
    p_school_id: schoolId, p_class_id: classId, p_annee: annee, p_grade_max: gradeMax,
  });
  if (error) { console.error('computePrimAnnual', error); return null; }
  return data;
}
