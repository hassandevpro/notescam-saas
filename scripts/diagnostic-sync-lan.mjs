// Diagnostic LECTURE SEULE de la remontée LAN → Cloud, à lancer SUR le serveur
// de l'école. N'écrit rien, ne contacte pas le cloud, ne modifie aucune donnée.
//
// Pourquoi il existe : quand des élèves saisis à l'école n'arrivent pas dans le
// cloud, la synchro n'affiche AUCUNE erreur. `sync-push` (côté cloud) ignore les
// lignes qu'il refuse et répond quand même 200 avec un compteur `skipped` ; le
// serveur LAN, lui, vide sa file d'attente sans regarder ce compteur. Une ligne
// refusée est donc perdue en silence, et le tableau de bord reste au vert.
// Ce script montre les trois causes possibles, sur les données réelles.
//
// Usage (serveur Linux de l'école) :
//   /opt/notescam/node/bin/node /opt/notescam/app/scripts/diagnostic-sync-lan.mjs
//   # base ailleurs :
//   NOTESCAM_DATA_DIR=/var/lib/notescam/data /opt/notescam/node/bin/node …
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.env.NOTESCAM_DATA_DIR
  || (process.platform === 'win32' ? 'C:/ProgramData/NotesCam/data' : '/var/lib/notescam/data');
const FILE = process.argv[2] || join(DIR, 'notescam.db');
if (!existsSync(FILE)) {
  console.error(`Base introuvable : ${FILE}\nPrécisez le chemin : node diagnostic-sync-lan.mjs /chemin/notescam.db`);
  process.exit(1);
}
const db = new DatabaseSync(FILE, { readOnly: true });
const all = (s, ...p) => { try { return db.prepare(s).all(...p); } catch (e) { return [{ erreur: e.message }]; } };
const one = (s, ...p) => all(s, ...p)[0] || {};
const titre = (t) => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`);

console.log(`Base analysée : ${FILE}`);

titre('1. VOLUMES — ce que l\'école a, table par table');
for (const t of ['students', 'classes', 'teachers', 'grades', 'student_fees', 'fee_payments']) {
  const n = one(`SELECT count(*) AS n FROM ${t}`).n;
  console.log(`  ${t.padEnd(14)} ${n ?? '(table absente)'}`);
}

// CAUSE 1 — la file de poussée. `push()` prend les PLUS ANCIENNES entrées
// (ORDER BY id LIMIT), et ne les purge qu'après un appel réussi. Si l'appel
// échoue, les mêmes entrées repartent à chaque cycle : tout ce qui est derrière
// elles est bloqué pour toujours. Une file vieille de plusieurs jours = blocage.
titre('2. CAUSE 1 — file de poussée bloquée (sync_outbox)');
const ob = one('SELECT count(*) AS n, min(at) AS plus_ancien, max(at) AS plus_recent FROM sync_outbox');
console.log(`  entrées en attente : ${ob.n}`);
console.log(`  plus ancienne      : ${ob.plus_ancien ?? '—'}`);
console.log(`  plus récente       : ${ob.plus_recent ?? '—'}`);
if (ob.plus_ancien) {
  const jours = Math.floor((Date.now() - Date.parse(ob.plus_ancien)) / 86400000);
  console.log(`  âge de la tête de file : ${jours} jour(s)` + (jours >= 2
    ? '   <<< BLOCAGE : la tête ne passe pas, rien derrière elle ne monte'
    : '   (normal)'));
}
for (const r of all('SELECT tablename, op, count(*) AS n FROM sync_outbox GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12'))
  console.log(`    ${String(r.tablename).padEnd(22)} ${String(r.op).padEnd(8)} ${r.n}`);

// CAUSE 2 — updated_at NULL. Le cloud impose NOT NULL sur students.updated_at :
// une ligne poussée avec updated_at = NULL est REFUSÉE. Et pour une ligne qui
// existe déjà dans le cloud, le comparateur LWW lit `Date.parse(updated_at || 0)`
// → 0, donc la version locale ne gagne JAMAIS. Dans les deux cas : ligne écartée.
// Les lignes créées par un import direct ou un seed n'ont pas d'updated_at.
titre('3. CAUSE 2 — lignes sans updated_at (refusées par le cloud, en silence)');
for (const t of ['students', 'classes', 'teachers', 'grades', 'student_fees']) {
  const r = one(`SELECT count(*) AS total,
    sum(CASE WHEN updated_at IS NULL OR trim(updated_at) = '' THEN 1 ELSE 0 END) AS sans
    FROM ${t}`);
  if (r.total == null) { console.log(`  ${t.padEnd(14)} (table absente)`); continue; }
  const bloque = Number(r.sans) > 0;
  console.log(`  ${t.padEnd(14)} ${String(r.sans).padStart(5)} / ${String(r.total).padEnd(6)} sans updated_at`
    + (bloque ? '   <<< ces lignes ne monteront JAMAIS en l\'état' : ''));
}

titre('4. CAUSE 2 bis — élèves sans updated_at, par classe');
const parClasse = all(`SELECT coalesce(c.name,'(sans classe)') AS classe, count(*) AS n
  FROM students s LEFT JOIN classes c ON c.id = s.class_id
  WHERE s.updated_at IS NULL OR trim(s.updated_at) = ''
  GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
if (!parClasse.length) console.log('  (aucun — cette cause est écartée)');
for (const r of parClasse) console.log(`    ${String(r.classe).padEnd(24)} ${r.n}`);

// CAUSE 3 — le cycle s'arrête avant la poussée. syncOnce() fait le pull d'abord
// et, hors dry-run, un échec de pull INTERROMPT le cycle : le push n'est jamais
// appelé. Curseurs de pull vides alors que la base contient des données = le
// pull n'a jamais abouti, donc rien n'est jamais monté.
titre('5. CAUSE 3 — le pull échoue, donc le push n\'est jamais joué');
const cur = all('SELECT name, value FROM sync_cursor ORDER BY name');
if (!cur.length) console.log('  AUCUN curseur enregistré   <<< le pull n\'a jamais abouti : le push n\'est jamais joué');
for (const r of cur) console.log(`    ${String(r.name).padEnd(16)} ${r.value}`);

titre('6. JUMELAGE / IDENTITÉ');
for (const r of all(`SELECT id, name FROM schools LIMIT 5`)) console.log(`  école : ${r.id}  ${r.name}`);
const v = one(`SELECT value FROM app_meta WHERE key = 'version'`);
if (v.value) console.log(`  version applicative : ${v.value}`);

titre('CE QU\'IL FAUT RETENIR');
const diag = [];
if (Number(ob.n) > 0 && ob.plus_ancien && (Date.now() - Date.parse(ob.plus_ancien)) > 2 * 86400000)
  diag.push('CAUSE 1 : la file de poussée est bloquée en tête — rien ne monte depuis ' + ob.plus_ancien);
const sansMaj = Number(one(`SELECT sum(CASE WHEN updated_at IS NULL OR trim(updated_at)='' THEN 1 ELSE 0 END) AS n FROM students`).n || 0);
if (sansMaj > 0) diag.push(`CAUSE 2 : ${sansMaj} élève(s) sans updated_at — le cloud les refuse sans le dire`);
if (!cur.length) diag.push('CAUSE 3 : aucun curseur de pull — le cycle s\'arrête avant la poussée');
if (!diag.length) console.log('  Aucune des trois causes connues. Envoyer la sortie complète + les journaux du service.');
for (const d of diag) console.log('  • ' + d);
db.close();
