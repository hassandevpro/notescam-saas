// Sauvegarde / restauration COMPLÈTE d'un établissement — logique pure.
//
// PRINCIPE CENTRAL : la liste des tables n'est écrite NULLE PART dans l'app.
// Elle est DÉCOUVERTE à chaque export depuis le schéma réel (RPC
// `backup_catalog`, cloud et LAN) selon une règle unique :
//
//     toute table qui porte une colonne `school_id`  →  fait partie de la
//     sauvegarde de l'école (+ la ligne `schools` elle-même).
//
// Conséquence voulue : un module ajouté demain (nouvelle table avec
// `school_id`, comme TOUTES les tables métier du projet) est sauvegardé,
// exporté et restauré sans modifier une ligne de ce fichier.
//
// Les seules exclusions sont des SECRETS ou de la mécanique interne — voir
// EXCLUDED_TABLE_PATTERNS. Elles sont listées dans le manifeste de chaque
// sauvegarde (`excluded`), pour qu'une table ignorée ne le soit jamais en
// silence.
//
// Format : { format: 'notescam-backup', version: 1, schoolId, createdAt,
//            edition, tables: { [table]: rows[] }, catalog, counts, excluded }

export const BACKUP_FORMAT = 'notescam-backup';
export const BACKUP_VERSION = 1;

// Secrets (jetons, clés, mots de passe, codes d'appairage, identifiants SMS)
// et mécanique de synchronisation : n'ont rien à faire dans un fichier qu'un
// admin télécharge, envoie par WhatsApp ou laisse sur une clé USB.
export const EXCLUDED_TABLE_PATTERNS = [
  /token/i, /secret/i, /password/i, /pwd/i, /pairing/i, /credential/i,
  /sms_settings/i, /^sync_/i, /^school_backups$/i,
];

export function isExcludedTable(name) {
  return EXCLUDED_TABLE_PATTERNS.some((re) => re.test(String(name)));
}

// Sépare le catalogue brut en tables sauvegardées / exclues.
// `catalog` : [{ table, pk: ['id'], deps: ['autre_table', ...], scope: 'school_id'|'id' }]
export function splitCatalog(catalog) {
  const included = [], excluded = [];
  for (const t of catalog || []) {
    if (!t?.table) continue;
    (isExcludedTable(t.table) ? excluded : included).push(t);
  }
  return { included, excluded: excluded.map((t) => t.table).sort() };
}

// Ordre d'insertion : parents avant enfants (tri topologique sur les FK).
// Les cycles et auto-références ne bloquent pas : les tables restantes sont
// ajoutées par ordre alphabétique, et la restauration rejoue en plusieurs
// passes les lignes refusées pour une FK pas encore présente.
export function orderTables(catalog) {
  const names = new Set(catalog.map((t) => t.table));
  const deps = new Map(catalog.map((t) => [
    t.table, new Set((t.deps || []).filter((d) => d !== t.table && names.has(d))),
  ]));
  const ordered = [];
  const done = new Set();
  let progress = true;
  while (done.size < names.size && progress) {
    progress = false;
    const ready = [...names].filter((n) => !done.has(n) && [...deps.get(n)].every((d) => done.has(d))).sort();
    for (const n of ready) { ordered.push(n); done.add(n); progress = true; }
  }
  for (const n of [...names].filter((n) => !done.has(n)).sort()) ordered.push(n);
  // `schools` toujours en tête : tout le reste en dépend.
  return ordered.includes('schools') ? ['schools', ...ordered.filter((n) => n !== 'schools')] : ordered;
}

export function buildBundle({ schoolId, edition, catalog, tables, excluded = [], createdAt }) {
  const counts = {};
  for (const [t, rows] of Object.entries(tables)) counts[t] = rows.length;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schoolId,
    edition: edition || null,
    createdAt: createdAt || new Date().toISOString(),
    catalog: catalog.map(({ table, pk, deps }) => ({ table, pk: pk || ['id'], deps: deps || [] })),
    excluded,
    counts,
    totalRows: Object.values(counts).reduce((a, n) => a + n, 0),
    tables,
  };
}

// Vérifie qu'un fichier est une sauvegarde exploitable POUR CETTE école.
// Restaurer la sauvegarde d'une autre école mélangerait deux établissements
// sous les mêmes identifiants : refusé, sans option de contournement.
export function validateBundle(bundle, { schoolId } = {}) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') return { ok: false, errors: ['Fichier illisible.'] };
  if (bundle.format !== BACKUP_FORMAT) errors.push('Ce fichier n’est pas une sauvegarde NotesCam.');
  else if (bundle.version !== BACKUP_VERSION) errors.push(`Version de sauvegarde non gérée : ${bundle.version}.`);
  if (!bundle.tables || typeof bundle.tables !== 'object' || Array.isArray(bundle.tables)) errors.push('Sauvegarde sans données (champ « tables » absent).');
  if (schoolId && bundle.schoolId && bundle.schoolId !== schoolId) {
    errors.push('Cette sauvegarde appartient à un AUTRE établissement : restauration refusée.');
  }
  if (!errors.length) {
    for (const [t, rows] of Object.entries(bundle.tables)) {
      if (!Array.isArray(rows)) { errors.push(`Table ${t} : contenu invalide.`); continue; }
      if (isExcludedTable(t)) errors.push(`Table ${t} : table sensible, refusée à l’import.`);
      const foreign = rows.find((r) => r && 'school_id' in r && r.school_id != null && schoolId && r.school_id !== schoolId);
      if (foreign) errors.push(`Table ${t} : contient des lignes d’un autre établissement.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const keyOf = (row, pk) => pk.map((c) => String(row?.[c] ?? '')).join('|');

// Plan de restauration pour UNE table.
//   mode 'missing'   : ne réinsère QUE les lignes absentes (défaut, sans risque :
//                      rien de ce qui existe n'est modifié).
//   mode 'overwrite' : réinsère les absentes ET remet les existantes à l'état
//                      de la sauvegarde (annule les modifications ultérieures).
// Les lignes ajoutées APRÈS la sauvegarde ne sont jamais supprimées : une
// restauration ne détruit pas de données.
// Colonnes techniques de synchronisation : ne comptent pas comme une différence.
const SYNC_COLUMNS = new Set(['updated_at', 'version', 'device_id']);
const norm = (v) => (v === true ? 1 : v === false ? 0 : v === undefined ? null
  : (v && typeof v === 'object') ? JSON.stringify(v) : v);
export function rowsDiffer(saved, current) {
  for (const [k, v] of Object.entries(saved || {})) {
    if (SYNC_COLUMNS.has(k) || !(k in (current || {}))) continue;
    let a = norm(v), b = norm(current[k]);
    // SQLite rend du JSON en texte, Postgres en objet : on compare le fond.
    if (typeof a === 'string' && typeof b !== 'string' && b != null) a = norm((() => { try { return JSON.parse(a); } catch { return a; } })());
    if (typeof b === 'string' && typeof a !== 'string' && a != null) b = norm((() => { try { return JSON.parse(b); } catch { return b; } })());
    if (a != null && b != null && typeof a !== typeof b) { if (String(a) !== String(b)) return true; continue; }
    if (a !== b) return true;
  }
  return false;
}

// Plan de restauration pour UNE table.
//   mode 'missing'   : ne réinsère QUE les lignes absentes (défaut, sans risque :
//                      rien de ce qui existe n'est modifié).
//   mode 'overwrite' : réinsère les absentes ET remet les existantes à l'état
//                      de la sauvegarde (annule les modifications ultérieures).
//                      Avec `existingRows` (Map clé → ligne), seules les lignes
//                      qui DIFFÈRENT sont réécrites : réécrire une ligne
//                      identique est inutile et heurte les tables immuables
//                      (paiements), qui la refuseraient.
// Les lignes ajoutées APRÈS la sauvegarde ne sont jamais supprimées : une
// restauration ne détruit pas de données.
export function planTable({ rows, existingKeys, existingRows, pk = ['id'], mode = 'missing' }) {
  const existing = existingRows instanceof Map ? new Set(existingRows.keys())
    : existingKeys instanceof Set ? existingKeys : new Set(existingKeys || []);
  const missing = [], present = [];
  for (const r of rows || []) (existing.has(keyOf(r, pk)) ? present : missing).push(r);
  if (mode !== 'overwrite') return { insert: missing, update: [], unchanged: present.length };
  const update = existingRows instanceof Map
    ? present.filter((r) => rowsDiffer(r, existingRows.get(keyOf(r, pk))))
    : present;
  return { insert: missing, update, unchanged: present.length - update.length };
}

export function rowKey(row, pk = ['id']) { return keyOf(row, pk); }

// Découpe en lots (limite de taille des requêtes PostgREST / API LAN).
export function chunk(arr, size = 500) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function backupFileName(schoolName, date = new Date()) {
  const slug = String(schoolName || 'ecole').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'ecole';
  const stamp = date.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `notescam-${slug}-${stamp}.json`;
}
