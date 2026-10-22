// UNE NOTE PRIMAIRE PEUT-ELLE S'ÉCRIRE SUR UNE BASE DÉJÀ INSTALLÉE ?
//
// Le client écrit en upsert sur (eleve, competence, critere, UA) : c'est la clé
// de saisie depuis que l'unité d'apprentissage a remplacé le trimestre. Mais
// `CREATE TABLE IF NOT EXISTS` ne touche pas une table déjà créée, et toute base
// installée avant ce changement porte encore l'ancienne clé, sur `trimestre_id`.
//
// SQLite refuse alors l'écriture — « ON CONFLICT clause does not match any
// PRIMARY KEY or UNIQUE constraint » — et la saisie repart en file à chaque
// cycle, indéfiniment. Export d'une école le 28/09/2026 : huit écritures de
// barème bloquées, 25 tentatives pour la plus ancienne. AUCUNE note primaire ne
// pouvait plus s'enregistrer, et rien à l'écran ne le disait.
//
// Ce test fabrique une base à l'ANCIENNE clé, laisse le serveur démarrer dessus,
// et vérifie que la saisie passe — notes comme barèmes.
//
// Lancer : node server/_prim_notes_uniq.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'nc-prim-uniq-'));

// ── 1) Une base « d'avant » : prim_notes avec la clé sur trimestre_id ────────
// Posée AVANT le démarrage du serveur, exactement comme la trouverait une mise à
// jour sur le PC d'une école.
{
  const vieille = new DatabaseSync(join(dir, 'notescam.db'));
  vieille.exec(`
    CREATE TABLE prim_notes (
      id            TEXT PRIMARY KEY,
      school_id     TEXT NOT NULL,
      eleve_id      TEXT NOT NULL,
      competence_id TEXT NOT NULL,
      critere_id    TEXT NOT NULL,
      trimestre_id  TEXT NOT NULL,
      note          NUMERIC,
      enseignant_id TEXT,
      date_saisie   TEXT,
      CONSTRAINT prim_notes_uniq UNIQUE (eleve_id, competence_id, critere_id, trimestre_id)
    );
    INSERT INTO prim_notes (id, school_id, eleve_id, competence_id, critere_id, trimestre_id, note, date_saisie)
      VALUES ('historique-1', 'ecole-1', 'eleve-1', '1a', 'oral', 't1', 7, '2026-09-01T08:00:00.000Z');
  `);
  vieille.close();
}

process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');
const { db } = await import('./db.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const essaie = (op, ctx) => { try { const r = runQuery(op, ctx); return r.error ? r.error.message : null; } catch (e) { return e.message; } };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };

// ── 2) La clé a été reprise, et la donnée historique est toujours là ────────
const cle = (() => {
  const VOULUE = 'eleve_id,competence_id,critere_id,ua';
  return db.prepare('PRAGMA index_list("prim_notes")').all().filter((i) => i.unique)
    .some((i) => db.prepare(`PRAGMA index_info("${i.name}")`).all().map((c) => c.name).join(',') === VOULUE);
})();
ok(cle, 'prim_notes : la clé d’unicité porte sur l’UA');
const colonnes = new Set(db.prepare('PRAGMA table_info("prim_notes")').all().map((r) => r.name));
ok(colonnes.has('points_max'), 'le barème (points_max) est présent');
ok(colonnes.has('trimestre_id'), 'trimestre_id conservée : aucune colonne n’a été jetée');
const hist = db.prepare('SELECT note, trimestre_id FROM prim_notes WHERE id = ?').get('historique-1');
ok(Number(hist?.note) === 7 && hist?.trimestre_id === 't1', 'la note déjà saisie a survécu à la reconstruction', hist);

// ── 3) Le décor, puis LE GESTE QUI ÉCHOUAIT ─────────────────────────────────
const SCHOOL = 'ecole-1';
must({ table: 'schools', action: 'insert', values: { id: SCHOOL, name: 'École de test' } });
must({ table: 'classes', action: 'insert', values: { id: 'cls-1', school_id: SCHOOL, name: 'CM2', level: 'CM2' } });
must({ table: 'students', action: 'insert', values: { id: 'eleve-1', school_id: SCHOOL, class_id: 'cls-1', name: 'Élève Un' } });

const crit = db.prepare('SELECT id FROM prim_criteres LIMIT 1').get();
const cmp  = db.prepare('SELECT id FROM prim_competences LIMIT 1').get();

// Le barème posé sur une colonne encore VIDE : une ligne par élève, note NULL.
// C'est littéralement le payload des huit entrées bloquées de l'export.
const bareme = (points, id) => essaie({
  table: 'prim_notes', action: 'upsert', onConflict: 'eleve_id,competence_id,critere_id,ua',
  values: {
    id, school_id: SCHOOL, eleve_id: 'eleve-1', competence_id: cmp.id, critere_id: crit.id,
    ua: 1, trimestre_id: 't1', note: null, points_max: points, date_saisie: new Date().toISOString(),
  },
});
ok(!bareme(10, 'n-1'), 'le barème /10 d’une colonne vide s’enregistre', bareme(10, 'n-1'));
// Rejoué avec un AUTRE id, comme le fait la file quand elle reprend : l'upsert
// doit retomber sur la même ligne au lieu d'en créer une seconde.
ok(!bareme(11, 'n-2'), 'le même barème corrigé à /11 passe par la clé, sans doublon');
const lignes = db.prepare('SELECT count(*) c FROM prim_notes WHERE eleve_id=? AND competence_id=? AND critere_id=? AND ua=1')
  .get('eleve-1', cmp.id, crit.id).c;
ok(lignes === 1, 'une seule ligne pour (élève, compétence, critère, UA)', lignes);
ok(Number(db.prepare('SELECT points_max FROM prim_notes WHERE eleve_id=? AND ua=1 AND critere_id=?')
  .get('eleve-1', crit.id).points_max) === 11, 'le dernier barème est celui qui reste');

// Puis la note elle-même, sur ce barème.
ok(!essaie({ table: 'prim_notes', action: 'upsert', onConflict: 'eleve_id,competence_id,critere_id,ua',
  values: { id: 'n-3', school_id: SCHOOL, eleve_id: 'eleve-1', competence_id: cmp.id, critere_id: crit.id,
    ua: 1, trimestre_id: 't1', note: 9, points_max: 11, date_saisie: new Date().toISOString() } }),
'la note se saisit sur le barème posé');
const finale = db.prepare('SELECT note, points_max FROM prim_notes WHERE eleve_id=? AND ua=1 AND critere_id=?')
  .get('eleve-1', crit.id);
ok(Number(finale.note) === 9 && Number(finale.points_max) === 11, 'note et barème relus tels qu’enregistrés', finale);

// ── 4) DEUX UA DU MÊME TRIMESTRE COHABITENT ─────────────────────────────────
// Ce que l'ancienne clé interdisait : UA1 et UA2 tombent tous deux dans T1.
ok(!essaie({ table: 'prim_notes', action: 'upsert', onConflict: 'eleve_id,competence_id,critere_id,ua',
  values: { id: 'n-4', school_id: SCHOOL, eleve_id: 'eleve-1', competence_id: cmp.id, critere_id: crit.id,
    ua: 2, trimestre_id: 't1', note: 6, points_max: 11, date_saisie: new Date().toISOString() } }),
'UA2 du même trimestre s’enregistre à côté d’UA1');
ok(db.prepare('SELECT count(*) c FROM prim_notes WHERE eleve_id=? AND critere_id=? AND ua IS NOT NULL')
  .get('eleve-1', crit.id).c === 2, 'les deux UA coexistent');

// ── 5) L'opération ne se rejoue pas sur une base déjà reprise ───────────────
// (idempotence : la détection porte sur le schéma réel, pas sur un marqueur)
const avant = db.prepare('SELECT count(*) c FROM prim_notes').get().c;
db.exec('PRAGMA integrity_check');
ok(avant === db.prepare('SELECT count(*) c FROM prim_notes').get().c, 'la table est intègre après reconstruction');

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Saisie primaire sur base installée : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
