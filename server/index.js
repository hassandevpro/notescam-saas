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
import { hashPassword, verifyPassword, signToken, verifyToken, verifyLicenseKey, licensingEnabled, machineFingerprint } from './security.js';
import { runQuery } from './query.js';
import { runRpc } from './rpc.js';
import { scheduleBackups, runBackup } from './backup.js';
import { runMigration } from './migrate.js';
import { mirrorToCloud, flushMirrorQueue, credentialPublicKey, publishCredentialKey } from './authBridge.js';
import { signupCloud, verifyCloud, runCloudActivation, getActivation } from './activateCloud.js';
import { scheduleCloudSync, syncOnce } from './cloudSync.js';

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
  const result = runQuery(req.body || {});
  return result;
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
  const here = machineFingerprint();
  const res = verifyLicenseKey(license_key, { machineId: here });
  if (!res.ok) {
    return reply.code(400).send({ data: null, error: { message: LICENSE_ERR[res.reason] || `Licence invalide : ${res.reason}` } });
  }
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
app.post('/api/backup', async (req, reply) => {
  const { userId } = authOf(req);
  const m = userId && db.prepare('SELECT role FROM school_users WHERE user_id = ? AND active = 1').get(userId);
  if (!m || m.role !== 'admin') return reply.code(403).send({ error: { message: 'Admin requis' } });
  const path = await runBackup();
  return { data: { path }, error: null };
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
  const { url, anonKey, email, password, localPassword } = req.body || {};
  try {
    const res = await runMigration({ url, anonKey, email, password, localPassword });
    return { data: res, error: null };
  } catch (e) {
    return reply.code(400).send({ error: { message: e.message } });
  }
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
    url: body.url || process.env.VITE_SUPABASE_URL,
    anonKey: body.anonKey || process.env.VITE_SUPABASE_ANON_KEY,
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
    console.log(`\n  NotesCam LAN — http://localhost:${PORT}`);
    console.log(`  Accessible sur le réseau : http://<IP-du-PC>:${PORT}`);
    console.log(`  Données : ${DATA_DIR}\n`);
  } catch (err) {
    console.error('Échec démarrage serveur :', err);
    process.exit(1);
  }
};
start();
