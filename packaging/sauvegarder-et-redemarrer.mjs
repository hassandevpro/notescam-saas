// SAUVEGARDE VÉRIFIÉE DE LA BASE LAN — serveur déjà arrêté.
//
// Pourquoi ce fichier existe : une mise à jour peut être installée sans que le
// serveur redémarre. Les tables et colonnes neuves étant posées AU DÉMARRAGE,
// l'application garde alors l'ancien comportement — et l'école conclut, à juste
// titre, que « rien n'est réglé ». Le script d'à côté relance le service ; ici
// on protège la base avant qu'il le fasse.
//
// `VACUUM INTO` consolide le WAL dans une copie cohérente sans toucher la
// source. Une copie par `cp` serveur actif peut être déchirée, et on ne s'en
// aperçoit qu'en voulant s'en servir — d'où l'arrêt du service AVANT, et la
// VÉRIFICATION de la copie APRÈS. Une sauvegarde non vérifiée n'est pas une
// sauvegarde.
//
// Code de sortie : 0 = copie vérifiée · 2 = copie refusée (ne rien installer).
//
// Usage : node sauvegarder-et-redemarrer.mjs <chemin-base> [dossier-sortie]
import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DB = process.argv[2] || 'C:/ProgramData/NotesCam/data/notescam.db';
const OUT = process.argv[3] || dirname(DB);

const vert = (s) => `\x1b[32m${s}\x1b[0m`;
const rouge = (s) => `\x1b[31m${s}\x1b[0m`;

if (!existsSync(DB)) {
  console.log(rouge(`\n  Base introuvable : ${DB}\n`));
  process.exit(2);
}

// Les comptages qui ne doivent jamais diminuer. `n/a` pour une table absente :
// une base ancienne n'a pas encore toutes les tables, ce n'est pas une erreur.
const TABLES = ['students', 'grades', 'prim_notes', 'fee_payments', 'budget_expenses', 'teachers', 'school_users'];
const compter = (db) => {
  const out = {};
  for (const t of TABLES) {
    try { out[t] = db.prepare(`SELECT count(*) c FROM ${t}`).get().c; } catch { out[t] = 'n/a'; }
  }
  return out;
};

const horo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const COPIE = join(OUT, `notescam.db.avant-maj-${horo}`);

console.log(`\n  Base    : ${DB}`);
console.log(`  Copie   : ${COPIE}\n`);

let source;
try {
  source = new DatabaseSync(DB, { readOnly: true });
} catch (e) {
  console.log(rouge(`  Base illisible : ${e.message}`));
  console.log('  Le serveur est-il encore en marche ? Arrêtez-le d’abord.\n');
  process.exit(2);
}
const avant = compter(source);
console.log('  Avant : ' + Object.entries(avant).map(([k, v]) => `${k}=${v}`).join(' '));

// `VACUUM INTO` exige une connexion en écriture ; la source n'est pas modifiée.
source.close();
const rw = new DatabaseSync(DB);
try {
  rw.exec(`VACUUM INTO '${COPIE.replace(/'/g, "''")}'`);
} catch (e) {
  console.log(rouge(`\n  ÉCHEC de la copie : ${e.message}`));
  console.log('  RIEN n’a été modifié. N’installez pas, ne redémarrez pas.\n');
  process.exit(2);
}
rw.close();

// --- La vérification : c'est elle qui fait d'une copie une sauvegarde --------
const copie = new DatabaseSync(COPIE, { readOnly: true });
const integrite = copie.prepare('PRAGMA integrity_check').get().integrity_check;
const apres = compter(copie);
copie.close();

console.log('  Copie : ' + Object.entries(apres).map(([k, v]) => `${k}=${v}`).join(' '));
console.log(`  Taille : ${statSync(COPIE).size} octets`);
console.log(`  integrity_check : ${integrite}`);

let ko = 0;
if (integrite !== 'ok') { console.log(rouge('\n  KO  contrôle d’intégrité')); ko++; }
for (const t of TABLES) {
  if (String(avant[t]) !== String(apres[t])) {
    console.log(rouge(`  KO  ${t} : ${avant[t]} dans la base, ${apres[t]} dans la copie`));
    ko++;
  }
}

if (ko) {
  console.log(rouge('\n  SAUVEGARDE NON VÉRIFIÉE — on s’arrête là.'));
  console.log('  Ne redémarrez pas, n’installez rien, et appelez l’éditeur.\n');
  process.exit(2);
}

console.log(vert('\n  Sauvegarde vérifiée. Le redémarrage peut avoir lieu.'));
console.log('  Conservez ce fichier :');
console.log(`    ${COPIE}\n`);
process.exit(0);
