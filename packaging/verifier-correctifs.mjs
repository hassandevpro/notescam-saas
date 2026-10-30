// LA MISE À JOUR EST-ELLE VRAIMENT EN PLACE SUR CE POSTE ?
//
// Trois défauts ont été corrigés en 0.3.15, et les trois se voient depuis la
// BASE de l'école, pas depuis le dépôt :
//   · l'écran « Modifier les compétences » qui répond « Enregistrement refusé
//     par le serveur » ;
//   · « RPC inconnue : update_my_profile » sur l'écran Profil ;
//   · les notes et barèmes du primaire qui restent en « échecs sync ».
//
// Tant que le serveur installé n'a pas redémarré avec le nouveau code, les
// tables et colonnes manquantes ne sont pas posées — et rien ne change à
// l'écran. Ce contrôle le dit en clair, sans rien modifier.
//
// Usage (double-cliquer verifier-correctifs.cmd), ou :
//   "C:\Program Files\NotesCam\node\node.exe" verifier-correctifs.mjs
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

const DB = process.argv[2] || 'C:/ProgramData/NotesCam/data/notescam.db';
const PORT = process.env.NOTESCAM_PORT || 8080;

const vert = (s) => `\x1b[32m${s}\x1b[0m`;
const rouge = (s) => `\x1b[31m${s}\x1b[0m`;
const gras = (s) => `\x1b[1m${s}\x1b[0m`;

console.log(gras('\n  NotesCam — contrôle de la mise à jour (lecture seule)\n'));

// ── 1. Quelle version tourne ? ──────────────────────────────────────────────
let version = null;
try {
  const r = await fetch(`http://localhost:${PORT}/api/version`, { signal: AbortSignal.timeout(4000) });
  version = (await r.json())?.data?.version || null;
} catch { /* serveur arrêté : on continue, la base dira l'essentiel */ }

if (version) console.log(`  Version du serveur en marche : ${gras(version)}`);
else console.log(`  ${rouge('Serveur non joignable')} sur http://localhost:${PORT} (arrêté ? autre port ?)`);

// ── FICHIERS vs SERVEUR EN MARCHE ───────────────────────────────────────────
// Le piège qui a coûté une soirée le 18/10/2026 (incident I8) : l'installeur
// était passé, les FICHIERS étaient à jour, mais le service n'avait jamais
// redémarré — il servait l'ancien code, et les tables neuves n'étaient donc
// pas posées. « Installé » ne veut pas dire « appliqué ». Ces deux nombres
// doivent être égaux ; s'ils diffèrent, tout le reste du rapport est explicable
// par cela seul, et il n'y a rien d'autre à chercher.
let versionFichiers = null;
for (const p of ['C:/Program Files/NotesCam/app/package.json', '/opt/notescam/app/package.json']) {
  try { versionFichiers = JSON.parse(readFileSync(p, 'utf8')).version; break; } catch { /* emplacement suivant */ }
}
if (versionFichiers) console.log(`  Version des fichiers install\u00e9s  : ${gras(versionFichiers)}`);

if (version && versionFichiers && version !== versionFichiers) {
  console.log(rouge('\n  LE SERVEUR EN MARCHE N\u2019EST PAS CELUI QUI EST INSTALL\u00c9.'));
  console.log(`  Fichiers ${versionFichiers}, serveur ${version} : le service n\u2019a pas red\u00e9marr\u00e9`);
  console.log('  depuis l\u2019installation. Les tables et colonnes neuves sont pos\u00e9es AU');
  console.log('  D\u00c9MARRAGE : tant qu\u2019il tourne, les \u00e9crans refusent comme avant.');
  console.log('\n  \u00c0 faire : lancer ' + gras('REDEMARRER-APRES-MAJ.cmd') + ' en administrateur');
  console.log('  (menu D\u00e9marrer \u2192 \u00ab Appliquer la mise \u00e0 jour \u00bb), ou red\u00e9marrer le PC.');
}

// ── 2. Ce que la base porte VRAIMENT ────────────────────────────────────────
if (!existsSync(DB)) {
  console.log(`\n  ${rouge('Base introuvable')} : ${DB}`);
  console.log('  Passez le chemin en argument si les données sont ailleurs.\n');
  process.exit(2);
}

const db = new DatabaseSync(DB, { readOnly: true });
const colonnes = (t) => db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
const clesUniques = (t) => db.prepare(`PRAGMA index_list("${t}")`).all().filter((i) => i.unique)
  .map((i) => db.prepare(`PRAGMA index_info("${i.name}")`).all().map((c) => c.name).sort().join(','));

const controles = [
  ['Modifier les compétences : ajouter les siennes',
    () => colonnes('apc_competences').includes('school_id') && colonnes('prim_competences').includes('school_id')],
  ['Modifier les compétences : masquer',
    () => ['apc_competences_masques', 'prim_competences_masques', 'mat_domaines_masques']
      .every((t) => colonnes(t).length > 0)],
  ['Modifier les compétences : renommer une ligne officielle',
    () => colonnes('referentiel_libelles').length > 0],
  ['Notes et barèmes du primaire (clé par unité d’apprentissage)',
    () => clesUniques('prim_notes').includes(['eleve_id', 'competence_id', 'critere_id', 'ua'].sort().join(','))],
  ['Avis « l’enseignant a saisi ses notes »',
    () => clesUniques('teacher_notifications')
      .includes(['school_id', 'teacher_id', 'class_id', 'sequence'].sort().join(','))],
  // 0.3.27 — POSÉE AU DÉMARRAGE par `ensureColumn` (server/db.js). C'est donc
  // aussi le contrôle qui dit si le service a VRAIMENT redémarré avec le
  // nouveau code : installer remplace les fichiers, et tant que le serveur
  // tourne encore sur l'ancien, la colonne n'existe pas.
  //
  // ⚠️ `schools` est SYNCHRONISÉE, et `sync-push` filtre les tables, pas les
  // colonnes : si le Cloud ignore `bulletin_accent`, il rejette la LIGNE
  // ENTIÈRE (PGRST204) et l'école cesse de remonter TOUS ses réglages. La
  // migration `supabase_bulletin_accent.sql` doit avoir tourné au Cloud.
  ['Couleur d’accent des bulletins (0.3.27) — et donc : le service a redémarré',
    () => colonnes('schools').includes('bulletin_accent')],
];

console.log('');
let manquants = 0;
for (const [titre, test] of controles) {
  let ok = false;
  try { ok = test(); } catch { ok = false; }
  if (!ok) manquants++;
  console.log(`  ${ok ? vert('OK  ') : rouge('KO  ')} ${titre}`);
}

// ── 2 bis. LA RECONSTRUCTION DE prim_notes PASSERA-T-ELLE ? ─────────────────
// « ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint » :
// la base porte encore l'ancienne clé (élève, compétence, critère, TRIMESTRE).
// `server/db.js` reconstruit la table au démarrage pour la remplacer par la clé
// par UA — mais la table neuve porte deux CHECK (`ua` entre 1 et 8,
// `points_max` dans ]0;200]). UNE SEULE ligne hors bornes fait échouer toute la
// reconstruction, et le redémarrage ne règle alors rien : on resterait sur le
// même refus, en croyant avoir appliqué la mise à jour.
//
// Ce contrôle le dit AVANT, pendant qu'on peut encore corriger la ligne fautive.
if (!clesUniques('prim_notes').includes(['eleve_id', 'competence_id', 'critere_id', 'ua'].sort().join(','))) {
  try {
    const horsUa = db.prepare('SELECT count(*) c FROM prim_notes WHERE ua IS NOT NULL AND (ua < 1 OR ua > 8)').get().c;
    const horsMax = db.prepare('SELECT count(*) c FROM prim_notes WHERE points_max IS NOT NULL AND (points_max <= 0 OR points_max > 200)').get().c;
    console.log('');
    if (horsUa || horsMax) {
      console.log(rouge('  ATTENTION : la reconstruction de prim_notes ÉCHOUERA en l’état.'));
      if (horsUa) console.log(`    ${horsUa} ligne(s) avec une unité d’apprentissage hors 1..8`);
      if (horsMax) console.log(`    ${horsMax} ligne(s) avec un barème hors ]0;200]`);
      console.log('    Redémarrer ne suffira pas. Envoyez ce rapport à l’éditeur :');
      console.log('    ces lignes doivent être corrigées d’abord, pas supprimées.');
    } else {
      console.log(vert('  La reconstruction de prim_notes passera au prochain démarrage'));
      console.log('  (aucune ligne hors bornes). C’est elle qui débloque les barèmes.');
    }
  } catch { /* table absente : rien à reconstruire */ }
}

// ── 2 ter. « Quand je crée un élève, il s'en crée six » ─────────────────────
// Un même élève inscrit plusieurs fois DANS LA MÊME MINUTE n'est pas un
// réimport ni une ressaisie : c'est le même geste parti plusieurs fois. On le
// distingue donc des doublons anciens, qui ont une autre cause et une autre
// parade (cf. diagnostic-doublons).
try {
  const rafales = db.prepare(`
    SELECT name, substr(created_at, 1, 16) AS minute, count(*) AS c
      FROM students
     WHERE created_at IS NOT NULL
     GROUP BY lower(trim(name)), substr(created_at, 1, 16)
    HAVING c > 1
     ORDER BY minute DESC
     LIMIT 10`).all();
  console.log('');
  if (rafales.length) {
    console.log(rouge(`  ${rafales.length} cas d’élève créé PLUSIEURS FOIS DANS LA MÊME MINUTE :`));
    for (const r of rafales) console.log(`    ${r.c} fois  ${r.name}  (${r.minute})`);
    console.log('    Le geste est parti plusieurs fois. Envoyez ce rapport.');
  } else {
    console.log(vert('  Aucun élève créé plusieurs fois dans la même minute sur cette base.'));
    console.log('  Si l’écran en montre plusieurs, ils ne sont pas enregistrés ici :');
    console.log('  rechargez avec Ctrl+Shift+R, et dites sur QUEL poste cela arrive.');
  }
} catch { /* colonne created_at absente : rien à dire */ }

// ── 2 quater. La forme exacte de prim_notes, pour un diagnostic à distance ──
try {
  const uniques = db.prepare('PRAGMA index_list("prim_notes")').all().filter((i) => i.unique)
    .map((i) => db.prepare(`PRAGMA index_info("${i.name}")`).all().map((c) => c.name).join(', '));
  console.log('\n  Clés uniques de prim_notes sur cette base :');
  for (const u of uniques) console.log(`    (${u})`);
  if (!uniques.some((u) => u.includes('ua'))) {
    console.log(rouge('    Aucune ne porte « ua » : c’est CE poste qui rend'));
    console.log(rouge('    « ON CONFLICT clause does not match any ... UNIQUE constraint ».'));
  }
} catch { /* table absente */ }

// ── 3. Ce qui n'est pas encore parti vers le cloud ──────────────────────────
try {
  const enAttente = db.prepare('SELECT count(*) c FROM sync_outbox').get().c;
  if (enAttente) console.log(`\n  ${enAttente} écriture(s) en attente d’envoi au cloud (normal si la synchro vient de reprendre).`);
} catch { /* table absente : école sans synchro cloud */ }

// ── 4. Verdict ──────────────────────────────────────────────────────────────
if (manquants === 0) {
  console.log(vert('\n  La mise à jour est en place. Les trois écrans doivent fonctionner.'));
  console.log('  Si un refus persiste À L’ÉCRAN, rechargez la page avec Ctrl+Shift+R :');
  console.log('  le navigateur garde l’ancienne interface en cache.\n');
  process.exit(0);
}

console.log(rouge(`\n  ${manquants} correctif(s) absent(s) de cette base.`));
console.log('\n  Ce poste n’a pas encore reçu la mise à jour, ou le serveur n’a pas redémarré');
console.log('  depuis. Les colonnes et tables manquantes sont posées AU DÉMARRAGE du serveur.');
console.log('\n  À faire : installer NotesCam-Setup.exe (0.3.15 ou plus récent) en administrateur,');
console.log('  ou appliquer le paquet de mise à jour, puis relancer ce contrôle.\n');
process.exit(1);
