// RÉGLER UN BARÈME N'EFFACE PLUS LA NOTE D'UNE COLLÈGUE — sur le VRAI serveur d'école.
//
// LE DÉFAUT, relevé le 2026-11-05 (notes du primaire disparues, Class 1 → CM1) :
// l'écran de saisie écrivait UNE LIGNE PAR ÉLÈVE pour persister le barème d'une colonne,
// avec `note: r?.note ?? null` — la note que l'ÉTAT EN MÉMOIRE croyait connaître. Pour
// tout élève absent de cet état (lecture serveur incomplète, onglet ouvert avant l'arrivée
// des notes, saisie faite entre-temps sur un autre poste), il écrivait donc `null`
// PAR-DESSUS une note bien réelle.
//
// LE CORRECTIF : une écriture qui ne parle pas de la note n'envoie PAS la colonne `note`.
// L'upsert ne met alors à jour que les colonnes fournies — l'insertion laisse `note` à
// NULL, et la mise à jour n'y TOUCHE PAS. Ce banc le prouve sur le chemin réel
// (`runQuery`), parce que c'est une propriété du SQL généré, pas du composant React.
//
// Lancer : node server/_prim_bareme_ecriture.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'nc-bareme-'));
process.env.NOTESCAM_DATA_DIR = DIR;
process.env.NOTESCAM_DISABLE_SYNC = '1';

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');

let ko = 0;
const ok = (c, msg, extra) => { console.log(`${c ? '✅' : '❌'} ${msg}${c || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`); if (!c) ko++; };

const SCHOOL = 'ecole-1';
const CLASSE = 'classe-ce1';
const COMP = '1a';
const CRIT = 'oral';
const UA = 1;
const CONFLIT = 'eleve_id,competence_id,critere_id,ua';

try {
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT OR IGNORE INTO schools (id, name) VALUES (?, 'Ecole test')").run(SCHOOL);
  db.prepare('INSERT OR IGNORE INTO classes (id, school_id, name) VALUES (?, ?, ?)').run(CLASSE, SCHOOL, 'CE1');
  db.prepare("INSERT OR IGNORE INTO prim_criteres (id, nom, ordre) VALUES (?, 'Oral', 1)").run(CRIT);
  db.prepare("INSERT OR IGNORE INTO prim_competences (id, code, intitule, ordre) VALUES (?, '1A', 'Communiquer', 1)").run(COMP);
  for (const [id, nom] of [['el-1', 'ESSOMBA Ruth'], ['el-2', 'MANGA Steve'], ['el-3', 'NGO BELL Ange']]) {
    db.prepare('INSERT OR IGNORE INTO students (id, school_id, class_id, name) VALUES (?, ?, ?, ?)').run(id, SCHOOL, CLASSE, nom);
  }

  // ── L'ÉTAT DE DÉPART : trois notes posées par une collègue, sur un autre poste.
  const now = '2026-11-05T08:00:00Z';
  const ins = db.prepare(`INSERT INTO prim_notes (id, school_id, eleve_id, competence_id, critere_id, ua, note, points_max, date_saisie, updated_at, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  ins.run('n-1', SCHOOL, 'el-1', COMP, CRIT, UA, 7, 10, now, now);
  ins.run('n-2', SCHOOL, 'el-2', COMP, CRIT, UA, 9, 10, now, now);
  ins.run('n-3', SCHOOL, 'el-3', COMP, CRIT, UA, 8, 10, now, now);
  const notes = () => db.prepare('SELECT eleve_id, note, points_max FROM prim_notes ORDER BY eleve_id').all();
  ok(notes().every((r) => r.note !== null), 'au départ : trois notes en base', notes());

  // ── LE GESTE D'AVANT : l'écran n'avait lu que l'élève 1, et écrivait la colonne
  //    entière avec ce qu'il croyait savoir. On rejoue exactement cela.
  const ancienGeste = (eleveId, note) => runQuery({
    table: 'prim_notes', action: 'upsert', onConflict: CONFLIT,
    values: {
      id: `x-${eleveId}`, school_id: SCHOOL, eleve_id: eleveId, competence_id: COMP,
      critere_id: CRIT, ua: UA, note, points_max: 20,
      date_saisie: now, updated_at: '2026-11-05T09:00:00Z', version: 1,
    },
  });
  ancienGeste('el-1', 7);      // connu de l'état
  ancienGeste('el-2', null);   // INCONNU → l'ancien code envoyait null
  const apresAncien = notes();
  ok(apresAncien.find((r) => r.eleve_id === 'el-2')?.note === null,
    'LE DÉFAUT EST BIEN LÀ : l’ancien geste a effacé la note de el-2', apresAncien);

  // On remet la note détruite, pour mesurer le nouveau geste sur le même état.
  db.prepare('UPDATE prim_notes SET note = 9 WHERE eleve_id = ?').run('el-2');

  // ── LE GESTE CORRIGÉ : la colonne `note` n'est PAS envoyée.
  const nouveauGeste = (eleveId) => runQuery({
    table: 'prim_notes', action: 'upsert', onConflict: CONFLIT,
    values: {
      id: `y-${eleveId}`, school_id: SCHOOL, eleve_id: eleveId, competence_id: COMP,
      critere_id: CRIT, ua: UA, points_max: 20,
      date_saisie: now, updated_at: '2026-11-05T10:00:00Z', version: 1,
    },
  });
  for (const id of ['el-1', 'el-2', 'el-3']) {
    const r = nouveauGeste(id);
    if (r?.error) ok(false, `écriture du barème pour ${id}`, r.error);
  }
  const apres = notes();
  ok(apres.length === 3, 'toujours trois lignes, pas une de plus', apres.length);
  ok(apres.every((r) => r.note !== null), 'AUCUNE NOTE EFFACÉE — le défaut est corrigé', apres);
  ok(apres.find((r) => r.eleve_id === 'el-1')?.note === 7
    && apres.find((r) => r.eleve_id === 'el-2')?.note === 9
    && apres.find((r) => r.eleve_id === 'el-3')?.note === 8,
    'et chacune a gardé SA valeur, y compris celles que l’écran n’avait jamais lues');
  ok(apres.every((r) => r.points_max === 20), 'le barème, lui, a bien été posé sur toute la colonne', apres);

  // ── UNE COLONNE ENCORE VIDE : le barème doit quand même s'écrire.
  db.prepare('DELETE FROM prim_notes').run();
  const r = nouveauGeste('el-1');
  ok(!r?.error, 'sur une colonne vide, l’écriture passe', r?.error);
  const neuve = db.prepare("SELECT note, points_max FROM prim_notes WHERE eleve_id = 'el-1'").get();
  ok(neuve && neuve.note === null && neuve.points_max === 20,
    'elle crée une ligne « barème sans note » : le choix survit à la fermeture de l’écran', neuve);

  // ── ET LA SAISIE ORDINAIRE, elle, écrit bien la note.
  const saisie = runQuery({
    table: 'prim_notes', action: 'upsert', onConflict: CONFLIT,
    values: {
      id: 'z-1', school_id: SCHOOL, eleve_id: 'el-1', competence_id: COMP, critere_id: CRIT,
      ua: UA, note: 15, points_max: 20,
      date_saisie: now, updated_at: '2026-11-05T11:00:00Z', version: 1,
    },
  });
  ok(!saisie?.error, 'la saisie d’une note passe', saisie?.error);
  ok(db.prepare("SELECT note FROM prim_notes WHERE eleve_id = 'el-1'").get()?.note === 15,
    'et la note est bien écrite (le correctif ne rend pas la colonne ineffaçable)');

  // ── EFFACER UNE NOTE RESTE POSSIBLE, mais seulement en le DISANT.
  const effacee = runQuery({
    table: 'prim_notes', action: 'upsert', onConflict: CONFLIT,
    values: {
      id: 'z-1', school_id: SCHOOL, eleve_id: 'el-1', competence_id: COMP, critere_id: CRIT,
      ua: UA, note: null, points_max: 20,
      date_saisie: now, updated_at: '2026-11-05T12:00:00Z', version: 1,
    },
  });
  ok(!effacee?.error, 'vider une case passe', effacee?.error);
  ok(db.prepare("SELECT note FROM prim_notes WHERE eleve_id = 'el-1'").get()?.note === null,
    'un `note: null` EXPLICITE efface — c’est le geste de l’enseignante, et lui seul');
} catch (e) {
  console.log(`❌ exception : ${e.message}`);
  ko++;
} finally {
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* Windows garde la base ouverte */ }
}

console.log(ko === 0 ? '\n✅ TOUT PASSE' : `\n❌ ${ko} échec(s)`);
process.exit(ko === 0 ? 0 : 1);
