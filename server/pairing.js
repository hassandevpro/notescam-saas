// server/pairing.js
// Rattachement d'un serveur LAN à une école Cloud EXISTANTE via un CODE D'APPAIRAGE
// (parcours industrialisé « Cloud → Hybride »). AUCUN school_id saisi, AUCUN secret
// privilégié sur le PC : le code est échangé contre un JETON SCELLÉ borné à l'école
// par une Edge Function (redeem-pairing-code, service_role confiné au Cloud).
//
// Machine à états FAIL-SAFE (décision Hassan) : on ne bascule en hybride QUE si
//   appairage OK → synchronisation initiale OK → contrôles OK → admin local OK.
// À la moindre erreur : on RESTE en mode Cloud (cloud_sync = 0), on NE planifie PAS
// la synchro, on renvoie l'étape en échec. Aucune bascule « à moitié ».
//
// Ne DUPLIQUE rien : réutilise le jeton scellé + les edges de synchro (H1-H7,
// cloudSync), policyEngine (via la policy migrée dans schools), syncFlag + les
// planificateurs de index.js, et la table migration_state existante.

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, DATA_DIR, deviceId } from './db.js';
import { hashPassword } from './security.js';
import { EDGE_BASE } from './cloudEnv.js';
import { setSetting } from './syncFlag.js';

const TOKEN_PATH = join(DATA_DIR, 'server-token.key');

// Étapes de la machine à états (exposées dans /api/pair/status pour l'assistant).
// `integrity` : contrôle table par table que le LAN est IDENTIQUE au Cloud (comptes +
// checksums). Sans ce feu vert, on NE bascule PAS en hybride (fail-safe renforcé).
export const PAIR_STAGES = ['redeem', 'sync', 'verify', 'integrity', 'admin', 'activate', 'done'];

// ── Dépendances RÉELLES (injectables pour les tests hors-ligne) ────────────────

// 1) Échange le code contre un jeton scellé + school_id via l'Edge (anon). L'Edge
//    seule (service_role) consomme le code et émet le jeton ; le LAN ne voit jamais
//    le service_role ni le school_id AVANT cet échange.
async function edgeRedeem(code, device) {
  const res = await fetch(`${EDGE_BASE}/redeem-pairing-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, device }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.token || !j?.school_id) {
    throw new Error(j?.error?.message || j?.error || `redeem: HTTP ${res.status}`);
  }
  return { token: j.token, schoolId: j.school_id, cloudUrl: j.cloud_url || null };
}

// 2) Synchronisation initiale Cloud → LAN. Réutilise la synchro continue H1-H7
//    (syncOnce : pull via le jeton scellé + sync-pull, LWW) — un premier passage
//    depuis le curseur initial = pull complet de l'école. Import DYNAMIQUE pour ne
//    pas coupler ce module (et ses tests) au planificateur.
//    CHARGEMENT EN MASSE : comme runMigration (migrate.js), on SUSPEND les FK le
//    temps du pull initial (ordre d'insertion et self-références non bloquants), puis
//    on les RÉ-active. Sinon, sur une base vide, les lignes filles arrivent avant
//    leurs parents → « FOREIGN KEY constraint failed » et données perdues.
async function defaultInitialSync() {
  const { syncOnce } = await import('./cloudSync.js');
  const { setBulkMode, backfillAllTracked } = await import('./syncMerkle.js');
  db.exec('PRAGMA foreign_keys = OFF');
  setBulkMode(true); // pull initial massif : pas de maintenance Merkle par ligne
  try {
    // DRAIN complet : sync-pull renvoie des LOTS (curseur). Un seul passage ne tire
    // qu'un lot partiel — on répète jusqu'à ce que plus rien n'arrive, pour que la
    // base locale soit COMPLÈTE avant les contrôles + l'activation hybride.
    let total = 0, last;
    for (let i = 0; i < 200; i++) {
      last = await syncOnce();
      total += last?.pulled || 0;
      if (!last?.pulled) break;
    }
    return { ...(last || {}), pulledTotal: total };
  } finally {
    setBulkMode(false);
    db.exec('PRAGMA foreign_keys = ON');
    // Reconstruit l'arbre de Merkle en UN bloc à partir des données fraîchement tirées,
    // pour que le contrôle d'intégrité (étape `integrity`) soit immédiat et exact.
    try { backfillAllTracked(); } catch (e) { console.warn('[merkle] backfill post-appairage:', e.message); }
  }
}

// 3) Contrôle d'intégrité minimal : l'école est-elle bien arrivée localement ?
function verifyAttached(schoolId) {
  const school = db.prepare('SELECT id, name FROM schools WHERE id = ?').get(schoolId);
  if (!school) throw new Error("Synchronisation initiale incomplète : l'école n'est pas présente localement.");
  const users = db.prepare('SELECT COUNT(*) n FROM school_users WHERE school_id = ?').get(schoolId).n;
  return { school: school.name, school_users: users };
}

// 3-bis) CONTRÔLE D'INTÉGRITÉ COMPLET : le LAN est-il IDENTIQUE au Cloud (chaque
//    table synchronisée : nombre de lignes + checksum) ? Renvoie le rapport ; lève
//    (avec le rapport attaché) si une seule divergence subsiste → pas de bascule.
async function defaultVerifyIntegrity() {
  const { verifyIntegrity } = await import('./syncVerify.js');
  const { recordSyncAudit } = await import('./syncAudit.js');
  const { markVerification } = await import('./syncHealth.js');
  const report = await verifyIntegrity();
  markVerification(report); // publie le rapport de la synchro INITIALE pour l'UI
  recordSyncAudit({ kind: 'verify', ok: report.ok, detail: { trigger: 'pairing', mismatches: report.mismatches, total: report.summary?.total } });
  if (!report.ok) {
    const e = new Error(`Données non identiques au Cloud : ${report.mismatches.length} table(s) divergente(s) (${report.mismatches.join(', ')}).`);
    e.report = report;
    throw e;
  }
  return report;
}

// 4) Crée le compte ADMIN LOCAL de ce serveur (identifiant LOCAL, jamais un secret
//    cloud) + le rattache à l'école en admin. Idempotent sur l'email.
function createLocalAdmin({ email, password, fullName = 'Administrateur' }, schoolId) {
  if (!email || !password || password.length < 6) throw new Error('Admin local : e-mail + mot de passe (≥ 6) requis.');
  const localId = randomUUID();
  db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_confirmed_at)
              VALUES (?,?,?,?,?)
              ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, full_name = excluded.full_name`)
    .run(localId, email, hashPassword(password), fullName, new Date().toISOString());
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  const existing = db.prepare('SELECT id FROM school_users WHERE school_id = ? AND user_id = ?').get(schoolId, uid);
  if (!existing) {
    db.prepare(`INSERT INTO school_users (id, school_id, user_id, role, active)
                VALUES (?,?,?,?,1)`).run(randomUUID(), schoolId, uid, 'admin');
  } else {
    db.prepare(`UPDATE school_users SET role='admin', active=1 WHERE id = ?`).run(existing.id);
  }
  // Rôle de GOUVERNANCE : sans lui, l'admin local n'a AUCUNE permission métier
  // (budget.prepare, etc.) → il ne peut ni créer un budget ni piloter la gouvernance.
  // On lui attribue le rôle de rang le plus élevé du catalogue de l'école (typiquement
  // « fondatrice »), déjà synchronisé avant cette étape. Idempotent, LAN-only.
  try {
    const top = db.prepare(
      "SELECT code FROM governance_roles WHERE school_id = ? AND active = 1 ORDER BY rank DESC LIMIT 1"
    ).get(schoolId);
    if (top && !db.prepare('SELECT 1 FROM user_governance_roles WHERE school_id = ? AND user_id = ? AND role = ?').get(schoolId, uid, top.code)) {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO user_governance_roles (id, school_id, user_id, role, created_at, updated_at, status, version)
                  VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), schoolId, uid, top.code, now, now, 'active', 1);
    }
  } catch { /* pas de catalogue de gouvernance : admin local sans rôle métier (dégradé) */ }
  return uid;
}

// 5) Bascule hybride — RÉUTILISE strictement le chemin d'activation existant
//    (drapeau persistant + planificateurs). Appelé UNIQUEMENT après succès complet.
async function defaultEnableHybrid() {
  setSetting('cloud_sync', '1');
  const { scheduleCloudSync } = await import('./cloudSync.js');
  const { scheduleEventSync } = await import('./eventSync.js');
  const { scheduleDecisionApply } = await import('./governanceApply.js');
  const sync = scheduleCloudSync();
  const events = scheduleEventSync();
  scheduleDecisionApply();
  return { sync, events };
}

function persistAttachment(schoolId, cloudUrl, token, report) {
  if (token) writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  db.prepare(`INSERT INTO migration_state (id, source, school_id, cloud_url, migrated_at, report)
              VALUES (1, 'pairing', ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET source='pairing', school_id=excluded.school_id,
                cloud_url=excluded.cloud_url, migrated_at=excluded.migrated_at, report=excluded.report`)
    .run(schoolId, cloudUrl, new Date().toISOString(), JSON.stringify(report || {}));
}

// ── Orchestrateur ──────────────────────────────────────────────────────────────
// deps injectables : { redeem, initialSync, enableHybrid, verify, makeAdmin, onStage }.
// Renvoie { ok, stage, schoolId, integrity, hybrid, error }.
export async function attachViaPairing({ code, localAdmin }, deps = {}) {
  const redeem = deps.redeem || edgeRedeem;
  const initialSync = deps.initialSync || defaultInitialSync;
  const enableHybrid = deps.enableHybrid || defaultEnableHybrid;
  const verify = deps.verify || verifyAttached;
  const verifyIntegrity = deps.verifyIntegrity || defaultVerifyIntegrity;
  const makeAdmin = deps.makeAdmin || createLocalAdmin;
  const onStage = deps.onStage || (() => {});

  if (!code || !String(code).trim()) return { ok: false, stage: 'redeem', error: 'Code d’appairage requis.' };

  let schoolId = null;
  const device = (() => { try { return deviceId(); } catch { return null; } })();

  // (1) APPAIRAGE — échange du code contre jeton + school_id.
  onStage('redeem');
  let redeemed;
  try {
    redeemed = await redeem(String(code).trim(), device);
    schoolId = redeemed.schoolId;
  } catch (e) {
    // Aucun effet de bord (pas de token écrit) → on reste 100 % Cloud.
    return { ok: false, stage: 'redeem', error: `Appairage refusé : ${e.message}`, hybrid: false };
  }

  // Persiste le jeton + l'état (nécessaire pour la synchro). NE bascule PAS l'hybride.
  setSetting('cloud_sync', '0'); // sécurité : la synchro ne tourne PAS tant que non validée
  persistAttachment(schoolId, redeemed.cloudUrl, redeemed.token, { stage: 'redeemed' });

  // (2) SYNCHRONISATION INITIALE Cloud → LAN.
  onStage('sync');
  try {
    await initialSync();
  } catch (e) {
    return { ok: false, stage: 'sync', schoolId, error: `Synchronisation initiale échouée : ${e.message}`, hybrid: false };
  }

  // (3) CONTRÔLES.
  onStage('verify');
  let integrity;
  try {
    integrity = verify(schoolId);
  } catch (e) {
    return { ok: false, stage: 'verify', schoolId, error: e.message, hybrid: false };
  }

  // (3-bis) CONTRÔLE D'INTÉGRITÉ COMPLET — le LAN doit être IDENTIQUE au Cloud.
  onStage('integrity');
  let integrityReport;
  try {
    integrityReport = await verifyIntegrity(schoolId);
  } catch (e) {
    // Données divergentes (ou Cloud injoignable) → on RESTE en Cloud, pas de bascule.
    return { ok: false, stage: 'integrity', schoolId, integrity, error: e.message, report: e.report || null, hybrid: false };
  }

  // (4) ADMIN LOCAL.
  onStage('admin');
  try {
    if (localAdmin) makeAdmin(localAdmin, schoolId);
  } catch (e) {
    return { ok: false, stage: 'admin', schoolId, error: e.message, hybrid: false };
  }

  // (5) ACTIVATION HYBRIDE — UNIQUEMENT ici, tout le reste ayant réussi.
  onStage('activate');
  try {
    await enableHybrid();
  } catch (e) {
    // La synchro peut échouer à démarrer : on retombe en Cloud sûr (pas de bascule).
    setSetting('cloud_sync', '0');
    return { ok: false, stage: 'activate', schoolId, integrity, error: `Activation hybride échouée : ${e.message}`, hybrid: false };
  }

  onStage('done');
  persistAttachment(schoolId, redeemed.cloudUrl, redeemed.token, { stage: 'done', integrity, verified: true });
  return { ok: true, stage: 'done', schoolId, integrity, report: integrityReport, hybrid: true };
}

// État courant (pour l'assistant) : déjà appairé ? mode ?
export function pairingState() {
  const migrated = existsSync(TOKEN_PATH);
  const row = db.prepare('SELECT source, school_id FROM migration_state WHERE id = 1').get() || null;
  return { migrated, source: row?.source || null, schoolId: row?.school_id || null };
}
