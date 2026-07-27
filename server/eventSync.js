// server/eventSync.js
// H3-a — Réplication du JOURNAL D'ÉVÉNEMENTS (domain_events) LAN ↔ Cloud.
//
// Journal APPEND-ONLY et IMMUABLE → PAS de LWW : log shipping monotone par curseur
// `seq`, idempotent par `id`. Aucune résolution de conflit (un événement ne change
// jamais). C'est le TRANSPORT du futur canal de commandes de gouvernance (H3-b/H3b).
//
// Sens :
//   • PULL cloud→local : events-pull renvoie les events de seq (bigserial) > curseur ;
//     insertion locale IDEMPOTENTE (ON CONFLICT id DO NOTHING), estampillée
//     `replicated_from='cloud'` (anti-écho).
//   • PUSH local→cloud : on pousse les events d'ORIGINE LOCALE (replicated_from IS
//     NULL) par `rowid` croissant (append-only → monotone) ; events-push insère en
//     idempotent côté cloud (qui attribue son propre seq).
//
// Curseurs (table sync_cursor, distincts de l'état pull_at/tomb_at) :
//   • event_pull_seq   = dernier seq CLOUD appliqué localement ;
//   • event_push_rowid = dernier rowid LOCAL poussé.
// Le curseur n'avance qu'APRÈS application/envoi réussi → coupure Internet = rien ne
// bouge ; reprise = on repart du curseur persistant ; un lot rejoué est un no-op.
//
// Gated : ne tourne que si NOTESCAM_CLOUD_SYNC=1 ET jeton serveur présent.

import { db } from './db.js';
import { serverToken } from './cloudSync.js';
import { EDGE_BASE } from './cloudEnv.js';

const BATCH = 500;

// Colonnes locales de domain_events autorisées à l'insertion d'un event distant.
const LOCAL_COLS = [
  'id', 'school_id', 'aggregate_type', 'aggregate_id', 'event_type', 'payload',
  'actor_id', 'actor_name', 'correlation_id', 'occurred_at', 'seq', 'device_id',
];

function cursor(name) { return db.prepare('SELECT value FROM sync_cursor WHERE name = ?').get(name)?.value ?? null; }
function setCursor(name, value) {
  if (value == null) return;
  db.prepare('INSERT INTO sync_cursor (name, value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .run(name, String(value));
}

// --- Transport edge (injectable pour les tests) -----------------------
async function edgeFetch(path, body) {
  const token = serverToken();
  if (!token) throw new Error('no_server_token');
  const res = await fetch(`${EDGE_BASE}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error(`${path}: HTTP ${res.status}`);
  return j;
}

// Insertion IDEMPOTENTE d'un event distant (n'écrase jamais : append-only). Estampille
// l'origine cloud (anti-écho). `payload` est stocké en TEXT côté LAN (JSON sérialisé).
function insertRemoteEvent(ev) {
  if (!ev?.id || !ev?.school_id) return false;
  const rec = {};
  for (const c of LOCAL_COLS) if (c in ev) rec[c] = ev[c];
  if (rec.payload != null && typeof rec.payload !== 'string') rec.payload = JSON.stringify(rec.payload);
  rec.replicated_from = 'cloud';
  const cols = Object.keys(rec);
  const sql = `INSERT INTO domain_events (${cols.map((c) => `"${c}"`).join(', ')}) `
    + `VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO NOTHING`;
  try { const info = db.prepare(sql).run(...cols.map((c) => rec[c])); return info.changes > 0; }
  catch (e) { console.warn(`[event-sync] insert ignoré: ${e.message}`); return false; }
}

// --- PULL cloud → local ----------------------------------------------
async function pull(edge, dryRun) {
  const j = await edge('events-pull', { since: cursor('event_pull_seq') });
  const events = j?.events || [];
  let applied = 0;
  const plan = [];
  for (const ev of events) {
    // Déjà présent localement ? (idempotence + anti double-application)
    const exists = db.prepare('SELECT 1 FROM domain_events WHERE id = ?').get(ev.id);
    if (exists) { plan.push({ id: ev.id, skip: 'exists' }); continue; }
    plan.push({ id: ev.id, apply: true });
    if (!dryRun && insertRemoteEvent(ev)) applied++;
  }
  if (!dryRun) setCursor('event_pull_seq', j?.cursor);
  return { pulled: events.length, applied, cursor: j?.cursor ?? null, plan };
}

// --- PUSH local → cloud ----------------------------------------------
async function push(edge, dryRun) {
  const last = Number(cursor('event_push_rowid') || 0);
  // Seuls les events d'ORIGINE LOCALE (anti-écho), par rowid croissant (ordre causal).
  const rows = db.prepare(
    `SELECT rowid AS _rid, * FROM domain_events
       WHERE replicated_from IS NULL AND rowid > ?
       ORDER BY rowid ASC LIMIT ?`,
  ).all(last, BATCH);
  if (!rows.length) return { pushed: 0, planned: [] };

  const events = rows.map((r) => {
    const { _rid, replicated_from, ...ev } = r;
    // payload TEXT → objet pour le jsonb cloud.
    if (typeof ev.payload === 'string') { try { ev.payload = JSON.parse(ev.payload); } catch { ev.payload = {}; } }
    delete ev.seq; // le cloud attribue son propre seq (bigserial)
    return ev;
  });
  const planned = rows.map((r) => ({ id: r.id, rowid: r._rid }));
  if (dryRun) return { pushed: 0, planned };

  await edge('events-push', { events });
  const maxRowid = rows[rows.length - 1]._rid;
  setCursor('event_push_rowid', maxRowid);
  return { pushed: events.length, planned };
}

// --- Orchestration ----------------------------------------------------
// PULL et PUSH sont INDÉPENDANTS (deux sens du journal) : chacun a son try/catch, son
// curseur avance seulement en cas de succès. Une coupure sur un sens n'empêche pas
// l'autre, et rien n'avance côté sens en échec (reprise propre au tick suivant).
export async function syncEventsOnce({ edge = edgeFetch, dryRun = false } = {}) {
  let p = { pulled: 0, applied: 0, plan: [] }, pullError = null;
  let q = { pushed: 0, planned: [] }, pushError = null;
  try { p = await pull(edge, dryRun); } catch (e) { pullError = e.message; }
  try { q = await push(edge, dryRun); } catch (e) { pushError = e.message; }
  return {
    dryRun, at: new Date().toISOString(),
    pulled: p.pulled, applied: p.applied, pushed: q.pushed,
    pullPlan: p.plan, pushPlan: q.planned, pullError, pushError,
  };
}

let _timer = null;
export function scheduleEventSync(intervalMs = 5 * 60 * 1000) {
  if (process.env.NOTESCAM_CLOUD_SYNC !== '1' || !serverToken()) return false;
  syncEventsOnce().catch((e) => console.error('[event-sync] échec initial:', e.message));
  _timer = setInterval(() => { syncEventsOnce().catch((e) => console.error('[event-sync] échec:', e.message)); }, intervalMs);
  _timer.unref?.();
  return true;
}
