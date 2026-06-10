// Sauvegarde locale — copie cohérente de la base via `VACUUM INTO`, qui
// produit un fichier .db propre et défragmenté même pendant les écritures
// (contrairement à un copier brut en mode WAL). Rotation pour borner le disque.

import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_DIR } from './db.js';

const BACKUP_DIR = process.env.NOTESCAM_BACKUP_DIR || join(DATA_DIR, 'backups');
mkdirSync(BACKUP_DIR, { recursive: true });

const KEEP = Number(process.env.NOTESCAM_BACKUP_KEEP || 14); // nb de copies gardées

export async function runBackup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(BACKUP_DIR, `notescam-${stamp}.db`);
  // Chemin en littéral SQL : on échappe les apostrophes (rare sous Windows).
  const safeDest = dest.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safeDest}'`);
  rotate();
  return dest;
}

function rotate() {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('notescam-') && f.endsWith('.db'))
    .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(KEEP)) {
    try { unlinkSync(join(BACKUP_DIR, f)); } catch { /* ignore */ }
  }
}

// Planifie une sauvegarde toutes les `hours` heures + une au démarrage.
export function scheduleBackups(hours = 2) {
  runBackup().catch((e) => console.error('[backup] échec initial :', e.message));
  setInterval(() => {
    runBackup().catch((e) => console.error('[backup] échec :', e.message));
  }, hours * 3600 * 1000).unref();
}

export { BACKUP_DIR };
