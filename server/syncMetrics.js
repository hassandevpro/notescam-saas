// server/syncMetrics.js
// Tableau de bord de SANTÉ de la synchronisation hybride (LAN). Agrège des métriques
// bon marché, calculées À LA LECTURE (aucune écriture périodique), pour piloter la
// supervision d'un parc de centaines d'établissements :
//   • temps moyen de réplication ;
//   • nombre d'événements EN ATTENTE (backlog de push, non encore répliqués) ;
//   • âge de la dernière synchro réussie ;
//   • DÉTECTION des synchronisations BLOQUÉES (in-flight trop long, plus de succès
//     depuis longtemps, ou backlog qui ne se draine pas).

import { db } from './db.js';
import { isCloudSyncEnabled } from './syncFlag.js';
import { syncHealth, hybridMode } from './syncHealth.js';
import { avgReplicationMs } from './syncAudit.js';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // cadence planifiée (cf. scheduleCloudSync)

function pendingEvents() {
  try { return db.prepare('SELECT COUNT(*) c FROM sync_outbox').get()?.c || 0; }
  catch { return 0; }
}
// Backlog du JOURNAL d'événements (domain_events d'origine locale pas encore poussés) :
// distinct de sync_outbox (changements de tables). Un push d'events bloqué (ex. lot
// rejeté) laisse ce backlog gonfler → sans ceci, il était INVISIBLE dans la santé.
function pendingEventLog() {
  try {
    const cur = Number(db.prepare("SELECT value FROM sync_cursor WHERE name = 'event_push_rowid'").get()?.value || 0);
    return db.prepare('SELECT COUNT(*) c FROM domain_events WHERE replicated_from IS NULL AND rowid > ?').get(cur)?.c || 0;
  } catch { return 0; }
}
// Lignes distantes en attente de REJEU (upsert de pull ayant échoué : FK/dérive).
// Un backlog non nul = des données du Cloud pas encore intégrées → à remonter.
function pendingPullRetry() {
  try { return db.prepare('SELECT COUNT(*) c FROM sync_pull_retry').get()?.c || 0; }
  catch { return 0; }
}
function ageMs(iso) { return iso ? Math.max(0, Date.now() - new Date(iso).getTime()) : null; }

// Détecte une synchro BLOQUÉE (ne progresse plus alors qu'elle devrait). Renvoie
// { stuck, reason }.
function detectStuck(enabled, h, pending) {
  if (!enabled) return { stuck: false, reason: null };
  const attemptAge = ageMs(h.lastAttemptAt);
  const successAge = ageMs(h.lastSuccessAt);
  // (1) Un cycle est « en vol » depuis anormalement longtemps (≥ 3 min).
  if (h.inFlight && attemptAge != null && attemptAge > 3 * 60 * 1000) return { stuck: true, reason: 'cycle_en_cours_trop_long' };
  // (2) Aucune synchro réussie depuis > 3 intervalles (réseau/edge/jeton en panne).
  if (successAge == null && attemptAge != null && attemptAge > 3 * SYNC_INTERVAL_MS) return { stuck: true, reason: 'aucun_succes' };
  if (successAge != null && successAge > 3 * SYNC_INTERVAL_MS) return { stuck: true, reason: 'succes_trop_ancien' };
  // (3) Backlog qui ne se draine pas : des événements en attente ET pas de succès récent.
  if (pending > 0 && successAge != null && successAge > 2 * SYNC_INTERVAL_MS) return { stuck: true, reason: 'backlog_non_draine' };
  return { stuck: false, reason: null };
}

export function syncMetrics() {
  const enabled = isCloudSyncEnabled();
  const h = syncHealth();
  const pendingTables = pendingEvents();
  const pendingEventLogN = pendingEventLog();
  const pendingPullRetryN = pendingPullRetry();
  const pending = pendingTables + pendingEventLogN + pendingPullRetryN; // en attente, tous canaux
  const { stuck, reason } = detectStuck(enabled, h, pending);
  return {
    enabled,
    mode: hybridMode(enabled, h),
    pendingEvents: pending,
    pendingTables,
    pendingEventLog: pendingEventLogN,
    pendingPullRetry: pendingPullRetryN,
    avgReplicationMs: avgReplicationMs(20),
    lastSuccessAt: h.lastSuccessAt,
    lastSuccessAgeMs: ageMs(h.lastSuccessAt),
    lastAttemptAt: h.lastAttemptAt,
    lastPulled: h.lastPulled,
    lastPushed: h.lastPushed,
    inFlight: h.inFlight,
    lastError: h.lastError,
    lastVerifyAt: h.lastVerifyAt,
    lastVerifyOk: h.lastVerifyOk,
    lastMismatches: h.lastMismatches,
    // Rapport de synchronisation AUTOMATIQUE (métriques + empreinte globale + verdict),
    // publié après chaque cycle → l'UI l'affiche sans action de l'admin.
    lastReport: h.lastReport,
    stuck,
    stuckReason: reason,
    intervalMs: SYNC_INTERVAL_MS,
  };
}
