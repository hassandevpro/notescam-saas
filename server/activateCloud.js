// server/activateCloud.js
// ETL Local/LAN (SQLite) → Cloud (Supabase) — scénario « LOCAL FIRST ».
//
// Une école vendue en local peut être convertie en cloud SANS recréer son
// établissement : on PRÉSERVE les identifiants (upsert par id) → aucun doublon,
// et le pont d'identifiants déjà en place conserve les mots de passe.
//
// Découpage (l'assistant SPA pilote ces étapes via /api/activate-cloud/*) :
//   1-2. signupCloud()  : crée le compte cloud admin + e-mail de vérification.
//        verifyCloud()  : attend la confirmation e-mail (connexion possible).
//   3-6. runCloudActivation() : analyse SQLite → provision du tenant (école +
//        comptes via fonction edge, service_role confinée au cloud) → poussée
//        des données par lots (idempotente, REPRISE après interruption) →
//        activation. Journal de migration + progression à chaque étape.
//
// Le client Supabase est importé DYNAMIQUEMENT (migration réelle) ou injecté
// via `clientFactory` (tests sans réseau ni dépendance).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, tableColumns, DATA_DIR } from './db.js';

const TOKEN_PATH = join(DATA_DIR, 'server-token.key');
const EDGE_BASE = (process.env.VITE_SUPABASE_URL || '');
const CHUNK = 500;

// Tables de données poussées vers le cloud (ordre FK). On EXCLUT :
//   - users / school_users  : gérées par la fonction edge (auth + memberships) ;
//   - country_education_config / evaluation_system : config GLOBALE déjà en cloud ;
//   - tables locales (license_activation, migration_state, pwd_mirror_queue, …).
const PUSH_ORDER = [
  'academic_periods', 'classes', 'subjects', 'students', 'teachers', 'grades',
  'student_fees', 'fee_payments', 'attendance', 'student_absences',
  'student_class_assignments', 'school_messages', 'teacher_notifications',
  'sequence_dates', 'timetable_slots',
];

const log = (cb, phase, detail = {}) => { try { cb?.({ phase, ...detail }); } catch { /* ignore */ } };

// --- Journal de migration (persisté → consultable + reprise) ----------
function appendLog(line) {
  const stamp = new Date().toISOString();
  const row = db.prepare('SELECT log FROM cloud_activation WHERE id = 1').get();
  const prev = row?.log || '';
  db.prepare('UPDATE cloud_activation SET log = ? WHERE id = 1').run(`${prev}${stamp}  ${line}\n`);
}
function setPhase(phase, patch = {}) {
  const cols = Object.keys(patch);
  const sets = ['phase = ?', ...cols.map((c) => `${c} = ?`)].join(', ');
  db.prepare(`INSERT INTO cloud_activation (id, phase) VALUES (1, ?)
              ON CONFLICT(id) DO UPDATE SET ${sets}`)
    .run(phase, phase, ...cols.map((c) => patch[c]));
}
export function getActivation() {
  return db.prepare('SELECT * FROM cloud_activation WHERE id = 1').get() || null;
}

async function getClient(clientFactory, url, anonKey, accessToken) {
  const createClient = clientFactory || (await import('@supabase/supabase-js')).createClient;
  const opts = { auth: { persistSession: false } };
  // RLS : pour que la poussée passe sous l'identité de l'admin, on injecte son
  // jeton dans l'en-tête Authorization de chaque requête PostgREST.
  if (accessToken) opts.global = { headers: { Authorization: `Bearer ${accessToken}` } };
  return createClient(url, anonKey, opts);
}

// ── Étapes 1-2 : compte cloud + vérification e-mail ─────────────────────
export async function signupCloud({ url, anonKey, email, password, clientFactory }) {
  if (!url || !anonKey || !email || !password) throw new Error('Paramètres requis manquants.');
  const supa = await getClient(clientFactory, url, anonKey);
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error && !/already registered/i.test(error.message || '')) throw new Error('Création du compte cloud : ' + error.message);
  setPhase('verify', { email, started_at: new Date().toISOString() });
  appendLog(`Compte cloud demandé pour ${email}. E-mail de vérification envoyé.`);
  // Si Supabase confirme automatiquement (confirmation e-mail désactivée), une
  // session est déjà disponible.
  return { ok: true, needsVerification: !data?.session };
}

export async function verifyCloud({ url, anonKey, email, password, clientFactory }) {
  const supa = await getClient(clientFactory, url, anonKey);
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error || !data?.session) return { confirmed: false };
  appendLog(`E-mail vérifié, connexion cloud établie pour ${email}.`);
  return { confirmed: true };
}

// ── Étapes 3-6 : analyse → provision → poussée → activation ─────────────
export async function runCloudActivation({ url, anonKey, email, password, onProgress, clientFactory }) {
  if (!url || !anonKey || !email || !password) throw new Error('Paramètres requis manquants.');

  // (3) Connexion (l'e-mail doit être vérifié) + analyse SQLite
  log(onProgress, 'connect');
  const authClient = await getClient(clientFactory, url, anonKey);
  const { data: auth, error: authErr } = await authClient.auth.signInWithPassword({ email, password });
  if (authErr || !auth?.session) throw new Error('Connexion cloud impossible (e-mail non vérifié ?).');
  const accessToken = auth.session.access_token;
  const cloudAdminId = auth.user.id;

  const school = db.prepare('SELECT * FROM schools LIMIT 1').get();
  if (!school) throw new Error('Aucune école locale à migrer.');
  setPhase('provision', { school_id: school.id });

  // Membres : tous les comptes locaux de l'école (admin inclus) + leur rôle.
  const members = db.prepare(`
    SELECT su.id AS membership_id, su.role, su.full_name, su.class_id,
           u.id AS local_user_id, u.email
      FROM school_users su JOIN users u ON u.id = su.user_id
     WHERE su.school_id = ? AND su.active = 1`).all(school.id);

  const counts = {};
  for (const t of PUSH_ORDER) {
    counts[t] = db.prepare(`SELECT COUNT(*) n FROM "${t}" WHERE school_id = ?`).get(school.id).n;
  }
  log(onProgress, 'analyzed', { counts, members: members.length });
  appendLog(`Analyse : ${members.length} comptes, ${counts.students || 0} élèves, ${counts.grades || 0} notes.`);

  // (4) Provision du tenant via fonction edge (service_role confinée au cloud).
  //     Crée l'école, les comptes auth manquants et les memberships ; renvoie le
  //     mapping local_user_id → cloud_user_id + un jeton serveur scellé.
  log(onProgress, 'provision');
  const provision = await provisionTenant(url, accessToken, {
    school,
    admin_email: email,
    members: members.map((m) => ({
      local_user_id: m.local_user_id, email: m.email, role: m.role,
      full_name: m.full_name, class_id: m.class_id, membership_id: m.membership_id,
    })),
  });
  // Mémorise les cloud_user_id en local (pont d'identifiants + remap des FK).
  db.prepare('UPDATE users SET cloud_user_id = ? WHERE id = ?').run(cloudAdminId, localUserByEmail(email)?.id || '');
  for (const u of provision.map || []) {
    if (u.local_user_id && u.cloud_user_id) {
      db.prepare('UPDATE users SET cloud_user_id = ? WHERE id = ?').run(u.cloud_user_id, u.local_user_id);
    }
  }
  if (provision.server_token) writeFileSync(TOKEN_PATH, provision.server_token, { mode: 0o600 });
  appendLog('Tenant provisionné (école + comptes + memberships).');

  // Carte local_user_id → cloud_user_id pour remapper les FK (teachers.auth_user_id).
  const cloudByLocal = new Map();
  for (const r of db.prepare('SELECT id, cloud_user_id FROM users WHERE cloud_user_id IS NOT NULL').all()) {
    cloudByLocal.set(r.id, r.cloud_user_id);
  }

  // (5) Poussée des données par lots, idempotente, AVEC REPRISE.
  log(onProgress, 'push');
  const supa = await getClient(clientFactory, url, anonKey, accessToken);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  let pushedGlobal = 0;

  for (const table of PUSH_ORDER) {
    const state = db.prepare('SELECT * FROM cloud_push_state WHERE tablename = ?').get(table);
    if (state?.done) { pushedGlobal += counts[table]; log(onProgress, 'push', { table, pct: Math.round(100 * pushedGlobal / total), resumed: true }); continue; }

    let rows = db.prepare(`SELECT * FROM "${table}" WHERE school_id = ?`).all(school.id);
    // Remap des FK pointant vers un utilisateur (id local → id cloud).
    if (table === 'teachers') rows = rows.map((r) => ({ ...r, auth_user_id: r.auth_user_id ? (cloudByLocal.get(r.auth_user_id) || null) : null }));

    db.prepare(`INSERT INTO cloud_push_state (tablename, pushed, total, done, updated_at)
                VALUES (?,0,?,0,?)
                ON CONFLICT(tablename) DO UPDATE SET total = excluded.total, updated_at = excluded.updated_at`)
      .run(table, rows.length, new Date().toISOString());

    const onConflict = table === 'grades' ? 'class_id,student_id,subject_id,sequence' : 'id';
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map(stripLocalOnly);
      const { error } = await supa.from(table).upsert(batch, { onConflict });
      if (error) { appendLog(`ÉCHEC ${table} (lot ${i}) : ${error.message}`); throw new Error(`Poussée ${table}: ${error.message}`); }
      pushedGlobal += batch.length;
      db.prepare('UPDATE cloud_push_state SET pushed = ?, updated_at = ? WHERE tablename = ?')
        .run(Math.min(i + batch.length, rows.length), new Date().toISOString(), table);
      log(onProgress, 'push', { table, pct: Math.round(100 * pushedGlobal / total) });
    }
    db.prepare('UPDATE cloud_push_state SET done = 1, pushed = total, updated_at = ? WHERE tablename = ?')
      .run(new Date().toISOString(), table);
    appendLog(`${table} : ${rows.length} lignes poussées.`);
  }

  // (6) Activation : le pont d'identifiants est actif (jeton stocké) ; les mots
  //     de passe du personnel convergent à leur prochaine connexion locale.
  setPhase('done', { finished_at: new Date().toISOString() });
  appendLog('Activation Cloud terminée.');
  log(onProgress, 'done', { counts });
  return { ok: true, school: school.name, schoolId: school.id, counts };
}

// Retire les colonnes locales qui n'existent pas côté cloud (robustesse).
function stripLocalOnly(row) {
  const r = { ...row };
  delete r.updated_at; // certaines tables locales l'ont en DEFAULT ; laissé au cloud
  return r;
}
function localUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

// Appel de la fonction edge `provision-tenant` (auth = JWT admin). Best-effort
// d'idempotence côté edge (réutilise les comptes existants → reprise sûre).
async function provisionTenant(url, accessToken, payload) {
  const res = await fetch(`${url}/functions/v1/provision-tenant`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error('Provision tenant : ' + (j?.error || `HTTP ${res.status}`));
  return j; // { server_token, map:[{local_user_id, cloud_user_id}] }
}
