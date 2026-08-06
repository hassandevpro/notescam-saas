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
import { db, DATA_DIR, SYNCED_TABLES, tableColumns, normalizeValue, deviceId, tx } from './db.js';
import { EDGE_BASE } from './cloudEnv.js';
import { isCloudSyncEnabled } from './syncFlag.js';
import { markSyncStart, markSyncSuccess, markSyncError, markVerification } from './syncHealth.js';
import { recordSyncAudit } from './syncAudit.js';
import { isTracked, snapshotRows, maintainMerkle } from './syncMerkle.js';
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
  // Modules additionnels renvoyés par sync-pull (étaient IGNORÉS ici → données
  // absentes côté LAN). Ordre FK : parents avant enfants.
  'governance_roles', 'user_governance_roles', 'governance_role_history',
  'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance', 'hr_career_events',
  'fee_catalog', 'student_fee_items',
  'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  'signalement_comments', 'signalement_history',
  'notifications', 'notification_outbox',
  'attendance', 'student_absences', 'student_class_assignments',
  // Vie scolaire (discipline) — uniformité LAN↔Cloud des données élèves.
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions',
  'student_warnings', 'student_detentions', 'parent_meetings', 'exit_permissions',
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

// Upsert direct (anti-écho : n'alimente PAS sync_outbox). Exporté pour l'auto-réparation
// (server/syncRepair.js) : applique une ligne distante autoritaire + maintient le Merkle.
export function rawUpsert(table, row) {
  const cols = tableColumns(table);
  const rec = {};
  for (const [k, v] of Object.entries(row)) if (cols.has(k)) rec[k] = normalizeValue(v);
  if (!('id' in rec)) return false;
  // Robustesse Cloud→LAN : des lignes cloud réelles ont created_at/updated_at NULL
  // alors que ces colonnes d'audit sont NOT NULL côté LAN → sans ceci, la ligne est
  // REJETÉE (perte de données : students, governance_roles…). On défaute au « maintenant »
  // (neutre pour LWW : une valeur null équivalait déjà à epoch 0). Sans effet sur les
  // lignes déjà horodatées.
  const nowIso = new Date().toISOString();
  if (cols.has('created_at') && rec.created_at == null) rec.created_at = nowIso;
  if (cols.has('updated_at') && rec.updated_at == null) rec.updated_at = nowIso;
  const keys = Object.keys(rec);
  const ph = keys.map(() => '?').join(', ');
  const upd = keys.filter((c) => c !== 'id').map((c) => `"${c}" = excluded."${c}"`).join(', ');
  const sql = `INSERT INTO "${table}" (${keys.map((c) => `"${c}"`).join(', ')}) VALUES (${ph})`
    + (upd ? ` ON CONFLICT(id) DO UPDATE SET ${upd}` : ' ON CONFLICT(id) DO NOTHING');
  // Maintenance Merkle de l'écriture RÉPLIQUÉE (dans la tx atomique du pull) : retirer
  // la contribution de l'ancienne ligne locale, ajouter celle de la ligne distante.
  const tracked = isTracked(table);
  const before = tracked ? snapshotRows(table, [rec.id]) : null;
  try { db.prepare(sql).run(...keys.map((c) => rec[c])); }
  catch (e) { console.warn(`[sync] upsert ${table} ignoré: ${e.message}`); return false; }
  if (tracked) maintainMerkle(table, before, snapshotRows(table, [rec.id]));
  return true;
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
  if (!res.ok || !j) {
    // On attache le CORPS parsé à l'erreur : sans ça, un refus métier explicite du
    // Cloud (ex. `rebuild_required`) se réduit à un « HTTP 409 » opaque et l'admin
    // n'a aucun moyen de savoir quoi faire. Cf. l'incident du jeton désaligné, où
    // un 401 générique a fait passer un problème d'appairage pour une panne réseau.
    const err = new Error(j?.error ? `${path}: ${j.error}` : `${path}: HTTP ${res.status}`);
    err.status = res.status;
    err.body = j;
    throw err;
  }
  return j;
}

// --- File de rejeu du pull (anti-perte silencieuse) ------------------
// Quand rawUpsert échoue (FK parent absent, dérive de schéma…), le curseur avance
// quand même (progrès) MAIS la ligne est mise en attente ici et REJOUÉE aux cycles
// suivants (le parent peut arriver, la colonne être ajoutée). Best-effort : ne lève
// jamais (une file cassée ne doit pas casser la synchro).
function recordPullRetry(table, row) {
  try {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO sync_pull_retry (tablename, row_id, row_json, attempts, first_seen, last_at)
                VALUES (?,?,?,1,?,?)
                ON CONFLICT(tablename, row_id) DO UPDATE SET
                  row_json = excluded.row_json, attempts = attempts + 1, last_at = excluded.last_at`)
      .run(table, String(row.id), JSON.stringify(row), now, now);
  } catch (e) { console.warn(`[sync] rejeu non enregistré ${table}/${row?.id}: ${e.message}`); }
}
function dropPullRetry(table, id) {
  try { db.prepare('DELETE FROM sync_pull_retry WHERE tablename = ? AND row_id = ?').run(table, String(id)); } catch { /* best-effort */ }
}
// Rejoue les lignes précédemment sautées, dans l'ordre des tables (parents avant
// enfants). Respecte LWW : ne réécrit jamais une version locale plus récente (une
// ligne supersédée par un pull ultérieur est simplement retirée de la file).
function retryPendingPull() {
  for (const table of PULL_ORDER) {
    let rows;
    try { rows = db.prepare('SELECT row_id, row_json FROM sync_pull_retry WHERE tablename = ?').all(table); }
    catch { return; }                       // table pas encore créée (vieux schéma) → no-op
    for (const r of rows) {
      let row; try { row = JSON.parse(r.row_json); } catch { dropPullRetry(table, r.row_id); continue; }
      const local = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(r.row_id);
      if (local && !remoteWins(local, row)) { dropPullRetry(table, r.row_id); continue; } // supersédé localement
      if (rawUpsert(table, row)) dropPullRetry(table, r.row_id);
      else { try { db.prepare('UPDATE sync_pull_retry SET attempts = attempts + 1, last_at = ? WHERE tablename = ? AND row_id = ?').run(new Date().toISOString(), table, r.row_id); } catch { /* best-effort */ } }
    }
  }
}

// --- Pull : cloud → local --------------------------------------------
// En `dryRun`, l'appel sync-pull (lecture seule côté cloud) est fait pour
// calculer les décisions LWW, mais RIEN n'est écrit ni les curseurs avancés.
async function pull(edge, dryRun) {
  const j = await edge('sync-pull', { since: cursor('pull_at'), tomb_since: cursor('tomb_at') });
  const rows = j?.rows || {};
  const plan = { apply: [], keepLocal: [], remove: [], keepLocalVsDelete: [] };
  const policy = currentPolicy();

  // Application d'un lot de pull. En dry-run : ne fait QUE construire le plan (aucune
  // écriture). En réel : appelée DANS une transaction (voir plus bas) pour que lignes
  // + tombstones + avancement des curseurs soient ATOMIQUES — une coupure secteur en
  // plein lot ⇒ rollback complet + rejeu propre au cycle suivant (curseur non avancé).
  const applyBatch = () => {
    // Anti-perte silencieuse : rejouer d'abord les lignes précédemment sautées
    // (un parent/colonne manquant a pu arriver depuis) AVANT d'appliquer le lot.
    if (!dryRun) retryPendingPull();
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
        // Échec d'upsert (FK/dérive) → NE PAS perdre : mise en file de rejeu (le
        // curseur avance quand même, mais la ligne sera ré-appliquée aux cycles suivants).
        if (!dryRun && !rawUpsert(table, row)) recordPullRetry(table, row);
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
        if (!dryRun) {
          const trackedT = isTracked(t.tablename);
          const beforeT = trackedT ? snapshotRows(t.tablename, [t.row_id]) : null;
          try { db.prepare(`DELETE FROM "${t.tablename}" WHERE id = ?`).run(t.row_id); } catch { /* FK : ignore */ }
          if (trackedT) maintainMerkle(t.tablename, beforeT, new Map());
        }
      } else {
        plan.keepLocalVsDelete.push({ table: t.tablename, id: t.row_id });
      }
    }
    // Curseurs avancés DANS la même transaction que les écritures : jamais d'avance
    // de curseur sans les données correspondantes (ni l'inverse).
    if (!dryRun) { setCursor('pull_at', j?.cursor); setCursor('tomb_at', j?.tomb_cursor); }
  };

  if (dryRun) applyBatch();  // aucune écriture : construit seulement le plan
  else tx(applyBatch);       // ATOMIQUE : lignes + tombstones + curseurs (tout ou rien)

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
  let p, pullError = null, rebuildRequired = null;
  try {
    p = await pull(edge, dryRun);
  } catch (e) {
    // RECONSTRUCTION REQUISE : le Cloud a purgé des tombstones que ce LAN n'avait
    // pas consommés → il ignore des suppressions et ses lignes locales
    // correspondantes ressusciteraient au push. On NE POUSSE SURTOUT PAS : on
    // arrête le cycle et on remonte une consigne explicite à l'admin.
    // (Un push « pour ne pas bloquer » serait ici exactement le bug de La Réussite.)
    if (e?.body?.error === 'rebuild_required') {
      rebuildRequired = {
        reason: e.body.reason || 'tombstones_purged',
        tombSince: e.body.tomb_since ?? null,
        purgedBefore: e.body.purged_before ?? null,
        message: e.body.message
          || 'Reconstruction du LAN depuis le Cloud requise (suppressions manquées).',
      };
      const res = {
        dryRun, at: new Date().toISOString(),
        pulled: 0, deleted: 0, pushed: 0,
        pullPlan: { apply: [], keepLocal: [], remove: [], keepLocalVsDelete: [] },
        pushPlan: [], pullError: e.message, rebuildRequired,
      };
      if (dryRun) journalDryRun(res);
      return res;
    }
    if (!dryRun) throw e;  // hors dry-run, un échec de pull interrompt le cycle
    pullError = e.message; // en dry-run, on rapporte quand même la poussée (offline OK)
    p = { pulled: 0, deleted: 0, plan: { apply: [], keepLocal: [], remove: [], keepLocalVsDelete: [] } };
  }
  const q = await push(edge, dryRun);

  const res = {
    dryRun, at: new Date().toISOString(),
    pulled: p.pulled, deleted: p.deleted, pushed: q.pushed,
    pullPlan: p.plan, pushPlan: q.planned, pullError, rebuildRequired,
  };
  if (dryRun) journalDryRun(res);
  return res;
}

// Cycle de synchro RÉEL (planifié) instrumenté pour la santé hybride. `syncOnce`
// reste pur (utilisé tel quel par les tests + le dry-run) : la santé n'est
// mesurée que pour les cycles effectivement joués par le planificateur.
// Cycle NORMAL = strictement INCRÉMENTAL et event-driven : push du seul lot d'outbox
// + pull des seules lignes changées depuis le curseur (keyset). AUCUN checksum global
// ici — le contrôle d'intégrité lourd est réservé à l'appairage / après restauration /
// à la demande de l'admin (cf. syncVerify.js), pour tenir la charge à des centaines
// d'établissements et des millions de lignes.
async function runScheduledSync() {
  markSyncStart();
  const t0 = Date.now();
  try {
    const r = await syncOnce();
    markSyncSuccess(r);
    // RAPPORT DE SYNCHRO AUTOMATIQUE après CHAQUE cycle : compare Cloud ↔ LAN et
    // publie le rapport (métriques + empreinte globale + verdict) pour l'UI, sans
    // action de l'admin. Léger (`promote:false`) : lecture O(1) de l'arbre de Merkle
    // maintenu + descente seulement sur divergence → aucun rescan global. Best-effort :
    // ne transforme jamais une synchro réussie en erreur. Import dynamique (anti-cycle).
    let report = null;
    try {
      const { verifyIntegrity } = await import('./syncVerify.js');
      report = await verifyIntegrity({ promote: false });
      markVerification(report);
      if (!report.ok) {
        // AUTO-RÉPARATION : ne JAMAIS relancer une synchro complète — répare seulement
        // les partitions divergentes, puis re-publie le rapport. Best-effort.
        try {
          const { autoRepair } = await import('./syncRepair.js');
          const rep = await autoRepair();
          if (rep?.report) { report = rep.report; markVerification(report); }
        } catch (re) { console.warn('[sync] auto-réparation indisponible:', re.message); }
      }
    } catch (ve) { console.warn('[sync] rapport d’intégrité indisponible:', ve.message); }
    // Une seule entrée d'audit ENRICHIE par cycle (état de parité + empreinte + rapport).
    recordSyncAudit({
      kind: 'sync', pushed: r.pushed, pulled: r.pulled, deleted: r.deleted,
      duration_ms: Date.now() - t0, ok: report ? report.ok : true,
      rows: (r.pushed || 0) + (r.pulled || 0), tables: report?.summary?.total ?? null,
      hash: report?.globalChecksum?.lan ?? null, report: report || null,
    });
    return r;
  } catch (e) {
    markSyncError(e);
    recordSyncAudit({ kind: 'error', duration_ms: Date.now() - t0, ok: false, detail: { message: e.message } });
    throw e;
  }
}

let _timer = null;
export function scheduleCloudSync(intervalMs = 5 * 60 * 1000) {
  if (!isCloudSyncEnabled() || !serverToken()) return false;
  runScheduledSync().catch((e) => console.error('[sync] échec initial:', e.message));
  _timer = setInterval(() => { runScheduledSync().catch((e) => console.error('[sync] échec:', e.message)); }, intervalMs);
  _timer.unref?.();
  return true;
}
