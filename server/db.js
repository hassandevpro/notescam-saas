// Couche base de données — `node:sqlite` (DatabaseSync), intégré à Node 24+.
// AUCUN module natif à compiler : packaging .exe trivial. Synchrone par
// design : naturellement sérialisé, ce qui convient à une école.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

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

// --- Migrations légères -----------------------------------------------
// `CREATE TABLE IF NOT EXISTS` ne touche pas une table déjà créée : pour
// ajouter une colonne aux bases existantes, on fait un ALTER conditionnel
// (node:sqlite ne connaît pas « ADD COLUMN IF NOT EXISTS »).
function ensureColumn(table, column, ddl) {
  const has = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all()
    .some((r) => r.name === column);
  if (!has) db.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${ddl}`);
}
ensureColumn('subjects', 'position', 'position INTEGER');   // ordre des matières sur le bulletin
ensureColumn('students', 'photo_url', 'photo_url TEXT');    // photo de l'élève
ensureColumn('students', 'statut_etablissement', 'statut_etablissement TEXT'); // nouveau/ancien dans l'établissement → frais d'inscription
// Frais flexibles : instantané des tranches + mode de paiement figé + ajustements
// (bourses/remises). Sur bases LAN déjà installées, ces colonnes manquaient et
// pickColumns avalait silencieusement les tranches (donnée perdue au rechargement).
ensureColumn('student_fees', 'tranches',     "tranches TEXT NOT NULL DEFAULT '[]'");
ensureColumn('student_fees', 'payment_mode', 'payment_mode TEXT');
ensureColumn('student_fees', 'adjustments',  "adjustments TEXT NOT NULL DEFAULT '[]'");
// Frais d'inscription par classe (facturés en plus aux nouveaux dans l'établissement).
ensureColumn('class_fee_grids', 'amount_inscription', 'amount_inscription INTEGER NOT NULL DEFAULT 0');
ensureColumn('timetable_slots', 'room', 'room TEXT');       // salle du cours (Vue Salle + conflits de salle)
// Affectation des enseignants (titulaire de classe + prof par matière). Absentes
// du 1er schéma LAN -> sans elles, pickColumns avalait teacher_id en silence et
// l'assignation « disparaissait » au rechargement. Voir aussi le garde-fou plus bas.
ensureColumn('classes',  'cycle',        'cycle TEXT');
ensureColumn('classes',  'teacher_id',   'teacher_id TEXT');
ensureColumn('classes',  'max_students', 'max_students INTEGER');
ensureColumn('classes',  'grade_max',    'grade_max INTEGER'); // barème de classe (/10, /20, /30…)
ensureColumn('classes',  'unit_id',      'unit_id TEXT');       // rattachement à une unité pédagogique (complexe scolaire)
// Moteur « officiel » (MINEDUB + MINESEC). Sans ces colonnes, la bascule du moteur
// et la série lycée étaient avalées par pickColumns en LAN : le choix « Officiel
// Cameroun » ne persistait pas et le bulletin ne basculait jamais (bug vécu).
ensureColumn('classes',  'serie',           'serie TEXT');           // série lycée (A, C, D…) — résolution second cycle
ensureColumn('classes',  'bulletin_engine', 'bulletin_engine TEXT'); // surcharge de moteur PAR CLASSE (null = hérite de l'école)
ensureColumn('subjects', 'teacher_id',   'teacher_id TEXT');
// Matières composites (modèles académiques) — parent + méthode de calcul.
ensureColumn('subjects', 'parent_id',   'parent_id TEXT');
ensureColumn('subjects', 'calc_method', 'calc_method TEXT');
ensureColumn('subjects', 'formula',     'formula TEXT');
ensureColumn('schools',  'currency',     "currency TEXT NOT NULL DEFAULT 'XAF'"); // devise officielle (affichage multi-devises)
ensureColumn('schools',  'ge_grade_max', 'ge_grade_max INTEGER');  // barème GE (/10 ou /20) — lu par geGradeMax()
ensureColumn('schools',  'period_mode',  "period_mode TEXT DEFAULT 'auto'"); // pilotage des périodes : 'auto' | 'manual'
ensureColumn('schools',  'grade_entry_mode', "grade_entry_mode TEXT NOT NULL DEFAULT 'principal'"); // 'principal' | 'subject' (enseignant de matière)
ensureColumn('schools',  'bulletin_subject_mode', "bulletin_subject_mode TEXT NOT NULL DEFAULT 'synthetic'"); // 'synthetic' | 'detailed'
// Moteur de bulletin de l'établissement : 'classic' | 'officiel' (+ anciens drapeaux
// minesec/minedub/apc… rétro-compatibles). Absente du schéma LAN d'origine → le
// choix « Officiel Cameroun » n'était jamais persisté (avalé par pickColumns).
ensureColumn('schools',  'bulletin_engine', "bulletin_engine TEXT NOT NULL DEFAULT 'classic'");
ensureColumn('schools',  'apc_bulletin_cols', 'apc_bulletin_cols TEXT'); // colonnes du bulletin APC premier cycle (JSON)
ensureColumn('schools',  'establishment_no', 'establishment_no TEXT'); // N° officiel établissement (en-tête bulletin)
ensureColumn('schools',  'bulletin_font',    'bulletin_font TEXT');    // police choisie pour le bulletin
// Relevés de notes — signatures + noms des 2 autorités additionnelles (le chef
// d'établissement réutilise signature_url/stamp_url/director). Sans ces colonnes,
// pickColumns avalerait les champs en silence en LAN.
ensureColumn('schools',  'censeur_signature_url',     'censeur_signature_url TEXT');
ensureColumn('schools',  'censeur_name',              'censeur_name TEXT');
ensureColumn('schools',  'surveillant_signature_url', 'surveillant_signature_url TEXT');
ensureColumn('schools',  'surveillant_name',          'surveillant_name TEXT');
ensureColumn('users',    'cloud_user_id',    'cloud_user_id TEXT');    // pont d'identifiants cloud ↔ local (bases déjà installées)
// Champs « personnel » communs ajoutés aux enseignants : ils sont un sous-type
// du personnel (cf. table `staff`) et portent donc le même socle d'informations.
for (const [col, ddl] of [
  ['matricule', 'matricule TEXT'], ['gender', 'gender TEXT'], ['address', 'address TEXT'],
  ['photo_url', 'photo_url TEXT'], ['fonction', 'fonction TEXT'], ['hire_date', 'hire_date TEXT'],
  ['status', 'status TEXT'], ['documents', 'documents TEXT'],
]) ensureColumn('teachers', col, ddl);

// --- Synchronisation continue LAN ↔ Cloud (Phase 2) -------------------
// Tables dont les changements sont répliqués vers/depuis le cloud. Chacune
// reçoit updated_at / version / device_id pour la résolution LWW + l'outbox.
export const SYNCED_TABLES = new Set([
  'schools', 'school_units', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'staff', 'grades', 'student_fees', 'fee_payments',
  'class_fee_grids',
  'attendance', 'student_absences', 'student_class_assignments',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
]);
for (const t of SYNCED_TABLES) {
  ensureColumn(t, 'updated_at', 'updated_at TEXT');                  // horodatage du dernier changement (LWW)
  ensureColumn(t, 'version',    'version INTEGER NOT NULL DEFAULT 1'); // compteur monotone (départage)
  ensureColumn(t, 'device_id',  'device_id TEXT');                    // origine du changement (anti-écho + départage)
}

// Identifiant STABLE de cette installation (origine des changements locaux).
let _deviceId = null;
export function deviceId() {
  if (_deviceId) return _deviceId;
  const p = join(DATA_DIR, 'device-id.key');
  try {
    if (existsSync(p)) _deviceId = readFileSync(p, 'utf8').trim();
    else { _deviceId = randomUUID(); writeFileSync(p, _deviceId, { mode: 0o600 }); }
  } catch { _deviceId = 'device-unknown'; }
  return _deviceId;
}

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
  'schools', 'school_units', 'school_users', 'classes', 'subjects', 'students', 'grades',
  'teachers', 'staff', 'student_fees', 'fee_payments', 'class_fee_grids',
  'attendance', 'student_absences',
  'student_class_assignments', 'school_messages', 'teacher_notifications',
  'sequence_dates', 'timetable_slots', 'country_education_config',
  'evaluation_system', 'superadmins', 'academic_periods',
]);

// Quote sûr d'un identifiant SQLite (table / colonne) : double les guillemets.
export function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// Filtre un objet pour ne garder que les colonnes existantes de la table.
// Ignorer une clé inconnue est volontaire (robustesse face aux divergences
// cloud/LAN), MAIS un silence total cache les vraies dérives de schéma : une
// colonne que le cloud possède et que le schéma LAN a oubliée est « sauvée »
// côté app puis perdue au rechargement (bug vécu sur classes.teacher_id).
// -> on JOURNALISE chaque colonne droppée, une seule fois par (table.colonne),
// pour que toute future divergence saute aux yeux dans les logs serveur.
const _droppedWarned = new Set();
export function pickColumns(table, obj) {
  const cols = tableColumns(table);
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (cols.has(k)) out[k] = normalizeValue(v);
    else {
      const sig = `${table}.${k}`;
      if (!_droppedWarned.has(sig)) {
        _droppedWarned.add(sig);
        console.warn(`[schema] colonne inconnue ignorée: ${sig} — le schéma LAN a peut-être divergé du cloud (donnée non persistée).`);
      }
    }
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
