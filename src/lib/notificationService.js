// Service de notifications (I/O). Branche les handlers réels sur le moteur pur :
//   • INTERNE  : crée une notification in-app (table notifications) — IMPLÉMENTÉ ;
//   • EMAIL/SMS/WHATSAPP : mis en FILE dans notification_outbox (status 'pending'),
//     mais AUCUN envoi (canaux prévus, non implémentés dans cette itération).
import { supabase } from './supabase';
import { uuid } from './uuid';
import { createDispatcher } from './notificationEngine';

// Handler INTERNE : notification in-app.
async function internalHandler(schoolId, { recipient, message }) {
  const now = new Date().toISOString();
  const rec = {
    id: uuid(), school_id: schoolId,
    recipient_id: recipient?.id || null, recipient_role: recipient?.role || null,
    type: message.type, title: message.title, body: message.body, link: message.link,
    read: false, created_at: now, updated_at: now, version: 1,
  };
  const { error } = await supabase.from('notifications').upsert(rec, { onConflict: 'id' });
  if (error) { console.error('internalHandler', error); return { status: 'failed', error: error.message }; }
  return { status: 'delivered', id: rec.id };
}

// Handler EXTERNE : met en file (pending). PAS d'envoi (canal non implémenté).
async function externalHandler(schoolId, channel, { recipient, message }) {
  const address = channel === 'email' ? (recipient?.email || null) : (recipient?.phone || null);
  if (!address) return { status: 'skipped', reason: 'no_address' };
  const now = new Date().toISOString();
  const rec = {
    id: uuid(), school_id: schoolId, notification_id: null, channel, address,
    status: 'pending', attempts: 0, payload: JSON.stringify({ title: message.title, body: message.body }),
    created_at: now, updated_at: now, version: 1,
  };
  const { error } = await supabase.from('notification_outbox').upsert(rec, { onConflict: 'id' });
  if (error) { console.error('externalHandler', error); return { status: 'failed', error: error.message }; }
  return { status: 'queued' };  // en file, non envoyé
}

// Point d'entrée : émet une notification sur les canaux demandés (défaut interne).
export async function notify({ schoolId, recipients = [], type = 'info', title, body = '', link = null, channels = ['internal'] }) {
  if (!schoolId || !title) return [];
  const dispatcher = createDispatcher({
    internal: (a) => internalHandler(schoolId, a),
    email:    (a) => externalHandler(schoolId, 'email', a),
    sms:      (a) => externalHandler(schoolId, 'sms', a),
    whatsapp: (a) => externalHandler(schoolId, 'whatsapp', a),
  });
  return dispatcher.dispatch({ type, title, body, link, channels, recipients });
}

// Raccourci : notification interne à un rôle (diffusion).
export function notifyRole(schoolId, role, msg) {
  return notify({ schoolId, recipients: [{ role }], channels: ['internal'], ...msg });
}

// ── Lecture (canal interne) ───────────────────────────────────────────────────

// Notifications visibles par l'utilisateur : ciblées sur lui, sur son rôle, ou
// diffusées (ni destinataire ni rôle). Filtrage côté client (volumes faibles).
export async function fetchMyNotifications(schoolId, userId, role, limit = 100) {
  const { data, error } = await supabase
    .from('notifications').select('*').eq('school_id', schoolId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('fetchMyNotifications', error); return []; }
  return (data || []).filter((n) =>
    (n.recipient_id && n.recipient_id === userId) ||
    (n.recipient_role && n.recipient_role === role) ||
    (!n.recipient_id && !n.recipient_role));
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ read: true, updated_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

export async function markAllRead(schoolId, ids = []) {
  if (!ids.length) return true;
  const { error } = await supabase.from('notifications').update({ read: true, updated_at: new Date().toISOString() }).in('id', ids);
  return !error;
}
