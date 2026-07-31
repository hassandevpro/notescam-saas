// Sauvegarde locale — copie cohérente de la base via `VACUUM INTO`, qui
// produit un fichier .db propre et défragmenté même pendant les écritures
// (contrairement à un copier brut en mode WAL). Rotation pour borner le disque.

import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

function rotate() {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('notescam-') && f.endsWith('.db'))
    .map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(KEEP)) {
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

export { BACKUP_DIR };
