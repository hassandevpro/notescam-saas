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

const EDGE_BASE  = (process.env.VITE_SUPABASE_URL || '') + '/functions/v1';
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

// Déchiffre les mots de passe déposés par le cloud et les applique en local
// (re-hash scrypt). Le clair ne touche jamais le disque. `supa` = client Supabase
// (ou stub), `hashFn` = hashPassword (injecté pour éviter une dépendance circulaire).
export async function applyCloudCredentials(supa, schoolId, hashFn) {
  const { data, error } = await supa.from('credential_outbox')
    .select('*').eq('school_id', schoolId).is('applied_at', null);
  if (error) return { applied: 0 };
  const priv = ensureKeypair();
  let applied = 0;
  for (const row of data || []) {
    try {
      const plain = privateDecrypt(
        { key: priv, padding: constants.RSA_PKCS1_OAEP_PADDING },
        Buffer.from(row.ciphertext, 'base64'),
      ).toString('utf8');
      const local = db.prepare('SELECT id FROM users WHERE cloud_user_id = ? OR email = ?')
        .get(row.cloud_user_id, row.email || '');
      if (local) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashFn(plain), local.id);
        await supa.from('credential_outbox').update({ applied_at: new Date().toISOString() }).eq('id', row.id);
        applied++;
      }
    } catch { /* ciphertext illisible : on ignore */ }
  }
  return { applied };
}
