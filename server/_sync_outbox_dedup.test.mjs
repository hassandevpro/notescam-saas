// Test — UNE LIGNE EN ATTENTE = UNE ENTRÉE DE FILE.
//
// Incident terrain (THE GENIUS, 29/10/2026). La file de poussée portait
// 13 314 326 entrées pour 6 457 pointeurs utiles : 2 062 entrées par ligne.
// `push()` en retire 500 par cycle de 5 minutes, en FIFO sur `id` — soit
// 26 629 cycles, 2 219 heures de serveur allumé, environ onze mois. Une note
// saisie le matin partait en position 13 000 000. La synchronisation n'était
// pas « peu fiable » : elle était à l'arrêt, et chaque « synchro manuelle » ne
// poussait que les 500 entrées suivantes.
//
// `sync_outbox` était un journal en ajout pur, sans unicité sur
// (tablename, row_id), alimenté par CINQ endroits. Ces contrôles vérifient que
// l'état est désormais impossible — et que la migration sait sortir une base
// déjà engorgée.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const DIR = mkdtempSync(join(tmpdir(), 'nc-outbox-'));
process.env.NOTESCAM_DATA_DIR = DIR;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── 1. L'index unique est posé ────────────────────────────────────────────
const { db, enqueueOutbox } = await import('./db.js');

const index = db.prepare("SELECT name, \"unique\" AS u FROM pragma_index_list('sync_outbox')").all();
ok(index.some((i) => i.name === 'idx_sync_outbox_cle' && i.u === 1),
  '1. (tablename, row_id) porte un index UNIQUE', index);

// ── 2. Enfiler la même ligne dix fois laisse UNE entrée ───────────────────
for (let i = 0; i < 10; i++) enqueueOutbox('students', 'eleve-1', 'upsert');
const n1 = db.prepare("SELECT COUNT(*) n FROM sync_outbox WHERE row_id = 'eleve-1'").get().n;
ok(n1 === 1, '2. dix écritures de la même ligne = une seule entrée de file', n1);

// ── 3. …mais avec un `id` NEUF à chaque fois ──────────────────────────────
// C'est l'invariant dont dépend la purge de `push()` : elle efface par
// `id <= maxId` APRÈS avoir lu son lot. Une mise à jour EN PLACE garderait
// l'ancien `id`, et une écriture survenant pendant la poussée serait purgée
// SANS AVOIR ÉTÉ POUSSÉE. C'est précisément la perte silencieuse à éviter.
const avantId = db.prepare("SELECT id FROM sync_outbox WHERE row_id = 'eleve-1'").get().id;
enqueueOutbox('students', 'eleve-1', 'upsert');
const apresId = db.prepare("SELECT id FROM sync_outbox WHERE row_id = 'eleve-1'").get().id;
ok(apresId > avantId,
  '3. ré-enfiler donne un id PLUS GRAND (la purge de push() ne peut pas l’avaler)',
  { avantId, apresId });

// ── 4. Le dernier état gagne : un upsert suivi d'un delete reste un delete ─
enqueueOutbox('students', 'eleve-1', 'delete');
const op = db.prepare("SELECT op FROM sync_outbox WHERE row_id = 'eleve-1'").get().op;
ok(op === 'delete', '4. l’entrée porte le DERNIER état connu de la ligne', op);

// ── 5. Deux lignes différentes restent deux entrées ───────────────────────
enqueueOutbox('students', 'eleve-2', 'upsert');
enqueueOutbox('grades', 'eleve-1', 'upsert');     // même row_id, autre table
const n2 = db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;
ok(n2 === 3, '5. la clé est bien (table, ligne) — rien n’est confondu', n2);

// ── 6. LA MIGRATION : une base DÉJÀ engorgée doit se dégonfler au démarrage ─
//
// Scénario joué dans un processus séparé, parce que `db.js` exécute ses
// migrations à l'import : il faut une base préparée AVANT.
const DIR2 = mkdtempSync(join(tmpdir(), 'nc-outbox-vieille-'));
const ancienne = new DatabaseSync(join(DIR2, 'notescam.db'));
ancienne.exec(`CREATE TABLE sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tablename TEXT NOT NULL, row_id TEXT NOT NULL,
  op TEXT NOT NULL, at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT)`);
// 50 lignes utiles × 200 réécritures = 10 000 entrées. Même forme que GENIUS.
const ins = ancienne.prepare('INSERT INTO sync_outbox (tablename,row_id,op,at) VALUES (?,?,?,?)');
ancienne.exec('BEGIN');
for (let tour = 0; tour < 200; tour++) {
  for (let i = 0; i < 50; i++) ins.run('students', `e${i}`, 'upsert', `2026-10-29T08:00:${tour % 60}.000Z`);
}
// La toute dernière écriture de e7 est une SUPPRESSION : elle doit survivre.
ins.run('students', 'e7', 'delete', '2026-10-29T09:00:00.000Z');
ancienne.exec('COMMIT');
const avantMigration = ancienne.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;
ancienne.close();

execFileSync(process.execPath, ['-e', `
  process.env.NOTESCAM_DATA_DIR = ${JSON.stringify(DIR2)};
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  await import(${JSON.stringify(new URL('./db.js', import.meta.url).href)});
`, '--input-type=module'], { stdio: 'pipe' });

const migree = new DatabaseSync(join(DIR2, 'notescam.db'));
const apresMigration = migree.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;
const distincts = migree.prepare(
  'SELECT COUNT(DISTINCT tablename || char(31) || row_id) n FROM sync_outbox').get().n;
const opE7 = migree.prepare("SELECT op FROM sync_outbox WHERE row_id = 'e7'").get()?.op;
const idxMigre = migree.prepare("SELECT name FROM pragma_index_list('sync_outbox')").all()
  .some((i) => i.name === 'idx_sync_outbox_cle');
migree.close();

ok(avantMigration === 10001, '6. base de départ bien engorgée (10 001 entrées)', avantMigration);
ok(apresMigration === 50, '7. après démarrage : une entrée par ligne (50)', apresMigration);
ok(apresMigration === distincts, '8. aucun doublon ne subsiste', { apresMigration, distincts });
ok(opE7 === 'delete', '9. la migration garde le DERNIER état, pas le premier', opE7);
ok(idxMigre, '10. l’index unique est posé sur la base migrée', idxMigre);

console.log('');
console.log(`=== ${fail ? 'KO' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
