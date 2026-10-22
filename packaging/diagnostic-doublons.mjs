// POURQUOI UN ÉLÈVE APPARAÎT-IL PLUSIEURS FOIS SUR CE POSTE ?
//
// Lecture seule : ce programme ne corrige RIEN et ne supprime RIEN. Il lit la
// base et dit ce qu'il voit, pour qu'on sache QUELLE cause traiter — il y en a
// plusieurs possibles, et elles ne se réparent pas de la même façon :
//
//   · même id répété              → ce n'est pas un doublon de données, c'est
//                                   l'affichage qui répète une même ligne ;
//   · ids différents, créés à la
//     même seconde                → une soumission partie plusieurs fois ;
//   · ids différents, créés à des
//     dates espacées              → réimport du même fichier, ou ressaisie ;
//   · device_id différents        → deux postes ont créé l'élève chacun de leur
//                                   côté, puis la synchro a réuni les deux ;
//   · classes d'ANNÉES différentes → ce n'est pas un doublon : le produit crée
//                                   une ligne par année scolaire.
//
// Usage (double-cliquer diagnostic-doublons.cmd), ou :
//   "C:\Program Files\NotesCam\node\node.exe" diagnostic-doublons.mjs [chemin\notescam.db]
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const DB = process.argv[2] || 'C:/ProgramData/NotesCam/data/notescam.db';
if (!existsSync(DB)) {
  console.log(`\n  Base introuvable : ${DB}\n  Passez le chemin en argument si les données sont ailleurs.\n`);
  process.exit(2);
}
const db = new DatabaseSync(DB, { readOnly: true });
const colonnes = new Set(db.prepare('PRAGMA table_info("students")').all().map((c) => c.name));
const col = (n, repli = 'NULL') => (colonnes.has(n) ? n : repli);

console.log('\n  NotesCam — pourquoi des élèves en double (lecture seule)\n');
console.log(`  Base : ${DB}`);
console.log(`  Élèves enregistrés : ${db.prepare('SELECT count(*) c FROM students').get().c}\n`);

const groupes = db.prepare(`
  SELECT lower(trim(name)) AS cle, count(*) AS n, name
    FROM students
   WHERE ${colonnes.has('archived_at') ? 'archived_at IS NULL' : '1=1'}
   GROUP BY lower(trim(name)) HAVING n > 1
   ORDER BY n DESC, name LIMIT 40`).all();

if (!groupes.length) {
  console.log('  Aucun élève n’apparaît deux fois sous le même nom.\n');
  process.exit(0);
}

const surnumeraires = groupes.reduce((s, g) => s + g.n - 1, 0);
console.log(`  ${groupes.length} nom(s) porté(s) par plusieurs dossiers — ${surnumeraires} dossier(s) en trop.\n`);

const detail = db.prepare(`
  SELECT id, name, class_id, ${col('created_at')} AS created_at, ${col('device_id')} AS device_id,
         ${col('matricule')} AS matricule, ${col('birth_date')} AS birth_date
    FROM students WHERE lower(trim(name)) = ? ORDER BY created_at, id`);
const anneeDe = db.prepare('SELECT name, current_year FROM classes WHERE id = ?');

const causes = new Map();
const noter = (c) => causes.set(c, (causes.get(c) || 0) + 1);

for (const g of groupes.slice(0, 12)) {
  const lignes = detail.all(g.cle);
  console.log(`  ── ${g.name}  (${g.n} dossiers)`);
  const annees = new Set(), devices = new Set(), dates = new Set(), ids = new Set();
  for (const l of lignes) {
    const cl = l.class_id ? anneeDe.get(l.class_id) : null;
    annees.add(cl?.current_year || '(sans classe)');
    devices.add(l.device_id || '(aucun)');
    dates.add(String(l.created_at || '').slice(0, 19));
    ids.add(l.id);
    console.log(`     ${l.id}  créé ${String(l.created_at || '?').slice(0, 19)}`
      + `  classe ${cl?.name || '(aucune)'} [${cl?.current_year || '?'}]`
      + `  matricule ${l.matricule || '-'}  poste ${String(l.device_id || '-').slice(0, 8)}`);
  }
  let cause;
  if (ids.size < lignes.length) cause = 'même id répété (affichage, pas doublon de données)';
  else if (annees.size === lignes.length && annees.size > 1) cause = 'une ligne par ANNÉE scolaire (normal : ce n’est pas un doublon)';
  else if (dates.size === 1) cause = 'créés à la même seconde (une soumission partie plusieurs fois)';
  else if (devices.size > 1) cause = 'créés depuis des postes différents';
  else cause = 'créés à des moments différents (réimport du fichier, ou ressaisie)';
  console.log(`     → ${cause}\n`);
  noter(cause);
}
if (groupes.length > 12) console.log(`  (… ${groupes.length - 12} autre(s) nom(s) non détaillé(s))\n`);

console.log('  Ce que cela indique :');
for (const [c, n] of [...causes].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)} cas  ${c}`);
console.log('\n  Rien n’a été modifié. Envoyez cette sortie telle quelle : elle désigne la cause à traiter.\n');
