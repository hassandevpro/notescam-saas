// Sauvegarde locale — copie cohérente de la base via `VACUUM INTO`, qui
// produit un fichier .db propre et défragmenté même pendant les écritures
// (contrairement à un copier brut en mode WAL). Rotation pour borner le disque.

import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { db, DATA_DIR } from './db.js';
import { parityStatus } from './parityGate.js';

const BACKUP_DIR = process.env.NOTESCAM_BACKUP_DIR || join(DATA_DIR, 'backups');
mkdirSync(BACKUP_DIR, { recursive: true });

const KEEP = Number(process.env.NOTESCAM_BACKUP_KEEP || 14); // nb de copies gardées
const EMERGENCY_LABEL = 'Sauvegarde d’urgence – Synchronisation incomplète';

// Sauvegarde JAMAIS bloquée (filet de sécurité avant réparation) — mais MARQUÉE si elle
// est prise pendant une désynchronisation, pour prévenir à la restauration.
export async function runBackup() {
  const st = parityStatus();
  const emergency = st.desync;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(BACKUP_DIR, `notescam-${stamp}${emergency ? '-URGENCE' : ''}.db`);
  const safeDest = dest.replace(/'/g, "''"); // littéral SQL : on échappe les apostrophes
  db.exec(`VACUUM INTO '${safeDest}'`);
  // Manifeste à côté : sert l'avertissement + le contrôle d'intégrité à la restauration.
  try {
    writeFileSync(dest + '.meta.json', JSON.stringify({
      at: new Date().toISOString(), emergency,
      label: emergency ? EMERGENCY_LABEL : 'Sauvegarde normale',
      mismatches: emergency ? st.mismatches : [],
    }));
  } catch { /* best-effort */ }
  rotate();
  return { path: dest, emergency, label: emergency ? EMERGENCY_LABEL : 'Sauvegarde normale', mismatches: emergency ? st.mismatches : [] };
}

// Sauvegardes disponibles + drapeau d'urgence (pour prévenir avant restauration).
export function listBackups() {
  return readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('notescam-') && f.endsWith('.db'))
    .map((f) => {
      const full = join(BACKUP_DIR, f);
      let meta = null;
      try { if (existsSync(full + '.meta.json')) meta = JSON.parse(readFileSync(full + '.meta.json', 'utf8')); } catch { /* */ }
      const emergency = meta ? !!meta.emergency : /-URGENCE\.db$/.test(f);
      return { file: f, at: statSync(full).mtime.toISOString(), emergency, label: meta?.label || (emergency ? EMERGENCY_LABEL : 'Sauvegarde normale'), mismatches: meta?.mismatches || [] };
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

// Rotation à deux étages. Avant : seules les 14 dernières copies (toutes les
// 2 h) étaient gardées, soit ~28 h d'historique — une erreur découverte le
// surlendemain n'était plus rattrapable. Désormais : les KEEP plus récentes
// + la plus récente de chaque jour sur KEEP_DAYS jours.
const KEEP_DAYS = Number(process.env.NOTESCAM_BACKUP_KEEP_DAYS || 14);
export function selectToDelete(files, { keep = KEEP, keepDays = KEEP_DAYS, now = Date.now() } = {}) {
  const sorted = [...files].sort((a, b) => b.t - a.t);
  const kept = new Set(sorted.slice(0, keep).map((x) => x.f));
  const days = new Set();
  for (const { f, t } of sorted) {
    if (now - t > keepDays * 86400000) continue;
    const day = new Date(t).toISOString().slice(0, 10);
    if (!days.has(day)) { days.add(day); kept.add(f); }
  }
  return sorted.filter((x) => !kept.has(x.f)).map((x) => x.f);
}

function rotate() {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('notescam-') && f.endsWith('.db'))
    .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }));
  for (const f of selectToDelete(files)) {
    try { unlinkSync(join(BACKUP_DIR, f)); } catch { /* ignore */ }
    try { unlinkSync(join(BACKUP_DIR, f + '.meta.json')); } catch { /* ignore */ }
  }
}

// Planifie une sauvegarde toutes les `hours` heures + une au démarrage.
export function scheduleBackups(hours = 2) {
  runBackup().catch((e) => console.error('[backup] échec initial :', e.message));
  setInterval(() => {
    runBackup().catch((e) => console.error('[backup] échec :', e.message));
  }, hours * 3600 * 1000).unref();
}

// Résout un nom de sauvegarde en chemin, UNIQUEMENT s'il s'agit d'une
// sauvegarde listée : un nom venant du client ne doit jamais désigner un autre
// fichier du disque (`../notescam.db`, chemin absolu…).
export function backupPath(file) {
  if (typeof file !== 'string' || basename(file) !== file) return null;
  if (!/^notescam-[\w.-]+\.db$/.test(file)) return null;
  const full = join(BACKUP_DIR, file);
  return existsSync(full) ? full : null;
}

// Contrôle d'intégrité AVANT de programmer une restauration : on ne remplace
// pas une base saine par un fichier corrompu.
export async function verifyBackupFile(path) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const d = new DatabaseSync(path, { readOnly: true });
    try {
      const r = d.prepare('PRAGMA integrity_check').get();
      const school = d.prepare('SELECT id, name FROM schools LIMIT 1').get() || null;
      const ok = r && Object.values(r)[0] === 'ok';
      return { ok, detail: ok ? null : Object.values(r || {})[0], school };
    } finally { d.close?.(); }
  } catch (e) {
    return { ok: false, detail: e.message, school: null };
  }
}

export { BACKUP_DIR };
