// scripts/validate-migrations.mjs
// Validation STATIQUE des migrations Postgres de la synchro (sans base) : idempotence,
// absence de trigger dupliqué, absence d'écrasement involontaire de fonction, et
// surtout absence de toute instruction qui casserait des données existantes.
//
// S'exécute sans Postgres → utilisable en CI/pré-BUILD. Renvoie un objet de résultats
// (findings) ; les `error` sont BLOQUANTES (gate BUILD).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['supabase_sync_integrity.sql', 'supabase_sync_merkle.sql', 'supabase_app_releases.sql'];

// Retire les corps de fonction $$...$$ (et $tag$...$tag$) pour analyser les
// instructions de PREMIER NIVEAU (DDL de migration). Renvoie {top, bodies}.
function splitDollar(sql) {
  const bodies = [];
  let top = '';
  const re = /\$([a-zA-Z_]*)\$/g;
  let i = 0, m;
  while ((m = re.exec(sql))) {
    const tag = m[0];
    const start = m.index;
    const close = sql.indexOf(tag, start + tag.length);
    if (close === -1) break;
    top += sql.slice(i, start) + ' <BODY> ';
    bodies.push(sql.slice(start + tag.length, close));
    i = close + tag.length;
    re.lastIndex = i;
  }
  top += sql.slice(i);
  return { top, bodies };
}
// Retire les commentaires -- et /* */ (hors chaînes — suffisant pour notre DDL).
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const findings = [];
const add = (level, file, msg) => findings.push({ level, file, msg });

// Fonctions définies dans TOUS les autres scripts SQL (détection d'écrasement).
function otherFileFunctions() {
  const map = new Map(); // name -> Set(files)
  for (const f of readdirSync(ROOT).filter((x) => x.startsWith('supabase_') && x.endsWith('.sql') && !TARGETS.includes(x))) {
    let txt = '';
    try { txt = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const m of txt.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi)) {
      if (!map.has(m[1])) map.set(m[1], new Set());
      map.get(m[1]).add(f);
    }
  }
  return map;
}
const OTHERS = otherFileFunctions();

for (const file of TARGETS) {
  let raw;
  try { raw = readFileSync(join(ROOT, file), 'utf8'); }
  catch { add('error', file, 'fichier introuvable'); continue; }
  const sql = stripComments(raw);
  const { top } = splitDollar(sql);

  // 1) CREATE TABLE → IF NOT EXISTS
  for (const m of top.matchAll(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)) {
    if (!m[1]) add('error', file, `CREATE TABLE ${m[2]} sans IF NOT EXISTS (non idempotent)`);
  }
  // 2) CREATE INDEX → IF NOT EXISTS
  for (const m of top.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
    if (!m[1]) add('error', file, `CREATE INDEX ${m[2]} sans IF NOT EXISTS (non idempotent)`);
  }
  // 3) CREATE FUNCTION → OR REPLACE, OU précédé d'un DROP FUNCTION IF EXISTS (idempotent
  //    aussi : requis quand le type de retour change, où OR REPLACE est interdit).
  for (const m of top.matchAll(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi)) {
    if (m[1]) continue;
    const before = top.slice(Math.max(0, m.index - 300), m.index);
    if (new RegExp(`DROP\\s+FUNCTION\\s+IF\\s+EXISTS\\s+(?:public\\.)?${m[2]}\\b`, 'i').test(before)) continue;
    add('error', file, `CREATE FUNCTION ${m[2]} sans OR REPLACE ni DROP IF EXISTS préalable (non idempotent)`);
  }
  // 4) Seeds INSERT de premier niveau → ON CONFLICT
  for (const m of top.matchAll(/INSERT\s+INTO\s+(?:public\.)?(\w+)/gi)) {
    // fenêtre jusqu'au prochain ';' pour vérifier ON CONFLICT
    const rest = top.slice(m.index, m.index + 400);
    if (!/ON\s+CONFLICT/i.test(rest)) add('error', file, `INSERT INTO ${m[1]} (seed) sans ON CONFLICT (non idempotent)`);
  }
  // 5) CREATE TRIGGER → gardé (pg_trigger NOT EXISTS ou DROP TRIGGER IF EXISTS avant)
  for (const m of raw.matchAll(/CREATE\s+TRIGGER\s+/gi)) {
    const before = raw.slice(Math.max(0, m.index - 400), m.index);
    const guarded = /pg_trigger[\s\S]*NOT\s+EXISTS/i.test(before) || /NOT\s+EXISTS[\s\S]*pg_trigger/i.test(before) || /DROP\s+TRIGGER\s+IF\s+EXISTS/i.test(before);
    if (!guarded) add('error', file, 'CREATE TRIGGER non gardé (risque de doublon à la 2e exécution)');
  }
  // 6) SÛRETÉ DES DONNÉES : aucune instruction destructrice sur des tables métier.
  //    (analyse le texte COMPLET, corps de fonctions inclus.)
  const full = sql; // commentaires retirés, corps conservés
  if (/\bDROP\s+TABLE\b/i.test(full)) add('error', file, 'DROP TABLE présent (destructif)');
  if (/\bTRUNCATE\b/i.test(full)) add('error', file, 'TRUNCATE présent (destructif)');
  if (/\bDROP\s+COLUMN\b/i.test(full)) add('error', file, 'ALTER … DROP COLUMN présent (perte de données)');
  // DELETE : autorisé UNIQUEMENT sur la table dérivée sync_merkle (reconstructible).
  for (const m of full.matchAll(/\bDELETE\s+FROM\s+(?:public\.)?(\w+)/gi)) {
    if (m[1] !== 'sync_merkle') add('error', file, `DELETE FROM ${m[1]} — seule sync_merkle (dérivée) peut être purgée`);
  }
  // UPDATE autonome (hors « DO UPDATE SET » d'un upsert) sur une table métier.
  for (const m of full.matchAll(/(?<!DO\s)\bUPDATE\s+(?:public\.)?(\w+)\s+SET/gi)) {
    if (m[1] !== 'sync_merkle') add('warn', file, `UPDATE ${m[1]} SET … — vérifier qu'il ne modifie pas de données métier`);
  }
  // 7) Écrasement involontaire d'une fonction existant AILLEURS.
  for (const m of top.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi)) {
    const other = OTHERS.get(m[1]);
    if (other) add('warn', file, `fonction ${m[1]} déjà définie dans ${[...other].join(', ')} — vérifier que la redéfinition est voulue`);
  }
}

const errors = findings.filter((f) => f.level === 'error');
const warns = findings.filter((f) => f.level === 'warn');

// Sortie structurée (consommée par l'orchestrateur) + lisible.
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warns }));
} else {
  console.log('=== Validation statique des migrations Postgres ===');
  for (const f of findings) console.log(`  [${f.level.toUpperCase()}] ${f.file}: ${f.msg}`);
  console.log(errors.length === 0
    ? `✅ Idempotence & sûreté OK (${warns.length} avertissement(s))`
    : `❌ ${errors.length} erreur(s) bloquante(s)`);
}
process.exit(errors.length === 0 ? 0 : 1);
