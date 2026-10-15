// Test LAN du référentiel BILINGUE SPÉCIAL : le schéma SQLite et le seed embarqué
// doivent charger, et rendre les mêmes coefficients que l'arrêté — hors ligne.
// Exécution : node server/_bilSeed.test.mjs
//
// Ce test monte une base SQLite JETABLE en mémoire. Il ne touche à aucune base
// d'école, ne lit ni n'écrit la moindre donnée réelle.
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('✅ ' + msg); pass++; };
const eq = (a, b, msg) => ok(a === b, `${msg} (${a} === ${b})`);

const here = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(':memory:');

console.log('── Chargement du schéma LAN + seed officiel ──');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
ok(true, 'server/schema.sql appliqué sans erreur');
db.exec(readFileSync(join(here, 'officiel-seed.sql'), 'utf8'));
ok(true, 'server/officiel-seed.sql appliqué sans erreur');

console.log('\n── Les tables bil_* sont peuplées ──');
const one = (sql, ...a) => db.prepare(sql).get(...a);
eq(Number(one('SELECT COUNT(*) n FROM bil_series').n), 2, '2 séries');
eq(Number(one('SELECT COUNT(*) n FROM bil_groupes').n), 10, '10 domaines');
eq(Number(one('SELECT COUNT(*) n FROM bil_matieres').n), 35, '35 matières');
eq(Number(one('SELECT COUNT(*) n FROM bil_serie_matieres').n), 141, '141 lignes coefficient');
eq(Number(one('SELECT COUNT(*) n FROM bil_referentiel_versions WHERE actif=1').n), 1, 'une version active');

console.log('\n── Coefficients identiques aux totaux imprimés de l\'arrêté ──');
for (const [cl, attendu] of [['6e', 31], ['5e', 31], ['4e', 32], ['3e', 32]]) {
  const r = one('SELECT SUM(coefficient) s FROM bil_serie_matieres WHERE serie_id=? AND classe_id=? AND actif=1', 'bil_fr', cl);
  eq(Number(r.s), attendu, `francophone ${cl} : Σcoef = ${attendu}`);
}
for (const [cl, attendu] of [['form1', 32], ['form2', 32], ['form3', 35]]) {
  const r = one('SELECT SUM(coefficient) s FROM bil_serie_matieres WHERE serie_id=? AND classe_id=? AND actif=1', 'bil_en', cl);
  eq(Number(r.s), attendu, `anglophone ${cl} : Σcoef = ${attendu} (recalculé, non imprimé)`);
}

console.log('\n── Charge horaire conservée et distincte du coefficient ──');
const tm = one(`SELECT sm.coefficient c, sm.charge_horaire h FROM bil_serie_matieres sm
  WHERE sm.serie_id='bil_fr' AND sm.classe_id='6e' AND sm.matiere_id='travail_manuel'`);
eq(Number(tm.c), 1, 'Travail Manuel : coefficient 1');
eq(Number(tm.h), 2, 'Travail Manuel : charge horaire 2 h');

console.log('\n── Matières au choix marquées comme telles ──');
const opt = one(`SELECT COUNT(*) n FROM bil_serie_matieres WHERE classe_id='form4' AND obligatoire=0`);
const obl = one(`SELECT COUNT(*) n FROM bil_serie_matieres WHERE classe_id='form4' AND obligatoire=1`);
eq(Number(obl.n), 4, 'Form 4 : 4 matières obligatoires');
ok(Number(opt.n) > 0, `Form 4 : ${opt.n} matières au choix, distinguées en base`);
const fr6opt = one(`SELECT COUNT(*) n FROM bil_serie_matieres WHERE serie_id='bil_fr' AND obligatoire=0`);
eq(Number(fr6opt.n), 0, 'francophone : aucune matière au choix (conforme à l\'arrêté)');

console.log('\n── Colonnes bulletin ajoutées à subjects ──');
// `schema.sql` crée la table de base ; les colonnes ajoutées après coup passent
// par les `ensureColumn(...)` de db.js, rejoués à chaque boot. On relit donc ces
// déclarations à la source et on les applique, ce qui vérifie à la fois qu'elles
// existent et que leur DDL est acceptée par SQLite.
const dbSrc = readFileSync(join(here, 'db.js'), 'utf8');
const declared = [...dbSrc.matchAll(/ensureColumn\(\s*'subjects',\s*'([a-z_]+)',\s*'([^']+)'\s*\)/g)];
ok(declared.length >= 4, `${declared.length} colonnes déclarées pour subjects dans db.js`);
for (const [, col, ddl] of declared) {
  const existing = db.prepare('PRAGMA table_info(subjects)').all().map((c) => c.name);
  if (!existing.includes(col)) db.exec(`ALTER TABLE subjects ADD COLUMN ${ddl}`);
}
const cols = db.prepare('PRAGMA table_info(subjects)').all().map((c) => c.name);
for (const c of ['charge_horaire', 'bil_domaine', 'bil_domaine_ordre', 'bil_obligatoire']) {
  ok(cols.includes(c), `subjects.${c} présente après ensureColumn`);
}

console.log('\n── Les tables bil_* sont autorisées côté LAN ──');
// Sans cette allowlist, query.js refuse la table et toute écriture échoue
// silencieusement — le bulletin resterait vide sans message d'erreur.
for (const t of ['bil_series', 'bil_groupes', 'bil_matieres', 'bil_serie_matieres', 'bil_referentiel_versions']) {
  ok(new RegExp(`'${t}'`).test(dbSrc), `${t} présente dans l'allowlist de db.js`);
}

console.log('\n── Préservation : AVANT vs APRÈS l\'ajout du bilingue ──');
// Preuve directe plutôt qu'effectifs codés en dur : on charge le seed TEL QU'IL
// ÉTAIT au dernier commit (sans le bilingue) dans une base jetable, on compte, et
// on compare au seed actuel. Aucun référentiel existant ne doit bouger d'une ligne.
//
// C'est exactement le risque qui a fait écarter la réutilisation des tables sc_* :
// chaque import y exécute `UPDATE …_versions SET actif = false`.
const TABLES = [
  'sc_series', 'sc_groupes', 'sc_matieres', 'sc_serie_matieres',
  'apc_cycles', 'apc_classes', 'apc_matieres', 'apc_competences', 'apc_classe_matieres',
  'mat_niveaux', 'mat_domaines',
  'prim_cycles', 'prim_niveaux', 'prim_competences', 'prim_criteres',
];

function compte(seedSql) {
  const d = new DatabaseSync(':memory:');
  d.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  d.exec(seedSql);
  const c = {};
  for (const t of TABLES) c[t] = Number(d.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
  for (const p of ['sc', 'apc', 'mat', 'prim']) {
    c[`${p}_versions_actives`] = Number(d.prepare(`SELECT COUNT(*) n FROM ${p}_referentiel_versions WHERE actif=1`).get().n);
  }
  d.close();
  return c;
}

const seedActuel = readFileSync(join(here, 'officiel-seed.sql'), 'utf8');
let avant = null;
try {
  avant = compte(execSync('git show HEAD:server/officiel-seed.sql', { cwd: join(here, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  console.log('   ⚠ seed du dernier commit illisible (' + e.message.split('\n')[0] + ') — comparaison avant/après ignorée');
}
const apres = compte(seedActuel);

if (avant) {
  for (const k of Object.keys(avant)) eq(apres[k], avant[k], `${k} : inchangé (${avant[k]})`);
  // Garde-fou : la comparaison ne vaut que si le seed de référence contenait
  // vraiment quelque chose. (On ne contrôle QUE les tables de contenu : maternelle
  // et primaire n'ont, elles, aucune ligne de version dans le seed LAN — c'est
  // préexistant, et le test ci-dessus montre que cela reste inchangé.)
  ok(TABLES.every((t) => avant[t] > 0), `le seed de référence était peuplé sur les ${TABLES.length} tables comparées`);
}

console.log('\n── Chaque référentiel garde SA version active ──');
// Seuls SC, APC et le bilingue publient une ligne de version dans le seed LAN ;
// maternelle et primaire n'en ont aucune. C'est PRÉEXISTANT et inchangé par cet
// ajout — la comparaison avant/après ci-dessus le vérifie explicitement.
for (const t of ['sc', 'apc', 'bil']) {
  eq(Number(one(`SELECT COUNT(*) n FROM ${t}_referentiel_versions WHERE actif=1`).n), 1,
    `${t}_referentiel_versions : une seule version active`);
}

console.log('\n── Rejouabilité : le seed est rechargé à CHAQUE boot LAN ──');
db.exec(seedActuel);
eq(Number(one('SELECT COUNT(*) n FROM bil_serie_matieres').n), 141, 'seed rejoué : 141 lignes bilingue, aucun doublon');
eq(Number(one('SELECT COUNT(*) n FROM sc_serie_matieres').n), 495, 'seed rejoué : second cycle toujours à 495 lignes');
for (const t of ['sc', 'apc', 'bil']) {
  eq(Number(one(`SELECT COUNT(*) n FROM ${t}_referentiel_versions WHERE actif=1`).n), 1,
    `seed rejoué : ${t} garde une seule version active`);
}

db.close();
console.log(`\n${pass} assertions OK`);
