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

// Handler EXTERNE : met en file (pending). PAS d'envoi ici (l'edge notify-dispatch
// est le seul expéditeur). SMS : coûteux (cf. supabase_sms_budget.sql) — une
// notification 'normal' n'est même pas mise en file, pour ne pas laisser croire
// qu'un envoi est possible (le budget se juge à la mise en file ET au dispatch).
// `next_attempt_at` légèrement dans le futur : laisse une chance à plusieurs SMS
// proches dans le temps pour le même destinataire d'être regroupés en un seul
// envoi par le dispatcher (cf. son commentaire d'en-tête).
async function externalHandler(schoolId, channel, { recipient, message }) {
  const address = channel === 'email' ? (recipient?.email || null) : (recipient?.phone || null);
  if (!address) return { status: 'skipped', reason: 'no_address' };
  const priority = message.priority || 'normal';
  if (channel === 'sms' && priority === 'normal') return { status: 'skipped', reason: 'low_priority' };
  const now = new Date().toISOString();
  const rec = {
    id: uuid(), school_id: schoolId, notification_id: null, channel, address,
    status: 'pending', attempts: 0, priority,
    payload: JSON.stringify({ title: message.title, body: message.body }),
    created_at: now, updated_at: now, version: 1,
    ...(channel === 'sms' ? { next_attempt_at: new Date(Date.now() + 3 * 60_000).toISOString() } : {}),
  };
  const { error } = await supabase.from('notification_outbox').upsert(rec, { onConflict: 'id' });
  if (error) { console.error('externalHandler', error); return { status: 'failed', error: error.message }; }
  return { status: 'queued' };  // en file, non envoyé
}

// Point d'entrée : émet une notification sur les canaux demandés (défaut interne).
// `priority` ('normal' | 'important' | 'urgent') n'a d'effet que sur le canal SMS —
// seules 'important'/'urgent' peuvent atteindre un SMS (cf. externalHandler + edge
// notify-dispatch, qui applique en dernier ressort la règle de budget).
export async function notify({ schoolId, recipients = [], type = 'info', title, body = '', link = null, channels = ['internal'], priority = 'normal' }) {
  if (!schoolId || !title) return [];
  const dispatcher = createDispatcher({
    internal: (a) => internalHandler(schoolId, a),
    email:    (a) => externalHandler(schoolId, 'email', a),
    sms:      (a) => externalHandler(schoolId, 'sms', a),
    whatsapp: (a) => externalHandler(schoolId, 'whatsapp', a),
  });
  return dispatcher.dispatch({ type, title, body, link, channels, recipients, priority });
}

// Raccourci : notification interne à un rôle (diffusion).
export function notifyRole(schoolId, role, msg) {
  return notify({ schoolId, recipients: [{ role }], channels: ['internal'], ...msg });
}

// ── Lecture (canal interne) ───────────────────────────────────────────────────

// Cette notification me concerne-t-elle ? Ciblée sur moi, sur mon rôle, ou
// diffusée (ni destinataire ni rôle). PUR — extrait du fetch pour que le temps
// réel applique EXACTEMENT le même filtre qu'au chargement (sinon une ligne
// arrivant en direct pourrait s'afficher chez quelqu'un qui ne la verrait pas
// après rechargement).
export function isNotificationForMe(n, userId, role) {
  if (!n) return false;
  return (n.recipient_id && n.recipient_id === userId)
    || (n.recipient_role && n.recipient_role === role)
    || (!n.recipient_id && !n.recipient_role);
}

// Notifications visibles par l'utilisateur. Filtrage côté client (volumes faibles).
export async function fetchMyNotifications(schoolId, userId, role, limit = 100) {
  const { data, error } = await supabase
    .from('notifications').select('*').eq('school_id', schoolId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('fetchMyNotifications', error); return []; }
  return (data || []).filter((n) => isNotificationForMe(n, userId, role));
}

// Temps réel : nouvelles notifications de l'école (INSERT + UPDATE, pour capter
// le passage à « lu » fait depuis un autre appareil). En LAN, `./supabase` est
// aliasé vers localClient qui émule `.channel()` par sondage — même code.
export function subscribeToMyNotifications(schoolId, onChange) {
  return supabase
    .channel(`appnotif_${schoolId}_${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `school_id=eq.${schoolId}` },
      (payload) => onChange(payload.new))
    .subscribe();
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
