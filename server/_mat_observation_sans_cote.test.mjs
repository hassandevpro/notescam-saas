// UNE OBSERVATION DE MATERNELLE PEUT-ELLE PRÉCÉDER SA COTE ?
//
// LE DÉFAUT QUE CE FICHIER VERROUILLE, remonté le 06/10/2026 par la file de
// synchro : « null value in column "niveau_acquis" … violates not-null
// constraint ». L'institutrice écrit son commentaire AVANT de coter ; la ligne
// partait sans cote et les deux bases la refusaient. En Cloud l'envoi échouait
// EN BOUCLE et EN SILENCE dans la file hors-ligne.
//
// Deux choses à prouver :
//   1. une base NEUVE accepte une observation sans cote ;
//   2. une base DÉJÀ INSTALLÉE, encore en NOT NULL, est reconstruite au
//      démarrage SANS perdre une seule ligne — c'est le point qui compte, SQLite
//      ne sachant pas retirer un NOT NULL par ALTER.
//
// Lancer : node server/_mat_observation_sans_cote.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

const dir = mkdtempSync(join(tmpdir(), 'nc-mat-cote-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };

// ── 1) Base neuve : la colonne est relâchée, le domaine reste gardé ──────────
const col = () => db.prepare('PRAGMA table_info("mat_observations")').all().find((r) => r.name === 'niveau_acquis');
ok(col().notnull === 0, 'base neuve : niveau_acquis est NULLABLE', col().notnull);

const S = 'ecole-mat';
must({ table: 'schools', action: 'insert', values: { id: S, name: 'École de test' } });
must({ table: 'classes', action: 'insert', values: { id: 'cls-gs', school_id: S, name: 'GS', level: 'GS' } });
must({ table: 'students', action: 'insert', values: { id: 'stu-1', school_id: S, class_id: 'cls-gs', name: 'Élève Un' } });
const dom = db.prepare('SELECT id FROM mat_domaines LIMIT 1').get();
const trim = db.prepare('SELECT id FROM apc_trimestres LIMIT 1').get();
ok(!!dom && !!trim, 'référentiel maternelle seedé (domaine + trimestre)');

// Le geste qui échouait : commenter sans coter.
must({ table: 'mat_observations', action: 'insert', values: {
  id: 'obs-1', school_id: S, eleve_id: 'stu-1', domaine_id: dom.id,
  trimestre_id: trim.id, niveau_acquis: null, observation: 'Progresse bien à l’oral.',
} });
const obs1 = must({ table: 'mat_observations', action: 'select', columns: '*',
  filters: [{ op: 'eq', col: 'id', val: 'obs-1' }] }).data[0];
ok(obs1.niveau_acquis === null, 'une observation SANS cote est acceptée', obs1.niveau_acquis);
ok(obs1.observation === 'Progresse bien à l’oral.', 'le commentaire est conservé');

// La cote arrive ensuite : la même ligne se complète.
must({ table: 'mat_observations', action: 'update', values: { niveau_acquis: 'A' },
  filters: [{ op: 'eq', col: 'id', val: 'obs-1' }] });
ok(must({ table: 'mat_observations', action: 'select', columns: '*',
  filters: [{ op: 'eq', col: 'id', val: 'obs-1' }] }).data[0].niveau_acquis === 'A',
  'la cote posée ensuite complète la ligne');

// Une cote inventée reste refusée : on a relâché le NOT NULL, pas le domaine.
const r = runQuery({ table: 'mat_observations', action: 'insert', values: {
  id: 'obs-faux', school_id: S, eleve_id: 'stu-1', domaine_id: dom.id,
  trimestre_id: trim.id, niveau_acquis: 'EXCELLENT',
} });
ok(!!r.error, 'une cote hors A/ECA/NA reste refusée', r.error ? 'refusé' : 'ACCEPTÉ');

// ── 2) Base ANTÉRIEURE : reconstruction sans perte ──────────────────────────
// On refabrique une table à l'ancienne (NOT NULL), on la remplit, puis on rejoue
// la migration de db.js telle quelle.
db.exec(`
  PRAGMA foreign_keys = OFF;
  DROP TABLE mat_observations;
  CREATE TABLE mat_observations (
    id            TEXT PRIMARY KEY,
    school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
    eleve_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    domaine_id    TEXT NOT NULL REFERENCES mat_domaines(id),
    trimestre_id  TEXT NOT NULL REFERENCES apc_trimestres(id),
    niveau_acquis TEXT NOT NULL,
    observation   TEXT,
    enseignant_id TEXT,
    date_saisie   TEXT,
    updated_at    TEXT,
    version       INTEGER NOT NULL DEFAULT 1,
    device_id     TEXT,
    CONSTRAINT mat_observations_uniq UNIQUE (eleve_id, domaine_id, trimestre_id)
  );
  PRAGMA foreign_keys = ON;
`);
db.prepare(`INSERT INTO mat_observations (id, school_id, eleve_id, domaine_id, trimestre_id, niveau_acquis, observation, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  .run('obs-ancien', S, 'stu-1', dom.id, trim.id, 'ECA', 'Observation héritée', 3);
ok(col().notnull === 1, 'base simulée « antérieure » : NOT NULL présent', col().notnull);

// Rejoue exactement la migration de server/db.js.
{
  const c = col();
  if (c && c.notnull === 1) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      BEGIN;
      CREATE TABLE mat_observations_nouveau (
        id            TEXT PRIMARY KEY,
        school_id     TEXT NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
        eleve_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        domaine_id    TEXT NOT NULL REFERENCES mat_domaines(id),
        trimestre_id  TEXT NOT NULL REFERENCES apc_trimestres(id),
        niveau_acquis TEXT CHECK (niveau_acquis IS NULL OR niveau_acquis IN ('A', 'ECA', 'NA')),
        observation   TEXT,
        enseignant_id TEXT,
        date_saisie   TEXT,
        updated_at    TEXT,
        version       INTEGER NOT NULL DEFAULT 1,
        device_id     TEXT,
        CONSTRAINT mat_observations_uniq UNIQUE (eleve_id, domaine_id, trimestre_id)
      );
      INSERT INTO mat_observations_nouveau
        (id, school_id, eleve_id, domaine_id, trimestre_id, niveau_acquis,
         observation, enseignant_id, date_saisie, updated_at, version, device_id)
        SELECT id, school_id, eleve_id, domaine_id, trimestre_id, niveau_acquis,
               observation, enseignant_id, date_saisie, updated_at, version, device_id
          FROM mat_observations;
      DROP TABLE mat_observations;
      ALTER TABLE mat_observations_nouveau RENAME TO mat_observations;
      CREATE INDEX IF NOT EXISTS idx_mat_obs_school  ON mat_observations(school_id);
      CREATE INDEX IF NOT EXISTS idx_mat_obs_student ON mat_observations(eleve_id);
      COMMIT;
    `);
    db.exec('PRAGMA foreign_keys = ON');
  }
}

ok(col().notnull === 0, 'après reconstruction : NULLABLE', col().notnull);
const herite = db.prepare('SELECT * FROM mat_observations WHERE id = ?').get('obs-ancien');
ok(!!herite, 'la ligne héritée a SURVÉCU à la reconstruction');
ok(herite.niveau_acquis === 'ECA' && herite.observation === 'Observation héritée',
   'sa cote et son commentaire sont intacts', herite);
ok(herite.version === 3, 'les colonnes de synchro sont préservées (version)', herite.version);
const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='mat_observations'").all()
  .map((r) => r.name);
ok(idx.includes('idx_mat_obs_school') && idx.includes('idx_mat_obs_student'),
   'les index sont recréés', idx);

// Et le geste qui échouait marche désormais sur la base reconstruite. Autre
// trimestre que la ligne héritée : l'unicité (élève, domaine, trimestre) tient
// toujours, et c'est tant mieux — on vérifie la cote, pas l'anti-doublon.
const trim2 = db.prepare('SELECT id FROM apc_trimestres WHERE id <> ? LIMIT 1').get(trim.id);
must({ table: 'mat_observations', action: 'insert', values: {
  id: 'obs-2', school_id: S, eleve_id: 'stu-1', domaine_id: dom.id,
  trimestre_id: trim2.id, observation: 'Commentaire avant notation',
} });
const obs2 = db.prepare('SELECT * FROM mat_observations WHERE id = ?').get('obs-2');
ok(obs2.niveau_acquis === null && obs2.observation === 'Commentaire avant notation',
   'base reconstruite : une observation sans cote passe', obs2);

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Observation sans cote : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
