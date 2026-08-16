// NotesCam — Serveur édition LAN (hors-ligne).
// Sert la SPA React compilée + une API qui remplace Supabase (Postgres+Auth+
// RLS+RPC+Storage) par SQLite local. Démarre en service Windows au boot.

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, createReadStream, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { db, getSchool, DATA_DIR } from './db.js';
import { hashPassword, verifyPassword, signToken, verifyToken, verifyLicenseKey, licensingEnabled, machineFingerprint, machineFingerprints } from './security.js';
import { runQuery, runBatch } from './query.js';
import { runRpc } from './rpc.js';
import { scheduleBackups, runBackup } from './backup.js';
import { runMigration } from './migrate.js';
import { mirrorToCloud, flushMirrorQueue, credentialPublicKey, publishCredentialKey } from './authBridge.js';
import { signupCloud, verifyCloud, runCloudActivation, getActivation } from './activateCloud.js';
import { scheduleCloudSync, syncOnce } from './cloudSync.js';
import { scheduleEventSync } from './eventSync.js';
import { scheduleDecisionApply } from './governanceApply.js';
import { setSetting, isCloudSyncEnabled } from './syncFlag.js';
import { syncHealth, hybridMode } from './syncHealth.js';
import { attachViaPairing, pairingState } from './pairing.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './cloudEnv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const FILES_DIR = process.env.NOTESCAM_FILES_DIR || join(DATA_DIR, 'files');
mkdirSync(FILES_DIR, { recursive: true });

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';   // écoute sur tout le LAN

const app = Fastify({ bodyLimit: 25 * 1024 * 1024 }); // 25 Mo (logos, templates)

// Corps binaire pour les uploads de fichiers (images, PDF).
for (const ct of ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'application/pdf', 'application/octet-stream']) {
  app.addContentTypeParser(ct, { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
}

// --- Auth middleware : extrait userId du Bearer token -----------------
function authOf(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  return { userId: payload?.sub || null, payload };
}
function userRow(id) {
  return db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(id) || null;
}
function sessionFor(user) {
  const token = signToken({ sub: user.id, email: user.email });
  return { access_token: token, token_type: 'bearer', user: { id: user.id, email: user.email, user_metadata: { full_name: user.full_name } } };
}

// ====================== AUTH ==========================================
app.post('/api/auth/signup', (req, reply) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password) return reply.code(400).send({ error: { message: 'Email et mot de passe requis' } });
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (exists) return reply.code(409).send({ error: { message: 'User already registered' } });
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash, full_name, email_confirmed_at) VALUES (?,?,?,?,?)')
    .run(id, email, hashPassword(password), full_name || null, new Date().toISOString());
  const user = userRow(id);
  return { data: { user: sessionFor(user).user, session: sessionFor(user) }, error: null };
});

app.post('/api/auth/login', (req, reply) => {
  const { email, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email || '');
  if (!row || !verifyPassword(password, row.password_hash))
    return reply.code(401).send({ error: { message: 'Invalid login credentials' } });
  // Clair disponible : on s'assure que le cloud a le MÊME mot de passe (fire-and-forget,
  // ne bloque jamais la connexion ; échec → file chiffrée rejouée plus tard).
  mirrorToCloud(row.id, row.email, password).catch(() => {});
  return { data: { session: sessionFor(row), user: sessionFor(row).user }, error: null };
});

app.get('/api/auth/me', (req) => {
  const { userId } = authOf(req);
  const user = userId ? userRow(userId) : null;
  if (!user) return { data: { user: null, session: null }, error: null };
  return { data: { user: sessionFor(user).user, session: sessionFor(user) }, error: null };
});

app.post('/api/auth/update', (req, reply) => {
  const { userId } = authOf(req);
  if (!userId) return reply.code(401).send({ error: { message: 'Not authenticated' } });
  const { password, full_name } = req.body || {};
  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
    const u = userRow(userId);
    mirrorToCloud(userId, u?.email, password).catch(() => {}); // garde le cloud identique
  }
  if (full_name != null) db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(full_name, userId);
  return { data: { user: sessionFor(userRow(userId)).user }, error: null };
});

// ====================== DB GÉNÉRIQUE ==================================
app.post('/api/db', (req, reply) => {
  const { userId } = authOf(req);
  if (!userId) return reply.code(401).send({ error: { message: 'Not authenticated' }, data: null });
  const result = runQuery(req.body || {}, { userId });
  return result;
});

// Batch atomique (Unit of Work / transactional outbox du kernel) : applique une
// liste d'ops d'écriture dans UNE transaction (tout ou rien). Utilisé par
// localClient.batch() → kernel driver.commit().
app.post('/api/db/batch', (req, reply) => {
  const { userId } = authOf(req);
  if (!userId) return reply.code(401).send({ error: { message: 'Not authenticated' }, data: null });
  return runBatch((req.body || {}).ops || [], { userId });
});

// ====================== RPC ===========================================
const PUBLIC_RPCS = new Set(['get_parent_portal_data']);
app.post('/api/rpc/:name', (req, reply) => {
  const { name } = req.params;
  const { userId } = authOf(req);
  if (!userId && !PUBLIC_RPCS.has(name))
    return reply.code(401).send({ error: { message: 'Not authenticated' }, data: null });
  return runRpc(name, req.body || {}, { userId });
});

// ====================== STORAGE (fichiers) ============================
const SAFE = (s) => String(s).replace(/[^a-zA-Z0-9._/-]/g, '_').replace(/\.\.+/g, '_');

// Upload : corps brut, chemin = /api/files/:bucket/<path>
app.put('/api/files/:bucket/*', (req, reply) => {
  const { userId } = authOf(req);
  if (!userId) return reply.code(401).send({ error: { message: 'Not authenticated' } });
  const bucket = SAFE(req.params.bucket);
  const rel = SAFE(req.params['*']);
  const full = join(FILES_DIR, bucket, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, req.body);
  return { data: { path: `${bucket}/${rel}` }, error: null };
});

app.delete('/api/files/:bucket/*', (req, reply) => {
  const { userId } = authOf(req);
  if (!userId) return reply.code(401).send({ error: { message: 'Not authenticated' } });
  const full = join(FILES_DIR, SAFE(req.params.bucket), SAFE(req.params['*']));
  try { if (existsSync(full)) unlinkSync(full); } catch { /* ignore */ }
  return { data: {}, error: null };
});

// ====================== LICENCE (activation offline) ==================
app.get('/api/license', () => {
  const row = db.prepare('SELECT * FROM license_activation WHERE id = 1').get() || null;
  const school = getSchool();
  // licensing_enabled = false -> l'app ne bloque pas (installation non provisionnée)
  // machine_id = empreinte de CETTE machine, à communiquer à l'éditeur pour
  // obtenir une licence verrouillée (node-locked).
  return { data: { activation: row, school, licensing_enabled: licensingEnabled(), machine_id: machineFingerprint() }, error: null };
});

// Messages d'erreur d'activation lisibles par école.
const LICENSE_ERR = {
  no_public_key:    'Cette installation n’attend pas de licence.',
  malformed:        'Clé de licence mal formée.',
  bad_signature:    'Clé de licence invalide (signature incorrecte).',
  expired:          'Cette licence a expiré.',
  machine_mismatch: 'Cette licence est verrouillée sur une autre machine. Vérifiez l’identifiant machine et demandez une clé pour ce poste.',
  error:            'Clé de licence illisible.',
};

app.post('/api/license/activate', (req, reply) => {
  const { license_key } = req.body || {};
  const candidates = machineFingerprints();
  const res = verifyLicenseKey(license_key, { machineIds: candidates });
  if (!res.ok) {
    // Sur un refus de verrou machine, on affiche les DEUX identifiants : sans
    // ça le support ne peut pas distinguer « mauvaise clé » de « empreinte du
    // poste qui a changé », les deux donnant exactement le même message.
    const detail = res.reason === 'machine_mismatch'
      ? ` (clé émise pour ${res.payload?.machine_id} — ce poste : ${candidates[0]})`
      : '';
    return reply.code(400).send({ data: null, error: { message: (LICENSE_ERR[res.reason] || `Licence invalide : ${res.reason}`) + detail } });
  }
  const here = res.machineId || candidates[0];
  db.prepare(`INSERT INTO license_activation (id, license_key, payload, activated_at, machine_id)
              VALUES (1, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET license_key=excluded.license_key, payload=excluded.payload, activated_at=excluded.activated_at, machine_id=excluded.machine_id`)
    .run(license_key, JSON.stringify(res.payload), new Date().toISOString(), here);
  // Reporte plan / expiration sur l'école si déjà créée
  const school = getSchool();
  if (school && res.payload) {
    // Filet de sécurité : normalise la casse du plan (une licence historique « Pro »
    // serait sinon stockée telle quelle et traitée comme Starter, clé non reconnue
    // côté app). Un nom hors liste est journalisé mais conservé tel quel.
    const VALID_PLANS = new Set(['starter', 'ecole', 'pro', 'reseau']);
    const plan = res.payload.plan ? String(res.payload.plan).trim().toLowerCase() : null;
    if (plan && !VALID_PLANS.has(plan)) console.warn(`[license] plan non reconnu: « ${res.payload.plan} » (traité comme Starter par l'app).`);
    db.prepare('UPDATE schools SET plan = COALESCE(?, plan), license_status = ?, license_expires_at = ? WHERE id = ?')
      .run(plan, 'active', res.payload.expires_at || null, school.id);
  }
  return { data: { payload: res.payload }, error: null };
});

// ====================== BACKUP (déclenchement manuel) =================
// JAMAIS bloquée en désynchro (filet de sécurité) — mais renvoyée MARQUÉE « urgence ».
app.post('/api/backup', async (req, reply) => {
  const { userId } = authOf(req);
  const m = userId && db.prepare('SELECT role FROM school_users WHERE user_id = ? AND active = 1').get(userId);
  if (!m || m.role !== 'admin') return reply.code(403).send({ error: { message: 'Admin requis' } });
  const res = await runBackup();
  return { data: res, error: null };
});

// Liste des sauvegardes + drapeau d'urgence (l'outil de restauration prévient si la
// sauvegarde provient d'un état non synchronisé + propose un contrôle d'intégrité).
app.get('/api/backup/list', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  const { listBackups } = await import('./backup.js');
  return { data: listBackups(), error: null };
});

// État de PARITÉ Cloud ↔ LAN (pour l'UI + les gardes update/version/restauration).
app.get('/api/sync/parity', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  const { parityStatus } = await import('./parityGate.js');
  return { data: parityStatus(), error: null };
});

// ====================== MISE À JOUR (OTA — fondations) ================
// Version courante (publique : utile aux scripts + à l'UI, aucune donnée sensible).
app.get('/api/version', async () => {
  const { currentVersion } = await import('./updateService.js');
  return { data: { version: currentVersion() }, error: null };
});

// PRÉ-VOL de mise à jour pour le script d'installation (localhost, sans auth) : verdict
// de parité STRICTEMENT MINIMAL — booléens + COMPTE uniquement, JAMAIS les noms de tables
// (L3 : pas de divulgation d'information sur un endpoint non authentifié). Le détail
// (tables divergentes) reste réservé à l'admin via /api/sync/parity.
app.get('/api/update/preflight', async () => {
  const { parityStatus } = await import('./parityGate.js');
  const st = parityStatus();
  return { data: { ok: st.ok, applicable: st.applicable, desync: st.desync, mismatchCount: (st.mismatches || []).length }, error: null };
});

// Statut de mise à jour : disponibilité + GARDE DE PARITÉ (allowed=false si Cloud≠LAN).
app.get('/api/update/status', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  try {
    const { updateStatus } = await import('./updateService.js');
    return { data: await updateStatus(), error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// Réglage de la mise à jour AUTOMATIQUE : état détaillé (pourquoi elle n'a pas
// encore eu lieu) et interrupteur. Le « pourquoi » compte autant que l'état :
// sans lui, une école voit « à jour » sans savoir qu'elle attend la fenêtre de
// maintenance, la parité, ou une clé de publication.
app.get('/api/update/auto', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  try {
    const m = await import('./updateInstaller.js');
    return { data: {
      enabled:    m.autoUpdateEnabled(),
      configured: m.releaseSigningConfigured(),
      inWindow:   m.inMaintenanceWindow(),
      idle:       m.serverIdle(),
    }, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

app.post('/api/update/auto', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  try {
    const { setAutoUpdate, autoUpdateEnabled } = await import('./updateInstaller.js');
    setAutoUpdate(req.body?.enabled !== false);
    return { data: { enabled: autoUpdateEnabled() }, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// Déclenche la mise à jour — BLOQUÉE (409 + tables divergentes) si désynchro.
app.post('/api/update/apply', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  try {
    const { applyUpdate } = await import('./updateService.js');
    return { data: await applyUpdate(), error: null };
  } catch (e) {
    if (e.blocked) return reply.code(409).send({ error: { message: e.message, parity: e.parity, blocked: true } });
    return reply.code(400).send({ error: { message: e.message } });
  }
});

// ====================== MIGRATION CLOUD → LOCAL/LAN ===================
// Provisioning initial uniquement : disponible tant qu'aucune école n'existe et
// qu'aucune migration n'a été faite. Une fois la base peuplée, l'endpoint se
// ferme (la re-synchronisation passe par le pont/sync, pas par un ré-import).
function migrationOpen() {
  const done = db.prepare('SELECT 1 FROM migration_state WHERE id = 1').get();
  const hasSchool = db.prepare('SELECT 1 FROM schools LIMIT 1').get();
  return !done && !hasSchool;
}

app.get('/api/migrate/status', () => {
  const row = db.prepare('SELECT * FROM migration_state WHERE id = 1').get() || null;
  return { data: { open: migrationOpen(), state: row }, error: null };
});

app.post('/api/migrate/cloud', async (req, reply) => {
  if (!migrationOpen()) return reply.code(409).send({ error: { message: 'Migration déjà effectuée ou base non vide.' } });
  const { email, password, localPassword } = req.body || {};
  try {
    // URL + clé anon par défaut depuis l'env du serveur (cloudCfg) → l'école ne
    // saisit que ses identifiants cloud dans l'assistant.
    const res = await runMigration({ ...cloudCfg(req.body), email, password, localPassword });
    return { data: res, error: null };
  } catch (e) {
    return reply.code(400).send({ error: { message: e.message } });
  }
});

// ── APPAIRAGE (parcours industrialisé « Cloud → Hybride ») ──────────────────────
// L'installateur saisit un CODE d'appairage (généré côté Cloud dans les Paramètres
// de l'école). Le serveur l'échange contre un jeton scellé + school_id via l'Edge,
// fait la synchro initiale, contrôle, crée l'admin local, puis — SI tout réussit —
// bascule en hybride. Aucun school_id saisi, aucun secret privilégié sur le PC.
app.get('/api/pair/status', () => ({ data: pairingState(), error: null }));

app.post('/api/pair/redeem', async (req, reply) => {
  if (!migrationOpen()) return reply.code(409).send({ error: { message: 'Base non vide : appairage impossible sur ce serveur.' } });
  const { code, localAdmin } = req.body || {};
  try {
    const res = await attachViaPairing({ code, localAdmin });
    if (!res.ok) return reply.code(400).send({ error: { message: res.error, stage: res.stage } });
    return { data: res, error: null };
  } catch (e) {
    return reply.code(400).send({ error: { message: e.message } });
  }
});

// ── Mode HYBRIDE (Cloud ↔ LAN) — activation EN QUELQUES CLICS depuis l'app ──────
// Remplace la variable d'environnement NOTESCAM_CLOUD_SYNC + le lanceur dédié :
// l'admin active/désactive la synchro Cloud continue + le drain des intentions
// distantes depuis les Paramètres. Nécessite que l'école ait été MIGRÉE (jeton scellé).
function hybridState() {
  const migrated = existsSync(join(DATA_DIR, 'server-token.key'));
  const row = db.prepare('SELECT school_id, cloud_url FROM migration_state WHERE id = 1').get() || null;
  const enabled = isCloudSyncEnabled();
  // Politique de déploiement répliquée depuis le Cloud (finance LAN-first + gouvernance
  // distante) : présente = l'école est configurée hybride côté Cloud. Distinct de
  // `enabled` (la synchro tourne-t-elle sur CE serveur). L'UI a besoin des deux.
  let policy = null;
  try { policy = db.prepare('SELECT deployment_policy FROM schools LIMIT 1').get()?.deployment_policy || null; } catch { /* pré-migration */ }
  const health = syncHealth();
  return {
    enabled, migrated,
    schoolId: row?.school_id || null,
    cloudUrl: row?.cloud_url || null,
    policy,
    health,
    mode: hybridMode(enabled, health),
  };
}
app.get('/api/hybrid/status', () => ({ data: hybridState(), error: null }));

app.post('/api/hybrid/enable', (req, reply) => {
  const st = hybridState();
  if (!st.migrated) {
    return reply.code(409).send({ error: { message: "L'école n'est pas encore migrée depuis le Cloud (jeton absent). Faites d'abord « Migrer depuis le Cloud »." } });
  }
  setSetting('cloud_sync', '1');
  // Démarre immédiatement (sans redémarrage du serveur).
  const sync = scheduleCloudSync();
  const events = scheduleEventSync();
  scheduleDecisionApply();
  return { data: { ...hybridState(), syncStarted: sync, eventsStarted: events }, error: null };
});

app.post('/api/hybrid/disable', () => {
  setSetting('cloud_sync', '0');
  return { data: hybridState(), error: null };
});

// Clé publique RSA de CE serveur : l'app cloud l'utilise pour chiffrer les
// changements de mot de passe (sens Cloud → Local du pont d'identifiants).
app.get('/api/credential/pubkey', () => {
  return { data: { public_key: credentialPublicKey() }, error: null };
});

// ====================== ACTIVATION CLOUD (LOCAL FIRST) ===============
// Réservée à l'admin connecté de l'école locale.
function requireLocalAdmin(req, reply) {
  const { userId } = authOf(req);
  const m = userId && db.prepare('SELECT role FROM school_users WHERE user_id = ? AND active = 1').get(userId);
  if (!m || m.role !== 'admin') { reply.code(403).send({ error: { message: 'Admin requis' } }); return null; }
  return userId;
}
function cloudCfg(body = {}) {
  return {
    url: body.url || SUPABASE_URL,
    anonKey: body.anonKey || SUPABASE_ANON_KEY,
  };
}

// Étape 1 : création du compte cloud (e-mail de vérification envoyé).
app.post('/api/activate-cloud/signup', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  const { email, password } = req.body || {};
  try {
    const res = await signupCloud({ ...cloudCfg(req.body), email, password });
    return { data: res, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// Étape 2 : l'e-mail est-il vérifié (connexion cloud possible) ?
app.post('/api/activate-cloud/verify', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  const { email, password } = req.body || {};
  try {
    const res = await verifyCloud({ ...cloudCfg(req.body), email, password });
    return { data: res, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// Étapes 3-6 : analyse → provision → poussée → activation (reprise sûre).
app.post('/api/activate-cloud/run', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  const { email, password } = req.body || {};
  try {
    const res = await runCloudActivation({ ...cloudCfg(req.body), email, password });
    return { data: res, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// État + journal de migration (pour l'assistant : progression / reprise).
app.get('/api/activate-cloud/status', (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  const state = getActivation();
  const push = db.prepare('SELECT tablename, pushed, total, done FROM cloud_push_state').all();
  return { data: { state, push }, error: null };
});

// ====================== SYNC : DRY-RUN (sans écriture) ===============
// Calcule et journalise ce qui SERAIT poussé/tiré, sans rien écrire (ni base,
// ni outbox, ni curseurs, ni cloud). Sert à valider la sync avant de l'activer.
app.post('/api/sync/dry-run', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  try {
    const res = await syncOnce({ dryRun: true });
    return { data: res, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// ====================== SYNC : CONTRÔLE D'INTÉGRITÉ ==================
// Contrôle LOURD (comptes + checksums TABLE PAR TABLE), réservé À LA DEMANDE de
// l'admin / après une restauration (l'appairage le fait déjà). PAS exécuté en
// fonctionnement normal : la synchro continue est purement incrémentale. Alimente
// l'écran « État de synchronisation » + la santé (HYBRIDE_MISMATCH si divergence).
app.get('/api/sync/verify', async (req, reply) => {
  const userId = requireLocalAdmin(req, reply); if (!userId) return;
  try {
    const { verifyIntegrity } = await import('./syncVerify.js');
    const { markVerification } = await import('./syncHealth.js');
    const { recordSyncAudit } = await import('./syncAudit.js');
    const report = await verifyIntegrity();
    markVerification(report);
    recordSyncAudit({ kind: 'verify', ok: report.ok, actor: userId, ip: req.ip, tables: report.summary?.total, hash: report.globalChecksum?.lan, report, detail: { trigger: 'ondemand', mismatches: report.mismatches } });
    return { data: report, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// AUTO-RÉPARATION à la demande : répare uniquement les partitions divergentes puis
// re-publie le rapport. Ne relance JAMAIS une synchro complète.
app.post('/api/sync/repair', async (req, reply) => {
  const userId = requireLocalAdmin(req, reply); if (!userId) return;
  try {
    const { autoRepair } = await import('./syncRepair.js');
    const { markVerification } = await import('./syncHealth.js');
    const { recordSyncAudit } = await import('./syncAudit.js');
    const res = await autoRepair();
    if (res?.report) markVerification(res.report);
    recordSyncAudit({ kind: 'repair', ok: res.ok, actor: userId, ip: req.ip, hash: res.report?.globalChecksum?.lan, report: res.report, detail: { trigger: 'manual', rounds: res.rounds, partitions: res.repaired.length } });
    return { data: { ok: res.ok, rounds: res.rounds, repaired: res.repaired, report: res.report }, error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// Journal d'audit PERSISTANT de la synchro (cycles incrémentaux + contrôles + erreurs).
app.get('/api/sync/audit', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  try {
    const { listSyncAudit } = await import('./syncAudit.js');
    return { data: listSyncAudit(req.query?.limit), error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// Tableau de bord de SANTÉ : métriques + événements en attente + temps moyen de
// réplication + détection des synchronisations bloquées. Bon marché (lecture seule).
app.get('/api/sync/health', async (req, reply) => {
  if (!requireLocalAdmin(req, reply)) return;
  try {
    const { syncMetrics } = await import('./syncMetrics.js');
    return { data: syncMetrics(), error: null };
  } catch (e) { return reply.code(400).send({ error: { message: e.message } }); }
});

// ====================== STATIC + SPA fallback =========================
if (existsSync(DIST_DIR)) {
  app.register(fastifyStatic, { root: DIST_DIR, prefix: '/' });
  app.register(fastifyStatic, { root: FILES_DIR, prefix: '/files/', decorateReply: false });

  // Toute route non-API et non-fichier -> index.html (routing React côté client)
  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api') || req.url.startsWith('/files')) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const html = join(DIST_DIR, 'index.html');
    const stream = createReadStream(html);
    reply.type('text/html').send(stream);
  });
} else {
  app.get('/', () => ({ status: 'ok', note: 'dist/ absent — lance `npm run build:lan` pour servir la SPA' }));
}

// ====================== BOOT ==========================================
const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    scheduleBackups(2);
    // Rejoue la file de miroir des mots de passe (Local → Cloud) au boot puis
    // périodiquement : converge dès que le cloud redevient joignable, sans bloquer.
    flushMirrorQueue().catch(() => {});
    setInterval(() => { flushMirrorQueue().catch(() => {}); }, 10 * 60 * 1000).unref();
    // Publie la clé publique de ce serveur (sens Cloud → Local) — best-effort.
    publishCredentialKey().catch(() => {});
    // Sync continue LAN ↔ Cloud (Phase 2) — gated : NOTESCAM_CLOUD_SYNC=1 + jeton présent.
    if (scheduleCloudSync()) console.log('  Sync continue LAN ↔ Cloud : activée');
    // H3-a : réplication du journal d'événements (transport du canal de gouvernance).
    // Même gate. INERTE tant que rien ne consomme les événements (H3-b appliquera).
    if (scheduleEventSync()) console.log('  Réplication domain_events LAN ↔ Cloud : activée');
    // H3-b : application des décisions distantes (approbation/refus). No-op tant que
    // l'école n'est pas en mode gouvernance financière distante (deployment_policy).
    if (scheduleDecisionApply()) console.log('  Application des décisions distantes : planifiée (inerte hors mode distant)');
    // Mise à jour automatique (OTA). Inerte tant qu'aucune clé publique de
    // publication n'est livrée avec l'installation : l'école reste alors sur
    // l'installeur manuel, exactement comme avant. Jamais bloquant au démarrage.
    try {
      const { startAutoUpdate } = await import('./updateInstaller.js');
      startAutoUpdate({ everyHours: 6 });
    } catch (e) { console.log('  Mise à jour automatique indisponible :', e.message); }
    console.log(`\n  NotesCam LAN — http://localhost:${PORT}`);
    console.log(`  Accessible sur le réseau : http://<IP-du-PC>:${PORT}`);
    console.log(`  Données : ${DATA_DIR}\n`);
  } catch (err) {
    console.error('Échec démarrage serveur :', err);
    process.exit(1);
  }
};
start();
