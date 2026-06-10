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
import { hashPassword, verifyPassword, signToken, verifyToken, verifyLicenseKey, licensingEnabled } from './security.js';
import { runQuery } from './query.js';
import { runRpc } from './rpc.js';
import { scheduleBackups, runBackup } from './backup.js';

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
  if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
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
  return { data: { activation: row, school, licensing_enabled: licensingEnabled() }, error: null };
});

app.post('/api/license/activate', (req, reply) => {
  const { license_key } = req.body || {};
  const res = verifyLicenseKey(license_key);
  if (!res.ok) return reply.code(400).send({ data: null, error: { message: `Licence invalide : ${res.reason}` } });
  db.prepare(`INSERT INTO license_activation (id, license_key, payload, activated_at)
              VALUES (1, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET license_key=excluded.license_key, payload=excluded.payload, activated_at=excluded.activated_at`)
    .run(license_key, JSON.stringify(res.payload), new Date().toISOString());
  // Reporte plan / expiration sur l'école si déjà créée
  const school = getSchool();
  if (school && res.payload) {
    db.prepare('UPDATE schools SET plan = COALESCE(?, plan), license_status = ?, license_expires_at = ? WHERE id = ?')
      .run(res.payload.plan || null, 'active', res.payload.expires_at || null, school.id);
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
    console.log(`\n  NotesCam LAN — http://localhost:${PORT}`);
    console.log(`  Accessible sur le réseau : http://<IP-du-PC>:${PORT}`);
    console.log(`  Données : ${DATA_DIR}\n`);
  } catch (err) {
    console.error('Échec démarrage serveur :', err);
    process.exit(1);
  }
};
start();
