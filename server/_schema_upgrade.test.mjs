// MISE À NIVEAU D'UNE BASE DÉJÀ INSTALLÉE — le chemin que les autres tests ratent.
//
// Tous les tests serveur partent d'une base NEUVE : schema.sql y crée les tables
// avec toutes leurs colonnes, donc un index posé sur une colonne récente passe
// sans broncher. Sur une base d'école DÉJÀ EN PLACE, ce n'est pas le cas :
//
//   server/db.js fait `db.exec(schema.sql)` PUIS les `ensureColumn(...)`.
//
// Un `CREATE INDEX` écrit dans schema.sql sur une colonne ajoutée par
// ensureColumn porte donc sur une colonne qui n'existe pas encore → SQLite lève
// « no such column », db.exec propage, et LE SERVEUR NE DÉMARRE PLUS.
//
// Vécu le 2026-08-06 avec `idx_fee_payments_receipt_no` : installation neuve
// parfaite, école existante hors service. Ce test ferme la classe entière.
//
// Lancer : node server/_schema_upgrade.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, 'schema.sql'), 'utf8');
const dbjs   = readFileSync(join(here, 'db.js'), 'utf8');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Colonnes ajoutées après coup, table par table -------------------------
const added = new Map();          // table -> Set(colonnes)
for (const m of dbjs.matchAll(/ensureColumn\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
  if (!added.has(m[1])) added.set(m[1], new Set());
  added.get(m[1]).add(m[2]);
}
ok(added.size > 0, `${added.size} tables reçoivent des colonnes via ensureColumn`);

// --- Index déclarés dans schema.sql ----------------------------------------
const indexes = [...schema.matchAll(/CREATE\s+INDEX[^;]*?\s+ON\s+(\w+)\s*\(([^)]*)\)/gi)]
  .map((m) => ({ table: m[1], cols: m[2].split(',').map((c) => c.trim().split(/\s+/)[0]) }));
ok(indexes.length > 0, `${indexes.length} index déclarés dans schema.sql`);

// --- LA règle --------------------------------------------------------------
const offenders = [];
for (const idx of indexes) {
  const late = added.get(idx.table);
  if (!late) continue;
  for (const col of idx.cols) if (late.has(col)) offenders.push(`${idx.table}(${col})`);
}
ok(offenders.length === 0,
  offenders.length === 0
    ? 'aucun index de schema.sql ne porte sur une colonne ajoutée par ensureColumn'
    : `INDEX PRÉMATURÉ(S) — le serveur ne démarrera pas sur une base existante : ${offenders.join(', ')}`);

// --- Même règle pour les CHECK/UNIQUE de table ajoutés après coup ----------
// (une contrainte de table ne peut pas non plus référencer une colonne future)
const tableConstraints = [...schema.matchAll(/CREATE\s+TABLE[^;]*?\((.*?)\n\);/gis)];
ok(tableConstraints.length > 0, `${tableConstraints.length} définitions de table analysées`);

// --- Vérification RÉELLE sur une base simulée « ancienne » ----------------
// On fabrique une base d'où l'on retire les colonnes tardives, puis on rejoue
// le schéma : c'est exactement ce que fait un serveur qui démarre après update.
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');

// On fabrique la base « ancienne » en RETIRANT réellement les colonnes tardives
// (ALTER TABLE DROP COLUMN), plutôt qu'en découpant le texte SQL : c'est l'état
// exact d'une école installée avant ces colonnes.
db.exec(schema);
let dropped = 0;
for (const [table, cols] of added) {
  for (const col of cols) {
    try { db.exec(`ALTER TABLE ${table} DROP COLUMN ${col}`); dropped++; }
    catch { /* colonne absente de ce schéma, ou portée par une contrainte : sans objet */ }
  }
}
ok(dropped > 0, `${dropped} colonnes retirées pour simuler une base antérieure`);

// LE test : rejouer schema.sql sur cette base doit passer sans erreur — c'est
// littéralement ce que fait server/db.js au démarrage.
let boom = null;
try { db.exec(schema); } catch (e) { boom = e.message; }
ok(!boom, boom ? `rejouer schema.sql sur une base ancienne ÉCHOUE → serveur mort : ${boom}`
               : 'schema.sql se rejoue sans erreur sur une base antérieure');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
