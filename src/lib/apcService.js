// Couche Supabase du moteur APC_MINISTERIEL_MINESEC.
//
// Deux familles :
//   • Référentiel officiel (global, lecture seule) : apc_cycles, apc_classes,
//     apc_trimestres, apc_sequences, apc_matieres, apc_competences. Chargé en
//     bloc et mis en cache IDB (`apcRefDB`).
//   • Transactionnel (par école) : apc_notes (et plus tard apc_bulletins).
//
// Identité d'une note = (eleve_id, competence_id, sequence_id). Côté client on
// dérive `nkey = ${eleve_id}_${competence_id}_${sequence_id}` pour retrouver /
// écraser une note. L'écriture cloud upsert sur ce triplet (anti-doublon).

import { supabase } from './supabase';
import { uuid } from './uuid';
// Définition canonique dans le moteur pur (lisible sans la couche Supabase).
import { noteNkey } from '../core/apcEngine';

export { noteNkey };

// --- Référentiel --------------------------------------------------------------
// Charge l'intégralité de la structure + les compétences de la version active.
// Renvoie null en cas d'échec (l'appelant retombe alors sur le cache IDB).
export async function fetchReferentiel() {
  try {
    const [cycles, classes, trimestres, sequences, matieres, classeMatieres, versions] = await Promise.all([
      supabase.from('apc_cycles').select('*'),
      supabase.from('apc_classes').select('*').order('niveau', { ascending: false }),
      supabase.from('apc_trimestres').select('*').order('numero'),
      supabase.from('apc_sequences').select('*').order('numero'),
      supabase.from('apc_matieres').select('*').order('ordre'),
      supabase.from('apc_classe_matieres').select('*'),
      supabase.from('apc_referentiel_versions').select('*').eq('actif', true),
    ]);

    const err = cycles.error || classes.error || trimestres.error
      || sequences.error || matieres.error || classeMatieres.error || versions.error;
    if (err) { console.error('fetchReferentiel', err); return null; }

    const activeVersionIds = (versions.data || []).map((v) => v.id);
    let compQ = supabase.from('apc_competences').select('*').eq('actif', true);
    if (activeVersionIds.length) compQ = compQ.in('referentiel_version_id', activeVersionIds);
    const competences = await compQ;
    if (competences.error) { console.error('fetchReferentiel competences', competences.error); return null; }

    return {
      cycles: cycles.data || [],
      classes: classes.data || [],
      trimestres: trimestres.data || [],
      sequences: sequences.data || [],
      matieres: matieres.data || [],
      classeMatieres: classeMatieres.data || [],
      competences: competences.data || [],
      versions: versions.data || [],
    };
  } catch (e) {
    console.error('fetchReferentiel', e);
    return null;
  }
}

// --- Notes --------------------------------------------------------------------
export async function fetchApcNotes(schoolId) {
  const { data, error } = await supabase.from('apc_notes').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchApcNotes', error); return null; }
  return data;
}

// Construit le record canonique d'une note (colonnes cloud + nkey local).
// Réutilise un id existant si fourni (mise à jour) sinon en génère un.
export function buildNoteRecord({ id, schoolId, eleveId, competenceId, sequenceId, enseignantId, note, noteMax, appreciation }) {
  // `apc_notes.note` est une colonne NUMERIC des deux côtés (Postgres et SQLite).
  // 'ABS' y était envoyé tel quel : Postgres refusait l'upsert (« invalid input
  // syntax for type numeric »), l'opération repartait indéfiniment dans la file
  // de synchronisation, tandis que SQLite — au typage souple — l'acceptait. Deux
  // éditions divergeaient donc sur la même frappe. Le moteur ayant toujours lu
  // 'ABS' comme NON ÉVALUÉE (cf. `_num`, core/apcEngine), on persiste NULL :
  // même sens, et une colonne numérique ne reçoit qu'un nombre.
  const brut = note === '' || note === undefined || note === 'ABS' ? null : note;
  const max  = Number(noteMax);
  return {
    id: id || uuid(),
    school_id: schoolId,
    eleve_id: eleveId,
    competence_id: competenceId,
    sequence_id: sequenceId,
    enseignant_id: enseignantId || null,
    note: brut,
    // Barème de CETTE évaluation. NULL = /20 (barème historique) : on ne
    // matérialise le 20 nulle part, pour ne pas distinguer artificiellement les
    // notes d'avant et d'après la colonne.
    note_max: Number.isFinite(max) && max > 0 && max !== 20 ? max : null,
    appreciation: appreciation || null,
    date_saisie: new Date().toISOString(),
    nkey: noteNkey(eleveId, competenceId, sequenceId),
  };
}

// Upsert cloud d'une note (anti-doublon sur le triplet). `nkey` est local : on
// l'ôte avant l'envoi (colonne inexistante côté Postgres).
export async function upsertApcNote(record) {
  const { nkey, ...row } = record;
  const { error } = await supabase
    .from('apc_notes')
    .upsert(row, { onConflict: 'eleve_id,competence_id,sequence_id' });
  if (error) { console.error('upsertApcNote', error); return false; }
  return true;
}
