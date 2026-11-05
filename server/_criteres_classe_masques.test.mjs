// MASQUER UN CRITÈRE POUR UNE SEULE CLASSE **ET UNE SEULE COMPÉTENCE** — chemin du serveur d'école
//
// Deux demandes de l'école le 2026-11-05 : « quand j'enlève les critères, ça ne doit pas le faire pour
// toutes les classes », puis « lorsqu'on masque un critère à une compétence, ça masque pour toute la
// classe ». La portée juste est (classe, COMPÉTENCE, critère). La table a le même statut que les masques
// de l'école : un réglage d'AFFICHAGE propre à l'édition, HORS synchronisation. Ce test garde :
//   • la table existe sur le serveur d'école, avec la compétence DANS SA CLÉ, et est autorisée ;
//   • elle n'est PAS synchronisée (aucune entrée d'outbox) ;
//   • le chemin exact de l'écran (upsert à clé composite, lecture, suppression) fonctionne, et est idempotent ;
//   • deux classes ne se masquent pas l'une l'autre, et deux COMPÉTENCES non plus ;
//   • le masque d'école existant (`prim_criteres_masques`) n'est pas touché ;
//   • AUCUNE note n'est supprimée par le masquage ;
//   • supprimer une classe emporte ses masques (clé étrangère).
//
// Lancer : node server/_criteres_classe_masques.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'nc-critmasq-'));
process.env.NOTESCAM_DATA_DIR = DIR;
process.env.NOTESCAM_DISABLE_SYNC = '1';

const { db, ALLOWED_TABLES, SYNCED_TABLES } = await import('./db.js');
const { runQuery } = await import('./query.js');

let ko = 0;
const ok = (c, msg, extra) => { console.log(`${c ? '✅' : '❌'} ${msg}${c || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`); if (!c) ko++; };

const T = 'prim_criteres_classe_masques';
const SCHOOL = 'ecole-1';
const C1 = 'classe-ce1';
const C2 = 'classe-cm2';
const CRIT = 'pratique';
const COMP1 = '1a';   // la compétence depuis laquelle on retire le critère
const COMP2 = '5a';   // celle qui ne doit RIEN perdre

try {
  ok(!!db.prepare("SELECT 1 x FROM sqlite_master WHERE type='table' AND name=?").get(T), 'la table existe sur le serveur d\'école');
  ok(!!db.prepare(`SELECT 1 x FROM pragma_table_info('${T}') WHERE name='competence_id'`).get(),
    'la compétence est une COLONNE de la table (sans elle, le masque vaut pour les onze)');
  ok(ALLOWED_TABLES.has(T), 'elle est autorisée aux requêtes de l\'application (sinon « Table non autorisée »)');
  ok(!SYNCED_TABLES.has(T), 'elle n\'est PAS synchronisée : réglage d\'affichage local');
  ok(ALLOWED_TABLES.has('prim_criteres_masques') && !SYNCED_TABLES.has('prim_criteres_masques'),
    'le masque d\'école existant garde son statut (autorisé, hors synchro)');

  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT OR IGNORE INTO schools (id, name) VALUES (?, 'Ecole test')").run(SCHOOL);
  for (const id of [C1, C2]) db.prepare('INSERT OR IGNORE INTO classes (id, school_id, name) VALUES (?, ?, ?)').run(id, SCHOOL, id);
  db.prepare("INSERT OR IGNORE INTO prim_criteres (id, nom, ordre) VALUES (?, 'Pratique', 3)").run(CRIT);
  for (const [id, nom] of [[COMP1, 'Communiquer en francais'], [COMP2, 'Utiliser les TIC']]) {
    db.prepare('INSERT OR IGNORE INTO prim_competences (id, code, intitule, ordre) VALUES (?, ?, ?, 1)')
      .run(id, id.toUpperCase(), nom);
  }
  // La colonne porte une note : masquer ne doit en effacer AUCUNE.
  db.prepare("INSERT OR IGNORE INTO students (id, school_id, class_id, name) VALUES ('el-1', ?, ?, 'ESSOMBA Ruth')").run(SCHOOL, C1);
  db.prepare(`INSERT OR IGNORE INTO prim_notes (id, school_id, eleve_id, competence_id, critere_id, ua, note, date_saisie)
    VALUES ('n-1', ?, 'el-1', ?, ?, 1, 8, '2026-11-05T08:00:00Z')`).run(SCHOOL, COMP1, CRIT);
  const notesAvant = db.prepare('SELECT COUNT(*) n FROM prim_notes').get().n;
  ok(notesAvant === 1, 'une note posée sur la colonne qu\'on va masquer', notesAvant);

  const avant = db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;

  const masquer = (classId, competenceId) => runQuery({
    table: T, action: 'upsert',
    values: { school_id: SCHOOL, class_id: classId, competence_id: competenceId, critere_id: CRIT },
    onConflict: 'school_id,class_id,competence_id,critere_id',
  });
  const lire = () => runQuery({ table: T, action: 'select', columns: 'class_id, competence_id, critere_id',
    filters: [{ col: 'school_id', op: 'eq', val: SCHOOL }], returning: true });

  let r = masquer(C1, COMP1);
  ok(!r.error, 'retirer « Pratique » du CE1 en 1A : accepté', r.error);
  r = masquer(C1, COMP1);
  ok(!r.error, 'le retirer deux fois : idempotent', r.error);
  ok(db.prepare(`SELECT COUNT(*) n FROM ${T}`).get().n === 1, 'une seule ligne en base après deux gestes');

  // ── LE CŒUR 1 : une autre COMPÉTENCE de la MÊME classe ne perd rien
  const en5a = (lire().data || []).filter((l) => l.competence_id === COMP2);
  ok(en5a.length === 0, 'la 5A de la même classe garde « Pratique »', en5a);

  // ── LE CŒUR 2 : deux classes de la même école ne se masquent pas l'une l'autre
  const lignes = lire().data || [];
  ok(lignes.length === 1 && lignes[0].class_id === C1 && lignes[0].competence_id === COMP1,
    'seul le CE1 en 1A est masqué : la CM2 garde « Pratique »', lignes);
  ok(db.prepare('SELECT COUNT(*) n FROM prim_criteres_masques WHERE school_id = ?').get(SCHOOL).n === 0,
    'AUCUN masque d\'école n\'a été écrit (avant, ce geste masquait pour toutes les classes)');

  masquer(C2, COMP1);
  ok((lire().data || []).length === 2, 'la CM2 se masque indépendamment (2 lignes)');
  masquer(C1, COMP2);
  ok((lire().data || []).length === 3, 'et la 5A du CE1 se masque séparément de sa 1A (3 lignes)');
  ok(db.prepare('SELECT COUNT(*) n FROM prim_notes').get().n === notesAvant,
    'AUCUNE note supprimée par trois masquages : masquer n\'efface rien');

  r = runQuery({ table: T, action: 'delete',
    filters: [{ col: 'school_id', op: 'eq', val: SCHOOL }, { col: 'class_id', op: 'eq', val: C1 },
      { col: 'competence_id', op: 'eq', val: COMP1 }, { col: 'critere_id', op: 'eq', val: CRIT }] });
  ok(!r.error, 'réafficher pour le CE1 en 1A : accepté', r.error);
  const reste = lire().data || [];
  ok(reste.length === 2 && !reste.some((l) => l.class_id === C1 && l.competence_id === COMP1),
    'seule la ligne (CE1, 1A) est supprimée : celle du CE1 en 5A et celle de la CM2 restent', reste);
  const notesApres = db.prepare("SELECT note FROM prim_notes WHERE id = 'n-1'").get();
  ok(notesApres && Number(notesApres.note) === 8, 'et la note de la colonne réaffichée est toujours là, intacte', notesApres);

  ok(db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n === avant, 'aucune entrée de synchro déclenchée');

  // ── Supprimer une classe emporte ses masques
  db.prepare('DELETE FROM classes WHERE id = ?').run(C2);
  ok(db.prepare(`SELECT COUNT(*) n FROM ${T} WHERE class_id = ?`).get(C2).n === 0, 'supprimer la classe emporte ses masques (clé étrangère)');
} catch (e) {
  console.log(`❌ exception : ${e.message}`);
  ko++;
} finally {
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* Windows garde la base ouverte */ }
}

console.log(ko === 0 ? '\n✅ TOUT PASSE' : `\n❌ ${ko} échec(s)`);
process.exit(ko === 0 ? 0 : 1);
