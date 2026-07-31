// server/syncFlag.js
// Réglage LOCAL persistant « mode hybride » (synchro Cloud continue + drain des
// intentions distantes). Remplace le besoin de la variable d'environnement
// NOTESCAM_CLOUD_SYNC=1 : on peut désormais activer l'hybride EN QUELQUES CLICS
// depuis l'app (route /api/hybrid/enable). La variable d'env reste prioritaire
// (rétro-compatibilité + démarrages scriptés).

import { db } from './db.js';

export function getSetting(key, def = null) {
  const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return r ? r.value : def;
}

export function setSetting(key, value) {
  db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, value == null ? null : String(value));
}

// Vrai si la synchro Cloud (mode hybride) doit tourner : soit forcée par l'env
// (démarrage scripté), soit activée depuis l'app (réglage persistant).
export function isCloudSyncEnabled() {
  return process.env.NOTESCAM_CLOUD_SYNC === '1' || getSetting('cloud_sync') === '1';
}
