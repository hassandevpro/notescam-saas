// MASQUER UNE COMPÉTENCE NATIONALE POUR UNE SEULE CLASSE — le chemin du serveur d'école
//
// Demande de l'école (2026-11-04) : « pas toute l'école, juste la classe en cours ». Le masquage par classe
// est une table à part (`prim_competences_classe_masquees`), du même statut que les masques de l'école :
// un réglage d'AFFICHAGE propre à l'édition, HORS synchronisation. Ce test garde :
//   • la table existe sur le serveur d'école et est autorisée aux requêtes de l'application ;
//   • elle n'est PAS synchronisée (aucune entrée d'outbox, aucune liste de synchro à modifier) ;
//   • le chemin exact de l'écran (upsert à clé composite, lecture, suppression) fonctionne, et est idempotent ;
//   • deux classes de la même école ne se masquent PAS l'une l'autre ;
//   • supprimer une classe emporte ses masques (clé étrangère).
//
// Lancer : node server/_masques_classe.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'nc-masq-'));
process.env.NOTESCAM_DATA_DIR = DIR;
process.env.NOTESCAM_DISABLE_SYNC = '1';

const { db, ALLOWED_TABLES, SYNCED_TABLES } = await import('./db.js');
const { runQuery } = await import('./query.js');

let ko = 0;
const ok = (c, msg, extra) => { console.log(`${c ? '✅' : '❌'} ${msg}${c || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`); if (!c) ko++; };

const T = 'prim_competences_classe_masquees';
const SCHOOL = 'ecole-1';
const C1 = 'classe-1';
const C2 = 'classe-2';
const COMP = '3b';

try {
  // ── La table et son statut
  ok(!!db.prepare("SELECT 1 x FROM sqlite_master WHERE type='table' AND name=?").get(T), 'la table existe sur le serveur d\'école');
  ok(ALLOWED_TABLES.has(T), 'elle est autorisée aux requêtes de l\'application (sinon « Table non autorisée »)');
  ok(!SYNCED_TABLES.has(T), 'elle n\'est PAS synchronisée : réglage d\'affichage local, comme les masques de l\'école');
  ok(ALLOWED_TABLES.has('prim_competences_masques') && !SYNCED_TABLES.has('prim_competences_masques'),
    'même statut que les masques de l\'école (autorisée, hors synchro)');

  // ── Fixtures minimales (clés étrangères)
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT OR IGNORE INTO schools (id, name) VALUES (?, 'Ecole test')").run(SCHOOL);
  for (const id of [C1, C2]) db.prepare("INSERT OR IGNORE INTO classes (id, school_id, name) VALUES (?, ?, ?)").run(id, SCHOOL, id);
  db.prepare("INSERT OR IGNORE INTO prim_competences (id, code, intitule, ordre) VALUES (?, '3B', 'Pratiquer les valeurs citoyennes', 70)").run(COMP);

  const avant = db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n;

  // ── Le chemin exact de l'écran : upsert à clé composite
  const masquer = (classId) => runQuery({
    table: T, action: 'upsert',
    values: { school_id: SCHOOL, class_id: classId, competence_id: COMP },
    onConflict: 'school_id,class_id,competence_id',
  });
  const lire = () => runQuery({ table: T, action: 'select', columns: 'class_id, competence_id',
    filters: [{ col: 'school_id', op: 'eq', val: SCHOOL }], returning: true });

  let r = masquer(C1);
  ok(!r.error, 'masquer 3B pour la classe 1 : accepté', r.error);
  r = masquer(C1);
  ok(!r.error, 'masquer deux fois : idempotent (aucune erreur de clé)', r.error);
  ok(db.prepare(`SELECT COUNT(*) n FROM ${T}`).get().n === 1, 'une seule ligne en base après deux masquages');

  // ── Deux classes de la même école ne se masquent pas l'une l'autre
  const lu = lire();
  const lignes = lu.data || [];
  ok(lignes.length === 1 && lignes[0].class_id === C1 && lignes[0].competence_id === COMP,
    'seule la classe 1 est masquée : la classe 2 garde sa compétence', lignes);
  masquer(C2);
  ok((lire().data || []).length === 2, 'la classe 2 se masque indépendamment (2 lignes)');

  // ── Réafficher : supprime UNE ligne, celle de la classe visée
  r = runQuery({ table: T, action: 'delete',
    filters: [{ col: 'school_id', op: 'eq', val: SCHOOL }, { col: 'class_id', op: 'eq', val: C1 }, { col: 'competence_id', op: 'eq', val: COMP }] });
  ok(!r.error, 'réafficher pour la classe 1 : accepté', r.error);
  const reste = lire().data || [];
  ok(reste.length === 1 && reste[0].class_id === C2, 'seule la ligne de la classe 1 est supprimée', reste);

  // ── Aucune synchronisation déclenchée
  ok(db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n === avant,
    'aucune entrée d\'outbox : rien à pousser, aucune liste de synchro touchée', db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n - avant);

  // ── La suppression d'une classe emporte ses masques
  db.prepare('DELETE FROM classes WHERE id = ?').run(C2);
  ok(db.prepare(`SELECT COUNT(*) n FROM ${T}`).get().n === 0, 'supprimer la classe emporte ses masques (clé étrangère)');
} finally {
  try { db.close(); } catch { /* */ }
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* */ }
}

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ Tous les contrôles passent');
process.exit(ko ? 1 : 0);
