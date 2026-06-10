// Sécurité — 100 % node:crypto, aucune dépendance native supplémentaire
// (important pour le packaging .exe hors-ligne).
//   * Mots de passe : scrypt (salt aléatoire, comparaison à temps constant)
//   * Sessions      : JWT HS256 maison (compatible avec l'API supabase.auth)
//   * Licence       : signature Ed25519 vérifiée hors-ligne (clé publique embarquée)

import {
  randomBytes, scryptSync, timingSafeEqual,
  createHmac, createHash, verify as cryptoVerify, createPublicKey,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
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

// --- Empreinte machine (verrou de licence node-locked) ----------------
// Identifiant STABLE de la machine, affiché à l'activation : l'école le
// communique à l'éditeur, qui signe une licence liée (`--machine <empreinte>`).
// Sources, par ordre de préférence (aucune dépendance native, sans admin) :
//   1. Windows MachineGuid (registre) — stable même après réinstallation de l'app
//   2. 1ʳᵉ adresse MAC physique
//   3. identifiant aléatoire persistant dans DATA_DIR (dernier recours)
// On hache la source brute -> empreinte courte lisible (ex. A1B2-C3D4-E5F6-7890).
let _machineFp = null;
function rawMachineId() {
  // 1) Windows MachineGuid
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    ).toString();
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (m) return 'winguid:' + m[1];
  } catch { /* pas Windows / pas d'accès registre */ }

  // 2) Première MAC physique non interne
  try {
    for (const list of Object.values(networkInterfaces())) {
      for (const i of list || []) {
        if (!i.internal && i.mac && i.mac !== '00:00:00:00:00:00') return 'mac:' + i.mac;
      }
    }
  } catch { /* ignore */ }

  // 3) Aléatoire persistant (lié à cette installation)
  const p = join(DATA_DIR, 'machine-id.key');
  try {
    if (existsSync(p)) return 'rnd:' + readFileSync(p, 'utf8').trim();
    const id = randomBytes(16).toString('hex');
    writeFileSync(p, id, { mode: 0o600 });
    return 'rnd:' + id;
  } catch {
    return 'rnd:fallback';   // jamais en pratique
  }
}
export function machineFingerprint() {
  if (_machineFp) return _machineFp;
  const hex = createHash('sha256').update(rawMachineId()).digest('hex').slice(0, 16).toUpperCase();
  _machineFp = hex.match(/.{4}/g).join('-');   // A1B2-C3D4-E5F6-7890
  return _machineFp;
}

// @param {string} licenseKey
// @param {{ machineId?: string }} opts  empreinte de CETTE machine (pour le verrou)
export function verifyLicenseKey(licenseKey, opts = {}) {
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
    // Verrou machine : si la licence est liée (`machine_id`), elle ne s'active
    // que sur la machine correspondante. Une licence sans `machine_id` reste
    // valable partout (rétrocompatible / licences non verrouillées).
    if (payload.machine_id) {
      const here = opts.machineId || machineFingerprint();
      if (payload.machine_id !== here) {
        return { ok: false, reason: 'machine_mismatch', payload };
      }
    }
    return { ok: true, reason: null, payload };
  } catch (e) {
    return { ok: false, reason: 'error', payload: null, error: e.message };
  }
}
