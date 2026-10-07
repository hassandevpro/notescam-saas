// Éprouve l'outil de réinitialisation de mot de passe LAN (resetPassword.js) :
// l'ancien mot de passe doit cesser de fonctionner, le nouveau fonctionner, un
// refus ne doit RIEN modifier, et la recherche du compte doit ignorer la casse
// (une école ne se souvient pas de la casse de son identifiant).
//
// Lancer : node server/_reset_password.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-reset-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { db } = await import('./db.js');
const { hashPassword, verifyPassword } = await import('./security.js');
const { listAccounts, findAccount, resetPassword, generatePassword, MIN_LENGTH } =
  await import('./resetPassword.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const jette = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const hashOf = (id) => db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id).password_hash;

// --- Une école, un directeur, un enseignant --------------------------
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École du Lac');
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)')
  .run('u1', 'directeur@ecole.cm', hashPassword('Ancien2026!'), 'Paul MBALLA');
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)')
  .run('u2', 'awa@ecole.cm', hashPassword('Prof2026!'), 'Awa NDIAYE');
db.prepare('INSERT INTO school_users (id, school_id, user_id, role, full_name) VALUES (?,?,?,?,?)')
  .run('su1', 'sch1', 'u1', 'admin', 'Paul MBALLA');
db.prepare('INSERT INTO school_users (id, school_id, user_id, role, full_name) VALUES (?,?,?,?,?)')
  .run('su2', 'sch1', 'u2', 'teacher', 'Awa NDIAYE');

// --- Inventaire des comptes ------------------------------------------
const comptes = listAccounts(db);
ok(comptes.length === 2, 'liste : les deux comptes sont visibles', comptes.length);
const dir1 = comptes.find((c) => c.email === 'directeur@ecole.cm');
ok(dir1 && dir1.roles === 'admin', 'liste : le rôle vient de school_users', dir1 && dir1.roles);
ok(dir1 && dir1.ecoles === 'École du Lac', 'liste : le nom de l’école est affiché', dir1 && dir1.ecoles);
ok(dir1 && dir1.active === 1, 'liste : compte actif', dir1 && dir1.active);

// --- Recherche insensible à la casse ---------------------------------
ok(findAccount(db, 'Directeur@Ecole.CM')?.id === 'u1', 'recherche : la casse de l’e-mail est ignorée');
ok(findAccount(db, '  directeur@ecole.cm  ')?.id === 'u1', 'recherche : espaces autour de l’e-mail tolérés');
ok(findAccount(db, 'inconnu@ecole.cm') === null, 'recherche : un e-mail inconnu ne renvoie rien');

// --- Réinitialisation ------------------------------------------------
const avant = hashOf('u1');
const r = resetPassword(db, hashPassword, { email: 'DIRECTEUR@ecole.cm', password: 'Rentree2026!' });
ok(r.email === 'directeur@ecole.cm' && r.full_name === 'Paul MBALLA', 'réinit : le compte touché est annoncé', r);
const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('u1');
ok(verifyPassword('Rentree2026!', row.password_hash), 'réinit : le NOUVEAU mot de passe ouvre le compte');
ok(!verifyPassword('Ancien2026!', row.password_hash), 'réinit : l’ANCIEN mot de passe ne marche plus');
ok(row.password_hash !== avant && row.password_hash.includes(':'), 'réinit : empreinte scrypt (salt:hash) remplacée');

// Le compte voisin n'est pas touché : l'outil réinitialise UN compte, pas l'école.
ok(verifyPassword('Prof2026!', hashOf('u2')), 'réinit : les autres comptes restent intacts');

// --- Refus : rien ne doit bouger --------------------------------------
const hAvant = hashOf('u1');
const msgCourt = jette(() => resetPassword(db, hashPassword, { email: 'directeur@ecole.cm', password: 'court' }));
ok(/trop court/i.test(msgCourt || ''), 'refus : mot de passe trop court', msgCourt);
ok(hashOf('u1') === hAvant, 'refus : la base n’a PAS été modifiée');
ok(verifyPassword('Rentree2026!', hashOf('u1')), 'refus : le mot de passe précédent fonctionne toujours');

const msgInconnu = jette(() => resetPassword(db, hashPassword, { email: 'inconnu@ecole.cm', password: 'Rentree2026!' }));
ok(/Aucun compte/i.test(msgInconnu || ''), 'refus : e-mail inconnu, message explicite', msgInconnu);
const msgVide = jette(() => resetPassword(db, hashPassword, { email: '', password: 'Rentree2026!' }));
ok(/Aucun compte/i.test(msgVide || ''), 'refus : e-mail vide', msgVide);

// --- Mot de passe généré ---------------------------------------------
const tirages = new Set();
let bons = 0;
for (let i = 0; i < 200; i++) {
  const p = generatePassword();
  tirages.add(p);
  if (p.length >= MIN_LENGTH && /[A-Z]/.test(p) && /[2-9]/.test(p) && !/[Il1O0]/.test(p)) bons++;
}
ok(bons === 200, 'généré : ≥ 8 car., une majuscule, un chiffre, aucun caractère ambigu', bons);
ok(tirages.size >= 199, 'généré : aléatoire (200 tirages quasi tous distincts)', tirages.size);
const gen = generatePassword();
ok(resetPassword(db, hashPassword, { email: 'awa@ecole.cm', password: gen }) &&
   verifyPassword(gen, hashOf('u2')), 'généré : accepté par le serveur tel quel', gen);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé sous Windows */ }
process.exit(fail === 0 ? 0 : 1);
