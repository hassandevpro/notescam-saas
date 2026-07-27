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

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_DIR, SYNCED_TABLES, tableColumns, normalizeValue, deviceId } from './db.js';
import { EDGE_BASE } from './cloudEnv.js';
import { shouldPush, shouldPull } from '../src/lib/policyEngine.js';

// Politique de déploiement de l'établissement (H1). Absente/vide (cas actuel de
// tous les établissements) → policyEngine renvoie push/pull vrais partout, donc
// la synchro se comporte EXACTEMENT comme avant (inertie garantie + testée).
function currentPolicy() {
  try { return db.prepare('SELECT deployment_policy FROM schools LIMIT 1').get()?.deployment_policy || null; }
  catch { return null; }
}

const TOKEN_PATH = join(DATA_DIR, 'server-token.key');
const BATCH = 500;

// Ordre FK pour appliquer les lignes distantes (parents avant enfants).
const PULL_ORDER = [
  'schools', 'school_units', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'staff', 'grades', 'student_fees', 'fee_payments',
  // Module Budgets — hiérarchie annual→period→sector puis chapitres/dépenses/
  // opérations. `budgets` s'auto-référence (parent_budget_id) : les lignes sont
  // triées par `tier` avant application (cf. tierRank) pour respecter la FK.
  // budget_periods (dédiées) avant les allocations qui les référencent ; les
  // allocations par ligne viennent après budget_chapters (leur parent FK).
  'budgets', 'budget_periods', 'budget_chapters', 'budget_expenses', 'budget_unlock_requests',
  'budget_reallocations', 'budget_revisions', 'budget_line_periods', 'budget_line_sectors',
  'budget_line_reallocations',
  'attendance', 'student_absences', 'student_class_assignments',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
];

// Ordre d'application intra-`budgets` : un parent doit précéder ses enfants
// (annual < period < sector). Les lignes héritées (tier NULL) n'ont pas de parent
// budget → rang 0. Garantit l'absence de violation de FK auto-référente au pull.
function tierRank(row) {
  return row?.tier === 'sector' ? 2 : row?.tier === 'period' ? 1 : 0;
}

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
// En `dryRun`, l'appel sync-pull (lecture seule côté cloud) est fait pour
// calculer les décisions LWW, mais RIEN n'est écrit ni les curseurs avancés.
async function pull(edge, dryRun) {
  const j = await edge('sync-pull', { since: cursor('pull_at'), tomb_since: cursor('tomb_at') });
  const rows = j?.rows || {};
  const plan = { apply: [], keepLocal: [], remove: [], keepLocalVsDelete: [] };
  const policy = currentPolicy();

  for (const table of PULL_ORDER) {
    // Politique de déploiement (H1) : un module en mode LAN-only n'intègre pas les
    // lignes distantes de ses tables. Inerte tant qu'aucune politique n'est définie.
    if (!shouldPull(policy, table)) continue;
    // `budgets` s'auto-référence : appliquer les parents (annual) avant les
    // enfants (period, puis sector) pour ne pas violer la FK parent_budget_id.
    const batch = table === 'budgets'
      ? [...(rows[table] || [])].sort((a, b) => tierRank(a) - tierRank(b))
      : (rows[table] || []);
    for (const row of batch) {
      if (!row?.id) continue;
      const local = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(row.id);
      if (local && !remoteWins(local, row)) { plan.keepLocal.push({ table, id: row.id }); continue; }
      plan.apply.push({ table, id: row.id });
      if (!dryRun) rawUpsert(table, row);
    }
  }
  for (const t of j?.tombstones || []) {
    if (!SYNCED_TABLES.has(t.tablename)) continue;
    if (!shouldPull(policy, t.tablename)) continue; // module LAN-only : on ignore aussi ses suppressions distantes
    const local = db.prepare(`SELECT updated_at FROM "${t.tablename}" WHERE id = ?`).get(t.row_id);
    if (!local) continue;
    // La suppression gagne si elle est au moins aussi récente que le dernier
    // changement local connu (sinon une modif locale postérieure la ressuscite).
    if ((Date.parse(local.updated_at || 0) || 0) <= (Date.parse(t.deleted_at || 0) || 0)) {
      plan.remove.push({ table: t.tablename, id: t.row_id });
      if (!dryRun) { try { db.prepare(`DELETE FROM "${t.tablename}" WHERE id = ?`).run(t.row_id); } catch { /* FK : ignore */ } }
    } else {
      plan.keepLocalVsDelete.push({ table: t.tablename, id: t.row_id });
    }
  }
  if (!dryRun) { setCursor('pull_at', j?.cursor); setCursor('tomb_at', j?.tomb_cursor); }
  return { pulled: Object.values(rows).reduce((a, r) => a + r.length, 0), deleted: plan.remove.length, plan };
}

// --- Push : local → cloud --------------------------------------------
// En `dryRun`, on calcule les changements mais on N'APPELLE PAS sync-push et on
// NE VIDE PAS l'outbox.
async function push(edge, dryRun) {
  const entries = db.prepare('SELECT * FROM sync_outbox ORDER BY id LIMIT ?').all(BATCH);
  if (!entries.length) return { pushed: 0, planned: [] };
  const policy = currentPolicy();
  // Réduit à un changement par (table,row_id) — le dernier état gagne.
  const seen = new Set();
  const changes = [];
  for (const e of [...entries].reverse()) {
    // Politique de déploiement (H1) : un module LAN-only ne pousse pas ses tables ;
    // l'entrée d'outbox est simplement consommée (purge par maxId ci-dessous), pas
    // renvoyée indéfiniment. Inerte tant qu'aucune politique n'est définie.
    if (!shouldPush(policy, e.tablename)) continue;
    const k = `${e.tablename}|${e.row_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (e.op === 'delete') { changes.push({ table: e.tablename, op: 'delete', row: { id: e.row_id } }); continue; }
    const row = db.prepare(`SELECT * FROM "${e.tablename}" WHERE id = ?`).get(e.row_id);
    if (row) changes.push({ table: e.tablename, op: 'upsert', row });
    else changes.push({ table: e.tablename, op: 'delete', row: { id: e.row_id } });
  }
  changes.reverse();
  const planned = changes.map((c) => ({ table: c.table, op: c.op, id: c.row.id }));
  if (dryRun) return { pushed: 0, planned };

  await edge('sync-push', { changes });
  // Succès : purge les entrées traitées (les nouvelles, id > maxId, restent).
  const maxId = entries[entries.length - 1].id;
  db.prepare('DELETE FROM sync_outbox WHERE id <= ?').run(maxId);
  return { pushed: changes.length, planned };
}

// Journal lisible (console + DATA_DIR/sync-dryrun.log). N'écrit aucune donnée
// métier : seulement un fichier de log.
function journalDryRun(r) {
  const L = [];
  L.push(`\n=== DRY-RUN ${r.at} ===`);
  if (r.pullError) L.push(`PULL indisponible (${r.pullError}) — rapport limité à la poussée.`);
  L.push(`PUSH (local→cloud) : ${r.pushPlan.length} changement(s) seraient envoyés`);
  for (const c of r.pushPlan) L.push(`  push ${String(c.op).padEnd(6)} ${c.table} ${c.id}`);
  const p = r.pullPlan;
  L.push(`PULL (cloud→local) : ${p.apply.length} à appliquer · ${p.keepLocal.length} ignorés (local plus récent) · ${p.remove.length} suppression(s) · ${p.keepLocalVsDelete.length} suppression(s) écartée(s)`);
  for (const c of p.apply) L.push(`  apply       ${c.table} ${c.id}`);
  for (const c of p.keepLocal) L.push(`  keep-local  ${c.table} ${c.id}`);
  for (const c of p.remove) L.push(`  delete      ${c.table} ${c.id}`);
  const text = L.join('\n');
  console.log(text);
  try { appendFileSync(join(DATA_DIR, 'sync-dryrun.log'), text + '\n'); } catch { /* log best-effort */ }
}

// --- Orchestration ----------------------------------------------------
// Pull d'abord (intègre le distant avec LWW), puis push (envoie l'état local
// courant). En `dryRun`, RIEN n'est écrit (base, outbox, curseurs, cloud) : on
// journalise seulement ce qui SERAIT poussé/tiré. @param edge transport.
export async function syncOnce({ edge = edgeFetch, dryRun = false } = {}) {
  let p, pullError = null;
  try {
    p = await pull(edge, dryRun);
  } catch (e) {
    if (!dryRun) throw e;  // hors dry-run, un échec de pull interrompt le cycle
    pullError = e.message; // en dry-run, on rapporte quand même la poussée (offline OK)
    p = { pulled: 0, deleted: 0, plan: { apply: [], keepLocal: [], remove: [], keepLocalVsDelete: [] } };
  }
  const q = await push(edge, dryRun);

  const res = {
    dryRun, at: new Date().toISOString(),
    pulled: p.pulled, deleted: p.deleted, pushed: q.pushed,
    pullPlan: p.plan, pushPlan: q.planned, pullError,
  };
  if (dryRun) journalDryRun(res);
  return res;
}

let _timer = null;
export function scheduleCloudSync(intervalMs = 5 * 60 * 1000) {
  if (process.env.NOTESCAM_CLOUD_SYNC !== '1' || !serverToken()) return false;
  syncOnce().catch((e) => console.error('[sync] échec initial:', e.message));
  _timer = setInterval(() => { syncOnce().catch((e) => console.error('[sync] échec:', e.message)); }, intervalMs);
  _timer.unref?.();
  return true;
}
