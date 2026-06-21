import { supabase } from './supabase';

export async function fetchMessagesForAdmin(schoolId, limit = 100) {
  const { data, error } = await supabase
    .from('school_messages')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('fetchMessagesForAdmin', error); return []; }
  return data ?? [];
}

export async function fetchMessagesForTeacher(teacherId, limit = 50) {
  const { data, error } = await supabase
    .from('school_messages')
    .select('*')
    .eq('to_teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('fetchMessagesForTeacher', error); return []; }
  return data ?? [];
}

export async function sendMessage(data) {
  const { error } = await supabase.from('school_messages').insert(data);
  if (error) { console.error('sendMessage', error); return false; }
  return true;
}

export async function markMessageRead(id) {
  const { error } = await supabase
    .from('school_messages')
    .update({ read: true })
    .eq('id', id);
  return !error;
}

export async function markAllTeacherMessagesRead(teacherId) {
  const { error } = await supabase
    .from('school_messages')
    .update({ read: true })
    .eq('to_teacher_id', teacherId)
    .eq('read', false);
  return !error;
}

export function subscribeToTeacherMessages(teacherId, onNew) {
  // Nom de canal unique : évite la réutilisation d'un canal déjà souscrit lors
  // d'un remount rapide (cf. subscribeToNotifications) qui ferait planter `.on()`.
  return supabase
    .channel(`msg_${teacherId}_${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'school_messages',
        filter: `to_teacher_id=eq.${teacherId}`,
      },
      (payload) => onNew(payload.new)
    )
    .subscribe();
}

// Formate un numéro camerounais pour WhatsApp (wa.me/237XXXXXXXXX)
export function buildWhatsAppUrl(phone, text) {
  const msg = encodeURIComponent(text);
  if (!phone) return `https://wa.me/?text=${msg}`;
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  const intl = cleaned.startsWith('237') ? cleaned
    : cleaned.startsWith('00237') ? cleaned.slice(2)
    : cleaned.startsWith('0')     ? '237' + cleaned.slice(1)
    : '237' + cleaned;
  return `https://wa.me/${intl}?text=${msg}`;
}
