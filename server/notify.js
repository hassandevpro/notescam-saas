// server/notify.js
// H5 — NOTIFICATIONS HYBRIDES côté LAN (serveur). Le moteur pur multi-canaux vit déjà
// côté client (src/lib/notificationEngine.js) ; ICI c'est le PENDANT SERVEUR, écrit
// directement en SQLite pour les 3 moments de la gouvernance financière distante.
//
// Canal INTERNE : ligne dans `notifications` (table SYNCHRONISÉE LWW → l'entrée remonte
// au Cloud comme n'importe quel état ; le décideur/demandeur la voit des deux côtés).
// Canaux EXTERNES (email/sms/whatsapp) : MIS EN FILE dans `notification_outbox`
// (status 'pending') — AUCUN envoi ici (canaux prévus, non implémentés, cf H5 « externe
// en file »). OFFLINE OK : tout est local, la réplication se fait quand le lien revient.
//
// INVARIANT : best-effort, ne lève JAMAIS. Une notification ratée ne doit jamais casser
// (ni faire reculer) une application financière — donc on notifie HORS de la transaction
// métier, et toute erreur est avalée (journalisée). C'est la garantie de l'invariant #6.

import { randomUUID } from 'node:crypto';
import { db, deviceId } from './db.js';

const CHANNELS = ['internal', 'email', 'sms', 'whatsapp'];

// Canal interne : notification in-app (synchronisée → sync_outbox pour la remontée Cloud).
function insertInternal(schoolId, recipient, msg, now) {
  const id = randomUUID();
  db.prepare(`INSERT INTO notifications
      (id, school_id, recipient_id, recipient_role, type, title, body, link, read, created_at, updated_at, version, device_id)
      VALUES (?,?,?,?,?,?,?,?,0,?,?,1,?)`)
    .run(id, schoolId, recipient?.id || null, recipient?.role || null,
         msg.type, msg.title, msg.body || null, msg.link || null, now, now, deviceId());
  db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)')
    .run('notifications', id, 'upsert', now);
  return id;
}

// Canal externe : mise en FILE (pending), jamais envoyé ici. Sans adresse → ignoré.
function queueExternal(schoolId, channel, recipient, msg, notifId, now) {
  const address = channel === 'email' ? (recipient?.email || null) : (recipient?.phone || null);
  if (!address) return;
  const id = randomUUID();
  db.prepare(`INSERT INTO notification_outbox
      (id, school_id, notification_id, channel, address, status, attempts, payload, created_at, updated_at, version, device_id)
      VALUES (?,?,?,?,?, 'pending', 0, ?, ?, ?, 1, ?)`)
    .run(id, schoolId, notifId, channel, address,
         JSON.stringify({ title: msg.title, body: msg.body || '' }), now, now, deviceId());
  db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)')
    .run('notification_outbox', id, 'upsert', now);
}

// Émet une notification serveur (best-effort, ne lève jamais).
// recipients : [{ id?, role?, email?, phone? }] — vide = diffusion (un seul envoi).
export function notify({ schoolId, recipients = [], type = 'info', title, body = '', link = null, channels = ['internal'] }) {
  if (!schoolId || !title) return [];
  const chans = (channels.length ? channels : ['internal']).filter((c) => CHANNELS.includes(c));
  if (!chans.length) return [];
  const targets = recipients.length ? recipients : [null];
  const now = new Date().toISOString();
  const msg = { type, title, body, link };
  const ids = [];
  try {
    for (const r of targets) {
      let notifId = null;
      for (const c of chans) {
        if (c === 'internal') notifId = insertInternal(schoolId, r, msg, now);
        else queueExternal(schoolId, c, r, msg, notifId, now);
      }
      if (notifId) ids.push(notifId);
    }
  } catch (e) {
    console.error('[notify]', e?.message || e);
  }
  return ids;
}

// Décideurs distants d'une école = comptes actifs portant la capacité d'accès distant
// (H4). Ce sont eux qui traitent une demande d'approbation venue d'Internet.
export function remoteDeciders(schoolId) {
  try {
    return db.prepare(
      'SELECT user_id AS id FROM school_users WHERE school_id = ? AND active = 1 AND remote_access_allowed = 1',
    ).all(schoolId);
  } catch { return []; }
}
