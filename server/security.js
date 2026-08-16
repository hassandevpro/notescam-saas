// Sécurité — 100 % node:crypto, aucune dépendance native supplémentaire
// (important pour le packaging .exe hors-ligne).
//   * Mots de passe : scrypt (salt aléatoire, comparaison à temps constant)
//   * Sessions      : JWT HS256 maison (compatible avec l'API supabase.auth)
//   * Licence       : signature Ed25519 vérifiée hors-ligne (clé publique embarquée)

import {
  randomBytes, scryptSync, timingSafeEqual,
  createHmac, createHash, verify as cryptoVerify, createPublicKey,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
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
//
// On calcule une LISTE de sources (aucune dépendance native, sans admin) :
//   1. Windows MachineGuid (registre) — stable même après réinstallation
//   2. Linux /etc/machine-id (ou /var/lib/dbus/machine-id) — stable, indépendant
//      du réseau : c'est l'identifiant canonique de la machine sous Linux
//   3. toutes les adresses MAC non internes, lues d'abord dans /sys/class/net
//      (visibles même sans IP) puis via os.networkInterfaces()
//   4. identifiant aléatoire persistant dans DATA_DIR (dernier recours)
//
// La PREMIÈRE source disponible donne l'empreinte AFFICHÉE (celle à faire
// signer). Toutes les autres restent ACCEPTÉES à l'activation.
//
// Pourquoi une liste et non une seule source : jusqu'ici Linux ne retenait que
// la 1ʳᵉ MAC remontée par os.networkInterfaces(), qui n'y liste que les
// interfaces AYANT DÉJÀ une adresse IP. Une unité systemd démarrée avant que le
// DHCP ait répondu (After=network.target ne l'attend pas), un docker0/VPN qui
// apparaît, et l'empreinte changeait d'un redémarrage à l'autre : la licence
// signée la veille était alors refusée (« verrouillée sur une autre machine »)
// sur la machine même pour laquelle elle avait été émise. Les empreintes
// historiques restent donc acceptées, et l'affichage bascule sur une source qui
// ne bouge plus.
//
// On hache la source brute -> empreinte courte lisible (ex. A1B2-C3D4-E5F6-7890).
const fpOf = (raw) =>
  createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase().match(/.{4}/g).join('-');

let _machineFps = null;
function rawMachineIds() {
  const out = [];
  const push = (v) => { if (v && !out.includes(v)) out.push(v); };

  // 1) Windows MachineGuid
  if (process.platform === 'win32') {
    try {
      const cmd = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
      ).toString();
      const m = cmd.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (m) push('winguid:' + m[1]);
    } catch { /* pas d'accès registre */ }
  }

  // 2) Linux machine-id (32 hex). /etc/machine-id peut être vide au 1er
  //    démarrage : dbus en garde alors une copie.
  for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try {
      if (!existsSync(p)) continue;
      const id = readFileSync(p, 'utf8').trim().toLowerCase();
      if (/^[0-9a-f]{32}$/.test(id)) push('linux:' + id);
    } catch { /* ignore */ }
  }

  // 3) MAC physiques. /sys/class/net les expose même sans IP (contrairement à
  //    os.networkInterfaces()) -> les empreintes MAC historiques redeviennent
  //    reproductibles quel que soit l'état du réseau au démarrage.
  const macs = [];
  try {
    for (const name of readdirSync('/sys/class/net').sort()) {
      try {
        const mac = readFileSync(`/sys/class/net/${name}/address`, 'utf8').trim();
        // type 1 = Ethernet ; exclut lo (772) et les tunnels
        const type = readFileSync(`/sys/class/net/${name}/type`, 'utf8').trim();
        if (type === '1' && mac && mac !== '00:00:00:00:00:00') macs.push(mac);
      } catch { /* interface disparue entre-temps */ }
    }
  } catch { /* pas Linux */ }
  try {
    for (const list of Object.values(networkInterfaces())) {
      for (const i of list || []) {
        if (!i.internal && i.mac && i.mac !== '00:00:00:00:00:00') macs.push(i.mac);
      }
    }
  } catch { /* ignore */ }
  for (const mac of macs) { push('mac:' + mac); push('mac:' + mac.toLowerCase()); }

  // 4) Aléatoire persistant (lié à cette installation). Réutilisé s'il existe
  //    déjà ; on n'en crée un que si AUCUNE autre source n'a répondu, sinon on
  //    fabriquerait une empreinte de secours sur une machine parfaitement
  //    identifiable.
  const p = join(DATA_DIR, 'machine-id.key');
  try {
    if (existsSync(p)) {
      push('rnd:' + readFileSync(p, 'utf8').trim());
    } else if (!out.length) {
      const id = randomBytes(16).toString('hex');
      writeFileSync(p, id, { mode: 0o600 });
      push('rnd:' + id);
    }
  } catch { /* dossier en lecture seule */ }

  if (!out.length) push('rnd:fallback');       // jamais en pratique
  return out;
}

// Toutes les empreintes acceptées, la 1ʳᵉ étant celle affichée.
export function machineFingerprints() {
  if (!_machineFps) _machineFps = rawMachineIds().map(fpOf);
  return _machineFps;
}
export function machineFingerprint() {
  return machineFingerprints()[0];
}

// @param {string} licenseKey
// @param {{ machineId?: string, machineIds?: string[] }} opts
//   empreinte(s) de CETTE machine (pour le verrou)
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
    // On compare à TOUTES les empreintes de ce poste (cf. machineFingerprints)
    // pour que les clés émises avant le correctif restent valables ici.
    if (payload.machine_id) {
      const here = opts.machineIds
        || (opts.machineId ? [opts.machineId] : machineFingerprints());
      if (!here.includes(payload.machine_id)) {
        return { ok: false, reason: 'machine_mismatch', payload, machineId: here[0] };
      }
      return { ok: true, reason: null, payload, machineId: payload.machine_id };
    }
    return { ok: true, reason: null, payload, machineId: null };
  } catch (e) {
    return { ok: false, reason: 'error', payload: null, error: e.message };
  }
}
