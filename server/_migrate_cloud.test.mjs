// Test bout-en-bout — migration Cloud → Local/LAN + pont d'identifiants.
//
// Sans réseau ni dépendance : on injecte un client Supabase STUB (clientFactory)
// et on stub global.fetch (fonctions edge). Base jetable via NOTESCAM_DATA_DIR.
//
// Couvre :
//   1. Cloud → Local : counts SQLite == counts cloud, comptes créés, jeton stocké.
//   2. Local → Cloud : le mot de passe admin est miroité (set-password) ;
//      hors-ligne → file chiffrée ; flush à la reconnexion.
//   3. Cloud → Local : changement chiffré (RSA) appliqué localement (scrypt).
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicEncrypt, constants } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'nc-mig-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co'; // EDGE_BASE lu au chargement d'authBridge

// --- Stub des fonctions edge (global.fetch) ---------------------------
const setPasswordCalls = [];
let failSetPassword = false;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.endsWith('/issue-server-token')) {
    return { ok: true, status: 200, json: async () => ({ token: 'TESTTOKEN' }) };
  }
  if (u.endsWith('/set-password')) {
    if (failSetPassword) throw new Error('offline');
    setPasswordCalls.push({ auth: opts.headers?.Authorization, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  throw new Error('fetch inattendu: ' + u);
};

// --- Jeu de données cloud (in-memory) + client stub -------------------
const DATA = {
  schools: [{ id: 'sch1', name: 'École Test', current_year: '2025-2026', logo_url: null }],
  school_users: [
    { id: 'su1', school_id: 'sch1', user_id: 'cloud-admin',   role: 'admin',   full_name: 'Directrice', active: 1 },
    { id: 'su2', school_id: 'sch1', user_id: 'cloud-teacher', role: 'teacher',  full_name: 'M. Prof',    active: 1 },
  ],
  classes: [{ id: 'cls1', school_id: 'sch1', name: '6e A', current_year: '2025-2026' }],
  subjects: [
    { id: 'sub1', school_id: 'sch1', class_id: 'cls1', name: 'Maths', coef: 4, max: 20 },
    { id: 'sub2', school_id: 'sch1', class_id: 'cls1', name: 'Français', coef: 4, max: 20 },
  ],
  students: [
    { id: 'stu1', school_id: 'sch1', class_id: 'cls1', name: 'Paul Mballa', photo_url: null },
    { id: 'stu2', school_id: 'sch1', class_id: 'cls1', name: 'Aïcha Ndong', photo_url: null },
  ],
  teachers: [{ id: 'tch1', school_id: 'sch1', name: 'M. Prof', email: 'prof@ecole.cm', auth_user_id: 'cloud-teacher', active: 1 }],
  grades: [
    { id: 'g1', school_id: 'sch1', class_id: 'cls1', student_id: 'stu1', subject_id: 'sub1', sequence: 1, value: '15' },
    { id: 'g2', school_id: 'sch1', class_id: 'cls1', student_id: 'stu1', subject_id: 'sub2', sequence: 1, value: '12' },
    { id: 'g3', school_id: 'sch1', class_id: 'cls1', student_id: 'stu2', subject_id: 'sub1', sequence: 1, value: '08' },
  ],
  student_fees: [{ id: 'f1', school_id: 'sch1', student_id: 'stu1', academic_year: '2025-2026', frais_annuels: 100000, frais_payes: 50000 }],
  fee_payments: [{ id: 'p1', school_id: 'sch1', student_id: 'stu1', academic_year: '2025-2026', amount: 50000, date: '2025-10-01' }],
  attendance: [], student_absences: [], student_class_assignments: [],
  school_messages: [], teacher_notifications: [], sequence_dates: [], timetable_slots: [],
  evaluation_system: [], country_education_config: [],
  credential_outbox: [],
};

function makeBuilder(table) {
  const eqs = []; const iss = []; let upd = null;
  const b = {
    select() { return b; },
    range() { return b; },
    order() { return b; },
    eq(c, v) { eqs.push([c, v]); return b; },
    is(c, v) { iss.push([c, v]); return b; },
    update(values) { upd = values; return b; },
    _match(r) {
      return eqs.every(([c, v]) => String(r[c]) === String(v))
        && iss.every(([c, v]) => (v === null ? (r[c] === null || r[c] === undefined) : String(r[c]) === String(v)));
    },
    maybeSingle() {
      const rows = (DATA[table] || []).filter(b._match);
      return Promise.resolve({ data: rows[0] || null, error: null });
    },
    then(resolve, reject) {
      try {
        const rows = (DATA[table] || []).filter(b._match);
        if (upd) { for (const r of rows) Object.assign(r, upd); return Promise.resolve({ data: null, error: null }).then(resolve, reject); }
        return Promise.resolve({ data: rows.slice(), error: null }).then(resolve, reject);
      } catch (e) { return Promise.resolve({ data: null, error: { message: e.message } }).then(resolve, reject); }
    },
  };
  return b;
}
const stubClient = () => ({
  auth: {
    signInWithPassword: async () => ({ data: { user: { id: 'cloud-admin' }, session: { access_token: 'ADMINJWT' } }, error: null }),
  },
  from: (t) => makeBuilder(t),
});
const clientFactory = () => stubClient();

// --- Chargement des modules (après env + stubs) -----------------------
const { runMigration } = await import('./migrate.js');
const { mirrorToCloud, flushMirrorQueue, credentialPublicKey, applyCloudCredentials } = await import('./authBridge.js');
const { db } = await import('./db.js');
const { hashPassword, verifyPassword } = await import('./security.js');

let pass = 0, fail = 0;
const ok = (cond, label, got) => {
  if (cond) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const count = (t) => db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n;

// ========================= TEST 1 : Cloud → Local =====================
const res = await runMigration({
  url: 'https://test.supabase.co', anonKey: 'anon',
  email: 'directrice@ecole.cm', password: 'cloudpass', localPassword: 'monpasslocal',
  clientFactory,
});

ok(res.ok, 'migration : intégrité OK', res.integrity);
ok(count('schools') === 1, 'school migrée', count('schools'));
ok(count('classes') === 1, '1 classe migrée', count('classes'));
ok(count('subjects') === 2, '2 matières migrées', count('subjects'));
ok(count('students') === 2, '2 élèves migrés', count('students'));
ok(count('grades') === 3, '3 notes migrées', count('grades'));
ok(count('student_fees') === 1, 'frais migrés', count('student_fees'));
ok(count('fee_payments') === 1, 'versements migrés', count('fee_payments'));
ok(count('teachers') === 1, 'enseignant migré', count('teachers'));
ok(count('users') === 2, '2 comptes locaux créés', count('users'));

const admin = db.prepare("SELECT * FROM users WHERE email = ?").get('directrice@ecole.cm');
ok(!!admin, 'compte admin créé avec le bon email');
ok(admin && verifyPassword('monpasslocal', admin.password_hash), 'admin : mot de passe LOCAL choisi fonctionne');
ok(admin && admin.cloud_user_id === 'cloud-admin', 'admin : cloud_user_id mémorisé', admin?.cloud_user_id);

const prof = db.prepare("SELECT * FROM users WHERE email = ?").get('prof@ecole.cm');
ok(!!prof, 'compte enseignant créé avec email issu de teachers.email');
ok(existsSync(join(dir, 'server-token.key')) && readFileSync(join(dir, 'server-token.key'), 'utf8') === 'TESTTOKEN',
  'jeton serveur émis et stocké');

// ========================= TEST 2 : Local → Cloud =====================
// La migration a déjà miroité le mot de passe admin (cloud joignable).
const adminMirror = setPasswordCalls.find((c) => c.body.cloud_user_id === 'cloud-admin');
ok(!!adminMirror, 'admin : mot de passe poussé au cloud (set-password) pendant la migration');
ok(adminMirror && adminMirror.body.password === 'monpasslocal', 'cloud reçoit le MÊME mot de passe que le local', adminMirror?.body?.password);
ok(adminMirror && adminMirror.auth === 'Bearer TESTTOKEN', 'appel edge authentifié par le jeton scellé', adminMirror?.auth);

// Miroir d'un changement de mot de passe enseignant
setPasswordCalls.length = 0;
await mirrorToCloud(prof.id, prof.email, 'profnouveau');
ok(setPasswordCalls.some((c) => c.body.cloud_user_id === 'cloud-teacher' && c.body.password === 'profnouveau'),
  'changement enseignant miroité au cloud', setPasswordCalls.map((c) => c.body));

// Hors-ligne : ne bloque pas, met en file chiffrée, puis flush converge
failSetPassword = true;
const qres = await mirrorToCloud(prof.id, prof.email, 'offlinepass');
ok(qres.queued === true, 'cloud injoignable : opération mise en file (non bloquante)', qres);
const queued = db.prepare('SELECT * FROM pwd_mirror_queue').all();
ok(queued.length === 1 && !queued[0].secret.includes('offlinepass'),
  'file : secret stocké CHIFFRÉ (jamais en clair)', queued[0]?.secret);

setPasswordCalls.length = 0;
failSetPassword = false;
const flushed = await flushMirrorQueue();
ok(flushed.flushed === 1, 'reconnexion : file rejouée', flushed);
ok(setPasswordCalls.some((c) => c.body.password === 'offlinepass'), 'mot de passe en file finalement poussé au cloud');
ok(db.prepare('SELECT COUNT(*) n FROM pwd_mirror_queue').get().n === 0, 'file vidée après flush');

// ========================= TEST 3 : Cloud → Local =====================
// L'app cloud chiffre un nouveau mot de passe avec la clé publique du serveur.
const pub = credentialPublicKey();
const cipher = publicEncrypt(
  { key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
  Buffer.from('changeducloud'),
).toString('base64');
DATA.credential_outbox.push({ id: 'ob1', school_id: 'sch1', cloud_user_id: 'cloud-teacher', email: 'prof@ecole.cm', ciphertext: cipher, applied_at: null });

const applied = await applyCloudCredentials(stubClient(), 'sch1', hashPassword);
ok(applied.applied === 1, 'changement cloud appliqué localement', applied);
const prof2 = db.prepare('SELECT * FROM users WHERE cloud_user_id = ?').get('cloud-teacher');
ok(verifyPassword('changeducloud', prof2.password_hash), 'enseignant : mot de passe changé dans le cloud ouvre en LOCAL');
ok(DATA.credential_outbox[0].applied_at != null, 'outbox marquée appliquée (pas de re-traitement)');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(fail === 0 ? 0 : 1);
