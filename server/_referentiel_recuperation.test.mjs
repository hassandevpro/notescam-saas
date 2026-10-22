// L'ÉCOLE RETROUVE-T-ELLE LES COMPÉTENCES QU'ELLE AVAIT DÉJÀ AJOUTÉES ?
//
// CE QUE CE TEST PROUVE, et pourquoi il existe.
//
// Avant la 0.3.15, « Ajouter une compétence » RÉUSSISSAIT en apparence : le
// serveur répondait `{"data":null,"error":null}`. Mais la colonne `school_id`
// n'existait pas en LAN, et `pickColumns` l'écartait en silence — la ligne
// naissait NATIONALE. Vérifié en rejouant le geste sur le serveur 0.3.4
// réellement installé : la ligne enregistrée ne portait aucune école.
//
// Conséquence, et c'est elle qui rend cette reprise obligatoire : depuis que
// `guardReferentielNational` protège le référentiel du ministère, ces lignes-là
// deviendraient DÉFINITIVEMENT intouchables pour l'école qui les a créées. Le
// correctif aurait aggravé le défaut qu'il corrige.
//
// Ces lignes se reconnaissent à leur id, posé par `idMaison` :
// `ec_<12 premiers caractères de l'id d'école>_<libellé>`. Aucune ligne
// nationale ne porte ce préfixe.
//
// Lancer : node server/_referentiel_recuperation.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'nc-recup-'));
const ECOLE = '31c70a36-065e-4933-a40c-1e9c051d1afc';   // forme réelle d'un id d'école
const AUTRE = '7d2f1b90-1111-2222-3333-444455556666';
// `idMaison` : ec_ + 12 premiers caractères de l'id sans tirets + slug.
const idMaison = (school, slug) => `ec_${school.replace(/-/g, '').slice(0, 12)}_${slug}`;
const MIENNE = idMaison(ECOLE, 'lecture_a_haute_voix');
const AUTRUI = idMaison(AUTRE, 'competence_d_une_autre_ecole');

// ── 1) L'état laissé par l'ancienne version ─────────────────────────────────
// prim_competences SANS colonne school_id, et deux lignes maison dedans :
// exactement ce que `pickColumns` produisait en avalant le school_id.
{
  const avant = new DatabaseSync(join(dir, 'notescam.db'));
  avant.exec(`
    CREATE TABLE prim_competences (
      id           TEXT PRIMARY KEY,
      country_code TEXT NOT NULL DEFAULT 'CM',
      code         TEXT NOT NULL,
      intitule     TEXT NOT NULL,
      domaine      TEXT,
      coefficient  NUMERIC NOT NULL DEFAULT 1,
      ordre        INTEGER NOT NULL,
      actif        INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO prim_competences (id, code, intitule, ordre) VALUES
      ('1a', '1A', 'Communiquer en francais', 1),
      ('${MIENNE}', 'EC1', 'Lecture a haute voix', 90),
      ('${AUTRUI}', 'EC1', 'Competence d une autre ecole', 91);
  `);
  avant.close();
}

process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');
const { db } = await import('./db.js');   // ← le démarrage du serveur applique les reprises

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const essaie = (op, ctx) => { try { const r = runQuery(op, ctx); return r.error ? r.error.message : null; } catch (e) { return e.message; } };
const ligne = (id) => db.prepare('SELECT id, school_id, intitule FROM prim_competences WHERE id = ?').get(id);

// Les écoles doivent exister pour que le rattachement ait lieu — il ne se fait
// JAMAIS vers une école absente de cette base.
db.prepare('INSERT INTO schools (id, name) VALUES (?, ?)').run(ECOLE, 'École qui teste');

// ── 2) Au démarrage SUIVANT, la ligne revient à son école ───────────────────
// (le premier démarrage a posé la colonne ; l'école vient d'être insérée)
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, ['-e', `process.env.NOTESCAM_DATA_DIR=${JSON.stringify(dir)};import('./server/db.js')`],
  { cwd: join(import.meta.dirname, '..'), stdio: 'pipe' });

const apres = new DatabaseSync(join(dir, 'notescam.db'), { readOnly: true });
const relu = (id) => apres.prepare('SELECT id, school_id FROM prim_competences WHERE id = ?').get(id);

ok(relu(MIENNE)?.school_id === ECOLE,
  'la compétence ajoutée avant la mise à jour est RENDUE à son école', relu(MIENNE));
ok(relu(AUTRUI)?.school_id === null,
  'celle d’une école ABSENTE de cette base n’est rattachée à personne', relu(AUTRUI));
ok(relu('1a')?.school_id === null,
  'la ligne du ministère reste nationale — rien ne la lui prend', relu('1a'));
apres.close();

// ── 3) Rendue ne suffit pas : elle doit être MODIFIABLE à nouveau ───────────
// C'est tout l'objet de la reprise. Sans elle, `guardReferentielNational`
// refuserait pour toujours une ligne que l'école a elle-même créée.
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)')
  .run('u-dir', 'dir@ecole.test', 'x:y', 'Directrice');
db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active) VALUES (?,?,?,?,1)')
  .run('su-1', ECOLE, 'u-dir', 'admin');
const moi = { userId: 'u-dir' };

const corrige = essaie({ table: 'prim_competences', action: 'update',
  values: { intitule: 'Lecture a haute voix (corrige)' },
  filters: [{ op: 'eq', col: 'id', val: MIENNE }] }, moi);
ok(!corrige, 'l’école peut de nouveau RENOMMER sa compétence', corrige);
ok(ligne(MIENNE)?.intitule === 'Lecture a haute voix (corrige)',
  'le nouvel intitulé est bien en base', ligne(MIENNE));

// Le libellé officiel est relevé AVANT la tentative : le seed officiel se
// rejoue à chaque démarrage et c'est LUI qui fait foi, pas ce que ce test a
// écrit au départ.
const officielAvant = ligne('1a')?.intitule;
const national = essaie({ table: 'prim_competences', action: 'update',
  values: { intitule: 'Detournee' }, filters: [{ op: 'eq', col: 'id', val: '1a' }] }, moi);
ok(!!national, 'et la ligne du ministère lui reste refusée', national);
ok(ligne('1a')?.intitule === officielAvant, 'le libellé ministériel est intact', ligne('1a'));

// ── 4) ISOLATION : l'école voisine ne touche pas à ce qui n'est pas à elle ──
db.prepare('INSERT INTO schools (id, name) VALUES (?, ?)').run(AUTRE, 'École voisine');
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)')
  .run('u-voisin', 'dir@voisine.test', 'x:y', 'Voisin');
db.prepare('INSERT INTO school_users (id, school_id, user_id, role, active) VALUES (?,?,?,?,1)')
  .run('su-2', AUTRE, 'u-voisin', 'admin');
const voisin = { userId: 'u-voisin' };

const vol = essaie({ table: 'prim_competences', action: 'update', values: { intitule: 'Je prends' },
  filters: [{ op: 'eq', col: 'id', val: MIENNE }] }, voisin);
ok(!!vol, 'l’école voisine ne peut pas modifier la compétence d’une autre', vol);
ok(ligne(MIENNE)?.intitule === 'Lecture a haute voix (corrige)', 'la compétence est restée intacte', ligne(MIENNE));

const volLibelle = essaie({ table: 'referentiel_libelles', action: 'upsert',
  onConflict: 'school_id,kind,item_id',
  values: { school_id: ECOLE, kind: 'prim', item_id: '1a', intitule: 'Pose chez le voisin' } }, voisin);
ok(!!volLibelle, 'elle ne peut pas écrire un libellé AU NOM d’une autre école', volLibelle);

const sienPropre = essaie({ table: 'referentiel_libelles', action: 'upsert',
  onConflict: 'school_id,kind,item_id',
  values: { school_id: AUTRE, kind: 'prim', item_id: '1a', intitule: 'Ma formulation' } }, voisin);
ok(!sienPropre, 'mais elle renomme la ligne officielle CHEZ ELLE', sienPropre);
const deuxLibelles = db.prepare('SELECT count(*) c FROM referentiel_libelles WHERE item_id = ?').get('1a').c;
ok(deuxLibelles === 1, 'un libellé par école, sans empiètement', deuxLibelles);

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Reprise des compétences maison : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
