// Sauvegarde locale — copie cohérente de la base via `VACUUM INTO`, qui
// produit un fichier .db propre et défragmenté même pendant les écritures
// (contrairement à un copier brut en mode WAL). Rotation pour borner le disque.

import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { db, DATA_DIR } from './db.js';
import { parityStatus } from './parityGate.js';
import { createArchive, verifyArchiveSync, readManifest } from './backupArchive.js';
import { appVersion } from './syncAudit.js';

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
    .filter(estSauvegarde)
    .map((f) => {
      const full = join(BACKUP_DIR, f);
      let meta = null;
      try { if (existsSync(full + '.meta.json')) meta = JSON.parse(readFileSync(full + '.meta.json', 'utf8')); } catch { /* */ }
      const complete = f.endsWith('.ncbak');
      const emergency = meta ? !!meta.emergency : /-URGENCE\.db$/.test(f);
      const st = statSync(full);
      return {
        file: f, at: st.mtime.toISOString(), emergency, bytes: st.size, complete,
        label: meta?.label || (complete ? 'Archive complète (base + photos)' : emergency ? EMERGENCY_LABEL : 'Sauvegarde normale'),
        mismatches: meta?.mismatches || [],
      };
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

function estSauvegarde(f) { return f.startsWith('notescam-') && (f.endsWith('.db') || f.endsWith('.ncbak')); }
const KEEP_ARCHIVES = Number(process.env.NOTESCAM_BACKUP_KEEP_ARCHIVES || 7); // archives complètes (lourdes) gardées

function rotate() {
  const tous = readdirSync(BACKUP_DIR).filter(estSauvegarde).map((f) => ({ f, t: statSync(join(BACKUP_DIR, f)).mtimeMs }));
  const dbs = tous.filter((x) => x.f.endsWith('.db'));
  const archives = tous.filter((x) => x.f.endsWith('.ncbak'));
  const aSupprimer = [...selectToDelete(dbs), ...selectToDelete(archives, { keep: KEEP_ARCHIVES, keepDays: KEEP_ARCHIVES })];
  for (const f of aSupprimer) {
    try { unlinkSync(join(BACKUP_DIR, f)); } catch { /* ignore */ }
    try { unlinkSync(join(BACKUP_DIR, f + '.meta.json')); } catch { /* ignore */ }
  }
}

// Planifie une sauvegarde toutes les `hours` heures + une au démarrage.
export function scheduleBackups(hours = 2) {
  const tick = (initial) => runBackup()
    .then(() => archiveDuJourSiAbsente())
    .catch((e) => console.error(initial ? '[backup] échec initial :' : '[backup] échec :', e.message));
  tick(true);
  setInterval(() => tick(false), hours * 3600 * 1000).unref();
}

// Une archive COMPLÈTE (base + photos) par 24 h : c'est elle qui permet de tout reconstruire sur une autre machine.
async function archiveDuJourSiAbsente() {
  const recentes = readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.ncbak'))
    .some((f) => Date.now() - statSync(join(BACKUP_DIR, f)).mtimeMs < 20 * 3600 * 1000);
  if (!recentes) await runArchiveBackup({ actor: 'automatique' });
}

export function journaliser(action, detail = {}) {
  try { appendFileSync(join(DATA_DIR, 'backup-journal.log'), JSON.stringify({ at: new Date().toISOString(), action, ...detail }) + '\n'); } catch { /* best-effort */ }
}

// Archive complète : base + photos/logos/signatures/tampons, en UN fichier (.ncbak), avec résumé et empreintes.
export async function runArchiveBackup({ actor = null } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(BACKUP_DIR, `notescam-${stamp}.ncbak`);
  const r = await createArchive({ db, dataDir: DATA_DIR, outPath: dest, tmpDir: join(BACKUP_DIR, `.tmp-${stamp}`), appVersion: appVersion(), actor });
  rotate();
  journaliser('export_archive', { by: actor, file: dest.split(/[\\/]/).pop(), bytes: r.bytes });
  return { path: dest, file: dest.split(/[\\/]/).pop(), bytes: r.bytes, manifest: r.manifest, complete: true };
}

// Résumé affichable AVANT de restaurer : « 412 élèves, 18 classes, 25 340 notes — créé le … ».
export function resumeArchive(path) {
  const { manifest, archiveSize, truncated } = readManifest(path);
  return {
    createdAt: manifest.createdAt, appVersion: manifest.appVersion || null, school: manifest.school || null,
    counts: manifest.counts || null, files: manifest.totals?.files ?? 0, bytes: archiveSize, truncated,
  };
}

// 0.3.37 > 0.3.9 : comparaison numérique segment par segment (jamais lexicographique).
export function versionPlusRecente(a, b) {
  const seg = (v) => String(v || '0').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const A = seg(a), B = seg(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) > (B[i] || 0); }
  return false;
}

// Résout un nom de sauvegarde en chemin, UNIQUEMENT s'il s'agit d'une
// sauvegarde listée : un nom venant du client ne doit jamais désigner un autre
// fichier du disque (`../notescam.db`, chemin absolu…).
export function backupPath(file) {
  if (typeof file !== 'string' || basename(file) !== file) return null;
  if (!/^notescam-[\w.-]+\.(db|ncbak)$/.test(file)) return null;
  const full = join(BACKUP_DIR, file);
  return existsSync(full) ? full : null;
}

// Contrôle d'intégrité AVANT de programmer une restauration : on ne remplace
// pas une base saine par un fichier corrompu.
export async function verifyBackupFile(path) {
  if (path.endsWith('.ncbak')) {
    try {
      const v = verifyArchiveSync(path);
      const m = v.manifest;
      if (!v.ok) return { ok: false, detail: 'archive altérée ou incomplète (' + v.problems.map((p) => p.kind).slice(0, 3).join(', ') + ')', school: null };
      if (m.appVersion && versionPlusRecente(m.appVersion, appVersion())) {
        return { ok: false, detail: `archive créée par NotesCam ${m.appVersion}, plus récent que cette installation (${appVersion()}). Mettez NotesCam à jour d'abord.`, school: m.school || null };
      }
      return { ok: true, detail: null, school: m.school || null };
    } catch (e) { return { ok: false, detail: e.message, school: null }; }
  }
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
