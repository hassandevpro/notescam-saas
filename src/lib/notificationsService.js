import { supabase } from './supabase';

export async function fetchNotifications(schoolId, limit = 50) {
  const { data, error } = await supabase
    .from('teacher_notifications')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('fetchNotifications', error); return []; }
  return data ?? [];
}

export async function markNotificationRead(id) {
  const { error } = await supabase
    .from('teacher_notifications')
    .update({ read: true })
    .eq('id', id);
  return !error;
}

export async function markAllNotificationsRead(schoolId) {
  const { error } = await supabase
    .from('teacher_notifications')
    .update({ read: true })
    .eq('school_id', schoolId)
    .eq('read', false);
  return !error;
}

// Upsert — one row per (school_id, teacher_id, class_id, sequence).
// On conflict: reset read=false and bump updated_at so the admin sees it as new again.
export async function upsertGradeNotification(data) {
  const { error } = await supabase
    .from('teacher_notifications')
    .upsert(
      { ...data, read: false },
      { onConflict: 'school_id,teacher_id,class_id,sequence', ignoreDuplicates: false }
    );
  if (error) console.error('upsertGradeNotification', error);
  return !error;
}

export function subscribeToNotifications(schoolId, onNew) {
  return supabase
    .channel(`notif_${schoolId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'teacher_notifications', filter: `school_id=eq.${schoolId}` },
      (payload) => onNew(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'teacher_notifications', filter: `school_id=eq.${schoolId}` },
      (payload) => onNew(payload.new)
    )
    .subscribe();
}
