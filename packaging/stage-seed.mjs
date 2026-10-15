// ════════════════════════════════════════════════════════════════════════════
// PRÉPARE LA BASE À EMBARQUER DANS L'INSTALLEUR (« seed » d'établissement)
//
// Appelé par build-installer.ps1 -SeedData <dossier de données>. Produit
// `_stage\seed\` : la base de l'école + ses fichiers (logos, cachets, photos),
// prêts à être posés sur le PC de l'école par l'installateur.
//
//   node packaging/stage-seed.mjs <dossier_data_source> <dossier_seed_destination>
//
// POURQUOI UN OUTIL ET PAS UNE COPIE. Trois pièges, chacun silencieux :
//
//   1. WAL. Copier `notescam.db` sans son `-wal` perd les dernières écritures
//      — une migration entière peut ainsi disparaître sans message. On ouvre
//      donc la base et on replie le WAL dedans (checkpoint TRUNCATE).
//   2. SECRETS. Un dossier de données contient des clés PROPRES À UN POSTE
//      (jeton serveur scellé, clé JWT, clé RSA du canal d'identifiants, clé de
//      la file de miroir). Les embarquer, c'est les distribuer à toutes les
//      écoles. Ici on ne copie QUE la base et `files/` — rien d'autre ne passe.
//   3. ÉTAT LOCAL. Files de synchro, curseurs de tirage, file de miroir des
//      mots de passe : tout cela décrit LE poste d'origine, pas l'école. On le
//      purge, sinon le nouveau poste hérite d'un état qui n'est pas le sien.
//
// L'outil AFFICHE ce qu'il embarque (école, effectifs, comptes de connexion) :
// un installeur chargé de données ne doit jamais partir sans qu'on ait vu, de
// ses yeux, de quelle école il s'agit.
// ════════════════════════════════════════════════════════════════════════════
import { DatabaseSync } from 'node:sqlite';
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [srcArg, dstArg] = process.argv.slice(2);
if (!srcArg || !dstArg) {
  console.error('Usage : node packaging/stage-seed.mjs <dossier_data> <dossier_seed>');
  process.exit(1);
}
const SRC = resolve(srcArg);
const DST = resolve(dstArg);
const SRC_DB = join(SRC, 'notescam.db');

if (!existsSync(SRC_DB)) {
  console.error(`❌ Aucune base ici : ${SRC_DB}`);
  process.exit(2);
}

// --- 1. Copie de la base + de son WAL, puis repli du WAL ---------------
if (existsSync(DST)) rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });
const DST_DB = join(DST, 'notescam.db');
copyFileSync(SRC_DB, DST_DB);
for (const ext of ['-wal', '-shm']) {
  if (existsSync(SRC_DB + ext)) copyFileSync(SRC_DB + ext, DST_DB + ext);
}

// `DatabaseSync` brut (PAS server/db.js) : on ne veut ni migration de schéma ni
// seed de référentiel sur une base qu'on ne fait que recopier.
const db = new DatabaseSync(DST_DB);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

// --- 2. Contrôle : de QUELLE école s'agit-il ? -------------------------
const ecoles = db.prepare('SELECT id, name, country_system, current_year FROM schools').all();
if (!ecoles.length) {
  console.error('❌ Cette base ne contient AUCUNE école — rien à embarquer.');
  db.close(); rmSync(DST, { recursive: true, force: true }); process.exit(3);
}
const comptes = db.prepare(`
  SELECT u.email, u.full_name,
         (SELECT group_concat(DISTINCT su.role) FROM school_users su WHERE su.user_id = u.id) AS roles
    FROM users u ORDER BY u.email COLLATE NOCASE`).all();
if (!comptes.length) {
  console.error('❌ Cette base ne contient AUCUN compte de connexion — personne ne pourrait');
  console.error('   se connecter après installation. Rien n\'est embarqué.');
  db.close(); rmSync(DST, { recursive: true, force: true }); process.exit(4);
}

// --- 3. Purge de l'état PROPRE AU POSTE d'origine ----------------------
// `migration_state` est CONSERVÉE à dessein : elle dit « cette base vient du
// cloud », ce qui garde l'assistant de rattachement fermé au premier démarrage
// (sans quoi l'école se verrait proposer de migrer une base déjà pleine).
const A_PURGER = [
  'pwd_mirror_queue',    // mots de passe chiffrés avec une clé qui reste ici
  'sync_outbox',         // changements à pousser depuis CE poste
  'sync_cursor',         // curseurs de tirage de CE poste
  'sync_pull_retry',
  'cloud_push_state',
  'cloud_activation',
  'app_settings',        // réglages locaux (hybride…) — propres au poste
  'applied_decisions',   // registres d'idempotence locaux, reconstruits
  'applied_budget_ops',
];
const purge = [];
for (const t of A_PURGER) {
  try {
    const n = db.prepare(`SELECT count(*) c FROM ${t}`).get().c;
    if (n > 0) { db.exec(`DELETE FROM ${t}`); purge.push(`${t} (${n})`); }
  } catch { /* table absente sur une base ancienne : rien à purger */ }
}
// Effectifs relevés AVANT la fermeture : réouvrir la base, même en lecture
// seule, recrée un `-shm` à côté d'elle — et le seed repartirait avec des
// fichiers WAL parasites que l'installeur poserait sur le PC de l'école.
const n = (t) => { try { return db.prepare(`SELECT count(*) c FROM ${t}`).get().c; } catch { return 0; } };
const stats = {
  students: n('students'), classes: n('classes'), subjects: n('subjects'),
  grades: n('grades'), apc: n('apc_notes'), prim: n('prim_notes'), mat: n('mat_observations'),
  fees: n('student_fees'), payments: n('fee_payments'),
  teachers: n('teachers'), staff: n('staff'),
};
db.exec('VACUUM');
db.close();
for (const ext of ['-wal', '-shm']) {
  if (existsSync(DST_DB + ext)) rmSync(DST_DB + ext, { force: true });
}

// --- 4. Fichiers de l'école (logos, cachets, signatures, photos) -------
let nbFichiers = 0;
const srcFiles = join(SRC, 'files');
if (existsSync(srcFiles)) {
  cpSync(srcFiles, join(DST, 'files'), { recursive: true });
  const compte = (d) => readdirSync(d, { withFileTypes: true })
    .reduce((acc, e) => acc + (e.isDirectory() ? compte(join(d, e.name)) : 1), 0);
  nbFichiers = compte(join(DST, 'files'));
}

// --- 5. Rapport : ce qui part dans l'installeur ------------------------
const mo = (f) => (statSync(f).size / 1024 / 1024).toFixed(1);
console.log('');
console.log("──────────── BASE EMBARQUÉE DANS L'INSTALLEUR ────────────");
for (const e of ecoles) console.log(`  École        : ${e.name}  (${e.country_system || '?'}, ${e.current_year || '?'})`);
console.log(`  Effectifs    : ${stats.students} élèves · ${stats.classes} classes · ${stats.subjects} matières`);
console.log(`  Notes        : ${stats.grades} classiques · ${stats.apc} APC · ${stats.prim} primaire · ${stats.mat} maternelle`);
console.log(`  Scolarité    : ${stats.fees} dossiers · ${stats.payments} paiements`);
console.log(`  Personnel    : ${stats.teachers} enseignants · ${stats.staff} personnel`);
console.log(`  Fichiers     : ${nbFichiers} (logos, cachets, photos)`);
console.log(`  Base         : ${mo(DST_DB)} Mo`);
console.log(`  Comptes de connexion (${comptes.length}) :`);
for (const c of comptes) console.log(`    - ${c.email}${c.roles ? `  [${c.roles}]` : ''}${c.full_name ? `  ${c.full_name}` : ''}`);
if (purge.length) console.log(`  Purgé (état du poste de build) : ${purge.join(', ')}`);
console.log('  Secrets NON embarqués : jeton serveur, clé JWT, clé RSA, clé miroir.');
console.log('────────────────────────────────────────────────────────────');
console.log('');
