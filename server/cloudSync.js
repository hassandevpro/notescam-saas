// server/cloudSync.js
// Synchronisation continue bidirectionnelle LAN ↔ Cloud (Phase 2).
//
// Le serveur LAN parle au cloud via 2 fonctions edge authentifiées par le JETON
// SCELLÉ de l'école (service_role confinée au cloud) :
//   - sync-pull : renvoie les lignes cloud modifiées depuis le curseur + tombstones.
//   - sync-push : applique les changements locaux (LWW côté serveur cloud).
//
// Résolution de conflits LWW : updated_at, puis version, puis device_id.
// Anti-écho : l'application des changements distants écrit en base SANS passer
// par query.js (donc sans réalimenter sync_outbox) → pas de boucle.
//
// Gated : ne tourne que si un jeton serveur existe ET NOTESCAM_CLOUD_SYNC=1.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_DIR, SYNCED_TABLES, tableColumns, normalizeValue, deviceId } from './db.js';

const TOKEN_PATH = join(DATA_DIR, 'server-token.key');
const EDGE_BASE = (process.env.VITE_SUPABASE_URL || '') + '/functions/v1';
const BATCH = 500;

// Ordre FK pour appliquer les lignes distantes (parents avant enfants).
const PULL_ORDER = [
  'schools', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'grades', 'student_fees', 'fee_payments',
  'attendance', 'student_absences', 'student_class_assignments',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
];

export function serverToken() {
  try { return existsSync(TOKEN_PATH) ? readFileSync(TOKEN_PATH, 'utf8').trim() || null : null; } catch { return null; }
}
function cursor(name) { return db.prepare('SELECT value FROM sync_cursor WHERE name = ?').get(name)?.value || null; }
function setCursor(name, value) {
  if (value == null) return;
  db.prepare('INSERT INTO sync_cursor (name, value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(name, value);
}

// --- Résolution LWW ---------------------------------------------------
// true => `remote` gagne (doit écraser le local).
export function remoteWins(local, remote) {
  if (!local) return true;
  if (!remote) return false;
  const lt = Date.parse(local.updated_at || 0) || 0;
  const rt = Date.parse(remote.updated_at || 0) || 0;
  if (rt !== lt) return rt > lt;
  const lv = local.version || 0, rv = remote.version || 0;
  if (rv !== lv) return rv > lv;
  return String(remote.device_id || '') > String(local.device_id || '');
}

// Upsert direct (anti-écho : n'alimente PAS sync_outbox).
function rawUpsert(table, row) {
  const cols = tableColumns(table);
  const rec = {};
  for (const [k, v] of Object.entries(row)) if (cols.has(k)) rec[k] = normalizeValue(v);
  if (!('id' in rec)) return false;
  const keys = Object.keys(rec);
  const ph = keys.map(() => '?').join(', ');
  const upd = keys.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ');
  const sql = `INSERT INTO "${table}" (${keys.map((c) => `"${c}"`).join(', ')}) VALUES (${ph})`
    + (upd ? ` ON CONFLICT(id) DO UPDATE SET ${upd}` : ' ON CONFLICT(id) DO NOTHING');
  try { db.prepare(sql).run(...keys.map((c) => rec[c])); return true; }
  catch (e) { console.warn(`[sync] upsert ${table} ignoré: ${e.message}`); return false; }
}

function applyRemoteRow(table, row) {
  if (!row?.id) return;
  const local = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(row.id);
  if (local && !remoteWins(local, row)) return; // le local est plus récent → on garde
  rawUpsert(table, row);
}

function applyTombstone(table, rowId, deletedAt) {
  if (!SYNCED_TABLES.has(table)) return;
  const local = db.prepare(`SELECT updated_at FROM "${table}" WHERE id = ?`).get(rowId);
  if (!local) return;
  // La suppression gagne si elle est au moins aussi récente que le dernier
  // changement local connu (sinon une modif locale postérieure la ressuscite).
  if ((Date.parse(local.updated_at || 0) || 0) <= (Date.parse(deletedAt || 0) || 0)) {
    try { db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(rowId); } catch { /* FK : ignore */ }
  }
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

// --- Pull : cloud → local --------------------------------------------
async function pull(edge) {
  const j = await edge('sync-pull', { since: cursor('pull_at'), tomb_since: cursor('tomb_at') });
  const rows = j?.rows || {};
  for (const table of PULL_ORDER) {
    for (const row of rows[table] || []) applyRemoteRow(table, row);
  }
  for (const t of j?.tombstones || []) applyTombstone(t.tablename, t.row_id, t.deleted_at);
  setCursor('pull_at', j?.cursor);
  setCursor('tomb_at', j?.tomb_cursor);
  return { pulled: Object.values(rows).reduce((a, r) => a + r.length, 0), deleted: (j?.tombstones || []).length };
}

// --- Push : local → cloud --------------------------------------------
async function push(edge) {
  const entries = db.prepare('SELECT * FROM sync_outbox ORDER BY id LIMIT ?').all(BATCH);
  if (!entries.length) return { pushed: 0 };
  // Réduit à un changement par (table,row_id) — le dernier état gagne.
  const seen = new Set();
  const changes = [];
  for (const e of [...entries].reverse()) {
    const k = `${e.tablename}|${e.row_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (e.op === 'delete') { changes.push({ table: e.tablename, op: 'delete', row: { id: e.row_id } }); continue; }
    const row = db.prepare(`SELECT * FROM "${e.tablename}" WHERE id = ?`).get(e.row_id);
    if (row) changes.push({ table: e.tablename, op: 'upsert', row });
    else changes.push({ table: e.tablename, op: 'delete', row: { id: e.row_id } });
  }
  changes.reverse();
  await edge('sync-push', { changes });
  // Succès : purge les entrées traitées (les nouvelles, id > maxId, restent).
  const maxId = entries[entries.length - 1].id;
  db.prepare('DELETE FROM sync_outbox WHERE id <= ?').run(maxId);
  return { pushed: changes.length };
}

// --- Orchestration ----------------------------------------------------
// Pull d'abord (intègre le distant avec LWW), puis push (envoie l'état local
// courant). @param edge  transport (défaut: fonctions edge réelles).
export async function syncOnce({ edge = edgeFetch } = {}) {
  const pulled = await pull(edge);
  const pushed = await push(edge);
  return { ...pulled, ...pushed, at: new Date().toISOString() };
}

let _timer = null;
export function scheduleCloudSync(intervalMs = 5 * 60 * 1000) {
  if (process.env.NOTESCAM_CLOUD_SYNC !== '1' || !serverToken()) return false;
  syncOnce().catch((e) => console.error('[sync] échec initial:', e.message));
  _timer = setInterval(() => { syncOnce().catch((e) => console.error('[sync] échec:', e.message)); }, intervalMs);
  _timer.unref?.();
  return true;
}
