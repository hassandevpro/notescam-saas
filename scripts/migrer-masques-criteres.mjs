// Migration du masque des critères du primaire vers (classe, compétence, critère).
//   node scripts/migrer-masques-criteres.mjs <chemin/notescam.db>                     # DRY-RUN (défaut)
//   node scripts/migrer-masques-criteres.mjs <chemin/notescam.db> --appliquer          # écrit, après sauvegarde
//   node scripts/migrer-masques-criteres.mjs <chemin/notescam.db> --ecole <uuid>       # une seule école
// Arrêter le service avant --appliquer. Retour arrière : DELETE FROM prim_criteres_masques_classe;
// DELETE FROM prim_criteres_masques_init;  (aucune note ni liste d'école n'est jamais touchée).
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { migrer } from './lib/migrerMasquesCriteres.mjs';

const args = process.argv.slice(2);
const chemin = args.find((a) => !a.startsWith('--'));
const appliquer = args.includes('--appliquer');
const i = args.indexOf('--ecole');
const schoolId = i >= 0 ? args[i + 1] : null;
if (!chemin || !existsSync(chemin)) { console.error('Usage : node scripts/migrer-masques-criteres.mjs <notescam.db> [--appliquer] [--ecole <uuid>]'); process.exit(1); }

const db = new DatabaseSync(chemin);
const horo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const rapport = migrer(db, { appliquer, schoolId, sauvegarde: appliquer ? `${chemin}.avant-masques-criteres-${horo}` : null });
console.log(JSON.stringify(rapport, null, 2));
console.log(appliquer ? 'ÉCRIT. Sauvegarde : ' + rapport.sauvegarde : 'DRY-RUN : aucune écriture. Relancez avec --appliquer après lecture.');
