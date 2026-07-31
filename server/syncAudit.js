// server/syncAudit.js
// Journal d'audit PERSISTANT de la synchronisation hybride (LAN). Survit aux redémarrages
// et retrace, ligne par ligne : chaque cycle (poussé/tiré/supprimé + durée + hash + état),
// chaque erreur, chaque CONTRÔLE d'intégrité, chaque AUTO-RÉPARATION et rollback.
// Alimente la page « Synchronisation » (historique + « Voir le rapport »).
//
// Table bornée (garde les N dernières lignes) → coût constant sur des années de synchro.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, deviceId } from './db.js';

const KEEP = 5000;
let APP_VERSION = '?';
try { APP_VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version || '?'; } catch { /* */ }
export function appVersion() { return APP_VERSION; }

db.exec(`CREATE TABLE IF NOT EXISTS sync_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  kind        TEXT NOT NULL,   -- 'sync' | 'error' | 'verify' | 'repair' | 'auto-repair' | 'rollback'
  pushed      INTEGER,
  pulled      INTEGER,
  deleted     INTEGER,
  duration_ms INTEGER,
  ok          INTEGER,
  detail      TEXT
)`);
// Enrichissement idempotent (bases déjà installées) : métadonnées du journal complet.
function ensureCol(col, ddl) {
  const has = db.prepare('PRAGMA table_info(sync_audit)').all().some((r) => r.name === col);
  if (!has) db.exec(`ALTER TABLE sync_audit ADD COLUMN ${ddl}`);
}
ensureCol('actor', 'actor TEXT');           // utilisateur à l'origine (contrôle/réparation manuels)
ensureCol('device', 'device TEXT');          // identifiant du serveur LAN (device_id)
ensureCol('app_version', 'app_version TEXT'); // version de NotesCam
ensureCol('ip', 'ip TEXT');                  // adresse IP de l'appelant (actions manuelles)
ensureCol('machine', 'machine TEXT');         // nom machine / hôte
ensureCol('tables', 'tables INTEGER');        // nb de tables comparées
ensureCol('rows', 'rows INTEGER');            // nb de lignes touchées (poussées+tirées)
ensureCol('hash', 'hash TEXT');               // empreinte globale au moment du cycle
ensureCol('report', 'report TEXT');           // rapport compact (JSON) pour « Voir le rapport »

// Enregistre une entrée d'audit. Best-effort strict : ne LÈVE JAMAIS.
export function recordSyncAudit(e = {}) {
  try {
    db.prepare(`INSERT INTO sync_audit
      (at, kind, pushed, pulled, deleted, duration_ms, ok, detail, actor, device, app_version, ip, machine, tables, rows, hash, report)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      new Date().toISOString(), String(e.kind || 'sync'),
      e.pushed ?? null, e.pulled ?? null, e.deleted ?? null, e.duration_ms ?? null,
      e.ok == null ? null : (e.ok ? 1 : 0),
      e.detail ? JSON.stringify(e.detail).slice(0, 2000) : null,
      e.actor ?? null,
      e.device ?? (() => { try { return deviceId(); } catch { return null; } })(),
      e.app_version ?? APP_VERSION,
      e.ip ?? null, e.machine ?? null,
      e.tables ?? null, e.rows ?? null, e.hash ?? null,
      e.report ? JSON.stringify(e.report).slice(0, 20000) : null,
    );
    db.prepare('DELETE FROM sync_audit WHERE id <= (SELECT MAX(id) FROM sync_audit) - ?').run(KEEP);
  } catch (err) { console.warn('[sync-audit]', err.message); }
}

// N dernières entrées (les plus récentes d'abord). Le rapport JSON est parsé pour l'UI.
export function listSyncAudit(limit = 100) {
  try {
    const n = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    return db.prepare('SELECT * FROM sync_audit ORDER BY id DESC LIMIT ?').all(n)
      .map((r) => ({ ...r, report: r.report ? safeParse(r.report) : null, detail: r.detail ? safeParse(r.detail) : null }));
  } catch { return []; }
}
function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

// Temps moyen de réplication (ms) sur les N derniers cycles réussis.
export function avgReplicationMs(n = 20) {
  try {
    const rows = db.prepare("SELECT duration_ms FROM sync_audit WHERE kind = 'sync' AND duration_ms IS NOT NULL ORDER BY id DESC LIMIT ?").all(Math.min(Math.max(Number(n) || 20, 1), 200));
    if (!rows.length) return null;
    return Math.round(rows.reduce((a, r) => a + r.duration_ms, 0) / rows.length);
  } catch { return null; }
}
