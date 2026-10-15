#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// RÉINITIALISER UN MOT DE PASSE OUBLIÉ — édition LAN, 100 % hors ligne
//
// À lancer SUR LE PC SERVEUR de l'école. Le serveur peut rester allumé (SQLite
// est en WAL : l'écriture est sûre, la prochaine connexion lit la nouvelle
// empreinte). Rien n'est envoyé sur Internet.
//
//   Lister les comptes de connexion :
//     node server/reset-password-cli.mjs --liste
//
//   Réinitialiser (mot de passe généré, affiché à l'écran) :
//     node server/reset-password-cli.mjs --email directeur@ecole.cm
//
//   Réinitialiser avec un mot de passe choisi :
//     node server/reset-password-cli.mjs --email directeur@ecole.cm --mot-de-passe 'Rentree2026!'
//
//   Sans argument dans une vraie console : mode guidé (liste + questions).
//
// Options : --data-dir <dossier>   base à ouvrir (défaut : $NOTESCAM_DATA_DIR,
//                                  sinon server/data). Installation Windows :
//                                  C:\ProgramData\NotesCam\data
//           --app-dir <dossier>    dossier « server » de l'installation à
//                                  dépanner (défaut : celui de ce fichier).
//
// Sur un PC d'école installé avec le .exe, passer plutôt par
// « reinitialiser-mot-de-passe.cmd » (dossier d'installation) : il trouve seul
// le node.exe embarqué et la base de ProgramData.
//
// POURQUOI `--app-dir`. Les écoles déjà installées tournent avec une version
// ANTÉRIEURE à cet outil : il n'est pas sur leur PC, et réinstaller pour
// dépanner un mot de passe serait absurde. Avec `--app-dir`, ce fichier et
// `resetPassword.js` suffisent (clé USB) : le moteur de base (`db.js`) et le
// hachage (`security.js`) sont pris DANS l'installation à dépanner, jamais
// recopiés — une empreinte scrypt calculée par une autre version du code
// verrouillerait l'école en silence.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Arguments (français, alias anglais acceptés) ----------------------
const ARGV = process.argv.slice(2);
const has = (...f) => f.some((x) => ARGV.includes(x));
const opt = (...f) => {
  for (const x of f) {
    const i = ARGV.indexOf(x);
    if (i >= 0 && ARGV[i + 1] && !ARGV[i + 1].startsWith('--')) return ARGV[i + 1];
  }
  return undefined;
};

if (has('--aide', '--help', '-h')) {
  console.log(`
Réinitialiser un mot de passe NotesCam (édition LAN, hors ligne)

  --liste                      affiche les comptes de connexion
  --email <e-mail>             compte à réinitialiser
  --mot-de-passe <texte>       nouveau mot de passe (sinon : généré)
  --fichier <liste.txt>        applique une liste « email ; motdepasse »
                               (une par ligne, # = commentaire) — tout ou rien
  --data-dir <dossier>         base à ouvrir (défaut : server/data)
  --app-dir <dossier>          dossier « server » de l'installation à dépanner
                               (défaut : celui de ce fichier)
  --aide                       cette aide
`);
  process.exit(0);
}

// --- Base de données --------------------------------------------------
// `server/db.js` lit NOTESCAM_DATA_DIR À L'IMPORT : on le pose avant (import
// dynamique, les imports statiques étant hissés en tête de module).
const DATA_DIR = resolve(opt('--data-dir', '--data') || process.env.NOTESCAM_DATA_DIR || join(__dirname, 'data'));

// Garde-fou : sans ce test, db.js créerait une base VIDE dans un dossier mal
// orthographié et l'outil annoncerait « aucun compte » sur une école qui en a
// trente. On refuse plutôt que de rassurer à tort.
if (!existsSync(join(DATA_DIR, 'notescam.db'))) {
  console.error(`\n❌ Aucune base NotesCam ici : ${join(DATA_DIR, 'notescam.db')}`);
  console.error('   Indiquer le bon dossier avec --data-dir.');
  console.error(String.raw`   Installation Windows par défaut : C:\ProgramData\NotesCam\data` + '\n');
  process.exit(2);
}
// L'installation à dépanner fournit le moteur de base et le hachage : avec
// `--app-dir`, l'outil peut tourner depuis une clé USB sur une école installée
// AVANT l'existence de cet outil (cf. en-tête).
const APP_DIR = resolve(opt('--app-dir', '--app') || __dirname);
if (!existsSync(join(APP_DIR, 'db.js')) || !existsSync(join(APP_DIR, 'security.js'))) {
  console.error(`\n❌ Dossier « server » de NotesCam introuvable ici : ${APP_DIR}`);
  console.error('   L\'indiquer avec --app-dir.');
  console.error(String.raw`   Installation Windows par défaut : C:\Program Files\NotesCam\app\server` + '\n');
  process.exit(2);
}

process.env.NOTESCAM_DATA_DIR = DATA_DIR;
const imp = (dir, f) => import(pathToFileURL(join(dir, f)).href);
const { db } = await imp(APP_DIR, 'db.js');
const { hashPassword } = await imp(APP_DIR, 'security.js');
// La logique de réinitialisation, elle, voyage AVEC cet outil (clé USB) : une
// installation ancienne ne la contient pas.
const { listAccounts, resetPassword, resetPasswordsBatch, parseLignes, generatePassword, MIN_LENGTH } = await imp(__dirname, 'resetPassword.js');

// --- Affichage --------------------------------------------------------
function afficherComptes() {
  const rows = listAccounts(db);
  if (!rows.length) { console.log('\n(aucun compte dans cette base)\n'); return rows; }
  console.log(`\n${rows.length} compte(s) de connexion — base : ${DATA_DIR}\n`);
  const w = Math.max(...rows.map((r) => r.email.length), 20);
  console.log(`  ${'E-MAIL (identifiant)'.padEnd(w)}  ${'RÔLE'.padEnd(12)}  NOM / ÉCOLE`);
  console.log(`  ${'-'.repeat(w)}  ${'-'.repeat(12)}  ${'-'.repeat(30)}`);
  for (const r of rows) {
    const roles = [r.superadmin ? 'superadmin' : null, r.roles].filter(Boolean).join(',') || '—';
    const qui = [r.full_name, r.ecoles].filter(Boolean).join(' — ') || '';
    const inactif = r.active === 0 ? '  [DÉSACTIVÉ]' : '';
    console.log(`  ${r.email.padEnd(w)}  ${roles.padEnd(12)}  ${qui}${inactif}`);
  }
  console.log('');
  return rows;
}

// --- Exécution --------------------------------------------------------
if (has('--liste', '--list')) { afficherComptes(); process.exit(0); }

// --- Liste « email ; motdepasse » (préparation d'une base d'établissement) ---
const FICHIER = opt('--fichier', '--file');
if (FICHIER) {
  let texte;
  try { texte = readFileSync(FICHIER, 'utf8'); }
  catch (e) {
    console.error('');
    console.error(`❌ Liste illisible : ${e.message}`);
    console.error('');
    process.exit(2);
  }
  const { entrees, erreurs: fmt } = parseLignes(texte);
  if (fmt.length) {
    console.error('');
    console.error("❌ Liste mal formée — rien n'a été modifié :");
    for (const m of fmt) console.error('   ' + m);
    console.error('');
    process.exit(2);
  }
  if (!entrees.length) {
    console.error('');
    console.error('❌ Liste vide — rien à appliquer.');
    console.error('');
    process.exit(2);
  }
  const r = resetPasswordsBatch(db, hashPassword, entrees);
  if (!r.ok) {
    console.error('');
    console.error('❌ Liste refusée — AUCUN compte modifié :');
    for (const m of r.erreurs) console.error('   ' + m);
    console.error('');
    console.error('   « --liste » affiche les e-mails exacts des comptes.');
    console.error('');
    process.exit(1);
  }
  console.log('');
  console.log(`✅ ${r.appliques.length} mot(s) de passe appliqué(s) — base : ${DATA_DIR}`);
  for (const c of r.appliques) console.log(`   - ${c.email}${c.full_name ? `  (${c.full_name})` : ''}`);
  console.log('');
  process.exit(0);
}

let email = opt('--email', '--mail');
let motDePasse = opt('--mot-de-passe', '--password', '--mdp');
let genere = false;

if (!email) {
  // Mode guidé : indispensable pour le .cmd lancé par double-clic sur le PC de
  // l'école, où personne ne tapera d'options.
  if (!process.stdin.isTTY) {
    console.error('\n❌ Préciser le compte : --email <e-mail>   (ou --liste, ou --aide)\n');
    process.exit(2);
  }
  const comptes = afficherComptes();
  if (!comptes.length) process.exit(1);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  email = (await rl.question('E-mail du compte a reinitialiser : ')).trim();
  if (!email) { console.error('\n❌ Annulé (aucun e-mail saisi).\n'); rl.close(); process.exit(2); }
  const saisi = (await rl.question(`Nouveau mot de passe (${MIN_LENGTH} car. min., Entree = en generer un) : `)).trim();
  rl.close();
  if (saisi) motDePasse = saisi;
}

if (!motDePasse) { motDePasse = generatePassword(); genere = true; }

try {
  const r = resetPassword(db, hashPassword, { email, password: motDePasse });
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ✅ MOT DE PASSE RÉINITIALISÉ');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Compte          : ${r.email}`);
  if (r.full_name) console.log(`  Titulaire       : ${r.full_name}`);
  console.log(`  Mot de passe    : ${r.password}${genere ? '   (généré)' : ''}`);
  console.log('══════════════════════════════════════════════════════════');
  console.log('  À faire maintenant : se connecter avec ce mot de passe,');
  console.log('  puis le changer dans l\'application (Profil).');
  console.log('  Installation hybride : le cloud s\'aligne tout seul à la');
  console.log('  première connexion réussie.\n');
  process.exit(0);
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  // Cas vécu : lancé sans élévation sur un PC installé, SQLite répond
  // « attempt to write a readonly database » — incompréhensible pour une école,
  // alors que la base est seulement protégée par les droits Windows.
  if (/readonly|read-only|EACCES|EPERM/i.test(e.message)) {
    console.error('   La base est protégée en écriture : relancer cet outil');
    console.error('   EN TANT QU\'ADMINISTRATEUR (clic droit → « Exécuter en');
    console.error('   tant qu\'administrateur »).\n');
  } else {
    console.error('   « --liste » affiche les e-mails exacts des comptes.\n');
  }
  process.exit(1);
}
