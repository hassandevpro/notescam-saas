// server/migrate.js
// ETL one-shot Supabase (cloud) → SQLite (Local/LAN).
//
// « Local » et « LAN » partagent ce même serveur + cette même base : la migration
// est UNIQUE, le mode n'est qu'un HOST d'écoute. Internet n'est requis que pendant
// cette opération ; ensuite la base SQLite est autonome (offline total).
//
// Réutilise db / tx / pickColumns / tableColumns (server/db.js). On copie les
// lignes telles quelles, idempotent (ON CONFLICT). AUCUNE logique métier ajoutée.
//
// Le client Supabase est importé DYNAMIQUEMENT (uniquement à la migration réelle)
// ou injecté via `clientFactory` (tests sans réseau ni dépendance).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, tx, pickColumns, tableColumns, DATA_DIR } from './db.js';
import { hashPassword } from './security.js';
import { mirrorToCloud } from './authBridge.js';

const FILES_DIR = process.env.NOTESCAM_FILES_DIR || join(DATA_DIR, 'files');
const TOKEN_PATH = join(DATA_DIR, 'server-token.key');
const PAGE = 1000;

// Ordre d'insertion = ordre des FK (parents avant enfants). users/school_users
// sont (re)créés à part : auth.users n'est pas lisible (mots de passe).
//
// Couvre TOUS les modules (ETL complet) : structure académique + notes du moteur
// officiel + catalogue de frais + budgets V3 + RH + gouvernance + immobilisations
// + signalements + notifications + journal d'événements + vie scolaire.
// EXCLUS volontairement : les référentiels GLOBAUX du moteur officiel (apc_*/sc_*/
// mat_*/prim_* de configuration) que chaque édition installe via son propre seed
// (build-officiel-seed) — seules les NOTES scolaires (school-scoped) migrent ;
// et applied_decisions/applied_budget_ops (registres d'idempotence LOCAUX au LAN,
// sans school_id — reconstruits par l'applicateur, jamais transportés).
const TABLE_ORDER = [
  // Structure de base
  'school_units', 'academic_periods',
  'classes', 'subjects', 'students', 'teachers', 'staff', 'grades',
  'student_fees', 'class_fee_grids', 'fee_payments',
  'attendance', 'student_absences',
  'student_class_assignments', 'school_messages', 'teacher_notifications',
  'sequence_dates', 'timetable_slots', 'evaluation_system', 'country_education_config',
  // Notes du moteur officiel (référentiels non migrés → installés par le seed LAN)
  'apc_notes', 'mat_observations', 'prim_notes',
  // Catalogue de frais
  'fee_catalog', 'student_fee_items',
  // Budgets V3 (ordre FK)
  'budgets', 'budget_periods', 'budget_chapters',
  'budget_line_periods', 'budget_line_sectors',
  'budget_expenses', 'budget_unlock_requests',
  'budget_reallocations', 'budget_revisions', 'budget_line_reallocations',
  // Ressources humaines
  'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance', 'hr_career_events',
  // Gouvernance
  'governance_roles', 'user_governance_roles', 'governance_role_history',
  // Immobilisations
  'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  // Signalements
  'signalements', 'signalement_comments', 'signalement_history',
  // Notifications
  'notifications', 'notification_outbox',
  // Journal d'événements / audit
  'domain_events', 'audit_events',
  // Vie scolaire (discipline) — incidents avant sanctions/convocations/conseil
  'late_arrivals', 'disciplinary_incidents', 'student_warnings', 'exit_permissions',
  'disciplinary_actions', 'parent_meetings', 'student_detentions', 'discipline_statistics',
];

// Clé de conflit par table (les tables de config n'ont pas de colonne `id`).
const CONFLICT_KEYS = {
  country_education_config: 'country_system',
  evaluation_system: 'country_system',
};

// Colonnes JSON/jsonb côté cloud : stockées en TEXT côté LAN. À la lecture cloud
// elles arrivent en objet/tableau JS → on les sérialise avant l'écriture SQLite
// (géré génériquement dans writeRows : toute valeur objet → JSON.stringify).

const ASSET_FIELDS = {
  schools: ['logo_url', 'stamp_url', 'signature_url'],
  students: ['photo_url'],
};

const log = (cb, phase, detail = {}) => { try { cb?.({ phase, ...detail }); } catch { /* ignore */ } };

// Pagination complète d'une table, scoped par école si la colonne existe.
async function pullAll(supa, table, schoolId) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supa.from(table).select('*').range(from, from + PAGE - 1);
    if (tableColumns(table).has('school_id')) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// Écrit un lot dans SQLite (upsert idempotent), colonnes filtrées par le schéma LAN.
function writeRows(table, rows) {
  if (!rows.length) return 0;
  const conflict = CONFLICT_KEYS[table] || 'id';
  let n = 0;
  tx(() => {
    for (const raw of rows) {
      const rec = pickColumns(table, raw);
      if (conflict === 'id' && !('id' in rec) && tableColumns(table).has('id')) rec.id = randomUUID();
      const cols = Object.keys(rec);
      if (!cols.length) continue;
      const ph = cols.map(() => '?').join(', ');
      const upd = cols.filter((c) => c !== conflict).map((c) => `"${c}" = excluded."${c}"`).join(', ');
      const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${ph})`
        + (upd ? ` ON CONFLICT("${conflict}") DO UPDATE SET ${upd}` : ` ON CONFLICT("${conflict}") DO NOTHING`);
      // jsonb/array côté cloud → objet/tableau JS : SQLite ne sait pas lier un objet,
      // on sérialise (les colonnes concernées sont en TEXT côté LAN).
      db.prepare(sql).run(...cols.map((c) => {
        const v = rec[c];
        return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
      }));
      n++;
    }
  });
  return n;
}

// Télécharge un asset public Supabase → FILES_DIR, renvoie le chemin local /files/...
async function downloadAsset(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const m = /\/storage\/v1\/object\/public\/([^?]+)/.exec(url);
    const rel = m ? m[1] : `school-assets/${randomUUID()}`;
    const full = join(FILES_DIR, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, buf);
    return `/files/${rel}`;
  } catch { return null; }
}

async function migrateAssets(rows, fields, onProgress) {
  for (const row of rows) {
    for (const f of fields) {
      const url = row[f];
      if (typeof url === 'string' && /^https?:\/\//.test(url)) {
        const local = await downloadAsset(url.split('?')[0]);
        if (local) row[f] = local; // réécrit l'URL pour servir hors-ligne
      }
    }
    log(onProgress, 'assets', { detail: 1 });
  }
  return rows;
}

// Émet et stocke le jeton serveur propre à cette école (auth = JWT admin).
// Aucune service_role ne descend sur le PC : le jeton est limité à l'école et
// révocable côté cloud. Best-effort : la migration aboutit même si l'émission
// échoue (le pont d'identifiants retombe alors sur sa file, sans bloquer).
async function provisionServerToken(url, accessToken) {
  try {
    const res = await fetch(`${url}/functions/v1/issue-server-token`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
    });
    const j = await res.json().catch(() => null);
    if (j?.token) writeFileSync(TOKEN_PATH, j.token, { mode: 0o600 });
    return !!j?.token;
  } catch { return false; }
}

export async function runMigration({ url, anonKey, email, password, localPassword, onProgress, clientFactory } = {}) {
  if (!url || !anonKey) throw new Error('URL et clé anon Supabase requises.');
  if (!email || !password) throw new Error('Identifiants cloud requis.');

  const createClient = clientFactory || (await import('@supabase/supabase-js')).createClient;

  // ── Étape 1 : connexion cloud ───────────────────────────────────────────
  log(onProgress, 'connect');
  const supa = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supa.auth.signInWithPassword({ email, password });
  if (authErr || !auth?.user) throw new Error('Connexion cloud refusée : ' + (authErr?.message || 'inconnue'));
  const cloudUserId = auth.user.id;

  // Émet le jeton serveur (avant l'écriture, pour que le miroir des mots de passe
  // fonctionne dès la création des comptes locaux).
  await provisionServerToken(url, auth.session?.access_token);

  // ── Étape 2 : découverte de l'école + analyse ───────────────────────────
  log(onProgress, 'analyze');
  const { data: membership, error: mErr } = await supa
    .from('school_users').select('*').eq('user_id', cloudUserId);
  if (mErr) throw new Error('Lecture des droits : ' + mErr.message);
  const adminRow = (membership || []).find((m) => m.role === 'admin') || (membership || [])[0];
  if (!adminRow) throw new Error("Ce compte n'est rattaché à aucune école.");
  const schoolId = adminRow.school_id;

  const { data: schoolArr, error: sErr } = await supa.from('schools').select('*').eq('id', schoolId);
  if (sErr || !schoolArr?.length) throw new Error('École introuvable : ' + (sErr?.message || schoolId));
  const school = schoolArr[0];

  const allMembers = await pullAll(supa, 'school_users', schoolId);
  const counts = {};
  const pulled = {};
  for (const t of TABLE_ORDER) {
    pulled[t] = await pullAll(supa, t, schoolId);
    counts[t] = pulled[t].length;
  }
  log(onProgress, 'analyzed', {
    counts: {
      students: counts.students, classes: counts.classes, teachers: counts.teachers,
      grades: counts.grades, payments: counts.fee_payments,
    },
  });

  // ── Étape 3 : téléchargement des fichiers (logos, photos) ────────────────
  log(onProgress, 'download');
  await migrateAssets(schoolArr, ASSET_FIELDS.schools, onProgress);
  await migrateAssets(pulled.students, ASSET_FIELDS.students, onProgress);

  // ── Étape 4 : création SQLite ────────────────────────────────────────────
  log(onProgress, 'write');
  const report = { tables: {}, users: 0 };

  // Chargement EN MASSE : on suspend l'application des FK le temps de l'écriture.
  // Cela rend l'ordre d'insertion et les self-références (budgets.parent_budget_id,
  // budget_chapters.parent_id) non bloquants ; on RÉ-active + contrôle après (étape 5).
  db.exec('PRAGMA foreign_keys = OFF');
  try {

  // 4a. École
  report.tables.schools = writeRows('schools', schoolArr);

  // 4b. Comptes : auth.users illisible → on RECRÉE des users locaux.
  //     Admin : mot de passe choisi dans l'assistant (poussé au cloud → identique
  //     des deux côtés). Autres : mot de passe aléatoire (réinitialisable, ou
  //     unifié dès leur 1re connexion locale via le pont d'identifiants).
  //     On mémorise cloud_user_id pour cibler le bon compte cloud plus tard.
  // Email par compte : auth.users illisible → l'admin via le paramètre saisi,
  // le personnel via teachers.email (school_users.user_id = teachers.auth_user_id).
  const emailByCloud = new Map();
  emailByCloud.set(cloudUserId, email);
  for (const t of pulled.teachers || []) {
    if (t.auth_user_id && t.email) emailByCloud.set(t.auth_user_id, t.email);
  }

  const idMap = new Map(); // cloudUserId → localUserId
  for (const m of allMembers) {
    const localId = randomUUID();
    idMap.set(m.user_id, localId);
    const isAdmin = m.user_id === cloudUserId;
    const pwd = isAdmin ? (localPassword || password) : randomUUID();
    const userEmail = emailByCloud.get(m.user_id) || m.email || `${localId}@local.notescam`;
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name, email_confirmed_at, cloud_user_id)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, cloud_user_id = excluded.cloud_user_id`)
      .run(localId, userEmail, hashPassword(pwd),
        m.full_name || null, new Date().toISOString(), m.user_id);
    report.users++;
    if (isAdmin) { try { await mirrorToCloud(localId, userEmail, pwd); } catch { /* file de repli */ } }
  }

  // Remap générique des références UTILISATEUR (cloud → local) : les comptes sont
  // RECRÉÉS avec de nouveaux ids locaux. Plutôt que de classer chaque colonne
  // (`created_by`, `requester`, `decided_by_id`, `user_id`, `actor_id`,
  // `recipient_id`, `reporter_id`…), on remplace TOUTE valeur qui est exactement
  // un id de compte connu → le bon id local. Un nom, un id d'enseignant/d'élève ou
  // un libellé ne peut jamais correspondre à un UUID de compte → jamais touché.
  const remapUserRefs = (rows) => {
    if (!rows) return rows;
    for (const row of rows) {
      for (const k in row) {
        const v = row[k];
        if (typeof v === 'string' && idMap.has(v)) row[k] = idMap.get(v);
      }
    }
    return rows;
  };

  // 4c. school_users avec les nouveaux user_id locaux
  const localMembers = allMembers.map((m) => ({
    ...m,
    id: m.id || randomUUID(),
    user_id: idMap.get(m.user_id) || randomUUID(),
  }));
  report.tables.school_users = writeRows('school_users', localMembers);

  // 4d. Toutes les tables métier (ordre FK), avec remap des références utilisateur.
  //     Couvre teachers.auth_user_id, staff.auth_user_id, et toutes les colonnes
  //     `*_by`/`user_id`/`actor_id`/… des nouveaux modules.
  for (const t of TABLE_ORDER) report.tables[t] = writeRows(t, remapUserRefs(pulled[t]));

  } finally {
    db.exec('PRAGMA foreign_keys = ON');   // ré-active l'application des FK
  }

  // ── Étape 5 : contrôle d'intégrité ───────────────────────────────────────
  log(onProgress, 'verify');
  const integrity = { ok: true, mismatches: [], fkViolations: 0 };
  for (const t of TABLE_ORDER) {
    const scoped = tableColumns(t).has('school_id');
    const local = db.prepare(`SELECT COUNT(*) n FROM "${t}"` + (scoped ? ' WHERE school_id = ?' : ''))
      .get(...(scoped ? [schoolId] : [])).n;
    if (local < counts[t]) { integrity.ok = false; integrity.mismatches.push({ table: t, cloud: counts[t], local }); }
  }
  // Contrôle FK global (advisory) : signale d'éventuelles références pendantes
  // (ex. une note officielle dont le référentiel LAN n'a pas la même version).
  // N'invalide PAS la migration — informe seulement le rapport.
  try { integrity.fkViolations = db.prepare('PRAGMA foreign_key_check').all().length; } catch { /* ignore */ }

  // ── Étape 6 : activation mode local ──────────────────────────────────────
  db.prepare(`INSERT INTO migration_state (id, source, school_id, cloud_url, migrated_at, report)
              VALUES (1, 'cloud', ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET source=excluded.source, school_id=excluded.school_id,
                cloud_url=excluded.cloud_url, migrated_at=excluded.migrated_at, report=excluded.report`)
    .run(schoolId, url, new Date().toISOString(), JSON.stringify({ counts, report, integrity }));

  log(onProgress, 'done', { integrity, report, counts, school: school.name });
  return { ok: integrity.ok, school: school.name, schoolId, counts, report, integrity };
}
