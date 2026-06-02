// Verrouillage des notes validées et des bulletins publiés.
// Le verrou est local (localStorage) — persiste entre sessions et survit
// au mode hors-ligne complet. Seul un admin peut poser/lever le verrou.
//
// Pourquoi pas en DB ? Pour ne pas dépendre d'une nouvelle table côté
// Supabase. Si un audit centralisé est requis plus tard, on pourra
// promouvoir cette logique au niveau du serveur.

import { logAction } from './historyService';

const KEY_PREFIX = 'notescam_lock_';

function keyFor(schoolId, scope, ...parts) {
  return `${KEY_PREFIX}${schoolId || 'anon'}_${scope}_${parts.join('_')}`;
}

function readMap(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function writeMap(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) { /* quota */ }
}

// === Verrouillage des séquences (notes) ===

export function isSequenceLocked(schoolId, classId, sequence) {
  return !!readMap(keyFor(schoolId, 'seq', classId, sequence));
}

export async function lockSequence(schoolId, classId, sequence, lockedByName) {
  writeMap(keyFor(schoolId, 'seq', classId, sequence), {
    at: Date.now(),
    by: lockedByName || null,
  });
  await logAction({
    action: 'validate',
    table: 'grades',
    target_id: `${classId}_seq_${sequence}`,
    details: { type: 'sequence_lock' },
  });
}

export async function unlockSequence(schoolId, classId, sequence) {
  localStorage.removeItem(keyFor(schoolId, 'seq', classId, sequence));
  await logAction({
    action: 'update',
    table: 'grades',
    target_id: `${classId}_seq_${sequence}`,
    details: { type: 'sequence_unlock' },
  });
}

// === Bulletins publiés ===

export function isBulletinPublished(schoolId, classId, periodKey) {
  return !!readMap(keyFor(schoolId, 'bul', classId, periodKey));
}

export async function publishBulletin(schoolId, classId, periodKey, byName) {
  writeMap(keyFor(schoolId, 'bul', classId, periodKey), {
    at: Date.now(),
    by: byName || null,
  });
  await logAction({
    action: 'publish',
    table: 'bulletins',
    target_id: `${classId}_${periodKey}`,
    details: {},
  });
}

export async function unpublishBulletin(schoolId, classId, periodKey) {
  localStorage.removeItem(keyFor(schoolId, 'bul', classId, periodKey));
  await logAction({
    action: 'update',
    table: 'bulletins',
    target_id: `${classId}_${periodKey}`,
    details: { type: 'unpublish' },
  });
}

// === Métadonnées d'affichage ===

export function getLockInfo(schoolId, scope, ...parts) {
  return readMap(keyFor(schoolId, scope, ...parts));
}
