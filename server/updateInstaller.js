// server/updateInstaller.js
// MISE À JOUR AUTOMATIQUE (OTA) des serveurs LAN — branchement RÉEL des quatre
// étapes laissées enfichables par `updateService.js` :
//
//   download → verifySignature → install → restart
//
// Ce module ne redéfinit AUCUNE règle de `updateService` : la garde de parité
// (aucune mise à jour tant que Cloud ≠ LAN) et la détection de version restent
// où elles sont. Il ne fournit que les mains.
//
// ── Chaîne de confiance ─────────────────────────────────────────────────────
// Un serveur d'école télécharge et exécute un binaire : c'est le point le plus
// sensible du produit. Deux verrous, tous deux obligatoires :
//   1. EMPREINTE  — le sha256 du fichier doit être exactement celui annoncé ;
//   2. SIGNATURE  — Ed25519 de l'éditeur sur « version|sha256 », vérifiée avec
//      une clé publique embarquée dans l'installation.
//
// La clé de RELEASE est DISTINCTE de la clé de licence (`license-pubkey.txt`).
// Les mélanger ferait d'une compromission de la clé de licence une exécution de
// code arbitraire sur tous les serveurs d'école. Sans clé de release configurée,
// la mise à jour automatique reste DÉSACTIVÉE (repli sur l'installeur manuel) —
// c'est le comportement des installations antérieures, et c'est le bon défaut.
//
// ── Ce qui n'est PAS fait ici ───────────────────────────────────────────────
// L'installation elle-même reste confiée à `packaging/update-notescam.ps1`, déjà
// éprouvé : il sauvegarde les données, arrête la tâche planifiée, lance
// l'installeur en place (mêmes AppId et dossier de données) puis vérifie que le
// service répond. On lui passe la main en processus DÉTACHÉ — il doit survivre à
// l'arrêt du serveur qu'il provoque lui-même.

import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './db.js';
import { getSetting, setSetting } from './syncFlag.js';
import { recordSyncAudit } from './syncAudit.js';
import { registerUpdateStep, updateStatus, applyUpdate, currentVersion } from './updateService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const UPDATE_DIR = join(DATA_DIR, 'updates');

// Un installeur Windows signé pèse quelques dizaines de Mo. Le plafond protège
// le disque de l'école d'un manifeste erroné ou malveillant.
const MAX_BYTES = 300 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

// ── Clé publique de RELEASE ─────────────────────────────────────────────────
const RELEASE_PUBKEY_FILE = join(__dirname, 'release-pubkey.txt');
function releasePublicKeyB64() {
  return (
    process.env.NOTESCAM_RELEASE_PUBKEY ||
    (existsSync(RELEASE_PUBKEY_FILE) ? readFileSync(RELEASE_PUBKEY_FILE, 'utf8') : '')
  ).trim();
}
export const releaseSigningConfigured = () => !!releasePublicKeyB64();

// Message signé par l'éditeur. Lier la VERSION à l'empreinte interdit de rejouer
// la signature d'une ancienne version sur un binaire différent.
export const signedPayload = (version, sha256) => `notescam-release:${version}:${String(sha256).toLowerCase()}`;

export function verifyReleaseSignature({ version, sha256, signature }) {
  const pub = releasePublicKeyB64();
  if (!pub) return { ok: false, reason: 'no_release_key' };
  if (!signature) return { ok: false, reason: 'missing_signature' };
  try {
    const key = createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' });
    const sig = Buffer.from(String(signature).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const msg = Buffer.from(signedPayload(version, sha256), 'utf8');
    // Ed25519 : algorithme implicite → 1er argument null (idem verifyLicenseKey).
    return cryptoVerify(null, msg, key, sig) ? { ok: true } : { ok: false, reason: 'bad_signature' };
  } catch (e) {
    return { ok: false, reason: 'verify_error', message: e.message };
  }
}

export function sha256File(path) {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
}

// ── Étape 1 : téléchargement ────────────────────────────────────────────────
// Écrit dans un fichier temporaire puis renomme : un téléchargement interrompu
// ne laisse jamais un binaire tronqué à la place d'un installeur valide.
export async function downloadRelease(release, { fetchImpl } = {}) {
  if (!release?.url) throw new Error('Publication sans URL de téléchargement');
  if (!release?.sha256) throw new Error('Publication sans empreinte sha256');
  if (!/^https:/i.test(release.url)) throw new Error('URL de mise à jour non sécurisée (https requis)');

  mkdirSync(UPDATE_DIR, { recursive: true });
  const target = join(UPDATE_DIR, `NotesCam-Setup-${release.version}.exe`);
  const tmp    = `${target}.part`;

  // Déjà téléchargé et intègre : on ne retélécharge pas (reprise après coupure).
  if (existsSync(target) && sha256File(target) === String(release.sha256).toLowerCase()) {
    return { path: target, bytes: statSync(target).size, cached: true };
  }

  const doFetch = fetchImpl || fetch;
  const res = await doFetch(release.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Téléchargement : HTTP ${res.status}`);

  const declared = Number(res.headers?.get?.('content-length') || 0);
  if (declared && declared > MAX_BYTES) throw new Error('Installeur trop volumineux (manifeste suspect)');

  rmSync(tmp, { force: true });
  let written = 0;
  const counter = new TransformCounter((n) => {
    written += n;
    if (written > MAX_BYTES) throw new Error('Installeur trop volumineux (flux interrompu)');
  });
  await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(tmp));

  renameSync(tmp, target);
  return { path: target, bytes: written, cached: false };
}

// Petit compteur de flux (évite une dépendance pour une seule ligne utile).
class TransformCounter extends Transform {
  constructor(onChunk) { super(); this._onChunk = onChunk; }
  _transform(chunk, _enc, cb) {
    try { this._onChunk(chunk.length); cb(null, chunk); } catch (e) { cb(e); }
  }
}

// ── Étape 2 : empreinte + signature ─────────────────────────────────────────
// Un échec ici SUPPRIME le fichier : on ne laisse jamais traîner un binaire non
// authentifié dans le dossier de données de l'école.
export function verifyDownloaded(release, downloaded) {
  const path = downloaded?.path;
  if (!path || !existsSync(path)) throw new Error('Installeur introuvable après téléchargement');

  const actual = sha256File(path);
  if (actual !== String(release.sha256).toLowerCase()) {
    rmSync(path, { force: true });
    throw new Error(`Empreinte invalide (attendu ${release.sha256}, obtenu ${actual})`);
  }

  const sig = verifyReleaseSignature({ version: release.version, sha256: actual, signature: release.signature });
  if (!sig.ok) {
    rmSync(path, { force: true });
    const why = {
      no_release_key:    'aucune clé publique de release configurée sur ce serveur',
      missing_signature: 'publication non signée',
      bad_signature:     'signature invalide',
    }[sig.reason] || sig.reason;
    throw new Error(`Signature refusée : ${why}`);
  }
  return { sha256: actual, signature: 'ok' };
}

// ── Étape 3 : installation ──────────────────────────────────────────────────
// On délègue au script éprouvé, en processus DÉTACHÉ : il va arrêter ce serveur.
// `-WaitForIdle` lui laisse patienter que l'école ne soit plus en train de saisir.
// Le script ne vit pas au même endroit dans le dépôt et dans une installation :
//   dépôt        …/server/updateInstaller.js  → ../packaging/update-notescam.ps1
//   installation {app}/app/server/…           → {app}/update-notescam.ps1
// (cf. packaging/build-installer.ps1 et notescam.iss). On essaie les deux.
export function resolveInstallerScript() {
  const candidates = [
    join(__dirname, '..', '..', 'update-notescam.ps1'),   // installation Windows
    join(__dirname, '..', 'packaging', 'update-notescam.ps1'), // dépôt / dev
  ];
  return candidates.find((p) => existsSync(p)) || candidates[0];
}

export function launchInstaller(downloaded, { spawnImpl, script, idleMinutes = 5, waitForIdle = 60 } = {}) {
  if (process.platform !== 'win32' && !spawnImpl) {
    throw new Error("Installation automatique disponible sur Windows uniquement (relais : l'installeur manuel)");
  }
  const ps1 = script || resolveInstallerScript();
  if (!existsSync(ps1) && !spawnImpl) throw new Error(`Script de mise à jour introuvable : ${ps1}`);

  const args = [
    '-ExecutionPolicy', 'Bypass', '-File', ps1,
    '-SetupExe', downloaded.path,
    '-IdleMinutes', String(idleMinutes),
    '-WaitForIdle', String(waitForIdle),
  ];
  const doSpawn = spawnImpl || spawn;
  const child = doSpawn('powershell', args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref?.();
  return { launched: true, script: ps1, pid: child.pid ?? null };
}

// ── Étape 4 : redémarrage ───────────────────────────────────────────────────
// Il n'y a rien à faire ici : le script d'installation arrête la tâche planifiée,
// installe, puis la relance. On se contente de tracer le passage de relais — le
// processus courant sera terminé de l'extérieur.
export function handoffRestart() {
  return { by: 'update-notescam.ps1', note: 'le service est relancé par le script d’installation' };
}

// ── Branchement ─────────────────────────────────────────────────────────────
// `applyUpdate` passe `status.latest` à chaque étape ; on partage l'état du
// téléchargement entre les étapes via une variable de passe.
export function registerUpdateHandlers(opts = {}) {
  if (!releaseSigningConfigured()) return { registered: false, reason: 'no_release_key' };
  // L'installation s'appuie sur le script PowerShell de l'édition Windows. Sur
  // l'édition Linux, on ne branche RIEN : sinon chaque contrôle téléchargerait
  // un installeur pour échouer à la dernière étape, toutes les six heures.
  if (process.platform !== 'win32' && !opts.spawnImpl) return { registered: false, reason: 'platform' };

  let downloaded = null;
  registerUpdateStep('download', async (release) => {
    downloaded = await downloadRelease(release, opts);
    return downloaded;
  });
  registerUpdateStep('verifySignature', async (release) => verifyDownloaded(release, downloaded));
  registerUpdateStep('install', async () => launchInstaller(downloaded, opts));
  registerUpdateStep('restart', async () => handoffRestart());
  return { registered: true };
}

// ── Automatisation ──────────────────────────────────────────────────────────
// Réglages, tous modifiables sans redéployer (table `settings`) :
//   auto_update           '1' (défaut) | '0'
//   auto_update_window    'HH-HH' heure locale, défaut '19-05' (hors temps scolaire)
//   auto_update_channel   'stable' (défaut)
const SETTING_ENABLED = 'auto_update';
const SETTING_WINDOW  = 'auto_update_window';
const SETTING_CHANNEL = 'auto_update_channel';

export const autoUpdateEnabled = () => getSetting(SETTING_ENABLED, '1') !== '0';
export const setAutoUpdate = (on) => setSetting(SETTING_ENABLED, on ? '1' : '0');

// Fenêtre de maintenance. Une école ne doit pas voir son serveur redémarrer en
// plein conseil de classe : par défaut on n'installe qu'entre 19 h et 5 h.
// La fenêtre peut enjamber minuit (19-05), d'où le test en deux branches.
export function inMaintenanceWindow(now = new Date(), window = getSetting(SETTING_WINDOW, '19-05')) {
  const m = String(window || '').match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return true;                       // réglage illisible : ne pas bloquer
  const [start, end] = [Number(m[1]), Number(m[2])];
  const h = now.getHours();
  return start === end ? true : start < end ? (h >= start && h < end) : (h >= start || h < end);
}

// Le serveur est-il AU REPOS ? Même signal que le script PowerShell : la date de
// modification du journal WAL de SQLite reflète la dernière écriture réelle.
export function serverIdle({ idleMinutes = 15, now = Date.now(), dataDir = DATA_DIR } = {}) {
  const wal = join(dataDir, 'notescam.db-wal');
  if (!existsSync(wal)) return true;
  const idleMs = now - statSync(wal).mtimeMs;
  return idleMs >= idleMinutes * 60 * 1000;
}

// Une passe : décide, et applique si TOUTES les conditions sont réunies.
// Renvoie toujours un motif — c'est ce que l'écran d'administration affiche.
export async function autoUpdateTick(opts = {}) {
  if (!autoUpdateEnabled())          return { acted: false, reason: 'disabled' };
  if (!releaseSigningConfigured())   return { acted: false, reason: 'no_release_key' };
  if (process.platform !== 'win32' && !opts.spawnImpl) return { acted: false, reason: 'platform' };

  const status = await updateStatus({ channel: getSetting(SETTING_CHANNEL, 'stable'), ...opts });
  if (!status.available)             return { acted: false, reason: 'up-to-date', current: status.current };
  // La garde de parité est la même que pour une mise à jour manuelle : on ne
  // remplace jamais le binaire tant que des données ne sont pas remontées.
  if (!status.allowed)               return { acted: false, reason: 'parity', parity: status.parity, latest: status.latest };

  const forced = status.mandatory;   // une version obligatoire ignore la fenêtre
  if (!forced && !inMaintenanceWindow(opts.now ? new Date(opts.now) : undefined)) {
    return { acted: false, reason: 'outside-window', latest: status.latest };
  }
  if (!forced && !serverIdle(opts))  return { acted: false, reason: 'busy', latest: status.latest };

  recordSyncAudit({ kind: 'verify', ok: true, detail: { autoUpdate: 'start', from: status.current, to: status.latest } });
  try {
    const res = await applyUpdate({ channel: getSetting(SETTING_CHANNEL, 'stable'), ...opts });
    return { acted: res.ok, reason: res.ok ? 'applied' : 'failed', result: res };
  } catch (e) {
    // `applyUpdate` lève sur désynchronisation (409) : on trace sans bruit.
    recordSyncAudit({ kind: 'rollback', ok: false, detail: { autoUpdate: 'blocked', message: e.message } });
    return { acted: false, reason: 'blocked', message: e.message };
  }
}

// Démarre la boucle. Ne JAMAIS planter le serveur si le Cloud est injoignable :
// une école hors ligne doit continuer de fonctionner exactement comme avant.
export function startAutoUpdate({ everyHours = 6, ...opts } = {}) {
  const reg = registerUpdateHandlers(opts);
  if (!reg.registered) {
    console.log(`[update] mise à jour automatique inactive (${reg.reason}) — installeur manuel inchangé`);
    return { started: false, reason: reg.reason };
  }
  const tick = () => autoUpdateTick(opts)
    .then((r) => { if (r.acted || r.reason === 'blocked') console.log('[update]', r.reason, r.latest || ''); })
    .catch((e) => console.log('[update] contrôle impossible :', e.message));

  // Premier contrôle différé : ne pas ralentir le démarrage du serveur.
  const first = setTimeout(tick, 5 * 60 * 1000);
  const timer = setInterval(tick, Math.max(1, everyHours) * 60 * 60 * 1000);
  first.unref?.(); timer.unref?.();
  console.log(`[update] mise à jour automatique active (v${currentVersion()}, contrôle toutes les ${everyHours} h)`);
  return { started: true, stop: () => { clearTimeout(first); clearInterval(timer); } };
}
