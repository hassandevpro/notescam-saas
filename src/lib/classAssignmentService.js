import { supabase } from './supabase';

export async function logAssignment({ school_id, student_id, class_id, class_name, assigned_by, assigned_by_name, reason }) {
  const { error } = await supabase.from('student_class_assignments').insert({
    school_id,
    student_id,
    class_id,
    class_name:       class_name       || null,
    assigned_by:      assigned_by      || null,
    assigned_by_name: assigned_by_name || null,
    reason:           reason           || null,
  });
  if (error) console.error('logAssignment', error);
  return !error;
}

export async function fetchAssignmentHistory(studentId) {
  const { data, error } = await supabase
    .from('student_class_assignments')
    .select('*')
    .eq('student_id', studentId)
    .order('assigned_at', { ascending: false });
  if (error) {
    console.error('fetchAssignmentHistory', error);
    return [];
  }
  return data || [];
}
