// server/authBridge.js
// Pont d'identifiants : garde le mot de passe LOCAL et CLOUD identiques, dans les
// deux sens, sans jamais bloquer l'authentification locale.
//
// Sécurité :
//   * Local → Cloud : on appelle une fonction edge `set-password` avec un JETON
//     propre à l'école (scopé, révocable). La clé service_role ne descend JAMAIS
//     sur le PC. Hors-ligne / échec → file CHIFFRÉE (AES-256-GCM, clé locale)
//     rejouée plus tard → l'auth locale ne dépend jamais du cloud.
//   * Cloud → Local : le cloud dépose le nouveau mot de passe CHIFFRÉ avec la clé
//     publique RSA de CE serveur (`credential_outbox`). Seul ce serveur peut le
//     déchiffrer (clé privée jamais exposée), le re-hache en scrypt et l'applique.
//
// Aucun mot de passe lisible n'existe au repos (scrypt local · bcrypt cloud ·
// file AES locale · outbox RSA).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  randomBytes, createCipheriv, createDecipheriv,
  generateKeyPairSync, privateDecrypt, createPublicKey, constants,
} from 'node:crypto';
import { db, DATA_DIR } from './db.js';
import { EDGE_BASE } from './cloudEnv.js';
const KEY_PATH   = join(DATA_DIR, 'mirror.key');        // clé AES de la file locale
const TOKEN_PATH = join(DATA_DIR, 'server-token.key');  // jeton scellé propre à l'école
const PRIV_PATH  = join(DATA_DIR, 'credential-rsa.pem'); // clé privée RSA (canal cloud→local)

// --- Jeton serveur ----------------------------------------------------
function serverToken() {
  try { return readFileSync(TOKEN_PATH, 'utf8').trim() || null; } catch { return null; }
}

// --- File chiffrée (mots de passe à miroiter quand le cloud est injoignable) ---
function localKey() {
  if (!existsSync(KEY_PATH)) writeFileSync(KEY_PATH, randomBytes(32), { mode: 0o600 });
  return readFileSync(KEY_PATH);
}
function enc(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', localKey(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function dec(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', localKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}
function enqueue(localUserId, email, plain) {
  db.prepare(`INSERT INTO pwd_mirror_queue (local_user_id, email, secret, created_at)
              VALUES (?,?,?,?)`).run(localUserId, email || null, enc(plain), new Date().toISOString());
}

// --- Local → Cloud ----------------------------------------------------
// Réécrit le mot de passe cloud du compte mappé au user local, via la fonction
// edge (jeton scellé). Fire-and-forget : sur échec, on met en file et on rend
// la main immédiatement (jamais bloquant).
export async function mirrorToCloud(localUserId, email, plain) {
  const token = serverToken();
  const cloudId = db.prepare('SELECT cloud_user_id FROM users WHERE id = ?').get(localUserId)?.cloud_user_id;
  if (!token || !cloudId || !plain) { enqueue(localUserId, email, plain); return { queued: true }; }
  try {
    const res = await fetch(`${EDGE_BASE}/set-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloud_user_id: cloudId, email, password: plain }),
    });
    if (!res.ok) throw new Error('edge ' + res.status);
    return { ok: true };
  } catch {
    enqueue(localUserId, email, plain);
    return { queued: true };
  }
}

// Rejoué par le serveur quand Internet revient (cf. scheduleMirrorFlush).
export async function flushMirrorQueue() {
  if (!serverToken()) return { flushed: 0 };
  const rows = db.prepare('SELECT * FROM pwd_mirror_queue ORDER BY id').all();
  let flushed = 0;
  for (const r of rows) {
    let plain;
    try { plain = dec(r.secret); } catch { db.prepare('DELETE FROM pwd_mirror_queue WHERE id = ?').run(r.id); continue; }
    const res = await mirrorToCloud(r.local_user_id, r.email, plain);
    if (res.ok) { db.prepare('DELETE FROM pwd_mirror_queue WHERE id = ?').run(r.id); flushed++; }
    else break; // toujours hors-ligne : on réessaiera au prochain tick
  }
  return { flushed };
}

// --- Cloud → Local (canal chiffré) ------------------------------------
// Paire RSA générée au 1er besoin ; la clé privée ne quitte jamais le PC.
function ensureKeypair() {
  if (!existsSync(PRIV_PATH)) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    writeFileSync(PRIV_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  return readFileSync(PRIV_PATH, 'utf8');
}
export function credentialPublicKey() {
  const priv = ensureKeypair();
  return createPublicKey(priv).export({ type: 'spki', format: 'pem' }).toString();
}

// Publie la clé publique de CE serveur dans le cloud (school_credential_keys) via
// la fonction edge `publish-server-key` (auth = jeton scellé). L'app cloud s'en
// sert pour chiffrer les changements de mot de passe (sens Cloud → Local).
// Best-effort : appelée au boot quand un jeton existe ; idempotente.
export async function publishCredentialKey() {
  const token = serverToken();
  if (!token) return { skipped: true };
  try {
    const res = await fetch(`${EDGE_BASE}/publish-server-key`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_key: credentialPublicKey() }),
    });
    return { ok: res.ok };
  } catch { return { ok: false }; }
}

// École rattachée à CE serveur (une installation LAN = une école). Sert de
// garde-fou : on n'applique jamais une credential destinée à une autre école.
function localSchoolId() {
  try { return db.prepare('SELECT id FROM schools LIMIT 1').get()?.id || null; } catch { return null; }
}

// Déchiffre une ligne d'outbox. Le clair vit en mémoire le temps du re-hash :
// il n'est jamais journalisé, ni écrit sur disque, ni renvoyé par une réponse HTTP.
function decryptRow(row, priv) {
  return privateDecrypt(
    { key: priv, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(row.ciphertext, 'base64'),
  ).toString('utf8');
}

// Applique UNE credential déchiffrée au compte local correspondant.
//
// PROVISIONNEMENT : si le compte local n'existe pas, on le CRÉE. C'est le cas
// normal après un appairage — la synchro descend `school_users` (les
// appartenances) mais JAMAIS `users` (les identifiants) : sans cela, aucun
// membre de l'école ne peut ouvrir de session locale, quel que soit son mot de
// passe cloud.
//
// L'identifiant local reprend le `cloud_user_id` : les lignes `school_users`
// déjà synchronisées pointent dessus (FK school_users.user_id → users.id), donc
// le membre récupère immédiatement son rôle, sans remapping ni écriture annexe.
//
// Idempotent : rejouer la même ligne ne crée pas de doublon (recherche préalable
// + ON CONFLICT sur l'e-mail, qui est UNIQUE COLLATE NOCASE).
// Renvoie 'created' | 'updated' | 'skipped'.
function applyCredential({ cloudUserId, email, fullName, plain }, hashFn) {
  const mail = String(email || '').trim();
  const local =
    (cloudUserId && db.prepare('SELECT id FROM users WHERE cloud_user_id = ?').get(cloudUserId)) ||
    (cloudUserId && db.prepare('SELECT id FROM users WHERE id = ?').get(cloudUserId)) ||
    (mail && db.prepare('SELECT id FROM users WHERE email = ?').get(mail)) ||
    null;

  if (local) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashFn(plain), local.id);
    // Rattache au cloud un compte créé localement avant l'appairage : le sens
    // Local → Cloud (mirrorToCloud) en dépend pour cibler le bon compte cloud.
    if (cloudUserId) {
      db.prepare('UPDATE users SET cloud_user_id = ? WHERE id = ? AND cloud_user_id IS NULL')
        .run(cloudUserId, local.id);
    }
    return 'updated';
  }

  // Création impossible sans e-mail (identifiant de connexion) ni compte cloud.
  if (!mail || !cloudUserId) return 'skipped';
  db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_confirmed_at, cloud_user_id)
              VALUES (?,?,?,?,?,?)
              ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash,
                                               cloud_user_id = excluded.cloud_user_id`)
    .run(cloudUserId, mail, hashFn(plain), fullName || null, new Date().toISOString(), cloudUserId);
  return 'created';
}

// Déchiffre les mots de passe déposés par le cloud et les applique en local
// (re-hash scrypt). `supa` = client Supabase (ou stub), `hashFn` = hashPassword
// (injecté pour éviter une dépendance circulaire).
export async function applyCloudCredentials(supa, schoolId, hashFn) {
  const { data, error } = await supa.from('credential_outbox')
    .select('*').eq('school_id', schoolId).is('applied_at', null);
  if (error) return { applied: 0, created: 0, updated: 0, skipped: 0 };
  const priv = ensureKeypair();
  const school = localSchoolId();
  let applied = 0, created = 0, updated = 0, skipped = 0;
  for (const row of data || []) {
    // Cloisonnement : jamais le compte d'une autre école sur ce serveur.
    if (row.school_id !== schoolId || (school && row.school_id !== school)) { skipped++; continue; }
    let plain;
    try { plain = decryptRow(row, priv); } catch { skipped++; continue; } // ciphertext illisible
    let outcome;
    try { outcome = applyCredential({ cloudUserId: row.cloud_user_id, email: row.email, plain }, hashFn); }
    catch { skipped++; continue; }
    if (outcome === 'skipped') { skipped++; continue; }
    if (outcome === 'created') created++; else updated++;
    await supa.from('credential_outbox').update({ applied_at: new Date().toISOString() }).eq('id', row.id);
    applied++;
  }
  return { applied, created, updated, skipped };
}

// Chemin RÉEL du serveur LAN. Le cloud n'expose pas `credential_outbox` en
// lecture (RLS : INSERT seulement, pour le membre concerné ou l'admin de son
// école) et le PC ne détient aucun secret privilégié : le serveur tire donc ses
// credentials par une fonction edge authentifiée par son JETON SCELLÉ, qui ne
// renvoie QUE les lignes de SON école. Le cloisonnement est garanti côté cloud,
// et re-vérifié ici.
export async function syncCloudCredentials(hashFn) {
  const token = serverToken();
  if (!token) return { applied: 0, created: 0, updated: 0, skipped: 0, reason: 'no_token' };
  const hash = hashFn || (await import('./security.js')).hashPassword;

  let rows = [];
  try {
    const res = await fetch(`${EDGE_BASE}/credentials-pull`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return { applied: 0, created: 0, updated: 0, skipped: 0, error: `credentials-pull: HTTP ${res.status}` };
    rows = (await res.json())?.rows || [];
  } catch (e) {
    return { applied: 0, created: 0, updated: 0, skipped: 0, error: e.message };
  }

  const priv = ensureKeypair();
  const school = localSchoolId();
  const done = [];
  let created = 0, updated = 0, skipped = 0;
  for (const row of rows) {
    if (school && row.school_id && row.school_id !== school) { skipped++; continue; }
    let plain;
    try { plain = decryptRow(row, priv); } catch { skipped++; continue; }
    let outcome;
    try { outcome = applyCredential({ cloudUserId: row.cloud_user_id, email: row.email, fullName: row.full_name, plain }, hash); }
    catch { skipped++; continue; }
    if (outcome === 'skipped') { skipped++; continue; }
    if (outcome === 'created') created++; else updated++;
    done.push(row.id);
  }

  // Acquittement groupé. S'il échoue (réseau), les lignes reviendront au
  // prochain passage : l'application étant idempotente, aucun doublon n'en naît.
  if (done.length) {
    try {
      await fetch(`${EDGE_BASE}/credentials-pull`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ack: done }),
      });
    } catch { /* réessai au prochain tick */ }
  }
  return { applied: done.length, created, updated, skipped };
}
