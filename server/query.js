// Moteur de requêtes générique : traduit une opération structurée
// (envoyée par localClient.js) en SQL paramétré SQLite.
//
// Sécurité : table en liste blanche, identifiants quotés, valeurs toujours
// passées en paramètres (jamais d'interpolation) -> pas d'injection SQL.

import { db, ALLOWED_TABLES, quoteIdent, tableColumns, pickColumns, normalizeValue, tx } from './db.js';
import { randomUUID } from 'node:crypto';

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

// --- Opération principale ---------------------------------------------
export function runQuery(op) {
  const { table } = op;
  if (!ALLOWED_TABLES.has(table)) {
    return { error: { message: `Table non autorisée : ${table}` }, data: null };
  }

  try {
    switch (op.action) {
      case 'select': return doSelect(op);
      case 'insert': return doInsertOrUpsert(op, false);
      case 'upsert': return doInsertOrUpsert(op, true);
      case 'update': return doUpdate(op);
      case 'delete': return doDelete(op);
      default: return { error: { message: `Action inconnue : ${op.action}` }, data: null };
    }
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

function doInsertOrUpsert(op, isUpsert) {
  const { table } = op;
  const rows = Array.isArray(op.values) ? op.values : [op.values];
  const inserted = [];

  tx(() => {
    for (const raw of rows) {
      const rec = pickColumns(table, raw);
      if (!('id' in rec) && tableColumns(table).has('id')) rec.id = randomUUID();
      const cols = Object.keys(rec);
      if (!cols.length) continue;

      const placeholders = cols.map(() => '?').join(', ');
      const colSql = cols.map(quoteIdent).join(', ');
      let sql = `INSERT INTO ${quoteIdent(table)} (${colSql}) VALUES (${placeholders})`;

      if (isUpsert) {
        const conflict = (op.onConflict || 'id').split(',').map((c) => c.trim());
        const updates = cols
          .filter((c) => !conflict.includes(c))
          .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`);
        sql += ` ON CONFLICT(${conflict.map(quoteIdent).join(', ')}) DO UPDATE SET ${updates.join(', ')}`;
      }
      db.prepare(sql).run(...cols.map((c) => rec[c]));

      if (op.returning && rec.id) {
        inserted.push(db.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE id = ?`).get(rec.id));
      } else {
        inserted.push(rec);
      }
    }
  });

  if (op.single) return { data: inserted[0] ?? null, error: null };
  return { data: op.returning ? inserted : null, error: null };
}

function doUpdate(op) {
  const { table } = op;
  const rec = pickColumns(table, op.values);
  const cols = Object.keys(rec);
  if (!cols.length) return { data: null, error: { message: 'Aucune colonne à mettre à jour' } };

  const where = buildWhere(op.filters);
  const setSql = cols.map((c) => `${quoteIdent(c)} = ?`).join(', ');
  const sql = `UPDATE ${quoteIdent(table)} SET ${setSql}${where.sql}`;
  db.prepare(sql).run(...cols.map((c) => rec[c]), ...where.params);

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
  db.prepare(`DELETE FROM ${quoteIdent(table)}${where.sql}`).run(...where.params);
  return { data: null, error: null };
}
