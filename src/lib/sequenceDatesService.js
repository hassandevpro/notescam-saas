import { supabase } from './supabase';

export const SEQ_DEFINITIONS = [
  { key: 'fr_seq_1',  label: 'Séq 1'   },
  { key: 'fr_seq_2',  label: 'Séq 2'   },
  { key: 'fr_seq_3',  label: 'Séq 3'   },
  { key: 'fr_seq_4',  label: 'Séq 4'   },
  { key: 'fr_seq_5',  label: 'Séq 5'   },
  { key: 'fr_seq_6',  label: 'Séq 6'   },
  { key: 'en_term_1', label: 'Term 1'  },
  { key: 'en_term_2', label: 'Term 2'  },
  { key: 'en_term_3', label: 'Term 3'  },
];

export async function fetchSequenceDates(schoolId) {
  const { data, error } = await supabase
    .from('sequence_dates')
    .select('*')
    .eq('school_id', schoolId);
  if (error) { console.error('fetchSequenceDates', error); return []; }
  return data || [];
}

export async function upsertSequenceDates(schoolId, rows) {
  const payload = rows.map((r) => ({
    school_id:     schoolId,
    seq_key:       r.seq_key,
    seq_label:     r.seq_label,
    exam_date:     r.exam_date     || null,
    deadline_date: r.deadline_date || null,
    conseil_date:  r.conseil_date  || null,
  }));
  const { error } = await supabase
    .from('sequence_dates')
    .upsert(payload, { onConflict: 'school_id,seq_key' });
  if (error) { console.error('upsertSequenceDates', error); return { error }; }
  return { error: null };
}
