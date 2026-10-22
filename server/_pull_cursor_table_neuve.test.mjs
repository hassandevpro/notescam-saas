// UNE TABLE SYNCHRONISÉE QUI NAÎT SUR UNE BASE DÉJÀ SYNCHRONISÉE
//
// ── LE DÉFAUT QUE CE TEST EMPÊCHE DE REVENIR ────────────────────────────────
//
// `sync-pull` est un keyset STRICTEMENT supérieur au curseur `pull_at` : une
// ligne déjà dépassée n'est PLUS JAMAIS renvoyée. Le serveur savait déjà remettre
// ce curseur à zéro quand une COLONNE apparaissait sur une table synchronisée
// (défaut constaté à THE GENIUS le 27/08/2026, colonne `sector`). Il ne le faisait
// PAS quand c'était une TABLE ENTIÈRE qui apparaissait.
//
// MESURÉ LE 2026-10-22, avant de livrer la 0.3.21 à THE GENIUS. Cette version
// crée cinq tables que la 0.3.19 n'avait pas, dont `cash_movements`, qui est
// synchronisée. Le Cloud de THE GENIUS portait **11 écritures de caisse datées du
// 2026-10-18**, quatre jours avant le paquet : leur curseur était donc largement
// passé devant. Sans cette règle, l'école installait la mise à jour, ouvrait son
// journal de caisse, et le trouvait VIDE — définitivement, puisque rien ne
// redescendait plus. Une colonne neuve perd un champ ; une table neuve perd tout.
//
// ── CE QUE LE TEST FAIT ─────────────────────────────────────────────────────
//
// Il fabrique la situation exacte d'une école : une base complète et déjà
// synchronisée (curseur posé), dont on RETIRE la table neuve — c'est l'état dans
// lequel la mise à jour trouve le serveur. Puis il démarre le serveur dessus et
// regarde le curseur.
//
//   node server/_pull_cursor_table_neuve.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');

let pass = 0, fail = 0;
const ok = (c, label, détail) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${détail === undefined ? '' : `  (obtenu: ${JSON.stringify(détail)})`}`); }
};

// Démarre le serveur (l'import de db.js suffit : le schéma et la règle de
// curseur s'exécutent au chargement) sur le dossier de données donné.
//
// Les deux sorties sont concaténées, et c'est VOLONTAIRE : les annonces de
// rattrapage passent par `console.warn`, donc par stderr. Ne lire que stdout
// faisait échouer les deux contrôles de journal alors que le serveur faisait
// exactement ce qu'il fallait.
const demarrer = (dir) => {
  const r = spawnSync(process.execPath,
    ['-e', 'import(process.argv[1]).then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); })',
      new URL('./db.js', import.meta.url).href],
    { cwd: RACINE, env: { ...process.env, NOTESCAM_DATA_DIR: dir }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`demarrage echoue (${r.status}) : ${r.stderr || r.stdout}`);
  return `${r.stdout || ''}${r.stderr || ''}`;
};

const CURSEUR = "SELECT value FROM sync_cursor WHERE name = 'pull_at'";
const POSE = '2026-10-20T08:00:00.000Z';

// ── 1) Une base d'école : complète, puis amputée de la table neuve ──────────
const dir = mkdtempSync(join(tmpdir(), 'nc-curseur-'));
demarrer(dir);   // premier démarrage : pose tout le schéma, comme une base neuve

{
  const base = new DatabaseSync(join(dir, 'notescam.db'));
  // Le serveur a-t-il bien cette table dans son schéma ? Sans cela le test ne
  // vérifierait rien du tout.
  const existe = base.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='cash_movements'").get();
  ok(!!existe, 'le schéma du serveur porte bien `cash_movements`');

  // On retire la table — c'est exactement ce que la mise à jour trouvera sur le
  // serveur d'une école restée en 0.3.19.
  base.exec('DROP TABLE cash_movements');
  // Et on pose un curseur DÉJÀ AVANCÉ : l'école synchronise depuis des semaines.
  base.exec("DELETE FROM sync_cursor WHERE name = 'pull_at'");
  base.prepare('INSERT INTO sync_cursor (name, value) VALUES (?, ?)').run('pull_at', POSE);
  ok(base.prepare(CURSEUR).get()?.value === POSE, 'curseur posé à une date avancée', POSE);
  base.close();
}

// ── 2) La mise à jour démarre sur cette base ────────────────────────────────
const journal = demarrer(dir);

{
  const base = new DatabaseSync(join(dir, 'notescam.db'));
  const recree = base.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='cash_movements'").get();
  ok(!!recree, 'la table synchronisée a été recréée au démarrage');

  const apres = base.prepare(CURSEUR).get()?.value ?? null;
  ok(apres === null,
    'LE CURSEUR EST REMIS À ZÉRO : le prochain pull ramènera les écritures de caisse',
    apres);
  base.close();
}

// Le journal doit NOMMER la table, pas seulement agir : un dépanneur qui lit les
// logs de l'école doit pouvoir dire pourquoi un long rattrapage a eu lieu.
ok(/cash_movements \(table entière\)/.test(journal),
  'le journal nomme la table entière responsable du rattrapage');
ok(/curseur de pull remis à zéro/.test(journal), 'et annonce la remise à zéro');

// ── 3) NON-RÉGRESSION : un démarrage sans changement ne touche à rien ───────
// La remise à zéro force un rattrapage complet : la déclencher à chaque
// démarrage ferait relire toute la base à chaque redémarrage du serveur.
{
  const base = new DatabaseSync(join(dir, 'notescam.db'));
  base.exec("DELETE FROM sync_cursor WHERE name = 'pull_at'");
  base.prepare('INSERT INTO sync_cursor (name, value) VALUES (?, ?)').run('pull_at', POSE);
  base.close();
}
demarrer(dir);
{
  const base = new DatabaseSync(join(dir, 'notescam.db'));
  ok(base.prepare(CURSEUR).get()?.value === POSE,
    'un démarrage SANS table ni colonne neuve laisse le curseur intact',
    base.prepare(CURSEUR).get()?.value ?? null);
  base.close();
}

// ── 4) Une base NEUVE n'est pas traitée comme une base amputée ─────────────
//
// MESURÉ, et ce n'était pas ce que je croyais : une installation neuve annonce
// DÉJÀ une remise à zéro, parce que `schema.sql` ne porte pas toutes les
// colonnes — 79 d'entre elles sont posées par les migrations légères, donc
// `COLONNES_AJOUTEES` n'est jamais vide au premier démarrage. Ce comportement
// existait avant la règle sur les tables, et il est inoffensif : il n'y a aucun
// curseur à invalider, la suppression ne porte sur rien.
//
// Ce que l'on vérifie donc ici est ce qui compte vraiment : la règle sur les
// TABLES ne s'ajoute pas au bruit d'une base neuve (aucune table n'y est
// désignée comme responsable), et le curseur reste absent — pas remis à une
// valeur quelconque.
{
  const neuf = mkdtempSync(join(tmpdir(), 'nc-curseur-neuf-'));
  const j = demarrer(neuf);
  ok(!/\(table entière\)/.test(j),
    'base neuve : aucune TABLE n’est désignée comme cause du rattrapage',
    (j.match(/[^\n]*\(table entière\)[^\n]*/) || [null])[0]);
  const base = new DatabaseSync(join(neuf, 'notescam.db'));
  ok(base.prepare(CURSEUR).get() === undefined,
    'base neuve : le curseur reste absent, il n’y avait rien à invalider');
  base.close();
}

console.log(`\n${fail ? '❌' : '✅'} Curseur de pull / table neuve : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
