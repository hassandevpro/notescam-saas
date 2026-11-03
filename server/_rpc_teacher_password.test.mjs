// admin_set_teacher_password (serveur LAN) : l'administrateur redéfinit le mot de
// passe d'un ENSEIGNANT de SON école, et rien d'autre.
// Exécution : node server/_rpc_teacher_password.test.mjs
//
// Même contrat que la fonction Cloud (supabase_admin_teacher_password.sql) : même
// cible (teachers.id), mêmes refus, renvoie l'e-mail. On attaque `runRpc`, la
// couche que sert réellement /api/rpc.
//
// ⚠️ `server/db.js` ouvre une base sur DISQUE à l'import : on redirige
// NOTESCAM_DATA_DIR vers un répertoire JETABLE avant tout import.
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX = mkdtempSync(join(tmpdir(), 'notescam-tpwd-'));
process.env.NOTESCAM_DATA_DIR = SANDBOX;

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('✅ ' + m); pass++; };

const { db, DB_PATH } = await import('./db.js');
const { runRpc } = await import('./rpc.js');
const { hashPassword, verifyPassword } = await import('./security.js');

ok(DB_PATH.startsWith(SANDBOX), 'base jetable — aucune base d’école touchée');

const ins = (sql, ...a) => db.prepare(sql).run(...a);
ins(`INSERT INTO schools (id, name) VALUES ('sch-a','École A'), ('sch-b','École B')`);
const user = (id, email, pwd) => ins('INSERT INTO users (id, email, password_hash) VALUES (?,?,?)', id, email, hashPassword(pwd));
const member = (id, school, uid, role) => ins(
  `INSERT INTO school_users (id, school_id, user_id, role, full_name, active) VALUES (?,?,?,?,?,1)`, id, school, uid, role, id);

user('u-admin-a', 'admin.a@x.cm', 'AdminA-1234'); member('su-admin-a', 'sch-a', 'u-admin-a', 'admin');
user('u-admin-b', 'admin.b@x.cm', 'AdminB-1234'); member('su-admin-b', 'sch-b', 'u-admin-b', 'admin');
user('u-prof', 'prof@x.cm', 'AncienMdp-1');       member('su-prof', 'sch-a', 'u-prof', 'teacher');
user('u-prof2', 'prof2@x.cm', 'AncienMdp-2');      member('su-prof2', 'sch-a', 'u-prof2', 'teacher');
member('su-prof2-b', 'sch-b', 'u-prof2', 'admin');   // aussi admin ailleurs : hors périmètre
user('u-prof-b', 'prof.b@x.cm', 'AncienMdp-3');   member('su-prof-b', 'sch-b', 'u-prof-b', 'teacher');
ins(`INSERT INTO teachers (id, school_id, name, auth_user_id) VALUES
  ('t-prof','sch-a','Prof A','u-prof'), ('t-prof2','sch-a','Prof Deux','u-prof2'),
  ('t-sans','sch-a','Sans accès',NULL), ('t-prof-b','sch-b','Prof B','u-prof-b')`);

const call = (ctx, teacherId, pwd) => runRpc('admin_set_teacher_password', { p_teacher_id: teacherId, p_new_password: pwd }, { userId: ctx });
const hashOf = (id) => db.prepare('SELECT password_hash h FROM users WHERE id = ?').get(id).h;

console.log('── Cas autorisé ──');
const r = call('u-admin-a', 't-prof', 'NouveauMdp-9');
ok(!r.error, 'l’admin de l’école réinitialise son enseignant');
ok(r.data === 'prof@x.cm', 'renvoie l’e-mail du compte (le miroir Cloud en a besoin)');
ok(verifyPassword('NouveauMdp-9', hashOf('u-prof')), 'le nouveau mot de passe fonctionne');
ok(!verifyPassword('AncienMdp-1', hashOf('u-prof')), 'l’ancien ne fonctionne plus');

console.log('── Refus : rien ne doit changer ──');
const refus = (label, res, msg, uid) => {
  const avant = hashOf(uid);
  ok(res.error && new RegExp(msg).test(res.error.message), `${label} → « ${res.error?.message} »`);
  ok(hashOf(uid) === avant, `${label} : mot de passe INCHANGÉ`);
};
{
  const av = hashOf('u-prof-b');
  const x = call('u-admin-a', 't-prof-b', 'Intrus-12345');
  ok(x.error && /introuvable/.test(x.error.message), 'admin d’une AUTRE école → « Compte introuvable »');
  ok(hashOf('u-prof-b') === av, 'enseignant d’une autre école : mot de passe INCHANGÉ');
}
{
  const av = hashOf('u-prof');
  const x = call('u-prof', 't-prof', 'AutoReset-123');
  ok(x.error && /Non autorisé/.test(x.error.message), 'un enseignant ne peut pas réinitialiser (Non autorisé)');
  ok(hashOf('u-prof') === av, 'mot de passe INCHANGÉ');
}
{
  refus('enseignant qui est aussi admin d’une autre école', call('u-admin-a', 't-prof2', 'Reset-12345'), 'Rôle non autorisé', 'u-prof2');
  refus('enseignant sans compte', { error: call('u-admin-a', 't-sans', 'Reset-12345').error }, 'introuvable', 'u-prof');
  refus('mot de passe de 7 caractères', call('u-admin-a', 't-prof', 'Court-1'), 'trop court', 'u-prof');
  refus('mot de passe vide', call('u-admin-a', 't-prof', ''), 'trop court', 'u-prof');
  refus('identifiant inconnu', { error: call('u-admin-a', 'inexistant', 'Reset-12345').error }, 'introuvable', 'u-prof');
}

console.log(`\n${pass} vérifications OK`);
try { rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* Windows garde la base ouverte : dossier temporaire laissé */ }
process.exit(0);
