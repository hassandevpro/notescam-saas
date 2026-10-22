// Valide l'écran « Mon profil » côté serveur LAN : les RPC update_my_profile /
// set_my_photo / touch_my_last_login existent, n'écrivent QUE sur le compte du
// jeton, et propagent le nom sur `users` + la fiche `teachers` liée.
//
// Elles manquaient totalement en LAN : l'écran Profil renvoyait
// « RPC inconnue : update_my_profile » et aucune modification ne tenait.
//
// Lancer : node server/_my_profile.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-profile-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { db, tableColumns } = await import('./db.js');
const { runRpc } = await import('./rpc.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const rpc = (name, params, userId) => {
  const r = runRpc(name, params, { userId });
  if (r.error) throw new Error(`${name}: ${r.error.message}`);
  return r.data;
};
const row = (sql, ...p) => db.prepare(sql).get(...p);

// --- Les colonnes de profil existent sur les bases déjà installées ---
const cols = tableColumns('school_users');
for (const c of ['phone', 'photo_url', 'last_login_at']) {
  ok(cols.has(c), `school_users : colonne ${c} présente`, cols.has(c));
}

// --- Jeu d'essai : une école, deux comptes, une fiche enseignant liée ---
db.exec(`
  INSERT INTO schools (id, name) VALUES ('sch1', 'École');
  INSERT INTO users (id, email, password_hash, full_name) VALUES
    ('u1', 'prof@ecole.cm', 'x:y', 'Ancien Nom'),
    ('u2', 'admin@ecole.cm', 'x:y', 'Admin');
  INSERT INTO school_users (id, school_id, user_id, role, full_name, active) VALUES
    ('su1', 'sch1', 'u1', 'teacher', 'Ancien Nom', 1),
    ('su2', 'sch1', 'u2', 'admin',   'Admin',      1);
  INSERT INTO teachers (id, school_id, name, auth_user_id) VALUES
    ('t1', 'sch1', 'Ancien Nom', 'u1');
`);

// --- Nom + téléphone ---
rpc('update_my_profile', { p_full_name: '  M. KAMGA Paul  ', p_phone: ' 677001122 ' }, 'u1');
const su1 = row('SELECT * FROM school_users WHERE id = ?', 'su1');
ok(su1.full_name === 'M. KAMGA Paul', 'profil : nom enregistré (et trimé)', su1.full_name);
ok(su1.phone === '677001122',         'profil : téléphone enregistré', su1.phone);
ok(row('SELECT full_name FROM users WHERE id = ?', 'u1').full_name === 'M. KAMGA Paul',
   'profil : nom recopié sur users (écran de connexion)');
const t1 = row('SELECT * FROM teachers WHERE id = ?', 't1');
ok(t1.name === 'M. KAMGA Paul', 'profil : nom miroité sur la fiche enseignant', t1.name);
ok(t1.phone === '677001122',    'profil : téléphone miroité sur la fiche enseignant', t1.phone);

// Le compte voisin n'a pas bougé : l'identité vient du jeton, pas des paramètres.
ok(row('SELECT * FROM school_users WHERE id = ?', 'su2').full_name === 'Admin',
   'profil : le compte d’un autre reste intact');

// --- Nom vide = on garde l'ancien ; téléphone vide = on efface ---
rpc('update_my_profile', { p_full_name: '   ', p_phone: '' }, 'u1');
const su1b = row('SELECT * FROM school_users WHERE id = ?', 'su1');
ok(su1b.full_name === 'M. KAMGA Paul', 'profil : nom vide ne détruit pas le nom', su1b.full_name);
ok(su1b.phone === null,                'profil : téléphone vidé volontairement', su1b.phone);

// --- Photo : posée, puis retirée, sans jamais toucher au nom ---
rpc('set_my_photo', { p_photo_url: 'http://lan/files/u1.jpg' }, 'u1');
ok(row('SELECT photo_url FROM school_users WHERE id = ?', 'su1').photo_url === 'http://lan/files/u1.jpg',
   'photo : enregistrée sur le compte');
ok(row('SELECT photo_url FROM teachers WHERE id = ?', 't1').photo_url === 'http://lan/files/u1.jpg',
   'photo : miroitée sur la fiche enseignant');

rpc('update_my_profile', { p_full_name: 'M. KAMGA Paul', p_phone: '699112233' }, 'u1');
ok(row('SELECT photo_url FROM school_users WHERE id = ?', 'su1').photo_url === 'http://lan/files/u1.jpg',
   'photo : une édition du nom ne l’efface pas');

rpc('set_my_photo', { p_photo_url: null }, 'u1');
ok(row('SELECT photo_url FROM school_users WHERE id = ?', 'su1').photo_url === null,
   'photo : retirée sur demande');

// --- Dernière connexion ---
rpc('touch_my_last_login', {}, 'u1');
ok(!!row('SELECT last_login_at FROM school_users WHERE id = ?', 'su1').last_login_at,
   'dernière connexion : horodatée');

// --- Sans jeton : refus net (et pas une écriture silencieuse) ---
const anon = runRpc('update_my_profile', { p_full_name: 'Pirate', p_phone: '000' }, {});
ok(!!anon.error, 'profil : appel sans jeton refusé', anon.error);
ok(row('SELECT full_name FROM school_users WHERE id = ?', 'su1').full_name === 'M. KAMGA Paul',
   'profil : rien n’a changé après l’appel anonyme');

// La base est encore ouverte : sous Windows le fichier reste verrouillé. Le
// répertoire est temporaire, son ménage n'est pas le sujet du test.
try { rmSync(dir, { recursive: true, force: true }); } catch { /* verrou Windows */ }
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
