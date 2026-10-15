// INVENTAIRE DES FICHIERS ET DES RÉFÉRENCES — socle commun.
//
// Trois consommateurs partagent ce module, et c'est voulu : une sauvegarde, une
// réconciliation et une comparaison d'inventaires avant synchronisation doivent
// répondre à la MÊME question (« quels fichiers existent, lesquels sont
// référencés ») avec la MÊME réponse. Deux implémentations divergeraient.
//
// Aucune écriture, aucune suppression : ce module ne fait que LIRE.

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, posix, sep } from 'node:path';

export const ASSET_BUCKET = 'school-assets';

// Les colonnes qui portent une référence de fichier, table par table.
// Les quatre tables sont TOUTES synchronisées (cf. SYNCED_TABLES) : leurs
// références voyagent donc entre LAN et Cloud, alors que les fichiers non.
export const REFERENCE_COLUMNS = Object.freeze([
  { table: 'schools',      columns: ['logo_url', 'stamp_url', 'signature_url'] },
  { table: 'school_units', columns: ['logo_url', 'stamp_url', 'signature_url'] },
  { table: 'students',     columns: ['photo_url'] },
  { table: 'staff',        columns: ['photo_url'] },
]);

// ── Normalisation d'une référence ────────────────────────────────────────────
// JUMEAU SERVEUR de `assetPath()` (src/lib/storage.js). Les deux doivent rendre
// le même chemin pour la même valeur ; `_file_reconcile.test.mjs` rejoue les cas
// de parité. Trois formes coexistent en base, selon l'édition d'origine :
//   1. URL absolue Supabase   https://….supabase.co/…/school-assets/<ecole>/x.jpg
//   2. URL relative LAN       /files/school-assets/<ecole>/x.jpg?v=…
//   3. chemin déjà relatif    <ecole>/students/42.jpg
// Une valeur étrangère (logo distant, data:) renvoie null : elle ne désigne
// aucun fichier local, et ne doit donc jamais être comptée comme manquante.
const MARKER = `/${ASSET_BUCKET}/`;

export function storagePathOf(stored) {
  if (!stored || typeof stored !== 'string') return null;
  const value = stored.trim();
  if (!value) return null;
  if (/^data:/i.test(value)) return null;
  const base = value.split(/[?#]/)[0];
  const i = base.indexOf(MARKER);
  const nu = (p) => p.replace(/^\/+/, '');
  if (i !== -1) {
    let p = base.slice(i + MARKER.length);
    try { p = decodeURIComponent(p); } catch { /* chemin exotique : tel quel */ }
    return nu(p) || null;
  }
  if (/^https?:/i.test(value)) return null;
  return nu(base) || null;
}

// ── Inventaire PHYSIQUE ──────────────────────────────────────────────────────

export function sha256File(fullPath) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(fullPath);
    s.on('error', reject);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

// Chemins RELATIFS AU BUCKET, triés — l'ordre stable rend deux inventaires
// comparables ligne à ligne et une archive reproductible.
export function listBucketFiles(filesDir, bucket = ASSET_BUCKET) {
  const root = join(filesDir, bucket);
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}

// Inventaire complet : chemin, taille, empreinte. `withChecksums: false` permet
// un inventaire rapide (comparaison de présence) sans relire chaque octet.
export async function inventory(filesDir, { bucket = ASSET_BUCKET, withChecksums = true } = {}) {
  const root = join(filesDir, bucket);
  const entries = [];
  for (const rel of listBucketFiles(filesDir, bucket)) {
    const full = join(root, rel.split('/').join(sep));
    const st = statSync(full);
    entries.push({
      path: rel,
      size: st.size,
      mtime: st.mtime.toISOString(),
      sha256: withChecksums ? await sha256File(full) : null,
    });
  }
  return entries;
}

// ── Inventaire des RÉFÉRENCES (base) ─────────────────────────────────────────
// Renvoie une entrée par référence NON VIDE et DÉSIGNANT UN FICHIER LOCAL.
// `raw` est conservé : un rapport doit pouvoir montrer la valeur telle qu'elle
// est en base, pas seulement sa forme normalisée.
export function referencesOf(db) {
  const refs = [];
  for (const { table, columns } of REFERENCE_COLUMNS) {
    let rows;
    try {
      rows = db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`).all();
    } catch {
      continue; // table absente d'un schéma plus ancien : on ne casse pas l'audit
    }
    for (const row of rows) {
      for (const col of columns) {
        const raw = row[col];
        if (!raw) continue;
        const path = storagePathOf(raw);
        if (!path) continue; // valeur étrangère (logo distant, data:)
        refs.push({ table, column: col, id: row.id, raw, path });
      }
    }
  }
  return refs;
}

// ── Rapprochement références ↔ fichiers ──────────────────────────────────────
// `missing` : une ligne de la base pointe vers un fichier absent  → photo cassée
// `orphans` : un fichier que plus aucune ligne ne référence       → place perdue
//
// Aucune des deux n'est réparée ni supprimée ici : ce module CONSTATE.
export function reconcile(refs, files) {
  const present = new Set(files.map((f) => (typeof f === 'string' ? f : f.path)));
  const referenced = new Set(refs.map((r) => r.path));
  const missing = refs.filter((r) => !present.has(r.path));
  const orphans = [...present].filter((p) => !referenced.has(p)).sort();
  return {
    checkedAt: new Date().toISOString(),
    counts: {
      references: refs.length,
      files: present.size,
      missing: missing.length,
      orphans: orphans.length,
      distinctReferenced: referenced.size,
    },
    missing,
    orphans,
  };
}

// ── Comparaison de DEUX inventaires (préalable à toute synchronisation) ──────
// LECTURE SEULE, et c'est la seule chose que la phase « avant autorisation »
// doit savoir faire. Le chemin sert de clé logique : il est déterministe
// (`<ecole>/students/<id>.jpg`, `<ecole>/<type>.<ext>`), donc stable et unique —
// `conflicts` existe justement pour PROUVER cette hypothèse sur le terrain :
// un même chemin portant deux empreintes signale que la clé ne suffit pas, et
// doit arrêter toute idée de transfert automatique.
export function compareInventories(left, right, { leftName = 'lan', rightName = 'cloud' } = {}) {
  const idx = (list) => new Map(list.map((e) => [typeof e === 'string' ? e : e.path, e]));
  const L = idx(left);
  const R = idx(right);
  const onlyLeft = [], onlyRight = [], conflicts = [], identical = [];
  for (const [path, l] of L) {
    const r = R.get(path);
    if (!r) { onlyLeft.push(path); continue; }
    const ls = l.sha256 ?? null, rs = r.sha256 ?? null;
    if (ls && rs && ls !== rs) conflicts.push({ path, [`${leftName}Sha256`]: ls, [`${rightName}Sha256`]: rs, [`${leftName}Size`]: l.size, [`${rightName}Size`]: r.size });
    else identical.push(path);
  }
  for (const path of R.keys()) if (!L.has(path)) onlyRight.push(path);
  return {
    comparedAt: new Date().toISOString(),
    counts: {
      [leftName]: L.size, [rightName]: R.size,
      [`only_${leftName}`]: onlyLeft.length, [`only_${rightName}`]: onlyRight.length,
      conflicts: conflicts.length, identical: identical.length,
    },
    onlyLeft: onlyLeft.sort(), onlyRight: onlyRight.sort(), conflicts, identical,
  };
}

export const toPosix = (p) => p.split(sep).join(posix.sep);
