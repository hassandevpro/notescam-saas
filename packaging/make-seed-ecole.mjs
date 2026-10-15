#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PRODUIT LA BASE D'UNE ÉCOLE DEPUIS LE CLOUD, pour l'embarquer dans un .exe
//
// Étape 1 de deux. Ensuite :
//   powershell -File packaging/build-installer.ps1 -SeedData <dossier affiché ici> -SeedLabel <label>
//
//   node packaging/make-seed-ecole.mjs --label bright-continent --email admin@ecole.cm
//   (le mot de passe cloud est demandé à l'écran — il n'apparaît ni dans la
//    ligne de commande, ni dans l'historique du shell)
//
//   Non interactif : --password '****', ou NOTESCAM_CLOUD_PASSWORD dans l'env.
//
// POURQUOI UN ENROBAGE PLUTÔT QUE `npm run migrate:cloud`. `runMigration` écrit
// dans NOTESCAM_DATA_DIR et ne vérifie PAS que la base est vide : une variable
// d'environnement oubliée, et l'école atterrit dans `server/data` — la base de
// développement — mélangée à des données de test. Ici le dossier est déduit du
// label, posé AVANT l'import de db.js, et on REFUSE d'écrire dans une base qui
// existe déjà.
//
// CE QUE DEVIENNENT LES MOTS DE PASSE (règle de server/migrate.js) :
//   * le compte ADMIN utilisé ici garde SON mot de passe cloud en local — c'est
//     lui qui ouvrira l'application après installation ;
//   * les AUTRES comptes (enseignants, caisse, direction) reçoivent un mot de
//     passe aléatoire : le cloud ne laisse pas lire les mots de passe. Sur
//     place, l'admin les redonne depuis l'application, ou avec
//     « reinitialiser-mot-de-passe.cmd ».
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const ARGV = process.argv.slice(2);
const opt = (...f) => {
  for (const x of f) {
    const i = ARGV.indexOf(x);
    if (i >= 0 && ARGV[i + 1] && !ARGV[i + 1].startsWith('--')) return ARGV[i + 1];
  }
  return undefined;
};

const LABEL = opt('--label');
const EMAIL = opt('--email');
if (!LABEL || !EMAIL) {
  console.error('Usage : node packaging/make-seed-ecole.mjs --label <nom-court> --email <admin cloud>');
  console.error('        [--password ****] [--out <dossier>]');
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(LABEL)) {
  console.error('❌ --label : minuscules, chiffres et tirets seulement (il nomme le .exe produit).');
  process.exit(1);
}

const OUT = resolve(opt('--out') || join(ROOT, 'packaging', '_seed', LABEL));
if (existsSync(join(OUT, 'notescam.db'))) {
  console.error(`❌ Une base existe déjà ici : ${join(OUT, 'notescam.db')}`);
  console.error('   La migration AJOUTERAIT ses lignes par-dessus. Supprimer ce dossier');
  console.error('   si la base doit être refaite, ou choisir un autre --out.');
  process.exit(2);
}

let password = opt('--password') || process.env.NOTESCAM_CLOUD_PASSWORD;
if (!password) {
  if (!process.stdin.isTTY) {
    console.error('❌ Mot de passe cloud absent : --password, NOTESCAM_CLOUD_PASSWORD,');
    console.error('   ou lancer cette commande dans un vrai terminal (saisie à l\'écran).');
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question(`Mot de passe cloud de ${EMAIL} : `);
  rl.close();
  if (!password) { console.error('\n❌ Annulé.'); process.exit(2); }
}

mkdirSync(OUT, { recursive: true });
// `db.js` lit NOTESCAM_DATA_DIR À L'IMPORT : posé avant tout import de serveur.
process.env.NOTESCAM_DATA_DIR = OUT;
const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../server/cloudEnv.js');
const { runMigration } = await import('../server/migrate.js');

console.log(`\nÉcole « ${LABEL} » — migration Cloud → base locale`);
console.log(`  Cloud  : ${SUPABASE_URL}`);
console.log(`  Compte : ${EMAIL}`);
console.log(`  Sortie : ${OUT}\n`);

try {
  const res = await runMigration({
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    email: EMAIL,
    password,
    onProgress: (e) => {
      if (e.phase === 'analyzed') console.log('  analyse :', JSON.stringify(e.counts));
      else if (e.phase !== 'assets') console.log('  →', e.phase);
    },
  });
  console.log(`\n✅ Base produite — ${res.school}`);
  console.table(res.report.tables);
  console.log(`Comptes recréés : ${res.report.users}`);
  if (!res.ok) {
    console.error('\n⚠ Intégrité : écarts détectés — NE PAS distribuer cette base.');
    console.error(JSON.stringify(res.integrity.mismatches, null, 2));
    process.exit(3);
  }
  console.log('\nÉtape suivante (installeur chargé de ces données) :');
  console.log('  powershell -ExecutionPolicy Bypass -File packaging/build-installer.ps1');
  console.log(`    -NodeVersion v24.20.0 -SeedData "${OUT}" -SeedLabel ${LABEL}`);
  console.log('');
  process.exit(0);
} catch (e) {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
}
