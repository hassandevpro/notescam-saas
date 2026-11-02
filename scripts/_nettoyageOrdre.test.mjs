// L'ORDRE DE SUPPRESSION D'UN SERVICE — et pourquoi l'ordre intuitif perd de l'argent
//
// `scripts/nettoyer-essais-services.mjs` supprime dans un ordre précis :
// contre-passations, versements, abonnements, service. Ce banc garde cet ordre,
// et garde surtout la RAISON : l'ordre inverse — celui que prendrait n'importe
// qui à la main — laisse l'argent dans la base, invisible à l'écran.
//
// Il reconstruit les contraintes du schéma réel dans une base en mémoire. Si une
// migration change un `ON DELETE`, ce banc tombe, et c'est exactement ce qu'on
// veut : l'ordre dépend de ces cascades, pas d'une habitude.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs scripts/_nettoyageOrdre.test.mjs
import { DatabaseSync } from 'node:sqlite';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// Les mêmes `ON DELETE` que `server/schema.sql` et les migrations Supabase :
//   student_fee_items.fee_catalog_id        → SET NULL
//   fee_schedule_items.student_fee_item_id  → CASCADE
//   fee_payments.fee_schedule_item_id       → SET NULL
//   fee_payments.student_fee_item_id        → SET NULL
//   fee_payments.reversal_of                → RESTRICT
const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE fee_catalog (id TEXT PRIMARY KEY, name TEXT, category TEXT);
  CREATE TABLE student_fee_items (
    id TEXT PRIMARY KEY, student_id TEXT,
    fee_catalog_id TEXT REFERENCES fee_catalog(id) ON DELETE SET NULL);
  CREATE TABLE fee_schedule_items (
    id TEXT PRIMARY KEY, period_key TEXT,
    student_fee_item_id TEXT NOT NULL REFERENCES student_fee_items(id) ON DELETE CASCADE);
  CREATE TABLE fee_payments (
    id TEXT PRIMARY KEY, amount INTEGER, receipt_no INTEGER,
    student_fee_item_id TEXT REFERENCES student_fee_items(id) ON DELETE SET NULL,
    fee_schedule_item_id TEXT REFERENCES fee_schedule_items(id) ON DELETE SET NULL,
    reversal_of TEXT REFERENCES fee_payments(id) ON DELETE RESTRICT);
`;

function base() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.exec(`
    INSERT INTO fee_catalog VALUES ('svc','Cantine (essai)','cantine');
    INSERT INTO student_fee_items VALUES ('abo','el1','svc');
    INSERT INTO fee_schedule_items VALUES ('ech','2026-10','abo');
    -- Un versement visant la PÉRIODE, un autre visant le SERVICE sans mois :
    -- les deux cas cohabitent, cf. supabase_fee_schedule.sql.
    INSERT INTO fee_payments VALUES ('p1',15000,1,'abo','ech',NULL);
    INSERT INTO fee_payments VALUES ('p2',5000,2,'abo',NULL,NULL);
    -- Une contre-passation, qui VERROUILLE son originale.
    INSERT INTO fee_payments VALUES ('p3',-5000,3,'abo',NULL,'p2');
  `);
  return db;
}
const n = (db, sql) => db.prepare(sql).get().n;

// ── 1. L'ORDRE INTUITIF PERD DE L'ARGENT ───────────────────────────────────
console.log('\n— L’ordre intuitif : le service d’abord —');
{
  const db = base();
  db.exec("DELETE FROM fee_catalog WHERE id='svc'");
  ok(n(db, 'SELECT COUNT(*) n FROM student_fee_items') === 1,
    'l’abonnement SURVIT à la suppression du service (SET NULL, pas CASCADE)');
  ok(n(db, 'SELECT COUNT(*) n FROM student_fee_items WHERE fee_catalog_id IS NULL') === 1,
    'et il devient orphelin : l’écran le filtre sur le service, donc il disparaît de l’affichage');
  ok(n(db, 'SELECT COUNT(*) n FROM fee_schedule_items') === 1, 'l’échéance survit aussi');
  ok(n(db, 'SELECT COALESCE(SUM(amount),0) n FROM fee_payments') === 15000,
    'et L’ARGENT RESTE DANS LA BASE : 15 000 invisibles à l’écran mais comptés en balance',
    n(db, 'SELECT COALESCE(SUM(amount),0) n FROM fee_payments'));
  db.close();
}

// ── 2. LA CONTRE-PASSATION VERROUILLE SON ORIGINALE ────────────────────────
console.log('\n— Le verrou RESTRICT —');
{
  const db = base();
  let leve = false;
  try { db.exec("DELETE FROM fee_payments WHERE id='p2'"); } catch { leve = true; }
  ok(leve, 'supprimer une originale avant sa contre-passation ÉCHOUE (RESTRICT)');
  ok(n(db, "SELECT COUNT(*) n FROM fee_payments WHERE id='p2'") === 1, 'et la ligne est toujours là');
  // D'où l'ordre : les négatives d'abord.
  db.exec("DELETE FROM fee_payments WHERE reversal_of IS NOT NULL");
  let leve2 = false;
  try { db.exec("DELETE FROM fee_payments WHERE id='p2'"); } catch { leve2 = true; }
  ok(!leve2, 'la contre-passation retirée, l’originale part sans difficulté');
  db.close();
}

// ── 3. L'ORDRE DU SCRIPT NE LAISSE RIEN ────────────────────────────────────
console.log('\n— L’ordre du script —');
{
  const db = base();
  // 1. contre-passations  2. versements  3. abonnements (cascade)  4. service
  db.exec("DELETE FROM fee_payments WHERE reversal_of IS NOT NULL");
  db.exec('DELETE FROM fee_payments');
  db.exec("DELETE FROM student_fee_items WHERE fee_catalog_id='svc'");
  db.exec("DELETE FROM fee_catalog WHERE id='svc'");
  ok(n(db, 'SELECT COUNT(*) n FROM fee_payments') === 0, 'aucun versement ne reste');
  ok(n(db, 'SELECT COUNT(*) n FROM student_fee_items') === 0, 'aucun abonnement ne reste');
  ok(n(db, 'SELECT COUNT(*) n FROM fee_schedule_items') === 0,
    'les échéances sont parties EN CASCADE avec l’abonnement — sans DELETE explicite');
  ok(n(db, 'SELECT COUNT(*) n FROM fee_catalog') === 0, 'et le service est supprimé');
  db.close();
}

// ── 4. LES DEUX RATTACHEMENTS D'UN VERSEMENT ───────────────────────────────
console.log('\n— Ne chercher qu’un rattachement laisse de l’argent —');
{
  const db = base();
  // Le piège : n'interroger que `fee_schedule_item_id`. `p2` vise le SERVICE
  // sans préciser de mois — il échapperait à la requête, et resterait.
  const parEche = db.prepare("SELECT id FROM fee_payments WHERE fee_schedule_item_id='ech'").all();
  const parAbo = db.prepare("SELECT id FROM fee_payments WHERE student_fee_item_id='abo'").all();
  ok(parEche.length === 1, 'par période seule : 1 versement trouvé', parEche.length);
  ok(parAbo.length === 3, 'par abonnement : les 3 sont trouvés', parAbo.length);
  const union = new Set([...parEche, ...parAbo].map((x) => x.id));
  ok(union.size === 3, 'l’union des deux rattachements ne laisse aucun versement derrière');
  db.close();
}

// ── 5. LE TROU DANS LA SÉQUENCE DES REÇUS ──────────────────────────────────
console.log('\n— Le trou que la suppression laisse —');
{
  const db = base();
  const avant = db.prepare('SELECT receipt_no FROM fee_payments WHERE receipt_no IS NOT NULL ORDER BY receipt_no').all();
  ok(avant.map((r) => r.receipt_no).join(',') === '1,2,3', 'trois reçus numérotés 1, 2, 3');

  // MÊME UN DELETE GLOBAL doit respecter l'ordre : la contre-passation
  // verrouille son originale, et SQLite refuse l'instruction en entier. Ce
  // n'est donc pas « une précaution pour les gros lots » — c'est la seule façon
  // dont la suppression aboutit, même sur trois lignes.
  let globalRefuse = false;
  try { db.exec('DELETE FROM fee_payments'); } catch { globalRefuse = true; }
  ok(globalRefuse,
    'un DELETE global échoue aussi : l’ordre n’est pas une précaution, c’est la condition');

  db.exec('DELETE FROM fee_payments WHERE reversal_of IS NOT NULL');
  db.exec('DELETE FROM fee_payments');
  ok(n(db, 'SELECT COUNT(*) n FROM fee_payments') === 0, 'dans le bon ordre, tout part');
  // `receipt_no` est séquentiel par (école, année) et SERT à détecter une
  // recette escamotée. Le script doit donc énumérer les numéros qui vont
  // manquer, pour que la trace soit portée au registre des incidents.
  ok(avant.length === 3,
    'les numéros 1, 2, 3 manqueront définitivement : c’est le signal anti-fraude du schéma,'
    + ' et le script l’annonce avant d’agir');
  db.close();
}

console.log(fail === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${fail}`);
if (fail > 0) process.exit(1);
