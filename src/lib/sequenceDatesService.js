import { supabase } from './supabase';
import { ALL_CALENDAR_PERIODS } from './calendarTracks';

// Les lignes persistables du calendrier scolaire, toutes tutelles confondues :
// séquences MINESEC, terms anglophones, UA du primaire MINEDUB, trimestres de
// maternelle. La liste vit dans `calendarTracks` (source unique) ; l'ordre des
// 9 clés historiques (fr_seq_1…6, en_term_1…3) est conservé en tête.
export const SEQ_DEFINITIONS = ALL_CALENDAR_PERIODS.map((p) => ({
  key:   p.key,
  label: p.fr,
  track: p.track,
  order: p.order,
}));

export async function fetchSequenceDates(schoolId) {
  const { data, error } = await supabase
    .from('sequence_dates')
    .select('*')
    .eq('school_id', schoolId);
  if (error) { console.error('fetchSequenceDates', error); return []; }
  return data || [];
}

// Les dates indexées par `seq_key` — la forme attendue par `currentPeriodOfTrack`.
export function indexSequenceDates(rows) {
  const map = {};
  for (const r of rows || []) map[r.seq_key] = r;
  return map;
}

export async function upsertSequenceDates(schoolId, rows) {
  const construire = (avecBornes) => rows.map((r) => ({
    school_id:     schoolId,
    seq_key:       r.seq_key,
    seq_label:     r.seq_label,
    exam_date:     r.exam_date     || null,
    deadline_date: r.deadline_date || null,
    conseil_date:  r.conseil_date  || null,
    // Début/fin : colonnes AJOUTÉES (migration additive). Envoyées seulement si l'école les a
    // remplies, pour qu'une base pas encore migrée continue d'enregistrer les anciennes dates.
    ...(avecBornes ? { start_date: r.start_date || null, end_date: r.end_date || null } : {}),
  }));
  const veutBornes = rows.some((r) => r.start_date || r.end_date);
  let { error } = await supabase
    .from('sequence_dates')
    .upsert(construire(veutBornes), { onConflict: 'school_id,seq_key' });
  // Colonne absente (base pas encore migrée) : on n'écrase pas les dates historiques, on le dit.
  if (error && veutBornes && /start_date|end_date/.test(`${error.message || ''} ${error.details || ''}`)) {
    const repli = await supabase.from('sequence_dates').upsert(construire(false), { onConflict: 'school_id,seq_key' });
    if (!repli.error) return { error: null, bornesIgnorees: true };
    error = repli.error;
  }
  if (error) { console.error('upsertSequenceDates', error); return { error }; }
  return { error: null };
}
