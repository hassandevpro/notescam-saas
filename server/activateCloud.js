// server/activateCloud.js
// ETL Local/LAN (SQLite) → Cloud (Supabase) — scénario « LOCAL FIRST ».
//
// Une école vendue en local peut être convertie en cloud SANS recréer son
// établissement : on PRÉSERVE les identifiants (upsert par id) → aucun doublon,
// et le pont d'identifiants déjà en place conserve les mots de passe.
//
// Découpage (l'assistant SPA pilote ces étapes via /api/activate-cloud/*) :
//   1-2. signupCloud()  : crée le compte cloud admin + e-mail de vérification.
//        verifyCloud()  : attend la confirmation e-mail (connexion possible).
//   3-6. runCloudActivation() : analyse SQLite → provision du tenant (école +
//        comptes via fonction edge, service_role confinée au cloud) → poussée
//        des données par lots (idempotente, REPRISE après interruption) →
//        activation. Journal de migration + progression à chaque étape.
//
// Le client Supabase est importé DYNAMIQUEMENT (migration réelle) ou injecté
// via `clientFactory` (tests sans réseau ni dépendance).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, tableColumns, DATA_DIR } from './db.js';

const TOKEN_PATH = join(DATA_DIR, 'server-token.key');
const EDGE_BASE = (process.env.VITE_SUPABASE_URL || '');
const CHUNK = 500;

// Garde-fou réseau : aucun appel distant (auth Supabase, fonction edge) ne doit
// pouvoir bloquer indéfiniment, sinon l'assistant reste figé « 0 % — migration
// en cours… » sans jamais d'erreur. On borne donc chaque appel ; un dépassement
// remonte une erreur EXPLICITE que l'assistant affiche au lieu de tourner à vide.
const NET_TIMEOUT_MS = 30000;
function withTimeout(promise, label, ms = NET_TIMEOUT_MS) {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} : délai dépassé (réseau ?).`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

// Tables de données poussées vers le cloud (ordre FK, parents avant enfants).
// ETL COMPLET : structure + notes officiel + frais + budgets + RH + gouvernance +
// immobilisations + signalements + notifications + journal d'événements + vie scolaire.
// On EXCLUT :
//   - users / school_users  : gérées par la fonction edge (auth + memberships) ;
//   - country_education_config / evaluation_system + référentiels officiel (apc_*/
//     sc_*/mat_*/prim_* de config) : config GLOBALE déjà en cloud (seul le school-scoped migre) ;
//   - applied_decisions / applied_budget_ops : registres d'idempotence LOCAUX (sans school_id) ;
//   - tables locales (license_activation, migration_state, pwd_mirror_queue, …).
export const PUSH_ORDER = [
  // Structure de base
  'academic_periods', 'school_units', 'classes', 'subjects', 'students', 'teachers', 'staff', 'grades',
  'student_fees', 'class_fee_grids', 'fee_payments', 'attendance', 'student_absences',
  'student_class_assignments', 'school_messages', 'teacher_notifications',
  'sequence_dates', 'timetable_slots',
  // Notes du moteur officiel (référentiels déjà en cloud)
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
  // Journal d'événements / audit (best-effort : RLS d'insertion restrictive côté cloud)
  'domain_events', 'audit_events',
  // Vie scolaire (discipline)
  'late_arrivals', 'disciplinary_incidents', 'student_warnings', 'exit_permissions',
  'disciplinary_actions', 'parent_meetings', 'student_detentions', 'discipline_statistics',
];

// Journal d'événements : l'insertion directe peut être bloquée par la RLS du cloud
// (réservée à kernel_emit/service_role). On la traite en BEST-EFFORT : une erreur
// journalise + saute la table, sans casser toute l'activation.
const BEST_EFFORT_TABLES = new Set(['domain_events', 'audit_events']);

// Colonnes jsonb côté cloud, stockées en TEXT (JSON) côté LAN : on les REPARSE en
// objet avant l'upsert (sinon Postgres stocke une chaîne JSON scalaire, pas un tableau).
const JSON_PUSH_COLUMNS = {
  governance_roles: ['permissions', 'pages', 'dashboards', 'workflows'],
  governance_role_history: ['detail'],
  domain_events: ['payload'],
  audit_events: ['payload'],
};

// Colonnes présentes UNIQUEMENT côté LAN (absentes du cloud) → retirées avant push.
const LOCAL_ONLY_COLUMNS = {
  domain_events: ['replicated_from'],   // marqueur anti-écho de la réplication LAN↔Cloud
};

// Erreur « table absente côté cloud » (ex. staff si la migration Personnel n'a
// pas été jouée). On la traite comme SKIP (journalisée) plutôt que comme un
// échec fatal de toute la migration.
function isMissingTable(error) {
  const code = error?.code || '';
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return code === '42P01' || code === 'PGRST205'
    || /does not exist|could not find the table|schema cache/i.test(msg);
}

const log = (cb, phase, detail = {}) => { try { cb?.({ phase, ...detail }); } catch { /* ignore */ } };

// --- Journal de migration (persisté → consultable + reprise) ----------
function appendLog(line) {
  const stamp = new Date().toISOString();
  const row = db.prepare('SELECT log FROM cloud_activation WHERE id = 1').get();
  const prev = row?.log || '';
  db.prepare('UPDATE cloud_activation SET log = ? WHERE id = 1').run(`${prev}${stamp}  ${line}\n`);
}
function setPhase(phase, patch = {}) {
  const cols = Object.keys(patch);
  const sets = ['phase = ?', ...cols.map((c) => `${c} = ?`)].join(', ');
  db.prepare(`INSERT INTO cloud_activation (id, phase) VALUES (1, ?)
              ON CONFLICT(id) DO UPDATE SET ${sets}`)
    .run(phase, phase, ...cols.map((c) => patch[c]));
}
export function getActivation() {
  return db.prepare('SELECT * FROM cloud_activation WHERE id = 1').get() || null;
}

async function getClient(clientFactory, url, anonKey, accessToken) {
  const createClient = clientFactory || (await import('@supabase/supabase-js')).createClient;
  const opts = { auth: { persistSession: false } };
  // RLS : pour que la poussée passe sous l'identité de l'admin, on injecte son
  // jeton dans l'en-tête Authorization de chaque requête PostgREST.
  if (accessToken) opts.global = { headers: { Authorization: `Bearer ${accessToken}` } };
  return createClient(url, anonKey, opts);
}

// ── Étapes 1-2 : compte cloud + vérification e-mail ─────────────────────
export async function signupCloud({ url, anonKey, email, password, clientFactory }) {
  if (!url || !anonKey || !email || !password) throw new Error('Paramètres requis manquants.');
  const supa = await getClient(clientFactory, url, anonKey);
  const { data, error } = await withTimeout(supa.auth.signUp({ email, password }), 'Création du compte cloud');
  if (error && !/already registered/i.test(error.message || '')) throw new Error('Création du compte cloud : ' + error.message);
  setPhase('verify', { email, started_at: new Date().toISOString() });
  appendLog(`Compte cloud demandé pour ${email}. E-mail de vérification envoyé.`);
  // Si Supabase confirme automatiquement (confirmation e-mail désactivée), une
  // session est déjà disponible.
  return { ok: true, needsVerification: !data?.session };
}

export async function verifyCloud({ url, anonKey, email, password, clientFactory }) {
  const supa = await getClient(clientFactory, url, anonKey);
  const { data, error } = await withTimeout(supa.auth.signInWithPassword({ email, password }), 'Connexion cloud');
  if (error || !data?.session) return { confirmed: false };
  appendLog(`E-mail vérifié, connexion cloud établie pour ${email}.`);
  return { confirmed: true };
}

// ── Étapes 3-6 : analyse → provision → poussée → activation ─────────────
export async function runCloudActivation({ url, anonKey, email, password, onProgress, clientFactory }) {
  if (!url || !anonKey || !email || !password) throw new Error('Paramètres requis manquants.');

  // (3) Connexion (l'e-mail doit être vérifié) + analyse SQLite
  log(onProgress, 'connect');
  const authClient = await getClient(clientFactory, url, anonKey);
  const { data: auth, error: authErr } = await withTimeout(
    authClient.auth.signInWithPassword({ email, password }), 'Connexion cloud');
  if (authErr || !auth?.session) throw new Error('Connexion cloud impossible (e-mail non vérifié ?).');
  const accessToken = auth.session.access_token;
  const cloudAdminId = auth.user.id;

  const school = db.prepare('SELECT * FROM schools LIMIT 1').get();
  if (!school) throw new Error('Aucune école locale à migrer.');
  setPhase('provision', { school_id: school.id });

  // Membres : tous les comptes locaux de l'école (admin inclus) + leur rôle.
  const members = db.prepare(`
    SELECT su.id AS membership_id, su.role, su.full_name, su.class_id,
           u.id AS local_user_id, u.email
      FROM school_users su JOIN users u ON u.id = su.user_id
     WHERE su.school_id = ? AND su.active = 1`).all(school.id);

  const counts = {};
  for (const t of PUSH_ORDER) {
    counts[t] = db.prepare(`SELECT COUNT(*) n FROM "${t}" WHERE school_id = ?`).get(school.id).n;
  }
  log(onProgress, 'analyzed', { counts, members: members.length });
  appendLog(`Analyse : ${members.length} comptes, ${counts.students || 0} élèves, ${counts.grades || 0} notes.`);

  // (4) Provision du tenant via fonction edge (service_role confinée au cloud).
  //     Crée l'école, les comptes auth manquants et les memberships ; renvoie le
  //     mapping local_user_id → cloud_user_id + un jeton serveur scellé.
  log(onProgress, 'provision');
  // Une école locale plus ancienne (ex. Cameroun) peut avoir des colonnes à null
  // que le cloud a depuis passées en NOT NULL DEFAULT (ex. ge_grade_max). Un null
  // explicite court-circuite le DEFAULT côté Postgres → on retire les clés nulles
  // pour laisser la base appliquer ses valeurs par défaut.
  const schoolPayload = Object.fromEntries(
    Object.entries(school).filter(([, v]) => v !== null && v !== undefined),
  );
  const provision = await provisionTenant(url, accessToken, {
    school: schoolPayload,
    admin_email: email,
    members: members.map((m) => ({
      local_user_id: m.local_user_id, email: m.email, role: m.role,
      full_name: m.full_name, class_id: m.class_id, membership_id: m.membership_id,
    })),
  });
  // Mémorise les cloud_user_id en local (pont d'identifiants + remap des FK).
  db.prepare('UPDATE users SET cloud_user_id = ? WHERE id = ?').run(cloudAdminId, localUserByEmail(email)?.id || '');
  for (const u of provision.map || []) {
    if (u.local_user_id && u.cloud_user_id) {
      db.prepare('UPDATE users SET cloud_user_id = ? WHERE id = ?').run(u.cloud_user_id, u.local_user_id);
    }
  }
  if (provision.server_token) writeFileSync(TOKEN_PATH, provision.server_token, { mode: 0o600 });
  appendLog('Tenant provisionné (école + comptes + memberships).');

  // Carte local_user_id → cloud_user_id pour remapper les références utilisateur.
  const cloudByLocal = new Map();
  for (const r of db.prepare('SELECT id, cloud_user_id FROM users WHERE cloud_user_id IS NOT NULL').all()) {
    cloudByLocal.set(r.id, r.cloud_user_id);
  }
  // Remap GÉNÉRIQUE des références utilisateur (id local → id cloud) : toute valeur
  // qui est exactement un id de compte local connu devient l'id cloud correspondant
  // (couvre created_by / requester / decided_by_id / user_id / actor_id / recipient_id…
  // sans classer chaque colonne). `auth_user_id` a une FK stricte vers auth.users :
  // une référence locale sans compte cloud correspondant DOIT devenir null.
  const remapUserRefs = (row) => {
    const r = { ...row };
    const origAuth = r.auth_user_id;
    for (const k in r) {
      const v = r[k];
      if (typeof v === 'string' && cloudByLocal.has(v)) r[k] = cloudByLocal.get(v);
    }
    if ('auth_user_id' in r) r.auth_user_id = origAuth ? (cloudByLocal.get(origAuth) || null) : null;
    return r;
  };

  // (5) Poussée des données par lots, idempotente, AVEC REPRISE.
  log(onProgress, 'push');
  const supa = await getClient(clientFactory, url, anonKey, accessToken);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  let pushedGlobal = 0;

  for (const table of PUSH_ORDER) {
    const state = db.prepare('SELECT * FROM cloud_push_state WHERE tablename = ?').get(table);
    if (state?.done) { pushedGlobal += counts[table]; log(onProgress, 'push', { table, pct: Math.round(100 * pushedGlobal / total), resumed: true }); continue; }

    const rows = db.prepare(`SELECT * FROM "${table}" WHERE school_id = ?`).all(school.id);

    db.prepare(`INSERT INTO cloud_push_state (tablename, pushed, total, done, updated_at)
                VALUES (?,0,?,0,?)
                ON CONFLICT(tablename) DO UPDATE SET total = excluded.total, updated_at = excluded.updated_at`)
      .run(table, rows.length, new Date().toISOString());

    const onConflict = table === 'grades' ? 'class_id,student_id,subject_id,sequence' : 'id';
    let pushedThisTable = 0;
    let skipped = false;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK).map((r) => stripLocalOnly(remapUserRefs(r), table));
      const { error } = await supa.from(table).upsert(batch, { onConflict });
      if (error) {
        // Table absente côté cloud, OU table best-effort (journal d'événements dont
        // l'insertion directe est bloquée par la RLS) → SKIP journalisé, sans casser le job.
        if (isMissingTable(error) || BEST_EFFORT_TABLES.has(table)) {
          appendLog(`${table} ignorée (${isMissingTable(error) ? 'absente côté cloud' : 'best-effort'}) : ${error.message}`); skipped = true; break;
        }
        appendLog(`ÉCHEC ${table} (lot ${i}) : ${error.message}`); throw new Error(`Poussée ${table}: ${error.message}`);
      }
      pushedThisTable += batch.length;
      pushedGlobal += batch.length;
      db.prepare('UPDATE cloud_push_state SET pushed = ?, updated_at = ? WHERE tablename = ?')
        .run(Math.min(i + batch.length, rows.length), new Date().toISOString(), table);
      log(onProgress, 'push', { table, pct: Math.round(100 * pushedGlobal / total) });
    }
    // Table sautée : on compte son reste comme « traité » pour ne pas figer la
    // barre, on la marque done (la reprise ne la retentera pas), et on continue.
    if (skipped) {
      pushedGlobal += Math.max(0, rows.length - pushedThisTable);
      db.prepare('UPDATE cloud_push_state SET done = 1, updated_at = ? WHERE tablename = ?')
        .run(new Date().toISOString(), table);
      continue;
    }
    db.prepare('UPDATE cloud_push_state SET done = 1, pushed = total, updated_at = ? WHERE tablename = ?')
      .run(new Date().toISOString(), table);
    appendLog(`${table} : ${rows.length} lignes poussées.`);
  }

  // (6) Activation : le pont d'identifiants est actif (jeton stocké) ; les mots
  //     de passe du personnel convergent à leur prochaine connexion locale.
  setPhase('done', { finished_at: new Date().toISOString() });
  appendLog('Activation Cloud terminée.');
  log(onProgress, 'done', { counts });
  return { ok: true, school: school.name, schoolId: school.id, counts };
}

// Prépare une ligne pour l'upsert cloud : retire les colonnes locales absentes du
// cloud, et REPARSE les colonnes jsonb (stockées en TEXT côté LAN) en objet.
function stripLocalOnly(row, table) {
  const r = { ...row };
  delete r.updated_at; // certaines tables locales l'ont en DEFAULT ; laissé au cloud
  for (const c of LOCAL_ONLY_COLUMNS[table] || []) delete r[c];
  for (const c of JSON_PUSH_COLUMNS[table] || []) {
    if (typeof r[c] === 'string') { try { r[c] = JSON.parse(r[c]); } catch { /* laisse la chaîne telle quelle */ } }
  }
  return r;
}
function localUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

// Appel de la fonction edge `provision-tenant` (auth = JWT admin). Best-effort
// d'idempotence côté edge (réutilise les comptes existants → reprise sûre).
async function provisionTenant(url, accessToken, payload) {
  // Abandon réel après NET_TIMEOUT_MS : sans cela, une fonction edge bloquée fige
  // toute l'activation à « 0 % » (c'est l'appel le plus à risque de pendre).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${url}/functions/v1/provision-tenant`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error('Provision tenant : ' + (e?.name === 'AbortError' ? 'délai dépassé (réseau ?)' : (e?.message || 'échec réseau')));
  } finally {
    clearTimeout(timer);
  }
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) throw new Error('Provision tenant : ' + (j?.error || `HTTP ${res.status}`));
  return j; // { server_token, map:[{local_user_id, cloud_user_id}] }
}
