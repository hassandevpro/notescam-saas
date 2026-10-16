// LES LIGNES À `updated_at` NULL REMONTENT-ELLES ENFIN ?
//
// LE DÉFAUT QUE CE TEST VERROUILLE. `ensureColumn` ajoute la colonne
// `updated_at` mais laisse les lignes DÉJÀ présentes à NULL. Le cloud refuse une
// ligne sans `updated_at`, et il la refuse EN SILENCE (`sync-push` répond 200
// avec un compteur `skipped` que le LAN ne regarde pas). Tout ce qu'une école
// avait saisi AVANT l'arrivée de ces colonnes ne pouvait donc JAMAIS monter.
//
// Et le seul chemin de retour n'y changeait rien : `autoRepair` réenfile les
// lignes locales absentes du cloud, qui sont refusées à nouveau pour la même
// raison. La divergence ne se résorbe jamais — c'est le cas que décrit
// `divergenceAlert` (« la réparation automatique n'y parvient pas »).
//
// CE QUE CE TEST SURVEILLE SURTOUT : que le rattrapage n'antidate PAS au
// présent. Poser `now` rendrait ces vieilles lignes plus récentes que le cloud,
// et la résolution « le plus récent gagne » ferait écraser des données cloud à
// jour. C'est l'erreur qui transformerait une réparation en perte de données.
//
// AUCUNE DONNÉE DE PRODUCTION : base temporaire, détruite à la fin.
//
// Lancer : node server/_sync_backfill_updated_at.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`✅ ${libelle}`);
  else { console.log(`❌ ${libelle}${obtenu !== undefined ? ` (obtenu: ${JSON.stringify(obtenu)})` : ''}`); echecs++; }
};

const dir = mkdtempSync(join(tmpdir(), 'nc-backfill-'));
const file = join(dir, 'test.db');
const db = new DatabaseSync(file);

// Deux formes réelles : une table AVEC `created_at` (le cas des 60 tables
// synchronisées qui en ont une) et une SANS (grades, apc_notes, mat_observations).
db.exec(`
  CREATE TABLE students (id TEXT PRIMARY KEY, name TEXT, created_at TEXT, updated_at TEXT, version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE grades   (id TEXT PRIMARY KEY, score TEXT, updated_at TEXT, version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE sans_sync(id TEXT PRIMARY KEY, x TEXT);
`);
db.exec(`
  INSERT INTO students (id, name, created_at, updated_at) VALUES
    ('s1', 'ABEGA',  '2024-09-15T08:00:00.000Z', NULL),
    ('s2', 'BIYA',   '2024-10-01T09:30:00.000Z', NULL),
    ('s3', 'DEJA',   '2024-09-20T10:00:00.000Z', '2026-01-05T12:00:00.000Z'),
    ('s4', 'SANS_CA', NULL,                      NULL);
  INSERT INTO grades (id, score, updated_at) VALUES ('g1', '14', NULL), ('g2', '12', NULL);
  INSERT INTO sans_sync (id, x) VALUES ('z1', 'rien');
`);

// Reproduction EXACTE de `backfillUpdatedAt` (server/db.js) : même requête, même
// sentinelle. Le module réel s'exécute à l'ouverture de la base et dépend de
// DATA_DIR ; on rejoue donc la logique ici, et le test de parité ci-dessous
// garantit qu'elle ne dérive pas de l'original.
const SENTINELLE = '2000-01-01T00:00:00.000Z';
const q = (n) => '"' + String(n).replace(/"/g, '""') + '"';
function backfill(tables) {
  let total = 0;
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${q(t)})`).all().map((c) => c.name);
    if (!cols.includes('updated_at')) continue;
    const source = cols.includes('created_at')
      ? `COALESCE(created_at, '${SENTINELLE}')`
      : `'${SENTINELLE}'`;
    total += db.prepare(`UPDATE ${q(t)} SET updated_at = ${source} WHERE updated_at IS NULL`).run().changes;
  }
  return total;
}

const TABLES = ['students', 'grades', 'sans_sync'];
const avant = db.prepare('SELECT count(*) n FROM students WHERE updated_at IS NULL').get().n;
ok(avant === 3, 'temoin : 3 eleves sans updated_at avant le rattrapage', avant);

const total = backfill(TABLES);
ok(total === 5, '5 lignes rattrapees (3 eleves + 2 notes)', total);

// ── 1. Plus aucune ligne non synchronisable ────────────────────────────────
ok(db.prepare('SELECT count(*) n FROM students WHERE updated_at IS NULL').get().n === 0,
  'aucun eleve ne reste sans updated_at');
ok(db.prepare('SELECT count(*) n FROM grades WHERE updated_at IS NULL').get().n === 0,
  'aucune note ne reste sans updated_at');

// ── 2. L'HORODATAGE N'EST PAS « MAINTENANT » ───────────────────────────────
// Le point le plus important du fichier : antidater au présent ferait gagner la
// ligne locale contre une version cloud à jour, donc écraserait des données.
const s1 = db.prepare("SELECT updated_at FROM students WHERE id = 's1'").get();
ok(s1.updated_at === '2024-09-15T08:00:00.000Z',
  "l eleve prend SA date de creation, pas l heure du rattrapage", s1.updated_at);
const maintenant = new Date().toISOString();
ok(s1.updated_at < maintenant, 'et elle est bien ANTERIEURE a maintenant', s1.updated_at);
ok(db.prepare("SELECT updated_at FROM students WHERE id = 's2'").get().updated_at === '2024-10-01T09:30:00.000Z',
  'chaque ligne garde SA propre date, pas une date commune');

// Table sans `created_at` : sentinelle ancienne, jamais `now`.
const g1 = db.prepare("SELECT updated_at FROM grades WHERE id = 'g1'").get();
ok(g1.updated_at === SENTINELLE, 'table sans created_at -> sentinelle ancienne', g1.updated_at);
ok(g1.updated_at < maintenant, 'la sentinelle est anterieure a maintenant', g1.updated_at);
// Ligne avec created_at NULL dans une table qui en a une : même repli.
ok(db.prepare("SELECT updated_at FROM students WHERE id = 's4'").get().updated_at === SENTINELLE,
  'created_at NULL -> sentinelle, pas une erreur');

// ── 3. Une ligne DÉJÀ horodatée n'est jamais touchée ───────────────────────
ok(db.prepare("SELECT updated_at FROM students WHERE id = 's3'").get().updated_at === '2026-01-05T12:00:00.000Z',
  'une ligne deja horodatee garde sa valeur');

// ── 4. Idempotent : rejouer ne change plus rien ────────────────────────────
const second = backfill(TABLES);
ok(second === 0, 'second passage : 0 ligne touchee', second);
ok(db.prepare("SELECT updated_at FROM students WHERE id = 's1'").get().updated_at === '2024-09-15T08:00:00.000Z',
  'et les dates du premier passage sont intactes');

// ── 5. Les tables NON synchronisées ne sont pas touchées ───────────────────
const cols = db.prepare('PRAGMA table_info(sans_sync)').all().map((c) => c.name);
ok(!cols.includes('updated_at'), 'une table sans updated_at est ignoree, pas alteree');
ok(db.prepare('SELECT count(*) n FROM sans_sync').get().n === 1, 'et son contenu est intact');

// ── 6. PARITÉ avec l'original : la requête ne doit pas dériver ─────────────
// Si quelqu'un change la sentinelle ou la source dans server/db.js sans toucher
// ce fichier, ce contrôle tombe — et c'est le but.
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
  ok(src.includes(`UPDATED_AT_SENTINELLE = '${SENTINELLE}'`),
    'la sentinelle du test est celle de server/db.js');
  ok(src.includes('WHERE updated_at IS NULL'),
    'le rattrapage reel ne touche QUE les lignes a NULL');
  ok(src.includes('COALESCE(created_at'),
    'le rattrapage reel prefere created_at a une date inventee');
  ok(!/updated_at = .*new Date\(\)\.toISOString\(\)|SET updated_at = datetime\('now'\)/.test(src),
    "le rattrapage reel n antidate PAS au present");
}

db.close();
rmSync(dir, { recursive: true, force: true });
console.log(echecs === 0 ? '\n✅ Rattrapage updated_at : tout passe' : `\n❌ ${echecs} echec(s)`);
process.exit(echecs === 0 ? 0 : 1);
