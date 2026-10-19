// server/syncRepair.js
// AUTO-RÉPARATION ciblée Cloud ↔ LAN. À partir des DIVERGENCES localisées par l'audit
// hiérarchique (syncVerify.js), on répare UNIQUEMENT les partitions concernées — jamais
// de resynchronisation complète — puis on re-hashe/compare jusqu'à parité (ou maxRounds).
//
// Pour chaque partition divergente :
//   1. tirer les lignes CLOUD autoritaires de la partition (edge sync-repair) — révèle
//      les deux sens (lignes présentes d'un seul côté) ;
//   2. réconcilier en LWW : appliquer le distant qui gagne (rawUpsert, anti-écho +
//      maintien Merkle), empiler dans l'outbox les lignes locales plus récentes/absentes
//      côté Cloud (poussées ensuite) ;
//   3. pousser (syncOnce) puis RE-AUDITER (léger) ; recommencer si ça diverge encore.
//
// Convergence garantie par le LWW (updated_at → version → device_id) : les deux bases
// tendent vers le même état, sans jamais perdre la donnée la plus récente.

import { db, tx } from './db.js';
import { EDGE_BASE } from './cloudEnv.js';
import { serverToken, remoteWins, rawUpsert, syncOnce, adaptRemoteRow } from './cloudSync.js';
import { recordSyncAudit } from './syncAudit.js';
import { isTracked, snapshotRows, maintainMerkle } from './syncMerkle.js';

const BATCH = 5000;

// Transport edge sync-repair (injectable pour les tests).
async function defaultRepairEdge({ table, by, keys }) {
  const token = serverToken();
  if (!token) throw new Error('no_server_token');
  const res = await fetch(`${EDGE_BASE}/sync-repair`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, by, keys }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) {
    // Le CORPS porte le motif réel (`bad_table`, `bad_by`, ou le message Postgres :
    // table `sync_tombstones` absente du projet cloud, id non-UUID dans le lot…).
    // Sans lui, l'école ne voyait qu'un « HTTP 400 » muet, impossible à diagnostiquer
    // à distance — exactement le défaut déjà corrigé dans cloudSync.edgeFetch.
    const err = new Error(`sync-repair ${table}/${by}: ${j?.error || `HTTP ${res.status}`}`);
    err.status = res.status;
    err.body = j;
    throw err;
  }
  return j;
}

function enqueue(table, id) {
  try { db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)').run(table, String(id), 'upsert', new Date().toISOString()); }
  catch { /* best-effort */ }
}
const ts = (v) => Date.parse(v || 0) || 0;

// Suppression locale d'une ligne (RESPECT d'une suppression Cloud) + maintien du Merkle.
function localDelete(table, id) {
  const tracked = isTracked(table);
  const before = tracked ? snapshotRows(table, [id]) : null;
  try { db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id); } catch { /* FK : ignore */ }
  if (tracked) maintainMerkle(table, before, new Map());
}

// Réconcilie une partition : `cloudRows` = lignes Cloud autoritaires, `localRows` = lignes
// locales du même scope, `tombs` = Map(id → deleted_at) des suppressions Cloud pour les
// ids présents SEULEMENT en LAN. Applique le distant gagnant ; pour une ligne locale
// absente du Cloud : si le Cloud l'a SUPPRIMÉE (tombstone ≥ dernière modif locale) →
// suppression locale (M1) ; sinon → création locale à pousser. À appeler DANS une tx.
function reconcile(table, cloudRows, localRows, tombs = new Map()) {
  const cloudById = new Map(cloudRows.map((r) => [String(r.id), r]));
  const localById = new Map(localRows.map((r) => [String(r.id), r]));
  const applied = [], pushed = [], deleted = [];
  for (const [id, crow] of cloudById) {
    const lrow = localById.get(id);
    if (!lrow || remoteWins(lrow, crow)) { if (rawUpsert(table, adaptRemoteRow(table, crow))) applied.push(id); }
    else { enqueue(table, id); pushed.push(id); }        // local plus récent → à pousser
  }
  for (const [id, lrow] of localById) {
    if (cloudById.has(id)) continue;
    const delAt = tombs.get(id);
    // M1 : une suppression Cloud au moins aussi récente que la dernière modif locale
    // GAGNE → on supprime localement (au lieu de ressusciter la ligne au Cloud).
    if (delAt && ts(lrow.updated_at) <= ts(delAt)) { localDelete(table, id); deleted.push(id); }
    else { enqueue(table, id); pushed.push(id); }        // vraie création locale non poussée
  }
  return { applied, pushed, deleted };
}

// Tombstones Cloud pour un lot d'ids (correctif M1). Map(id → deleted_at).
//
// NON BLOQUANT. Les tombstones sont un RAFFINEMENT : ils disent qu'une ligne
// présente seulement en LAN a été supprimée au Cloud, et évitent de la ressusciter.
// Sans eux, le repli est la branche sûre — la ligne est poussée au Cloud, donc
// conservée. Une erreur ici (table `sync_tombstones` absente du projet cloud,
// lot d'ids refusé par PostgREST…) ne doit donc PAS faire échouer la réparation.
//
// C'est le blocage observé en production : un seul HTTP 400 sur
// `fee_payments/tombstones` remontait jusqu'à autoRepair, qui abandonnait avant
// d'avoir réparé la moindre table — à chaque cycle, indéfiniment. Le journal
// n'affichait que « auto-réparation indisponible », ce qui était vrai au sens le
// plus large : aucune table n'était réparée, pas même celles sans le moindre souci.
//
// Le lot part en paramètre d'URL côté Cloud (`row_id=in.(…)`) : au-delà de quelques
// centaines d'ids la requête dépasse la longueur admise et revient en HTTP 400, pour
// TOUTES les lignes du lot. On découpe donc ici. (Le filtrage des ids non-UUID, lui,
// est fait côté Cloud : c'est là que le type `uuid` de `row_id` est connu.)
const TOMB_CHUNK = 200;

async function fetchTombstones(repairEdge, table, ids) {
  const m = new Map();
  for (let i = 0; i < ids.length; i += TOMB_CHUNK) {
    const lot = ids.slice(i, i + TOMB_CHUNK);
    let tombstones;
    try { ({ tombstones } = await repairEdge({ table, by: 'tombstones', keys: lot })); }
    catch (e) {
      console.warn(`[sync] tombstones ${table} indisponibles (${e.message}) — réparation poursuivie, les lignes locales seront poussées`);
      return m;                            // ce qui a été obtenu reste exploitable
    }
    for (const t of tombstones || []) m.set(String(t.row_id), t.deleted_at);
  }
  return m;
}
const localOnlyIds = (cloudRows, localRows) => {
  const cloud = new Set(cloudRows.map((r) => String(r.id)));
  return localRows.filter((r) => !cloud.has(String(r.id))).map((r) => String(r.id));
};

// Répare une partition (élève/classe) : fetch Cloud + tombstones + reconcile.
async function repairScope(repairEdge, table, by, key) {
  const col = by === 'student' ? 'student_id' : 'class_id';
  const keys = Array.isArray(key) ? key : [key];
  const { rows: cloudRows } = await repairEdge({ table, by, keys });
  const ph = keys.map(() => '?').join(',');
  const localRows = db.prepare(`SELECT * FROM "${table}" WHERE "${col}" IN (${ph})`).all(...keys);
  const tombs = await fetchTombstones(repairEdge, table, localOnlyIds(cloudRows, localRows));
  let res;
  tx(() => { res = reconcile(table, cloudRows, localRows, tombs); });
  return res;
}

// Répare une table entière (petite table de config, ou table suivie SANS dimension) :
// fetch de toute la table Cloud (borné) + tombstones → reconcile complet des deux sens.
async function repairWholeTable(repairEdge, table) {
  let cloudRows = [];
  try { cloudRows = (await repairEdge({ table, by: 'all', keys: [] })).rows || []; }
  catch (e) { if (/too_many_rows|413/.test(e.message)) return { applied: [], pushed: [], deleted: [], skipped: 'too_large' }; throw e; }
  const localRows = db.prepare(`SELECT * FROM "${table}" LIMIT ${BATCH}`).all();
  const tombs = await fetchTombstones(repairEdge, table, localOnlyIds(cloudRows, localRows));
  let res;
  tx(() => { res = reconcile(table, cloudRows, localRows, tombs); });
  return res;
}

// Auto-réparation complète. deps injectables (tests hors-ligne) :
//   verify()  → lance l'audit léger (défaut : verifyIntegrity({promote:false})) ;
//   sync()    → pousse l'outbox + tire (défaut : syncOnce()) ;
//   repairEdge({table,by,keys}) → lignes Cloud d'une partition (défaut : edge sync-repair) ;
//   maxRounds → nombre de passes de réparation avant abandon (défaut 3).
export async function autoRepair(deps = {}) {
  const repairEdge = deps.repairEdge || defaultRepairEdge;
  const sync = deps.sync || (() => syncOnce());
  const verify = deps.verify || (async () => (await import('./syncVerify.js')).verifyIntegrity({ promote: false }));
  const maxRounds = deps.maxRounds ?? 3;

  let report = await verify();
  const out = { rounds: 0, repaired: [], failed: [], ok: report.ok, report };
  if (report.ok) return out;

  for (let round = 0; round < maxRounds && !report.ok; round++) {
    out.rounds++;
    for (const table of report.mismatches) {
      // ISOLATION PAR TABLE : une table que le Cloud refuse (schéma non migré,
      // colonne absente, lot rejeté…) ne doit pas empêcher la réparation des autres.
      // Sans ce try, la PREMIÈRE table en erreur faisait remonter l'exception jusqu'à
      // l'appelant et aucune des suivantes n'était traitée — un défaut localisé sur
      // `fee_payments` paralysait la réparation de l'école entière.
      try {
        const div = (report.divergences || []).find((d) => d.table === table);
        if (div && !div.tableOnly && div.classes?.length) {
          for (const c of div.classes) {
            const r = c.students?.length
              ? await repairScope(repairEdge, table, 'student', c.students)
              : await repairScope(repairEdge, table, 'class', c.class_id);
            out.repaired.push({ table, class: c.class_id, applied: r.applied.length, pushed: r.pushed.length, deleted: r.deleted.length });
          }
        } else {
          const r = await repairWholeTable(repairEdge, table);
          out.repaired.push({ table, whole: true, applied: r.applied.length, pushed: r.pushed.length, deleted: (r.deleted || []).length, skipped: r.skipped });
        }
      } catch (e) {
        console.warn(`[sync] réparation ${table} impossible: ${e.message}`);
        out.failed.push({ table, error: e.message });
      }
    }
    // Pousse les lignes locales gagnantes/absentes au Cloud + tire le distant → converge.
    try { await sync(); } catch { break; /* réseau indisponible : on s'arrête proprement */ }
    report = await verify();
  }

  out.ok = report.ok;
  out.report = report;
  recordSyncAudit({ kind: 'auto-repair', ok: report.ok, detail: { rounds: out.rounds, partitions: out.repaired.length, mismatches: report.mismatches, repaired: out.repaired, failed: out.failed } });
  return out;
}
