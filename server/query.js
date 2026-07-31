// Moteur de requêtes générique : traduit une opération structurée
// (envoyée par localClient.js) en SQL paramétré SQLite.
//
// Sécurité : table en liste blanche, identifiants quotés, valeurs toujours
// passées en paramètres (jamais d'interpolation) -> pas d'injection SQL.

import { db, ALLOWED_TABLES, quoteIdent, tableColumns, pickColumns, normalizeValue, tx, SYNCED_TABLES, deviceId } from './db.js';
import { randomUUID } from 'node:crypto';
import { guardBudgetExpense, guardBudgetStructure, guardBudgetLine, guardBudgetAllocations } from './budgetGuard.js';
import { emitApprovalRequestForOp } from './governanceApply.js';
import { isTracked, snapshotRows, maintainMerkle } from './syncMerkle.js';

// --- Suivi des changements pour la sync continue (Phase 2) ------------
// Horodate la ligne écrite (updated_at/device_id) pour la résolution LWW.
function stampSync(table, rec) {
  if (!SYNCED_TABLES.has(table)) return;
  const cols = tableColumns(table);
  if (cols.has('updated_at')) rec.updated_at = new Date().toISOString();
  if (cols.has('device_id'))  rec.device_id = deviceId();
}
// Journalise un changement local à pousser. La sync cloud écrit en base SANS
// passer par ici (anti-écho) → seuls les vrais changements locaux sont empilés.
function recordOutbox(table, id, op) {
  if (!SYNCED_TABLES.has(table) || id == null) return;
  db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)')
    .run(table, String(id), op, new Date().toISOString());
}

// Embeds supabase (`schools (*)`) -> clé FK sur la ligne parente.
const EMBED_FK = {
  schools: 'school_id', classes: 'class_id', students: 'student_id',
  subjects: 'subject_id', teachers: 'teacher_id',
};

function parseColumns(columns) {
  // Sépare colonnes scalaires et embeds « table (*) »
  const scalars = [];
  const embeds = [];
  if (!columns || columns === '*') return { scalars: ['*'], embeds };
  // Découpe en respectant les parenthèses
  const parts = columns.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^([a-z_]+)\s*\(/i);
    if (m) {
      const name = m[1];
      embeds.push({ key: name, table: name, fk: EMBED_FK[name] || name.replace(/s$/, '') + '_id' });
    } else {
      scalars.push(part);
    }
  }
  if (!scalars.length) scalars.push('*');
  return { scalars, embeds };
}

function buildWhere(filters = []) {
  const clauses = [];
  const params = [];
  for (const f of filters) {
    const col = quoteIdent(f.col);
    switch (f.op) {
      case 'eq':  clauses.push(`${col} = ?`);  params.push(normalizeValue(f.val)); break;
      case 'neq': clauses.push(`${col} <> ?`); params.push(normalizeValue(f.val)); break;
      case 'gt':  clauses.push(`${col} > ?`);  params.push(normalizeValue(f.val)); break;
      case 'gte': clauses.push(`${col} >= ?`); params.push(normalizeValue(f.val)); break;
      case 'lt':  clauses.push(`${col} < ?`);  params.push(normalizeValue(f.val)); break;
      case 'lte': clauses.push(`${col} <= ?`); params.push(normalizeValue(f.val)); break;
      case 'is':  clauses.push(f.val === null ? `${col} IS NULL` : `${col} IS ?`);
                  if (f.val !== null) params.push(normalizeValue(f.val)); break;
      case 'in': {
        const arr = Array.isArray(f.val) ? f.val : [];
        if (!arr.length) { clauses.push('1 = 0'); break; }
        clauses.push(`${col} IN (${arr.map(() => '?').join(',')})`);
        arr.forEach((v) => params.push(normalizeValue(v)));
        break;
      }
      default: break;
    }
  }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

function resolveEmbeds(rows, embeds) {
  for (const e of embeds) {
    const stmt = db.prepare(`SELECT * FROM ${quoteIdent(e.table)} WHERE id = ?`);
    for (const row of rows) {
      const fkVal = row[e.fk];
      row[e.key] = fkVal ? (stmt.get(fkVal) || null) : null;
    }
  }
  return rows;
}

// --- Non-répudiation + immuabilité de la traçabilité (revue P0 #8) ------
// domain_events / audit_events sont APPEND-ONLY (update/delete refusés) et
// l'acteur (actor_id) est estampillé depuis la SESSION authentifiée (ctx.userId),
// jamais depuis le payload client → un utilisateur ne peut pas forger un event
// au nom d'un autre. Le serveur LAN (JWT) est ici la frontière de confiance, à
// l'image de la fonction SECURITY DEFINER kernel_emit côté Cloud.
const APPEND_ONLY = new Set(['domain_events', 'audit_events']);
function guardAppendOnly(op, ctx) {
  if (!APPEND_ONLY.has(op.table)) return;
  if (op.action === 'update' || op.action === 'delete') {
    throw new Error(`${op.table} est append-only (${op.action} interdit)`);
  }
  if (ctx?.userId && op.values) {
    const stamp = (v) => { if (v && typeof v === 'object') v.actor_id = ctx.userId; };
    if (Array.isArray(op.values)) op.values.forEach(stamp); else stamp(op.values);
  }
}

// --- Opération principale ---------------------------------------------
export function runQuery(op, ctx = null) {
  const { table } = op;
  if (!ALLOWED_TABLES.has(table)) {
    return { error: { message: `Table non autorisée : ${table}` }, data: null };
  }

  try {
    guardAppendOnly(op, ctx);
    guardBudgetExpense(op, ctx);   // enforcement budgétaire serveur (chaîne + workflow + permissions)
    guardBudgetStructure(op);      // P5 : pas de modif silencieuse / d'écriture directe des opérations
    guardBudgetLine(op);           // v3 : activation ligne (config + plafond annuel) + gel
    guardBudgetAllocations(op);    // v3 : gel des allocations d'une ligne active/clôturée
    let result;
    switch (op.action) {
      case 'select': result = doSelect(op); break;
      case 'insert': result = doInsertOrUpsert(op, false); break;
      case 'upsert': result = doInsertOrUpsert(op, true); break;
      case 'update': result = doUpdate(op); break;
      case 'delete': result = doDelete(op); break;
      default: return { error: { message: `Action inconnue : ${op.action}` }, data: null };
    }
    // H3-b : sur une écriture de dépense, émettre la DEMANDE d'approbation distante
    // si la dépense est soumise (mode gouvernance distante). Best-effort strict :
    // ne doit JAMAIS transformer une écriture réussie en erreur.
    if (!result?.error && op.table === 'budget_expenses' && ['insert', 'upsert', 'update'].includes(op.action)) {
      try { emitApprovalRequestForOp(op); } catch (e) { console.warn('[gov] demande d’approbation non émise:', e.message); }
    }
    return result;
  } catch (e) {
    return { error: { message: e.message }, data: null };
  }
}

function doSelect(op) {
  const { table } = op;
  const { scalars, embeds } = parseColumns(op.columns);
  // On sélectionne toujours toutes les colonnes scalaires existantes
  // (l'embed a besoin des FK) puis on projette si nécessaire.
  const selectCols = scalars.includes('*')
    ? '*'
    : Array.from(new Set([...scalars, ...embeds.map((e) => e.fk)]))
        .filter((c) => tableColumns(table).has(c)).map(quoteIdent).join(', ') || '*';

  const where = buildWhere(op.filters);
  let sql = `SELECT ${selectCols} FROM ${quoteIdent(table)}${where.sql}`;

  if (op.order?.length) {
    const ord = op.order
      .filter((o) => tableColumns(table).has(o.col))
      .map((o) => `${quoteIdent(o.col)} ${o.ascending === false ? 'DESC' : 'ASC'}`);
    if (ord.length) sql += ' ORDER BY ' + ord.join(', ');
  }
  if (op.limit != null) sql += ` LIMIT ${Number(op.limit) | 0}`;
  if (op.single) sql += op.limit == null ? ' LIMIT 2' : '';

  let rows = db.prepare(sql).all(...where.params);
  if (embeds.length) rows = resolveEmbeds(rows, embeds);

  if (op.single) {
    if (rows.length === 0) {
      // .single() => erreur, .maybeSingle() => null
      return op.maybeSingle
        ? { data: null, error: null }
        : { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
    }
    if (rows.length > 1 && !op.maybeSingle) {
      return { data: null, error: { message: 'Multiple rows returned' } };
    }
    return { data: rows[0], error: null };
  }
  return { data: rows, error: null };
}

// Cœur insert/upsert SANS transaction propre (réutilisable dans un batch : SQLite
// n'imbrique pas les BEGIN). doInsertOrUpsert l'enveloppe dans tx() pour l'op isolée.
function insertOrUpsertCore(op, isUpsert, inserted = []) {
  const { table } = op;
  const rows = Array.isArray(op.values) ? op.values : [op.values];
  const tracked = isTracked(table); // maintenance Merkle (tables suivies uniquement)
  {
    for (const raw of rows) {
      const rec = pickColumns(table, raw);
      if (!('id' in rec) && tableColumns(table).has('id')) rec.id = randomUUID();
      stampSync(table, rec);
      const cols = Object.keys(rec);
      if (!cols.length) continue;

      const placeholders = cols.map(() => '?').join(', ');
      const colSql = cols.map(quoteIdent).join(', ');
      let sql = `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${placeholders})`;

      if (APPEND_ONLY.has(table)) {
        // Immuabilité stricte : un event/audit déjà présent n'est JAMAIS écrasé
        // (ni par insert ni par upsert) → idempotence du rejeu sans réécriture.
        sql += ` ON CONFLICT(id) DO NOTHING`;
      } else if (isUpsert) {
        const conflict = (op.onConflict || 'id').split(',').map((c) => c.trim());
        const updates = cols
          .filter((c) => !conflict.includes(c))
          .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`);
        sql += ` ON CONFLICT(${conflict.map(quoteIdent).join(', ')}) DO UPDATE SET ${updates.join(', ')}`;
      }
      // Snapshot AVANT (un upsert peut écraser une ligne existante → il faut retirer
      // sa contribution Merkle avant d'ajouter la nouvelle).
      const before = tracked ? snapshotRows(table, [rec.id]) : null;
      db.prepare(sql).run(...cols.map((c) => rec[c]));
      if (tracked) maintainMerkle(table, before, snapshotRows(table, [rec.id]));

      if (op.returning && rec.id) {
        inserted.push(db.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE id = ?`).get(rec.id));
      } else {
        inserted.push(rec);
      }
      recordOutbox(table, rec.id, 'upsert');
    }
  }
  return inserted;
}

function doInsertOrUpsert(op, isUpsert) {
  const inserted = [];
  tx(() => insertOrUpsertCore(op, isUpsert, inserted));
  if (op.single) return { data: inserted[0] ?? null, error: null };
  return { data: op.returning ? inserted : null, error: null };
}

function doUpdate(op) {
  const { table } = op;
  const rec = pickColumns(table, op.values);
  stampSync(table, rec);
  const cols = Object.keys(rec);
  if (!cols.length) return { data: null, error: { message: 'Aucune colonne à mettre à jour' } };

  const where = buildWhere(op.filters);
  let setSql = cols.map((c) => `${quoteIdent(c)} = ?`).join(', ');
  // Rend `version` réellement MONOTONE (revue P0 #4) : chaque modif locale
  // incrémente le compteur, ce qui donne un départage LWW fiable même à
  // horodatage égal (ou en cas d'horloge décalée). Non touché si le payload
  // fixe déjà `version` explicitement.
  if (SYNCED_TABLES.has(table) && tableColumns(table).has('version') && !cols.includes('version')) {
    setSql += `, ${quoteIdent('version')} = COALESCE(${quoteIdent('version')}, 0) + 1`;
  }
  // Ids affectés + snapshot AVANT (capturés sur le prédicat courant, avant l'UPDATE).
  const tracked = isTracked(table);
  let affectedIds = null, before = null;
  if (tracked) {
    affectedIds = db.prepare(`SELECT id FROM ${quoteIdent(table)}${where.sql}`).all(...where.params).map((r) => r.id);
    before = snapshotRows(table, affectedIds);
  }
  const sql = `UPDATE ${quoteIdent(table)} SET ${setSql}${where.sql}`;
  db.prepare(sql).run(...cols.map((c) => rec[c]), ...where.params);
  if (tracked) maintainMerkle(table, before, snapshotRows(table, affectedIds));

  if (SYNCED_TABLES.has(table) && tableColumns(table).has('id')) {
    for (const r of db.prepare(`SELECT id FROM ${quoteIdent(table)}${where.sql}`).all(...where.params)) recordOutbox(table, r.id, 'upsert');
  }

  if (op.returning) {
    const rows = db.prepare(`SELECT * FROM ${quoteIdent(table)}${where.sql}`).all(...where.params);
    return { data: op.single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

function doDelete(op) {
  const { table } = op;
  const where = buildWhere(op.filters);
  if (!where.sql) return { error: { message: 'DELETE sans filtre refusé' }, data: null };
  // Capture les ids supprimés AVANT le DELETE → tombstones dans l'outbox pour
  // propager la suppression au cloud (la ligne disparaît localement, hard delete).
  let deletedIds = [];
  if (SYNCED_TABLES.has(table) && tableColumns(table).has('id')) {
    deletedIds = db.prepare(`SELECT id FROM ${quoteIdent(table)}${where.sql}`).all(...where.params).map((r) => r.id);
  }
  const tracked = isTracked(table);
  const before = tracked ? snapshotRows(table, deletedIds) : null;
  db.prepare(`DELETE FROM ${quoteIdent(table)}${where.sql}`).run(...where.params);
  if (tracked) maintainMerkle(table, before, new Map()); // après = vide → contributions retirées
  for (const id of deletedIds) recordOutbox(table, id, 'delete');
  return { data: null, error: null };
}

// --- Batch atomique (Unit of Work / transactional outbox) -------------
// Applique une LISTE d'ops d'écriture dans UNE SEULE transaction : tout est
// validé, ou rien (rollback). C'est ce qui permet au kernel d'écrire une donnée
// métier ET l'event d'outbox `domain_events` de façon indissociable → un crash
// (coupure secteur) ne peut plus laisser la donnée sans son event. Aucune op de
// lecture ici. Toute erreur d'une op fait échouer et annuler tout le lot.
// Applique une LISTE d'ops d'écriture (mêmes GUARDS que runQuery/runBatch) SANS
// ouvrir de transaction : à appeler DANS une transaction déjà ouverte par l'appelant.
// C'est le point d'entrée que l'applicateur de gouvernance budgétaire (H3b-3) réutilise
// pour appliquer une intention distante par le CHEMIN GUARDÉ (jamais rawUpsert), tout en
// inscrivant l'idempotence + la confirmation dans la MÊME tx atomique. Lève sur violation.
export function runOpsGuarded(ops = [], ctx = null) {
  for (const op of ops) {
    if (!ALLOWED_TABLES.has(op.table)) throw new Error(`Table non autorisée : ${op.table}`);
    guardAppendOnly(op, ctx);
    guardBudgetExpense(op, ctx);   // enforcement budgétaire serveur
    guardBudgetStructure(op);      // P5 : structure/opérations protégées (RPC only)
    guardBudgetLine(op);           // v3 : activation ligne (config + plafond annuel) + gel
    guardBudgetAllocations(op);    // v3 : gel des allocations d'une ligne active/clôturée
    let res;
    switch (op.action) {
      case 'insert': insertOrUpsertCore(op, false); break;
      case 'upsert': insertOrUpsertCore(op, true); break;
      case 'update': res = doUpdate(op); break;   // pas de tx interne
      case 'delete': res = doDelete(op); break;    // pas de tx interne
      default: throw new Error(`Action inconnue : ${op.action}`);
    }
    if (res?.error) throw new Error(res.error.message); // → rollback du lot
  }
}

export function runBatch(ops = [], ctx = null) {
  if (!Array.isArray(ops) || !ops.length) return { data: { applied: 0 }, error: null };
  try {
    tx(() => runOpsGuarded(ops, ctx));
    return { data: { applied: ops.length }, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}
