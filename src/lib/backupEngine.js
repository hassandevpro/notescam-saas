// Export / restauration complète — moteur IO, indépendant du client.
//
// Reçoit le client en paramètre (supabase-js en cloud, localClient en LAN :
// même interface) → testable de bout en bout contre le vrai serveur SQLite
// (server/_backup_engine.test.mjs) sans navigateur.
//
// Toutes les écritures passent par `client.from(table)` : RLS en cloud,
// garde-fous de query.js en LAN (immuabilité des paiements, cloisonnement…)
// s'appliquent à la restauration comme à n'importe quelle saisie. Une ligne
// refusée par ces règles est COMPTÉE et SIGNALÉE, jamais ignorée en silence.

import {
  splitCatalog, orderTables, buildBundle, validateBundle, planTable, rowKey, chunk,
} from './backupCore.js';

// Colonnes de licence / abonnement : une vieille sauvegarde ne doit jamais
// ramener un ancien plan ou une ancienne date d'expiration.
const PROTECTED_SCHOOL_COLUMNS = /^(plan|license_|licence_|subscription|trial_|billing)/i;

export async function fetchCatalog(client, schoolId) {
  const { data, error } = await client.rpc('backup_catalog', { p_school: schoolId });
  if (error) throw new Error(`Catalogue des tables indisponible : ${error.message}`);
  return Array.isArray(data) ? data : [];
}

// Lecture paginée. On s'arrête sur une page VIDE (pas sur une page « courte ») :
// PostgREST plafonne silencieusement à max-rows, et une page courte ne prouve
// donc pas qu'on a tout lu.
async function fetchAll(client, table, { scopeCol, schoolId, orderCols = [], columns = '*', pageSize = 1000 }) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    let q = client.from(table).select(columns).eq(scopeCol, schoolId);
    // Tri sur TOUTE la clé primaire : avec une clé composite triée sur sa seule
    // première colonne, les ex-aequo rendent la pagination par offset instable
    // (lignes sautées ou dupliquées d'une page à l'autre).
    for (const c of orderCols) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} : ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < pageSize && !orderCols.length) break; // sans ordre stable, pas de pagination fiable
  }
  return out;
}

const scopeOf = (t) => t.scope || (t.table === 'schools' ? 'id' : 'school_id');

export async function exportSchoolData(client, { schoolId, edition, onProgress } = {}) {
  if (!schoolId) throw new Error('École non définie.');
  const catalog = await fetchCatalog(client, schoolId);
  const { included, excluded } = splitCatalog(catalog);
  const order = orderTables(included);
  const byName = new Map(included.map((t) => [t.table, t]));
  const tables = {};
  let done = 0;
  for (const name of order) {
    const t = byName.get(name);
    onProgress?.({ phase: 'export', table: name, done, total: order.length });
    tables[name] = await fetchAll(client, name, {
      scopeCol: scopeOf(t), schoolId, orderCols: t.pk || [],
    });
    done++;
  }
  onProgress?.({ phase: 'export', done, total: order.length });
  return buildBundle({ schoolId, edition, catalog: order.map((n) => byName.get(n)), tables, excluded });
}

function cleanRow(row, { columns, table, forUpdate, now }) {
  const allowed = columns?.length ? new Set(columns) : null;
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (allowed && !allowed.has(k)) continue;              // colonne disparue depuis la sauvegarde
    if (forUpdate && table === 'schools' && PROTECTED_SCHOOL_COLUMNS.test(k)) continue;
    out[k] = v;
  }
  // Les lignes restaurées sont datées de MAINTENANT : sinon la synchronisation
  // (curseur sur updated_at, résolution « le plus récent gagne ») les ignorerait
  // ou les écraserait par l'état — plus récent — qui les avait supprimées.
  if (allowed ? allowed.has('updated_at') : 'updated_at' in out) out.updated_at = now;
  return out;
}

// Écrit un lot ; en cas d'échec, retombe ligne par ligne pour isoler les
// lignes réellement refusées (FK pas encore présente, règle métier…).
async function writeRows(client, table, rows, { upsert, onConflict }) {
  const failed = [];
  let written = 0;
  for (const part of chunk(rows, 200)) {
    const q = upsert ? client.from(table).upsert(part, { onConflict }) : client.from(table).insert(part);
    const { error } = await q;
    if (!error) { written += part.length; continue; }
    for (const row of part) {
      const q1 = upsert ? client.from(table).upsert(row, { onConflict }) : client.from(table).insert(row);
      const r = await q1;
      if (r.error) failed.push({ row, message: r.error.message });
      else written++;
    }
  }
  return { written, failed };
}

/**
 * Restaure une sauvegarde dans l'école courante.
 * @param {'missing'|'overwrite'} mode  'missing' (défaut) : réinsère seulement
 *   ce qui manque. 'overwrite' : remet aussi les lignes existantes à l'état
 *   de la sauvegarde. Dans les deux cas, RIEN n'est supprimé.
 * @param {boolean} dryRun  calcule le plan sans rien écrire (aperçu).
 */
export async function restoreSchoolData(client, bundle, { schoolId, mode = 'missing', dryRun = false, onProgress } = {}) {
  const v = validateBundle(bundle, { schoolId });
  if (!v.ok) return { ok: false, errors: v.errors, tables: {} };

  // Schéma ACTUEL (pas celui de la sauvegarde) : ordre, clés et colonnes
  // valables aujourd'hui. Une table de la sauvegarde absente du schéma actuel
  // est signalée, pas forcée.
  const live = splitCatalog(await fetchCatalog(client, schoolId)).included;
  const byName = new Map(live.map((t) => [t.table, t]));
  const order = orderTables(live).filter((n) => Array.isArray(bundle.tables[n]));
  const unknown = Object.keys(bundle.tables).filter((n) => !byName.has(n) && bundle.tables[n].length);
  const now = new Date().toISOString();

  const report = {};
  const pending = []; // lignes refusées, rejouées après les autres tables
  let i = 0;
  for (const name of order) {
    const t = byName.get(name);
    const pk = t.pk?.length ? t.pk : ['id'];
    onProgress?.({ phase: dryRun ? 'analyse' : 'restore', table: name, done: i++, total: order.length });
    // En mode « écraser », on lit les lignes entières pour ne réécrire que
    // celles qui ont changé ; sinon les clés suffisent.
    const existing = await fetchAll(client, name, {
      scopeCol: scopeOf(t), schoolId, orderCols: pk, columns: mode === 'overwrite' ? '*' : pk.join(','),
    });
    const plan = planTable({
      rows: bundle.tables[name], pk, mode,
      ...(mode === 'overwrite'
        ? { existingRows: new Map(existing.map((r) => [rowKey(r, pk), r])) }
        : { existingKeys: new Set(existing.map((r) => rowKey(r, pk))) }),
    });
    const rep = { inBackup: bundle.tables[name].length, toInsert: plan.insert.length, toUpdate: plan.update.length,
      unchanged: plan.unchanged, inserted: 0, updated: 0, failed: 0, errors: [] };
    report[name] = rep;
    if (dryRun) continue;

    const ins = plan.insert.map((r) => cleanRow(r, { columns: t.columns, table: name, forUpdate: false, now }));
    const upd = plan.update.map((r) => cleanRow(r, { columns: t.columns, table: name, forUpdate: true, now }));
    const a = await writeRows(client, name, ins, { upsert: false });
    const b = await writeRows(client, name, upd, { upsert: true, onConflict: pk.join(',') });
    rep.inserted = a.written; rep.updated = b.written;
    for (const f of a.failed) pending.push({ name, row: f.row, upsert: false, message: f.message, onConflict: pk.join(',') });
    for (const f of b.failed) pending.push({ name, row: f.row, upsert: true, message: f.message, onConflict: pk.join(',') });
  }

  // Rejeu : une ligne refusée faute de parent (auto-référence, cycle de FK)
  // passe souvent une fois les autres tables écrites.
  let rest = pending;
  for (let pass = 0; pass < 2 && rest.length && !dryRun; pass++) {
    const next = [];
    for (const p of rest) {
      const q = p.upsert ? client.from(p.name).upsert(p.row, { onConflict: p.onConflict }) : client.from(p.name).insert(p.row);
      const r = await q;
      if (r.error) next.push({ ...p, message: r.error.message });
      else report[p.name][p.upsert ? 'updated' : 'inserted']++;
    }
    rest = next;
  }
  for (const p of rest) {
    const rep = report[p.name];
    rep.failed++;
    if (rep.errors.length < 5) rep.errors.push(p.message);
  }

  onProgress?.({ phase: dryRun ? 'analyse' : 'restore', done: order.length, total: order.length });
  const sum = (k) => Object.values(report).reduce((a, r) => a + r[k], 0);
  return {
    ok: sum('failed') === 0,
    dryRun, mode,
    errors: [],
    unknownTables: unknown,
    totals: { toInsert: sum('toInsert'), toUpdate: sum('toUpdate'), unchanged: sum('unchanged'),
      inserted: sum('inserted'), updated: sum('updated'), failed: sum('failed') },
    tables: report,
  };
}
