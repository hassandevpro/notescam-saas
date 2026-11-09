// BANC D'ESSAI de la migration du masque des critères, sur une base de DÉMONSTRATION (aucune donnée réelle).
//   node scripts/_migrerMasquesCriteres.test.mjs
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrer } from './lib/migrerMasquesCriteres.mjs';
import { masquesCriteresPour } from '../src/core/primCriteresMasques.js';

let ko = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) ko += 1; };
const dir = mkdtempSync(join(tmpdir(), 'masques-'));
const chemin = join(dir, 'demo.db');
const db = new DatabaseSync(chemin);
db.exec('PRAGMA foreign_keys = ON');

// Les DEUX tables neuves viennent du VRAI schema.sql (si quelqu'un les change, ce banc le voit).
const schema = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');
const ddl = (nom) => schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${nom} \\([\\s\\S]*?\\n\\);`))[0];
db.exec(`
  CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT);
  CREATE TABLE classes (id TEXT PRIMARY KEY, school_id TEXT, name TEXT, level TEXT);
  CREATE TABLE prim_competences (id TEXT PRIMARY KEY, school_id TEXT, code TEXT, actif INTEGER DEFAULT 1);
  CREATE TABLE prim_criteres (id TEXT PRIMARY KEY, nom TEXT);
  CREATE TABLE prim_criteres_masques (school_id TEXT, critere_id TEXT, masque_le TEXT, PRIMARY KEY (school_id, critere_id));
  ${ddl('prim_criteres_masques_classe')}
  ${ddl('prim_criteres_masques_init')}
`);
// Établissement de démonstration : CE2 A + CE2 B (compétences), CM1 A (matières), Form 1 (secondaire).
db.exec(`
  INSERT INTO schools VALUES ('ecoleA','Démo A'), ('ecoleB','Démo B');
  INSERT INTO classes VALUES ('ce2a','ecoleA','CE2 A','CE2'), ('ce2b','ecoleA','CE2 B','CE2'),
                             ('cm1a','ecoleA','CM1 A','CM1'), ('f1','ecoleA','Form 1','Form 1'),
                             ('ce2x','ecoleB','CE2 X','CE2');
  INSERT INTO prim_competences VALUES ('1a',NULL,'1A',1), ('1b',NULL,'1B',1), ('2a',NULL,'2A',1), ('old',NULL,'OLD',0),
                                      ('maison','ecoleA','M1',1), ('autre','ecoleB','Z',1);
  INSERT INTO prim_criteres VALUES ('oral','Oral'), ('ecrit','Écrit'), ('pratique','Pratique'), ('se','Savoir-être');
  INSERT INTO prim_criteres_masques VALUES ('ecoleA','oral',NULL), ('ecoleA','pratique',NULL);
`);
const compteurs = () => ({
  masquesClasse: db.prepare('SELECT COUNT(*) n FROM prim_criteres_masques_classe').get().n,
  init: db.prepare('SELECT COUNT(*) n FROM prim_criteres_masques_init').get().n,
  ecole: db.prepare('SELECT COUNT(*) n FROM prim_criteres_masques').get().n,
});

// ── 1. DRY-RUN : rien n'est écrit ───────────────────────────────────────────
const avant = compteurs();
const dry = migrer(db);
ok(dry.mode === 'dry-run', 'le mode par défaut est le dry-run');
ok(JSON.stringify(compteurs()) === JSON.stringify(avant), 'dry-run : AUCUNE écriture');
const A = dry.ecoles.find((e) => e.ecole === 'ecoleA');
// 3 classes du primaire (CE2 A, CE2 B, CM1 A) ; Form 1 exclue. Compétences visibles : 1a,1b,2a,maison = 4.
ok(A.classesPrimaires === 3 && A.classesAInitialiser === 3, `3 classes du primaire détectées, Form 1 écartée (${A.classesPrimaires})`);
ok(A.lignesAEcrire === 3 * 4 * 2, `lignes à écrire = 3 classes × 4 compétences × 2 critères masqués = ${A.lignesAEcrire}`);
const B = dry.ecoles.find((e) => e.ecole === 'ecoleB');
ok(B.criteresMasquesParEcole === 0 && B.lignesAEcrire === 0 && B.classesAInitialiser === 1, 'école sans masque : initialise sa classe, aucune ligne');
ok(dry.totalClasses === 4 && dry.totalLignes === 24, `totaux : ${dry.totalClasses} classes, ${dry.totalLignes} lignes`);

// ── 2. Sauvegarde obligatoire ───────────────────────────────────────────────
let refus = false;
try { migrer(db, { appliquer: true }); } catch { refus = true; }
ok(refus && JSON.stringify(compteurs()) === JSON.stringify(avant), 'sans sauvegarde, --appliquer est refusé et n’écrit rien');

// ── 3. Un enseignant a DÉJÀ affiné CE2 B avant la migration : on n'y touche pas ──
db.exec(`INSERT INTO prim_criteres_masques_init VALUES ('ecoleA','ce2b','x');
         INSERT INTO prim_criteres_masques_classe VALUES ('ecoleA','ce2b','1a','se','x');`);

// ── 4. APPLICATION ──────────────────────────────────────────────────────────
const copie = join(dir, 'sauvegarde.db');
const rap = migrer(db, { appliquer: true, sauvegarde: copie });
ok(existsSync(copie), 'la sauvegarde existe');
const bak = new DatabaseSync(copie, { readOnly: true });
ok(bak.prepare('SELECT COUNT(*) n FROM prim_criteres_masques_classe').get().n === 1, 'la sauvegarde reflète l’état D’AVANT (1 ligne)');
bak.close();
ok(rap.totalClasses === 3 && rap.totalLignes === 2 * 4 * 2, `appliqué : ${rap.totalClasses} classes, ${rap.totalLignes} lignes (CE2 B sautée)`);
ok(db.prepare("SELECT COUNT(*) n FROM prim_criteres_masques_classe WHERE class_id='ce2b'").get().n === 1, 'CE2 B (déjà affinée) est INTACTE');
ok(db.prepare('SELECT COUNT(*) n FROM prim_criteres_masques').get().n === 2, 'la liste de l’école n’est ni modifiée ni supprimée');

// ── 5. ÉQUIVALENCE : ce que chaque classe affichait avant == après ──────────
const parClasse = {};
for (const c of db.prepare('SELECT class_id FROM prim_criteres_masques_init').all()) parClasse[c.class_id] = { init: true, parCompetence: {} };
for (const r of db.prepare('SELECT * FROM prim_criteres_masques_classe').all()) (parClasse[r.class_id].parCompetence[r.competence_id] ||= []).push(r.critere_id);
const ecoleA = ['oral', 'pratique'];
let diff = 0;
for (const cl of ['ce2a', 'cm1a']) for (const comp of ['1a', '1b', '2a', 'maison']) {
  const a = [...masquesCriteresPour(ecoleA, {}, cl)(comp)].sort().join();
  const p = [...masquesCriteresPour(ecoleA, parClasse, cl)(comp)].sort().join();
  if (a !== p) diff += 1;
}
ok(diff === 0, 'ÉQUIVALENCE : toutes les classes migrées affichent EXACTEMENT les mêmes critères qu’avant');
ok(masquesCriteresPour(ecoleA, parClasse, 'ce2b')('1a').join() === 'se', 'CE2 B garde son propre affinage (pas la liste de l’école)');
ok(masquesCriteresPour(ecoleA, parClasse, 'f1')('1a').join() === 'oral,pratique', 'Form 1 (hors primaire) : inchangée, lit encore la liste de l’école');

// ── 6. IDEMPOTENCE ──────────────────────────────────────────────────────────
const apres = compteurs();
const rejoue = migrer(db, { appliquer: true, sauvegarde: join(dir, 's2.db') });
ok(rejoue.totalClasses === 0 && rejoue.totalLignes === 0, 'rejouée : rien à faire');
ok(JSON.stringify(compteurs()) === JSON.stringify(apres), 'rejouée : compteurs identiques');

// ── 7. RETOUR ARRIÈRE ───────────────────────────────────────────────────────
db.exec('DELETE FROM prim_criteres_masques_classe; DELETE FROM prim_criteres_masques_init;');
ok(masquesCriteresPour(ecoleA, {}, 'ce2a')('1a').join() === 'oral,pratique', 'retour arrière : vider les deux tables rend la lecture de la liste de l’école');

db.close(); rmSync(dir, { recursive: true, force: true });
console.log(ko ? `\n${ko} KO` : '\nTOUT PASSE');
process.exit(ko ? 1 : 0);
