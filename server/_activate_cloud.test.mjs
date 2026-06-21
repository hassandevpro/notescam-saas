// Test bout-en-bout — activation Cloud (LOCAL FIRST : SQLite → Supabase).
//
// Sans réseau ni dépendance : client Supabase STUB (clientFactory) + global.fetch
// stub (fonction edge provision-tenant). Base jetable via NOTESCAM_DATA_DIR.
//
// Vérifie : poussée de TOUTES les tables, identifiants PRÉSERVÉS (upsert par id),
// AUCUN doublon, mapping cloud_user_id, jeton scellé stocké, journal de migration,
// et REPRISE après interruption (les tables déjà poussées sont sautées).
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-act-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

// --- Cloud simulé : un Map id→row par table (détecte les doublons) ----
const cloud = {};
let pushCalls = 0;
function cloudPut(table, rows, onConflict) {
  cloud[table] ||= new Map();
  for (const r of rows) {
    const key = onConflict === 'class_id,student_id,subject_id,sequence'
      ? `${r.class_id}_${r.student_id}_${r.subject_id}_${r.sequence}` : r.id;
    cloud[table].set(key, r);
    pushCalls++;
  }
}

// --- Stub fonction edge provision-tenant (global.fetch) ---------------
global.fetch = async (url, opts = {}) => {
  if (String(url).endsWith('/functions/v1/provision-tenant')) {
    const body = JSON.parse(opts.body);
    const map = (body.members || []).map((m) => ({
      local_user_id: m.local_user_id,
      cloud_user_id: m.email === body.admin_email ? 'cloud-admin' : 'cloud-' + m.email.split('@')[0],
    }));
    return { ok: true, status: 200, json: async () => ({ server_token: 'TESTTOKEN', map }) };
  }
  throw new Error('fetch inattendu: ' + url);
};

// --- Stub client Supabase ---------------------------------------------
const clientFactory = () => ({
  auth: {
    signUp: async () => ({ data: { session: null, user: { id: 'cloud-admin' } }, error: null }),
    signInWithPassword: async ({ email }) => ({ data: { session: { access_token: 'ADMINJWT' }, user: { id: 'cloud-admin', email } }, error: null }),
  },
  from: (table) => ({
    upsert: async (rows, opts = {}) => { cloudPut(table, Array.isArray(rows) ? rows : [rows], opts.onConflict); return { error: null }; },
  }),
});

// --- Chargement modules (après env + stubs) ---------------------------
const { db } = await import('./db.js');
const { hashPassword } = await import('./security.js');
const { signupCloud, verifyCloud, runCloudActivation, getActivation } = await import('./activateCloud.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// --- Seed d'une école LOCALE -----------------------------------------
db.prepare('INSERT INTO schools (id, name, current_year, plan) VALUES (?,?,?,?)').run('sch1', 'École Locale', '2025-2026', 'starter');
db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)').run('u-admin', 'directrice@ecole.cm', hashPassword('adminpass'));
db.prepare('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)').run('u-prof', 'prof@ecole.cm', hashPassword('profpass'));
db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active) VALUES (?,?,?,?,1)').run('su1', 'sch1', 'u-admin', 'admin');
db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active) VALUES (?,?,?,?,1)').run('su2', 'sch1', 'u-prof', 'teacher');
db.prepare('INSERT INTO academic_periods (id, school_id, school_year, type, name) VALUES (?,?,?,?,?)').run('ap1', 'sch1', '2025-2026', 'sequence', 'Séquence 1');
db.prepare('INSERT INTO classes (id, school_id, name, current_year) VALUES (?,?,?,?)').run('cls1', 'sch1', '6e A', '2025-2026');
db.prepare('INSERT INTO subjects (id, school_id, class_id, name) VALUES (?,?,?,?)').run('sub1', 'sch1', 'cls1', 'Maths');
db.prepare('INSERT INTO teachers (id, school_id, name, email, auth_user_id) VALUES (?,?,?,?,?)').run('tch1', 'sch1', 'M. Prof', 'prof@ecole.cm', 'u-prof');
db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run('stu1', 'sch1', 'cls1', 'Paul Mballa');
db.prepare('INSERT INTO students (id, school_id, class_id, name) VALUES (?,?,?,?)').run('stu2', 'sch1', 'cls1', 'Aïcha Ndong');
db.prepare('INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value) VALUES (?,?,?,?,?,?,?)').run('g1', 'sch1', 'cls1', 'stu1', 'sub1', 1, '15');
db.prepare('INSERT INTO student_fees (id, school_id, student_id, academic_year, frais_annuels) VALUES (?,?,?,?,?)').run('f1', 'sch1', 'stu1', '2025-2026', 100000);
db.prepare('INSERT INTO fee_payments (id, school_id, student_id, academic_year, amount) VALUES (?,?,?,?,?)').run('p1', 'sch1', 'stu1', '2025-2026', 50000);

const cfg = { url: 'https://test.supabase.co', anonKey: 'anon', email: 'directrice@ecole.cm', password: 'adminpass', clientFactory };

// ===== Étapes 1-2 : compte + vérification =====
const su = await signupCloud(cfg);
ok(su.ok, 'signup cloud demandé', su);
ok(getActivation()?.phase === 'verify', 'phase = verify après signup', getActivation()?.phase);
const vr = await verifyCloud(cfg);
ok(vr.confirmed === true, 'e-mail vérifié → connexion possible', vr);

// ===== Étapes 3-6 : analyse → provision → poussée =====
const res = await runCloudActivation(cfg);
ok(res.ok, 'activation cloud OK', res);

// Données poussées : tout est là, identifiants préservés
ok(cloud.classes?.size === 1, '1 classe poussée', cloud.classes?.size);
ok(cloud.subjects?.size === 1, '1 matière poussée', cloud.subjects?.size);
ok(cloud.students?.size === 2, '2 élèves poussés', cloud.students?.size);
ok(cloud.grades?.size === 1, '1 note poussée', cloud.grades?.size);
ok(cloud.student_fees?.size === 1, 'frais poussés', cloud.student_fees?.size);
ok(cloud.fee_payments?.size === 1, 'versements poussés', cloud.fee_payments?.size);
ok(cloud.academic_periods?.size === 1, 'période académique poussée', cloud.academic_periods?.size);
ok(cloud.students?.has('stu1'), 'identifiant élève PRÉSERVÉ (stu1)', [...(cloud.students?.keys() || [])]);
const totalCloud = Object.values(cloud).reduce((a, m) => a + m.size, 0);
ok(pushCalls === totalCloud && totalCloud === 9, 'aucun doublon : lignes poussées == lignes uniques (9)', { pushCalls, totalCloud });

// FK utilisateur remappée local → cloud
ok(cloud.teachers?.get('tch1')?.auth_user_id === 'cloud-prof', 'teachers.auth_user_id remappé en id cloud', cloud.teachers?.get('tch1')?.auth_user_id);

// Mapping des comptes mémorisé en local (pont d'identifiants)
ok(db.prepare("SELECT cloud_user_id FROM users WHERE id = 'u-admin'").get().cloud_user_id === 'cloud-admin', 'admin : cloud_user_id mémorisé');
ok(db.prepare("SELECT cloud_user_id FROM users WHERE id = 'u-prof'").get().cloud_user_id === 'cloud-prof', 'enseignant : cloud_user_id mémorisé');

// Jeton scellé + journal + état
ok(existsSync(join(dir, 'server-token.key')) && readFileSync(join(dir, 'server-token.key'), 'utf8') === 'TESTTOKEN', 'jeton serveur stocké');
ok(getActivation()?.phase === 'done', 'phase finale = done', getActivation()?.phase);
ok((getActivation()?.log || '').includes('Activation Cloud terminée'), 'journal de migration renseigné');
ok(db.prepare('SELECT COUNT(*) n FROM cloud_push_state WHERE done = 1').get().n === 16, '16 tables marquées terminées (reprise)', db.prepare('SELECT COUNT(*) n FROM cloud_push_state WHERE done = 1').get().n);

// ===== REPRISE : 2e exécution ne re-pousse rien (tables déjà done) =====
pushCalls = 0;
const res2 = await runCloudActivation(cfg);
ok(res2.ok && pushCalls === 0, 'reprise : tables déjà poussées sautées (0 ligne re-poussée)', pushCalls);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(fail === 0 ? 0 : 1);
