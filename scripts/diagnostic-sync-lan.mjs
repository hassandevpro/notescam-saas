// Diagnostic LECTURE SEULE de la synchronisation LAN ↔ Cloud, à lancer SUR le
// serveur de l'école. N'écrit rien, ne contacte pas le cloud, ne modifie aucune
// donnée, ne touche à aucune file.
//
// Pourquoi il existe : quand des élèves saisis à l'école n'arrivent pas dans le
// cloud, la synchro n'affiche AUCUNE erreur. `sync-push` (côté cloud) ignore les
// lignes qu'il refuse et répond quand même 200 avec un compteur `skipped` ; le
// serveur LAN, lui, vide sa file d'attente sans regarder ce compteur. Une ligne
// refusée est donc perdue en silence, et le tableau de bord reste au vert.
// Ce script montre les causes possibles, sur les données réelles.
//
// ── CE QU'IL FAUT SAVOIR AVANT DE LIRE SA SORTIE ───────────────────────────
// Les deux sens ne sont PAS indépendants. Dans `syncOnce` (server/cloudSync.js) :
//
//     if (!dryRun) throw e;  // hors dry-run, un échec de pull interrompt le cycle
//
// Le pull (Cloud → LAN) est joué AVANT le push (LAN → Cloud). Donc si la
// DESCENTE échoue, la REMONTÉE n'est jamais tentée. « Les changements faits en
// ligne n'arrivent pas sur le serveur » ET « les notes ne remontent pas » n'est
// donc pas deux pannes : c'est la signature d'UNE SEULE, située à la descente.
// C'est la section 5 qu'il faut lire en premier dans ce cas.
//
// Usage (serveur Linux de l'école) :
//   /opt/notescam/node/bin/node /opt/notescam/app/scripts/diagnostic-sync-lan.mjs
//   # base ailleurs :
//   NOTESCAM_DATA_DIR=/var/lib/notescam/data /opt/notescam/node/bin/node …
//   # autres classes à examiner (défaut : FORM 1,FORM 2) :
//   NC_CLASSES="FORM 1,FORM 2,CLASSE 6" /opt/notescam/node/bin/node …
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DIR = process.env.NOTESCAM_DATA_DIR
  || (process.platform === 'win32' ? 'C:/ProgramData/NotesCam/data' : '/var/lib/notescam/data');
const FILE = process.argv[2] || join(DIR, 'notescam.db');
// Le jeton serveur vit A COTE de la base analysee : quand un chemin est passe en
// argument (copie de sauvegarde, autre poste), regarder dans le dossier par defaut
// ferait dire « jeton present » en montrant celui d'une TOUTE AUTRE installation.
const DOSSIER = dirname(FILE);
if (!existsSync(FILE)) {
  console.error(`Base introuvable : ${FILE}\nPrécisez le chemin : node diagnostic-sync-lan.mjs /chemin/notescam.db`);
  process.exit(1);
}
const db = new DatabaseSync(FILE, { readOnly: true });
const all = (s, ...p) => { try { return db.prepare(s).all(...p); } catch (e) { return [{ erreur: e.message }]; } };
const one = (s, ...p) => all(s, ...p)[0] || {};
// Vrai quand la requête a échoué (table absente d'un schéma plus ancien) : les
// sections récentes doivent le DIRE au lieu d'afficher un zéro rassurant.
const absent = (r) => Array.isArray(r) ? (r.length === 1 && r[0]?.erreur) : !!r?.erreur;
const titre = (t) => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`);
const CLASSES_VISEES = (process.env.NC_CLASSES || 'FORM 1,FORM 2')
  .split(',').map((s) => s.trim()).filter(Boolean);
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

console.log(`Base analysée : ${FILE}`);
console.log(`Date du diagnostic : ${new Date().toISOString()}`);

// ── 0. L'INTERRUPTEUR ────────────────────────────────────────────────────
// À vérifier AVANT tout le reste : `scheduleCloudSync` sort immédiatement, et
// SANS RIEN ÉCRIRE DANS AUCUN JOURNAL, si la synchro n'est pas activée ou si le
// jeton serveur est absent :
//     if (!isCloudSyncEnabled() || !serverToken()) return false;
// Dans ce cas la file d'attente grossit, aucune erreur n'apparaît nulle part, et
// les deux sens sont muets. C'est la panne la moins visible et la plus simple.
titre('0. L\'INTERRUPTEUR — la synchro tourne-t-elle, tout simplement ?');
const flag = one("SELECT value FROM app_settings WHERE key = 'cloud_sync'");
const mig = one('SELECT source, school_id, cloud_url, migrated_at FROM migration_state WHERE id = 1');
const JETON = join(DOSSIER, 'server-token.key');
const aJeton = existsSync(JETON);
const actif = String(flag.value || '') === '1';
console.log(`  réglage app_settings.cloud_sync : ${absent(flag) ? '(table absente)' : (flag.value ?? '(non défini)')}`
  + (actif ? '   → activé' : '   <<< LA SYNCHRO NE TOURNE PAS SUR CE SERVEUR'));
console.log(`  jeton serveur (${JETON}) : ${aJeton ? 'présent' : 'ABSENT'}`
  + (aJeton ? '' : '   <<< sans jeton, aucun cycle ne démarre'));
console.log(`  école migrée depuis le Cloud : ${mig.migrated_at || '(jamais)'}`);
console.log(`  school_id : ${mig.school_id || '—'}`);
console.log(`  cloud_url : ${mig.cloud_url || '—'}`);
if (!actif) {
  console.log('  NOTE : la variable d\'environnement NOTESCAM_CLOUD_SYNC=1 passe outre ce');
  console.log('         réglage. Vérifiez-la dans l\'unité systemd avant de conclure :');
  console.log('             systemctl show notescam -p Environment');
}

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
// `attempts` / `last_error` n'existent que depuis la 0.3.x : c'est ici que la
// RAISON du refus est écrite, et c'est le renseignement le plus utile du script.
const tete = all('SELECT tablename, row_id, op, at, attempts, last_error FROM sync_outbox ORDER BY id LIMIT 5');
if (absent(tete)) {
  console.log('  (colonnes attempts/last_error absentes : serveur antérieur à la 0.3.x —');
  console.log('   ce serveur ne garde AUCUNE trace du motif de refus)');
} else if (tete.length) {
  console.log('  tête de file, avec le motif du refus :');
  for (const r of tete) {
    console.log(`    ${String(r.tablename).padEnd(18)} ${r.op.padEnd(7)} ${r.row_id}`);
    console.log(`        empilée le ${r.at} · ${r.attempts ?? 0} tentative(s)`);
    if (r.last_error) console.log(`        MOTIF : ${r.last_error}`);
  }
}

// CAUSE 2 — updated_at NULL. Le cloud impose NOT NULL sur students.updated_at :
// une ligne poussée avec updated_at = NULL est REFUSÉE. Et pour une ligne qui
// existe déjà dans le cloud, le comparateur LWW lit `Date.parse(updated_at || 0)`
// → 0, donc la version locale ne gagne JAMAIS. Dans les deux cas : ligne écartée.
// Les lignes créées par un import direct ou un seed n'ont pas d'updated_at.
titre('3. CAUSE 2 — lignes sans updated_at (refusées par le cloud, en silence)');
for (const t of ['students', 'classes', 'teachers', 'grades', 'student_fees']) {
  const r = one(`SELECT count(*) AS total,
    coalesce(sum(CASE WHEN updated_at IS NULL OR trim(updated_at) = '' THEN 1 ELSE 0 END), 0) AS sans
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
for (const r of cur) {
  // `pull_tables` est la liste mémorisée des tables déjà tirées : longue et sans
  // intérêt à l'écran, mais son ABSENCE est un renseignement.
  if (r.name === 'pull_tables') { console.log(`    ${r.name.padEnd(16)} (liste de ${(JSON.parse(r.value || '[]') || []).length} tables)`); continue; }
  const age = Date.parse(r.value || 0);
  const suffixe = Number.isFinite(age) && age > 0
    ? `   (il y a ${Math.floor((Date.now() - age) / 86400000)} jour(s))` : '';
  console.log(`    ${String(r.name).padEnd(16)} ${r.value}${suffixe}`);
}
const pullAt = cur.find((r) => r.name === 'pull_at')?.value;
if (pullAt) {
  const jours = Math.floor((Date.now() - (Date.parse(pullAt) || 0)) / 86400000);
  if (jours >= 2) console.log(`  <<< le curseur de descente n'a pas bougé depuis ${jours} jour(s) :`
    + ' aucune descente n\'aboutit, donc aucune remontée non plus');
}

// ── 6. LA DESCENTE MISE EN ATTENTE ───────────────────────────────────────
// Quand `rawUpsert` échoue à la descente (FK parent absent, colonne inconnue du
// schéma local), la ligne distante n'est PAS perdue : elle est mise ici et
// rejouée à chaque cycle. Un backlog qui ne se draine pas est exactement le
// symptôme « le changement fait en ligne n'arrive pas sur le serveur ».
titre('6. DESCENTE EN ATTENTE — lignes du Cloud qui n\'entrent pas (sync_pull_retry)');
const pr = all(`SELECT tablename, count(*) AS n, max(attempts) AS tentatives,
  min(first_seen) AS depuis, max(last_at) AS dernier
  FROM sync_pull_retry GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
if (absent(pr)) {
  console.log('  (table absente : serveur antérieur à la 0.3.x)');
} else if (!pr.length) {
  console.log('  (aucune — toutes les lignes descendues sont entrées)');
} else {
  for (const r of pr) {
    console.log(`    ${String(r.tablename).padEnd(22)} ${String(r.n).padStart(5)} ligne(s)`
      + ` · jusqu'à ${r.tentatives} tentative(s) · depuis ${r.depuis}`);
  }
  const det = all(`SELECT tablename, row_id, attempts, last_error FROM sync_pull_retry
    ORDER BY attempts DESC LIMIT 5`);
  console.log('  les plus obstinées, avec leur motif :');
  for (const r of det) {
    console.log(`    ${String(r.tablename).padEnd(18)} ${r.row_id} · ${r.attempts} tentative(s)`);
    if (r.last_error) console.log(`        MOTIF : ${r.last_error}`);
  }
}

// ── 7. LA QUARANTAINE ────────────────────────────────────────────────────
// Au-delà de PUSH_MAX_ATTEMPTS (8 par défaut), la tête de file part ici AVEC sa
// raison, et la file redémarre. Rien n'est perdu — la LIGNE reste en base — mais
// elle ne remontera plus d'elle-même tant que la réparation ne la réenfile pas.
titre('7. QUARANTAINE — entrées écartées de la file, avec leur motif');
const q = all(`SELECT tablename, op, count(*) AS n, max(quarantined_at) AS dernier
  FROM sync_outbox_quarantine GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`);
if (absent(q)) {
  console.log('  (table absente : serveur antérieur à la 0.3.x)');
} else if (!q.length) {
  console.log('  (aucune — rien n\'a été écarté de la file)');
} else {
  for (const r of q) {
    console.log(`    ${String(r.tablename).padEnd(22)} ${String(r.op).padEnd(8)} ${String(r.n).padStart(5)}`
      + ` · dernière le ${r.dernier}`);
  }
  const motifs = all(`SELECT last_error, count(*) AS n FROM sync_outbox_quarantine
    GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);
  console.log('  motifs, du plus fréquent au moins fréquent :');
  for (const r of motifs) console.log(`    ${String(r.n).padStart(5)} × ${r.last_error || '(sans motif)'}`);
}

// ── 8. LE JOURNAL ────────────────────────────────────────────────────────
// Une entrée par cycle. `kind='error'` porte le message de l'échec : c'est la
// réponse directe à « pourquoi ça ne synchronise pas ».
titre('8. JOURNAL DES CYCLES (sync_audit) — les derniers échecs, en clair');
const der = all("SELECT at, kind, pushed, pulled, ok, app_version FROM sync_audit ORDER BY id DESC LIMIT 8");
if (absent(der)) {
  console.log('  (table absente : serveur antérieur à la 0.3.x)');
} else if (!der.length) {
  console.log('  AUCUN cycle journalisé   <<< la synchro n\'a jamais tourné sur ce serveur');
} else {
  for (const r of der) {
    console.log(`    ${r.at}  ${String(r.kind).padEnd(7)} poussé=${r.pushed ?? '-'} tiré=${r.pulled ?? '-'}`
      + ` ok=${r.ok} v${r.app_version ?? '?'}`);
  }
  const errs = all("SELECT at, detail FROM sync_audit WHERE kind = 'error' ORDER BY id DESC LIMIT 5");
  if (errs.length) {
    console.log('  derniers messages d\'erreur :');
    for (const r of errs) {
      let m = r.detail;
      try { m = JSON.parse(r.detail)?.message ?? r.detail; } catch { /* brut */ }
      console.log(`    ${r.at}  ${m}`);
    }
  } else {
    console.log('  (aucun cycle en erreur journalisé)');
  }
}

// ── 9. LE BARÈME DES CLASSES VISÉES ──────────────────────────────────────
// « FORM 1 est sur 20 en ligne mais sur 100 en LAN » se lit ICI. Le barème d'un
// bulletin vient de `classes.grade_max` EN PREMIER (src/core/bulletinScale.js) ;
// à défaut seulement, il est déduit du système (EN → 100, FR → 20). Donc :
//   · grade_max = 100 en LAN et 20 au Cloud  → la correction n'est pas DESCENDUE ;
//   · grade_max identique des deux côtés      → ce n'est PAS la synchro, c'est la
//     VERSION du code installé : `bulletinScale.js` n'existe que depuis la 0.3.24,
//     avant quoi le barème était déduit de la seule langue (`sys === 'FR' ? 20 : 100`).
// La colonne `updated_at` dit quand la ligne a changé pour la dernière fois ici.
titre('9. BARÈME DES CLASSES VISÉES — la lecture qui tranche « 20 en ligne / 100 en LAN »');
console.log(`  classes demandées : ${CLASSES_VISEES.join(', ')}   (changer avec NC_CLASSES=…)`);
const toutes = all('SELECT id, name, system, grade_max, updated_at, version FROM classes ORDER BY name');
if (absent(toutes)) {
  console.log('  (table classes illisible)');
} else {
  const cibles = toutes.filter((c) => CLASSES_VISEES.some((n) => norm(c.name) === norm(n)));
  if (!cibles.length) {
    console.log('  AUCUNE classe ne porte un de ces noms. Classes présentes :');
    for (const c of toutes) console.log(`      ${c.name}`);
  }
  for (const c of cibles) {
    const g = db.prepare(`SELECT count(*) AS n, max(CAST(value AS REAL)) AS hi
      FROM grades WHERE class_id = ? AND value IS NOT NULL AND trim(value) <> ''`).get(c.id);
    const deduit = String(c.system || '').toUpperCase() === 'EN' ? 100 : 20;
    console.log(`    ${c.name}`);
    console.log(`        id                : ${c.id}`);
    console.log(`        système           : ${c.system}`);
    console.log(`        grade_max EN BASE : ${c.grade_max === null ? '(vide)' : c.grade_max}`);
    console.log(`        barème imprimé    : ${c.grade_max ?? deduit}`
      + (c.grade_max === null ? `   (déduit du système, car grade_max est vide)` : '   (lu dans grade_max)'));
    console.log(`        si code < 0.3.24  : ${deduit}   (déduit de la seule langue)`);
    console.log(`        dernière modif    : ${c.updated_at || '(jamais)'} · version ${c.version ?? '-'}`);
    console.log(`        notes saisies     : ${g.n} (la plus haute : ${g.hi ?? '—'})`);
    if (g.hi !== null && g.hi > 20 && Number(c.grade_max) === 20) {
      console.log('        <<< ATTENTION : des notes dépassent 20 alors que le barème annonce 20.');
    }
    // Une classe en attente de descente explique à elle seule le symptôme.
    const enAttente = one('SELECT attempts, last_error FROM sync_pull_retry WHERE tablename = ? AND row_id = ?', 'classes', String(c.id));
    if (!absent(enAttente) && enAttente.attempts) {
      console.log(`        <<< CETTE LIGNE EST EN ATTENTE DE DESCENTE : ${enAttente.attempts} tentative(s)`);
      if (enAttente.last_error) console.log(`            MOTIF : ${enAttente.last_error}`);
    }
    const enFile = one('SELECT count(*) AS n FROM sync_outbox WHERE tablename = ? AND row_id = ?', 'classes', String(c.id));
    if (Number(enFile.n) > 0) console.log(`        note : ${enFile.n} modification(s) locale(s) de cette classe attendent de MONTER`);
  }
}

titre('10. JUMELAGE / IDENTITÉ');
for (const r of all(`SELECT id, name FROM schools LIMIT 5`)) console.log(`  école : ${r.id}  ${r.name}`);
const v = one(`SELECT value FROM app_meta WHERE key = 'version'`);
if (v.value) console.log(`  version applicative : ${v.value}`);
console.log('  La version QUI COMPTE est celle du serveur en marche, pas celle de la base :');
console.log('      curl -s http://localhost:8080/api/version');
console.log('      curl -s http://localhost:8080/api/hybrid/status');

titre('CE QU\'IL FAUT RETENIR');
const diag = [];
if (!actif && !absent(flag)) diag.push('INTERRUPTEUR : cloud_sync n\'est pas à 1 — vérifiez NOTESCAM_CLOUD_SYNC dans systemd, sinon AUCUN cycle ne tourne et les deux sens sont muets');
if (!aJeton) diag.push('INTERRUPTEUR : le jeton serveur est absent — aucun cycle ne peut démarrer');
if (Number(ob.n) > 0 && ob.plus_ancien && (Date.now() - Date.parse(ob.plus_ancien)) > 2 * 86400000)
  diag.push('CAUSE 1 : la file de poussée est bloquée en tête — rien ne monte depuis ' + ob.plus_ancien);
const sansMaj = Number(one(`SELECT sum(CASE WHEN updated_at IS NULL OR trim(updated_at)='' THEN 1 ELSE 0 END) AS n FROM students`).n || 0);
if (sansMaj > 0) diag.push(`CAUSE 2 : ${sansMaj} élève(s) sans updated_at — le cloud les refuse sans le dire`);
if (!cur.length) diag.push('CAUSE 3 : aucun curseur de pull — le cycle s\'arrête avant la poussée');
if (pullAt && (Date.now() - (Date.parse(pullAt) || 0)) > 2 * 86400000)
  diag.push('CAUSE 3 : le curseur de descente est figé depuis ' + pullAt + ' — la descente n\'aboutit pas, donc la remontée n\'est jamais tentée');
if (!absent(pr) && pr.length) diag.push(`DESCENTE : ${pr.reduce((a, r) => a + Number(r.n || 0), 0)} ligne(s) du Cloud attendent d'entrer (section 6) — c'est littéralement « le changement en ligne n'arrive pas »`);
if (!absent(q) && q.length) diag.push(`QUARANTAINE : ${q.reduce((a, r) => a + Number(r.n || 0), 0)} entrée(s) écartée(s) de la file avec motif (section 7)`);
if (!diag.length) {
  console.log('  Aucune des causes connues n\'est visible dans la base.');
  console.log('  Envoyer la sortie complète + les journaux du service :');
  console.log('      sudo journalctl -u notescam --since "7 days ago" | grep -i "\\[sync\\]" | tail -100');
} else {
  for (const d of diag) console.log('  • ' + d);
  console.log('\n  RAPPEL DE L\'ENCHAÎNEMENT : le pull est joué AVANT le push, et son échec');
  console.log('  interrompt le cycle. Corriger la DESCENTE d\'abord ; la remontée repart');
  console.log('  souvent d\'elle-même ensuite, sans qu\'on y touche.');
}
console.log('\n  Ce script n\'a RIEN modifié : base ouverte en lecture seule, aucune file touchée.');
db.close();
