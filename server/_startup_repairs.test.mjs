// LES RÉPARATIONS DE DÉMARRAGE TOURNENT-ELLES VRAIMENT AU DÉMARRAGE ?
//
// Ce fichier existe à cause d'un défaut précis, trouvé le 27/08/2026 : la
// réparation des classes pré-scolaires était appelée en haut de server/db.js,
// AVANT les `const` de portée module qu'elle utilise (PRESCOLAIRE, SECTEURS).
// Zone morte temporelle : elle levait « Cannot access 'PRESCOLAIRE' before
// initialization », son propre try/catch avalait l'erreur, et la réparation ne
// tournait JAMAIS — en silence, sur toutes les installations.
//
// Et son test passait. Parce qu'il appelait `ensureCrecheSector()` À LA MAIN,
// après le chargement du module, quand les const sont initialisées. Il vérifiait
// que la fonction fait ce qu'elle promet ; il ne vérifiait pas qu'elle est
// APPELÉE. Ce sont deux questions différentes, et c'est la seconde qui a coûté
// une livraison.
//
// Ici, donc : AUCUN appel manuel. On prépare une base fautive, on importe
// server/db.js — ce que fait le serveur au lancement — et on regarde l'état.
//
//   node server/_startup_repairs.test.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';

const ici    = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, '..');
const dir    = mkdtempSync(join(tmpdir(), 'nc-startup-'));
process.env.NOTESCAM_DATA_DIR = dir;

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Une base FAUTIVE, écrite AVANT tout import de db.js ─────────────────────
// On applique `schema.sql` seul, pour que la base existe déjà — avec ses défauts
// et SANS les colonnes posées par `ensureColumn` — au moment où le serveur
// démarre. C'est exactement la situation d'une école qui met à jour.
{
  const pre = new DatabaseSync(join(dir, 'notescam.db'));
  pre.exec('PRAGMA foreign_keys = ON');
  pre.exec(readFileSync(join(ici, 'schema.sql'), 'utf8'));
  pre.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run('ec', 'ECOLE');
  // Le cas réel : « CRECHE », aucun cycle, aucune section — donc dans AUCUN
  // périmètre, invisible de tout compte borné à un cycle.
  pre.prepare('INSERT INTO classes (id,school_id,name,cycle,section) VALUES (?,?,?,?,?)')
     .run('c-creche', 'ec', 'CRECHE', null, null);
  // Témoin : une classe correcte ne doit pas bouger.
  pre.prepare('INSERT INTO classes (id,school_id,name,cycle,section) VALUES (?,?,?,?,?)')
     .run('c-cm2', 'ec', 'CM2', 'primaire', null);
  // Curseur de synchro déjà avancé : c'est lui qui empêche une ligne distante
  // déjà tirée de revenir (sync-pull est un keyset sur updated_at).
  pre.prepare('INSERT INTO sync_cursor (name,value) VALUES (?,?)').run('pull_at', 'position-deja-avancee');
  pre.close();
}

// ── Le démarrage lui-même. Aucun appel manuel après cette ligne. ────────────
const { db } = await import('./db.js');

// ── 1. La réparation des classes d'accueil a-t-elle tourné ? ────────────────
const creche = db.prepare('SELECT cycle, section FROM classes WHERE id = ?').get('c-creche');
ok(creche?.cycle === 'maternelle',
  '1. au DÉMARRAGE, la crèche reçoit son cycle (le défaut du 27/08 : elle n’en recevait aucun)', creche);
ok(creche?.section === 'maternelle',
  '2. et sa section — sans elle, un compte borné par sections ne la voit toujours pas', creche);

const cm2 = db.prepare('SELECT cycle, section FROM classes WHERE id = ?').get('c-cm2');
ok(cm2?.cycle === 'primaire' && cm2?.section === null,
  '3. témoin : une classe correcte n’est pas touchée', cm2);

// ── 2. Le curseur de pull a-t-il été invalidé par la colonne neuve ? ────────
// La base n'avait que `schema.sql` : les colonnes d'`ensureColumn` (dont
// `teachers.sector`) manquaient, et le démarrage vient de les ajouter. Une ligne
// distante déjà tirée ne reviendrait jamais les remplir — d'où la remise à zéro.
// C'est LE défaut vécu à THE GENIUS : secteur posé côté cloud, jeté en silence
// côté serveur parce que la colonne n'existait pas encore, et jamais renvoyé.
const cur = db.prepare('SELECT value FROM sync_cursor WHERE name = ?').get('pull_at');
ok(!cur, '4. colonne ajoutée sur une table synchronisée -> curseur de pull remis à zéro', cur);

// ── 3. Et il ne se remet PAS à zéro quand rien n'a changé ───────────────────
// Deuxième démarrage, dans un processus neuf : le schéma est complet, aucune
// colonne n'est ajoutée, donc aucune raison de tout relire. Un rattrapage complet
// à chaque lancement serait une régression à lui seul — sur une école de 1 600
// élèves, il se verrait.
db.prepare('INSERT INTO sync_cursor (name,value) VALUES (?,?)').run('pull_at', 'position-du-2e-demarrage');
execFileSync(process.execPath, ['-e', "import('./server/db.js')"],
  { cwd: racine, env: { ...process.env, NOTESCAM_DATA_DIR: dir }, stdio: 'ignore' });

const cur2 = db.prepare('SELECT value FROM sync_cursor WHERE name = ?').get('pull_at');
ok(cur2?.value === 'position-du-2e-demarrage',
  '5. schéma inchangé -> le curseur est LAISSÉ EN PLACE (pas de rattrapage inutile)', cur2);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
