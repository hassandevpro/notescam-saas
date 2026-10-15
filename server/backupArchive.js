// SAUVEGARDE COHÉRENTE — base de données ET fichiers, en un seul jeu restaurable.
//
// POURQUOI. `backup.js` copie la base par `VACUUM INTO` et rien d'autre. Les
// photos d'élèves, logos, signatures et tampons vivent dans `DATA_DIR/files/`,
// qui n'est jamais sauvegardé. Une restauration ramène donc des élèves dont la
// `photo_url` pointe vers des fichiers qui n'existent plus : la base est intacte
// et toutes les photos sont perdues, silencieusement.
//
// ── FORMAT `.ncbak` (version 1) ─────────────────────────────────────────────
// Un fichier unique, lisible séquentiellement, sans dépendance externe :
//
//   "NCBAK1\n"                      magie (7 octets)
//   <8 octets>                      longueur du manifeste, entier big-endian
//   <manifeste JSON UTF-8>          inventaire complet (ci-dessous)
//   <contenu des entrées>           concaténé, dans l'ordre du manifeste
//
// Le manifeste porte, pour CHAQUE entrée : `kind` (`db` | `file`), `path`,
// `size`, `sha256` et `offset` (position absolue du premier octet). L'offset est
// redondant avec la somme des tailles : c'est délibéré — il permet de lire une
// entrée isolément, et surtout de détecter une archive TRONQUÉE sans la relire
// entièrement (comparer la taille du fichier à `totalBytes`).
//
// Les entrées ne sont pas compressées. Les images le sont déjà, et une archive
// non compressée se vérifie et se restaure en flux, sans charger un octet de
// plus que nécessaire en mémoire. La compression reste ajoutable en couche.
//
// ── POINT DE COHÉRENCE ──────────────────────────────────────────────────────
// L'instantané de la base est pris EN PREMIER (`VACUUM INTO`, copie cohérente
// même pendant les écritures), l'inventaire des fichiers ENSUITE. Entre les
// deux, une école peut encore travailler :
//   • un fichier AJOUTÉ après l'instantané entre dans l'archive sans être
//     référencé par la base restaurée → ORPHELIN, inoffensif, signalé ;
//   • un fichier SUPPRIMÉ après l'instantané reste référencé par la base sans
//     être dans l'archive → RÉFÉRENCE NON RÉSOLUE, signalée au rapport.
// Aucun des deux ne corrompt la restauration ; les deux sont visibles. C'est la
// raison d'être du rapport de restauration : une sauvegarde dont on ne sait pas
// ce qu'elle contient ne vaut rien.
//
// ── SÛRETÉ ──────────────────────────────────────────────────────────────────
// • La restauration écrit dans un répertoire CIBLE EXPLICITE, et refuse le
//   répertoire de données actif sauf `allowInPlace` (jamais utilisé par défaut).
// • Elle travaille dans un dossier de transit, puis PROMEUT : une restauration
//   interrompue ou invalide ne laisse pas une cible à moitié écrite.
// • L'archive source n'est jamais modifiée ni supprimée, même en cas d'échec.

import { createHash } from 'node:crypto';
import {
  closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync,
  readSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ASSET_BUCKET, inventory, referencesOf, sha256File } from './fileInventory.js';

export const MAGIC = Buffer.from('NCBAK1\n', 'utf8');
const HEADER_LEN = MAGIC.length + 8;

const sha256Buf = (buf) => createHash('sha256').update(buf).digest('hex');

// Un chemin d'archive ne doit jamais s'échapper de la cible (`..`, chemin
// absolu, lettre de lecteur). Une archive est une donnée d'entrée : on la traite
// comme hostile.
export function isSafeEntryPath(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..' || seg === '');
}

// ── CRÉATION ────────────────────────────────────────────────────────────────
/**
 * @param {object}   opts
 * @param {object}   opts.db          base ouverte (node:sqlite)
 * @param {string}   opts.dataDir     répertoire de données (contient files/)
 * @param {string}   opts.outPath     archive à écrire (.ncbak)
 * @param {string}  [opts.tmpDir]     dossier de transit pour l'instantané
 * @returns {Promise<{path, manifest, bytes}>}
 */
export async function createArchive({ db, dataDir, outPath, tmpDir }) {
  const filesDir = join(dataDir, 'files');
  const staging = tmpDir || join(dirname(outPath), `.ncbak-tmp-${Date.now()}`);
  mkdirSync(staging, { recursive: true });
  const snapshot = join(staging, 'database.sqlite');

  try {
    // 1. Instantané de la base — point de cohérence de toute l'archive.
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    const dbSize = statSync(snapshot).size;
    const dbSha = await sha256File(snapshot);

    // 2. Inventaire des fichiers, APRÈS l'instantané (cf. en-tête).
    const files = await inventory(filesDir, { withChecksums: true });

    // 3. Références de la base INSTANTANÉE — pas de la base vivante : c'est
    //    l'état restauré qu'il faut pouvoir recouper.
    let references = [];
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const snap = new DatabaseSync(snapshot, { readOnly: true });
      references = referencesOf(snap).map(({ table, column, id, path }) => ({ table, column, id, path }));
      snap.close?.();
    } catch { /* inventaire de références indisponible : l'archive reste valide */ }

    // 4. Manifeste, puis écriture séquentielle.
    const entries = [
      { kind: 'db', path: 'database.sqlite', size: dbSize, sha256: dbSha },
      ...files.map((f) => ({ kind: 'file', path: `${ASSET_BUCKET}/${f.path}`, size: f.size, sha256: f.sha256, mtime: f.mtime })),
    ];
    let offset = 0;
    const manifest = {
      format: 'ncbak', version: 1,
      createdAt: new Date().toISOString(),
      bucket: ASSET_BUCKET,
      entries: entries.map((e) => { const withOffset = { ...e, offset }; offset += e.size; return withOffset; }),
      references,
      totals: { entries: entries.length, files: files.length, bytes: offset, references: references.length },
    };
    const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf8');
    const lenBuf = Buffer.alloc(8);
    lenBuf.writeBigUInt64BE(BigInt(manifestBuf.length));

    mkdirSync(dirname(outPath), { recursive: true });
    const partial = `${outPath}.partial`;
    const out = createWriteStream(partial);
    const write = (buf) => new Promise((res, rej) => out.write(buf, (e) => (e ? rej(e) : res())));
    await write(MAGIC);
    await write(lenBuf);
    await write(manifestBuf);
    for (const e of manifest.entries) {
      const src = e.kind === 'db' ? snapshot : join(filesDir, ...e.path.split('/'));
      await pipeline(createReadStream(src), out, { end: false });
    }
    await new Promise((res, rej) => out.end((err) => (err ? rej(err) : res())));

    // Promotion atomique : une archive partielle n'est jamais visible sous son
    // nom définitif, donc jamais prise pour une sauvegarde valide.
    renameSync(partial, outPath);
    return { path: outPath, manifest, bytes: statSync(outPath).size };
  } finally {
    try { rmSync(staging, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

// ── LECTURE DU MANIFESTE ────────────────────────────────────────────────────
export function readManifest(archivePath) {
  const st = statSync(archivePath);
  if (st.size < HEADER_LEN) throw new Error('Archive tronquée : en-tête incomplet.');
  const fd = openSync(archivePath, 'r');
  try {
    const head = Buffer.alloc(HEADER_LEN);
    readSync(fd, head, 0, HEADER_LEN, 0);
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Ce fichier n’est pas une archive NotesCam (.ncbak).');
    const len = Number(head.readBigUInt64BE(MAGIC.length));
    if (!Number.isSafeInteger(len) || len <= 0 || HEADER_LEN + len > st.size) throw new Error('Archive corrompue : manifeste illisible.');
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, HEADER_LEN);
    let manifest;
    try { manifest = JSON.parse(buf.toString('utf8')); } catch { throw new Error('Archive corrompue : manifeste non lisible en JSON.'); }
    if (manifest?.format !== 'ncbak') throw new Error('Format d’archive inconnu.');
    if (manifest.version !== 1) throw new Error(`Version d’archive non gérée : ${manifest.version}`);
    const dataStart = HEADER_LEN + len;
    const expected = dataStart + (manifest.totals?.bytes ?? 0);
    return { manifest, dataStart, archiveSize: st.size, truncated: st.size < expected, expectedSize: expected };
  } finally { closeSync(fd); }
}

// ── VÉRIFICATION (sans rien écrire) ─────────────────────────────────────────
export async function verifyArchive(archivePath) {
  const { manifest, dataStart, truncated, archiveSize, expectedSize } = readManifest(archivePath);
  const problems = [];
  if (truncated) problems.push({ kind: 'truncated', expectedSize, archiveSize });

  // Chemins dupliqués : deux entrées pour le même chemin rendraient la
  // restauration dépendante de l'ordre. On refuse de deviner.
  const seen = new Set();
  for (const e of manifest.entries) {
    if (seen.has(e.path)) problems.push({ kind: 'duplicate', path: e.path });
    seen.add(e.path);
    if (!isSafeEntryPath(e.path)) problems.push({ kind: 'unsafe_path', path: e.path });
  }

  const fd = openSync(archivePath, 'r');
  const checked = [];
  try {
    for (const e of manifest.entries) {
      const start = dataStart + e.offset;
      if (start + e.size > archiveSize) { problems.push({ kind: 'missing_payload', path: e.path }); continue; }
      const h = createHash('sha256');
      let read = 0;
      const chunk = Buffer.alloc(Math.min(e.size || 1, 1 << 20));
      while (read < e.size) {
        const n = readSync(fd, chunk, 0, Math.min(chunk.length, e.size - read), start + read);
        if (n <= 0) break;
        h.update(chunk.subarray(0, n));
        read += n;
      }
      const sha = h.digest('hex');
      if (read !== e.size) problems.push({ kind: 'short_read', path: e.path, read, size: e.size });
      else if (sha !== e.sha256) problems.push({ kind: 'checksum_mismatch', path: e.path, expected: e.sha256, got: sha });
      else checked.push(e.path);
    }
  } finally { closeSync(fd); }

  return { ok: problems.length === 0, manifest, checked, problems };
}

// ── RESTAURATION ────────────────────────────────────────────────────────────
/**
 * Restaure dans un répertoire CIBLE ISOLÉ et produit un rapport.
 * L'archive source n'est jamais modifiée, y compris en cas d'échec.
 *
 * @param {object}  opts
 * @param {string}  opts.archivePath
 * @param {string}  opts.targetDir           répertoire de données à créer/remplir
 * @param {string} [opts.activeDataDir]      répertoire de production à protéger
 * @param {boolean}[opts.allowInPlace=false] autorise targetDir === activeDataDir
 */
export async function restoreArchive({ archivePath, targetDir, activeDataDir, allowInPlace = false }) {
  const target = resolve(targetDir);
  if (activeDataDir && !allowInPlace && target === resolve(activeDataDir)) {
    throw new Error('Restauration refusée : la cible est le répertoire de données ACTIF. Restaurez dans un répertoire isolé, ou passez allowInPlace.');
  }

  const verification = await verifyArchive(archivePath);
  const fatal = verification.problems.filter((p) => p.kind !== 'checksum_mismatch');
  if (fatal.length) {
    return {
      ok: false, restored: [], skipped: [], archivePath, targetDir: target,
      report: report({ verification, restored: [], mismatches: [], unresolved: [], orphans: [], aborted: true }),
    };
  }

  // Transit puis promotion : une interruption ne laisse pas de cible partielle.
  const staging = `${target}.restoring-${Date.now()}`;
  mkdirSync(staging, { recursive: true });
  const restored = [], mismatches = [];
  try {
    const { manifest, dataStart } = readManifest(archivePath);
    for (const e of manifest.entries) {
      const bad = verification.problems.find((p) => p.path === e.path && p.kind === 'checksum_mismatch');
      if (bad) { mismatches.push({ path: e.path, expected: e.sha256, got: bad.got }); continue; }
      const dest = e.kind === 'db'
        ? join(staging, 'notescam.db')
        : join(staging, 'files', ...e.path.split('/'));
      mkdirSync(dirname(dest), { recursive: true });
      await pipeline(
        createReadStream(archivePath, { start: dataStart + e.offset, end: dataStart + e.offset + e.size - 1 }),
        createWriteStream(dest),
      );
      restored.push(e.path);
    }

    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    renameSync(staging, target);
  } catch (err) {
    try { rmSync(staging, { recursive: true, force: true }); } catch { /* best-effort */ }
    throw err;
  }

  // Rapport : que vaut CE QUI A ÉTÉ RESTAURÉ ?
  const present = new Set(
    restored.filter((p) => p !== 'database.sqlite').map((p) => p.replace(new RegExp(`^${ASSET_BUCKET}/`), '')),
  );
  const refs = manifestReferences(archivePath);
  const unresolved = refs.filter((r) => !present.has(r.path));
  const referenced = new Set(refs.map((r) => r.path));
  const orphans = [...present].filter((p) => !referenced.has(p)).sort();

  return {
    ok: mismatches.length === 0,
    archivePath, targetDir: target,
    restored, mismatches,
    report: report({ verification, restored, mismatches, unresolved, orphans, aborted: false }),
  };
}

function manifestReferences(archivePath) {
  try { return readManifest(archivePath).manifest.references || []; } catch { return []; }
}

function report({ verification, restored, mismatches, unresolved, orphans, aborted }) {
  return {
    generatedAt: new Date().toISOString(),
    aborted,
    archiveValid: verification.ok,
    counts: {
      entriesInArchive: verification.manifest?.totals?.entries ?? 0,
      restored: restored.length,
      checksumMismatches: mismatches.length,
      unresolvedReferences: unresolved.length,
      orphanFiles: orphans.length,
    },
    problems: verification.problems,
    mismatches,
    unresolvedReferences: unresolved,
    orphanFiles: orphans,
  };
}

// Écrit le rapport à côté de l'archive (JSON lisible par un exploitant).
export function writeReport(reportObj, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(reportObj, null, 2), 'utf8');
  return outPath;
}

export { sha256Buf, unlinkSync as _unused };
export const _internals = { HEADER_LEN, sep };
