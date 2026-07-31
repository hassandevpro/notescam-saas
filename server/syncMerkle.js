// server/syncMerkle.js
// Arbre de Merkle ADAPTATIF pour l'audit d'intégrité hiérarchique LAN ↔ Cloud.
//
// Objectif : un audit qui part du niveau le plus élevé et ne descend QUE dans les
// partitions divergentes (anti-entropie façon Cassandra/DynamoDB) → jamais de rescan
// global quand une seule classe/séquence diffère. Les checksums de partition sont
// maintenus INCRÉMENTALEMENT à chaque écriture des tables suivies → audit quasi instantané.
//
// ADAPTATIF : seules les tables volumineuses/critiques (MERKLE_EXPLICIT) OU celles qui
// dépassent un seuil configurable (MERKLE_AUTO_ROWCOUNT) maintiennent l'arbre. Les
// petites tables de config restent en contrôle ponctuel (syncVerify → sync_integrity).
//
// ── Agrégat (identique SQLite ↔ Postgres) ────────────────────────────────────────
//   leaf(table,id,version) = bigint(15 premiers hex de md5("table:id:version")) mod P
//   P = 2^61 - 1 (premier de Mersenne). 15 hex = 60 bits < P → toujours positif.
//   checksum(partition) = Σ leaf mod P  (addition modulaire : commutative, incrémentale)
//     insert → c = (c + h) mod P ; delete → c = (c - h + P) mod P ; update → -old +new.
//   Stocké en TEXT (décimal canonique de [0,P)) → comparaison Cloud↔LAN par ÉGALITÉ DE
//   CHAÎNE (bigint::text côté Cloud), sans jamais passer par un flottant.
//   Miroir Cloud : supabase_sync_merkle.sql (MÊME formule, figée).

import { createHash } from 'node:crypto';
import { db, tableColumns, tx } from './db.js';
import { getSetting } from './syncFlag.js';

export const P = (1n << 61n) - 1n; // 2305843009213693951

// Tables suivies EN CONTINU (Merkle incrémental). Catégories retenues par Hassan :
// notes, présences/absences, paiements & finance, inscriptions.
export const MERKLE_EXPLICIT = new Set([
  'grades', 'apc_notes', 'prim_notes', 'mat_observations',
  'attendance', 'student_absences',
  'fee_payments', 'student_fees', 'student_fee_items',
  'budget_expenses',
]);

// Seuil d'auto-promotion : une table non explicite qui atteint ce nombre de lignes
// bascule automatiquement en Merkle (sans changement de code). Ajustable via le réglage
// persistant `merkle_auto_rowcount` (table settings) → centralisé et modifiable.
const DEFAULT_AUTO_ROWCOUNT = 100000;
export function autoThreshold() {
  const v = Number(getSetting('merkle_auto_rowcount'));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_AUTO_ROWCOUNT;
}

// Dimensions de partition disponibles, par ordre de descente (les plus sélectives
// d'abord). Column-driven : seules celles réellement présentes sur la table sont
// utilisées → naturellement extensible aux tables auto-promues.
const DIMENSIONS = [
  { scope: 'class',   col: 'class_id' },
  { scope: 'student', col: 'student_id' },
  { scope: 'seq',     col: 'sequence' },
];

db.exec(`CREATE TABLE IF NOT EXISTS sync_merkle (
  scope      TEXT NOT NULL,     -- 'table' | 'class' | 'student' | 'seq'
  part_key   TEXT NOT NULL,     -- '<table>' | '<table>|<value>'
  checksum   TEXT NOT NULL,     -- décimal canonique de [0, P)
  row_count  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, part_key)
)`);

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');

// leaf hash (BigInt dans [0, P)). FORMULE FIGÉE — miroir exact côté Cloud.
export function leaf(table, id, version) {
  const h = BigInt('0x' + md5(`${table}:${id}:${version == null ? '' : version}`).slice(0, 15));
  return h % P;
}

// Dimensions réellement présentes sur la table.
function dimsOf(table) {
  const cols = tableColumns(table);
  return DIMENSIONS.filter((d) => cols.has(d.col));
}

// Ensemble RUNTIME des tables suivies : les explicites + celles auto-promues (seuil).
// Le CHEMIN D'ÉCRITURE consulte ce Set en O(1) (jamais de COUNT par écriture sur une
// petite table). L'ajout d'une table auto-promue se fait via refreshPromotions().
const _tracked = new Set(MERKLE_EXPLICIT);

// Une table est-elle suivie (Merkle) ? Décision O(1) faisant autorité pour la maintenance.
export function isTracked(table) { return _tracked.has(table); }

// Recalcule les auto-promotions : toute table candidate dont le volume atteint le seuil
// bascule en Merkle (ajout au Set + backfill unique). Appelé au démarrage, avant chaque
// audit, et après un import massif — PAS sur le chemin d'écriture. Renvoie les promues.
export function refreshPromotions(candidates = []) {
  const promoted = [];
  const thr = autoThreshold();
  for (const t of candidates) {
    if (_tracked.has(t) || !tableColumns(t).size) continue;
    let n = 0;
    try { n = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get()?.c || 0; } catch { n = 0; }
    if (n >= thr) { _tracked.add(t); backfillTable(t); promoted.push(t); }
  }
  return promoted;
}

// Contributions d'une ligne : (scope, part_key) auxquels son leaf appartient.
function contributions(table, row) {
  if (!row) return [];
  const h = leaf(table, row.id, row.version);
  const out = [{ scope: 'table', part_key: table, h }];
  for (const d of dimsOf(table)) {
    const v = row[d.col];
    if (v != null && v !== '') out.push({ scope: d.scope, part_key: `${table}|${v}`, h });
  }
  return out;
}

const readPart = db.prepare('SELECT checksum, row_count FROM sync_merkle WHERE scope = ? AND part_key = ?');
const upsertPart = db.prepare(`INSERT INTO sync_merkle (scope, part_key, checksum, row_count, updated_at)
  VALUES (?,?,?,?,?) ON CONFLICT(scope, part_key) DO UPDATE SET checksum = excluded.checksum, row_count = excluded.row_count, updated_at = excluded.updated_at`);
const delPart = db.prepare('DELETE FROM sync_merkle WHERE scope = ? AND part_key = ?');

// Applique un delta modulaire à une partition (read-modify-write ; node:sqlite est
// synchrone/sérialisé → pas de course). Purge la partition devenue vide.
function bumpPartition(scope, part_key, deltaBig, dcount, nowIso) {
  const cur = readPart.get(scope, part_key);
  const curSum = cur ? BigInt(cur.checksum) : 0n;
  const next = ((curSum + deltaBig) % P + P) % P;
  const cnt = (cur ? cur.row_count : 0) + dcount;
  if (cnt <= 0 && next === 0n) { if (cur) delPart.run(scope, part_key); return; }
  upsertPart.run(scope, part_key, next.toString(), cnt, nowIso);
}

// Applique la transition d'UNE ligne (oldRow → newRow ; null = absente). Gère insert,
// update (version change), delete, ET un changement de dimension (ligne qui change de
// classe/élève : retirée de l'ancienne partition, ajoutée à la nouvelle).
function applyRowDelta(table, oldRow, newRow, nowIso) {
  const agg = new Map(); // "scope\0key" -> { scope, part_key, delta, dcount }
  const acc = (c, sign) => {
    const k = c.scope + '\0' + c.part_key;
    const e = agg.get(k) || { scope: c.scope, part_key: c.part_key, delta: 0n, dcount: 0 };
    e.delta += sign > 0 ? c.h : -c.h;
    e.dcount += sign;
    agg.set(k, e);
  };
  for (const c of contributions(table, oldRow)) acc(c, -1);
  for (const c of contributions(table, newRow)) acc(c, +1);
  for (const e of agg.values()) bumpPartition(e.scope, e.part_key, e.delta, e.dcount, nowIso);
}

// Colonnes lues pour un snapshot Merkle (id, version + dimensions présentes).
function snapCols(table) {
  const cols = ['id'];
  if (tableColumns(table).has('version')) cols.push('version');
  for (const d of dimsOf(table)) cols.push(d.col);
  return cols;
}

// Snapshot { id -> row } des lignes d'ids donnés (pour calculer les deltas avant/après).
export function snapshotRows(table, ids) {
  const out = new Map();
  if (!ids?.length) return out;
  const cols = snapCols(table).map((c) => `"${c}"`).join(', ');
  const stmt = db.prepare(`SELECT ${cols} FROM "${table}" WHERE id = ?`);
  for (const id of ids) { const r = stmt.get(id); if (r) out.set(String(id), r); }
  return out;
}

// Mode « import massif » : suspend la maintenance par ligne (trop lente pour des
// dizaines de milliers de lignes). L'appelant reconstruit ensuite l'arbre en un bloc
// via backfillAllTracked(). Utilisé par l'appairage initial et la migration.
let _bulk = false;
export function setBulkMode(on) { _bulk = !!on; }

// Maintenance incrémentale à partir de deux snapshots (avant/après) sur un ensemble
// d'ids. À appeler UNIQUEMENT pour une table suivie, DANS la transaction d'écriture.
export function maintainMerkle(table, before, after) {
  if (_bulk || !isTracked(table)) return;
  const nowIso = new Date().toISOString();
  const ids = new Set([...before.keys(), ...after.keys()]);
  for (const id of ids) applyRowDelta(table, before.get(id) || null, after.get(id) || null, nowIso);
}

// Reconstruit intégralement l'arbre d'une table (deploy / promotion / restauration /
// import massif). Streame les lignes (pas de chargement complet en mémoire) et agrège
// en mémoire des partitions (quelques milliers de clés max), puis réécrit d'un bloc.
export function backfillTable(table) {
  if (!tableColumns(table).size) return { table, rows: 0, partitions: 0, skipped: true };
  const nowIso = new Date().toISOString();

  // Agrégation EN MÉMOIRE (lecture streamée : pas de chargement complet des millions
  // de lignes). Chaque partition somme ses leaves.
  const parts = new Map(); // "scope\0key" -> { scope, part_key, sum(BigInt), count }
  const add = (scope, part_key, h) => {
    const k = scope + '\0' + part_key;
    const e = parts.get(k) || { scope, part_key, sum: 0n, count: 0 };
    e.sum = (e.sum + h) % P; e.count += 1; parts.set(k, e);
  };
  const cols = snapCols(table).map((c) => `"${c}"`).join(', ');
  const stmt = db.prepare(`SELECT ${cols} FROM "${table}"`);
  let rows = 0;
  for (const row of stmt.iterate()) {
    rows++;
    for (const c of contributions(table, row)) add(c.scope, c.part_key, c.h);
  }

  // Écriture ATOMIQUE (un seul commit/fsync) : purge de l'ancien sous-arbre + réécriture.
  // Indispensable à l'échelle — sinon des milliers de partitions = des milliers de
  // transactions (synchronous=FULL) → backfill de plusieurs dizaines de secondes.
  tx(() => {
    db.prepare("DELETE FROM sync_merkle WHERE part_key = ? OR part_key LIKE ?").run(table, `${table}|%`);
    const ins = db.prepare('INSERT OR REPLACE INTO sync_merkle (scope, part_key, checksum, row_count, updated_at) VALUES (?,?,?,?,?)');
    for (const e of parts.values()) ins.run(e.scope, e.part_key, (e.sum % P).toString(), e.count, nowIso);
  });
  return { table, rows, partitions: parts.size };
}

// Promotion : garantit que le sous-arbre d'une table suivie existe. Backfill une seule
// fois (si aucune partition 'table' présente). Idempotent, best-effort.
export function ensureTracked(table) {
  if (!isTracked(table)) return false;
  const has = readPart.get('table', table);
  if (!has) backfillTable(table);
  return true;
}

// Reconstruit toutes les tables actuellement suivies (utilisé après import massif /
// restauration / 1re activation). Ne touche jamais les petites tables non suivies.
export function backfillAllTracked() {
  const done = [];
  for (const t of MERKLE_EXPLICIT) { if (tableColumns(t).size) done.push(backfillTable(t)); }
  return done;
}

// ── Lecture de scopes (côté audit LAN) ───────────────────────────────────────────
// Checksum niveau table (Merkle). null si non suivie (l'audit basculera sur le
// contrôle ponctuel md5 de syncVerify).
export function localTableChecksum(table) {
  const r = readPart.get('table', table);
  return r ? { checksum: r.checksum, count: r.row_count } : null;
}

// Partitions d'un scope pour une table, optionnellement filtrées à une liste de clés
// (descente ciblée). Renvoie { part_key(sans préfixe table) -> { checksum, count } }.
export function localScope(table, scope, keys = null) {
  const out = {};
  const prefix = `${table}|`;
  let sql = "SELECT part_key, checksum, row_count FROM sync_merkle WHERE scope = ? AND part_key LIKE ?";
  const rows = db.prepare(sql).all(scope, `${prefix}%`);
  const filter = keys ? new Set(keys.map(String)) : null;
  for (const r of rows) {
    const key = r.part_key.slice(prefix.length);
    if (filter && !filter.has(key)) continue;
    out[key] = { checksum: r.checksum, count: r.row_count };
  }
  return out;
}

// Valeurs distinctes d'une dimension pour une table restreinte à des clés parentes
// (ex. student_id des grades d'une classe donnée) — pour cibler la descente.
export function distinctChildKeys(table, childCol, parentCol, parentKeys) {
  if (!parentKeys?.length || !tableColumns(table).has(childCol) || !tableColumns(table).has(parentCol)) return [];
  const ph = parentKeys.map(() => '?').join(',');
  const rows = db.prepare(`SELECT DISTINCT "${childCol}" k FROM "${table}" WHERE "${parentCol}" IN (${ph}) AND "${childCol}" IS NOT NULL`).all(...parentKeys);
  return rows.map((r) => String(r.k));
}
