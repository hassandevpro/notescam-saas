// Sécurité — 100 % node:crypto, aucune dépendance native supplémentaire
// (important pour le packaging .exe hors-ligne).
//   * Mots de passe : scrypt (salt aléatoire, comparaison à temps constant)
//   * Sessions      : JWT HS256 maison (compatible avec l'API supabase.auth)
//   * Licence       : signature Ed25519 vérifiée hors-ligne (clé publique embarquée)

import {
  randomBytes, scryptSync, timingSafeEqual,
  createHmac, verify as cryptoVerify, createPublicKey,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Secret de signature JWT : généré au 1er démarrage, persistant ----
const SECRET_PATH = join(DATA_DIR, 'jwt-secret.key');
let JWT_SECRET;
if (existsSync(SECRET_PATH)) {
  JWT_SECRET = readFileSync(SECRET_PATH);
} else {
  JWT_SECRET = randomBytes(48);
  writeFileSync(SECRET_PATH, JWT_SECRET, { mode: 0o600 });
}

// --- Mots de passe ----------------------------------------------------
export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- JWT HS256 --------------------------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj) { return b64url(JSON.stringify(obj)); }

export function signToken(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${b64urlJson(header)}.${b64urlJson(body)}`;
  const sig = b64url(createHmac('sha256', JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [h, p, sig] = String(token).split('.');
    if (!h || !p || !sig) return null;
    const expected = b64url(createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { return null; }
}

// --- Licence Ed25519 (vérification hors-ligne) ------------------------
// Format d'une clé : "<base64url(payload JSON)>.<base64url(signature)>"
// La clé PRIVÉE reste chez l'éditeur ; seule la PUBLIQUE est embarquée ici.
// Source de la clé publique (SPKI base64, ligne unique) :
//   1. variable d'env NOTESCAM_LICENSE_PUBKEY (priorité)
//   2. fichier server/license-pubkey.txt (livré dans l'installateur)
const PUBKEY_FILE = join(__dirname, 'license-pubkey.txt');
const LICENSE_PUBLIC_KEY_B64 = (
  process.env.NOTESCAM_LICENSE_PUBKEY ||
  (existsSync(PUBKEY_FILE) ? readFileSync(PUBKEY_FILE, 'utf8') : '')
).trim();

// Licence active uniquement si une clé publique est configurée. Sinon, le
// serveur ne bloque pas (mode non-licencié : dev / installation non provisionnée).
export function licensingEnabled() {
  return !!LICENSE_PUBLIC_KEY_B64;
}

export function verifyLicenseKey(licenseKey) {
  if (!LICENSE_PUBLIC_KEY_B64) {
    return { ok: false, reason: 'no_public_key', payload: null };
  }
  try {
    const [payloadB64, sigB64] = String(licenseKey).trim().split('.');
    if (!payloadB64 || !sigB64) return { ok: false, reason: 'malformed', payload: null };

    const payloadBuf = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const sigBuf = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    const pubKey = createPublicKey({
      key: Buffer.from(LICENSE_PUBLIC_KEY_B64, 'base64'),
      format: 'der', type: 'spki',
    });

    // Ed25519 : algorithme implicite -> 1er argument null
    const valid = cryptoVerify(null, payloadBuf, pubKey, sigBuf);
    if (!valid) return { ok: false, reason: 'bad_signature', payload: null };

    const payload = JSON.parse(payloadBuf.toString('utf8'));
    if (payload.expires_at && new Date(payload.expires_at) < new Date()) {
      return { ok: false, reason: 'expired', payload };
    }
    return { ok: true, reason: null, payload };
  } catch (e) {
    return { ok: false, reason: 'error', payload: null, error: e.message };
  }
}
