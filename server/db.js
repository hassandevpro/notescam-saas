// Couche base de données — `node:sqlite` (DatabaseSync), intégré à Node 24+.
// AUCUN module natif à compiler : packaging .exe trivial. Synchrone par
// design : naturellement sérialisé, ce qui convient à une école.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Emplacement des données : configurable pour l'installation packagée
// (C:\ProgramData\NotesCam). Par défaut, ./server/data en développement.
export const DATA_DIR = process.env.NOTESCAM_DATA_DIR || join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = join(DATA_DIR, 'notescam.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');   // lecteurs concurrents + écriture sûre
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');  // attend si un autre process écrit

// Applique le schéma (idempotent : tout est IF NOT EXISTS)
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// --- Introspection : colonnes réelles par table -------------------
// Sert à filtrer les payloads entrants -> on ignore toute clé inconnue
// au lieu de planter (robustesse face aux divergences cloud/LAN).
const _columnsCache = new Map();
export function tableColumns(table) {
  if (_columnsCache.has(table)) return _columnsCache.get(table);
  const rows = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all();
  const cols = new Set(rows.map((r) => r.name));
  _columnsCache.set(table, cols);
  return cols;
}

// Liste blanche des tables exposées par l'API générique.
export const ALLOWED_TABLES = new Set([
  'schools', 'school_users', 'classes', 'subjects', 'students', 'grades',
  'teachers', 'student_fees', 'fee_payments', 'attendance', 'student_absences',
  'student_class_assignments', 'school_messages', 'teacher_notifications',
  'sequence_dates', 'timetable_slots', 'country_education_config',
  'evaluation_system', 'superadmins',
]);

// Quote sûr d'un identifiant SQLite (table / colonne) : double les guillemets.
export function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// Filtre un objet pour ne garder que les colonnes existantes de la table.
export function pickColumns(table, obj) {
  const cols = tableColumns(table);
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (cols.has(k)) out[k] = normalizeValue(v);
  }
  return out;
}

// SQLite ne connaît ni booléen ni objet : on normalise.
export function normalizeValue(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v && typeof v === 'object') return JSON.stringify(v);
  if (v === undefined) return null;
  return v;
}

export function getSchool() {
  return db.prepare('SELECT * FROM schools LIMIT 1').get() || null;
}

// Transaction atomique (node:sqlite n'a pas l'API .transaction de better-sqlite3).
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* déjà rollback */ }
    throw e;
  }
}
