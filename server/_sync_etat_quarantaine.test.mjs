// LE COMPTEUR « LIGNES REFUSÉES PAR LE CLOUD » COMPTE DES LIGNES, PAS DES ENTRÉES
//
// Constat du 2026-11-04 : le Cloud affichait « 181 253 lignes de l'école sont refusées ». Le
// compteur était un COUNT(*) de `sync_outbox_quarantine`, une table qui ne se vide jamais :
//   • une même ligne refusée, réenfilée par la réparation, refusée de nouveau y compte N fois ;
//   • une ligne ACTUELLEMENT réenfilée est déjà comptée en file d'attente.
//
// CE QUE CE TEST INTERDIT AUSSI : retirer une ligne du compteur d'après `sync_shadow`. L'ombre
// d'une ligne refusée était posée dans le cycle même de sa mise en quarantaine (défaut corrigé
// dans cloudSync.js, gardé par _sync_cadence.test.mjs) : un tel critère aurait affiché ~0 et
// masqué le vrai problème.
//
// Rien n'est supprimé de la quarantaine : la trace reste entière (`quarantinedBrut`).
//
// Lancer : node server/_sync_etat_quarantaine.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'nc-etat-'));
process.env.NOTESCAM_DATA_DIR = DIR;
process.env.NOTESCAM_DISABLE_SYNC = '1';

const { db } = await import('./db.js');
const { compteursSynchro } = await import('./syncEtat.js');

let ko = 0;
const ok = (c, msg, extra) => { console.log(`${c ? '✅' : '❌'} ${msg}${c || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`); if (!c) ko++; };

const quar = db.prepare(`INSERT INTO sync_outbox_quarantine
  (tablename, row_id, op, at, attempts, last_error, quarantined_at) VALUES (?,?,?,?,?,?,?)`);
const ombre = db.prepare('INSERT OR REPLACE INTO sync_shadow (tablename, row_id, row_json, at) VALUES (?,?,?,?)');
const file = db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at, attempts) VALUES (?,?,?,?,?)');
const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-02T10:00:00.000Z';

try {
  db.exec('DELETE FROM sync_outbox_quarantine; DELETE FROM sync_shadow; DELETE FROM sync_outbox;');

  ok(compteursSynchro().quarantined === 0, 'aucune entrée → 0 refusée');

  // 1. Une même ligne refusée 40 fois = UNE ligne.
  for (let i = 0; i < 40; i++) quar.run('grades', 'a1', 'upsert', T0, 8, 'PGRST204', T0);
  ok(compteursSynchro().quarantined === 1, '40 entrées pour la même ligne → 1 ligne refusée', compteursSynchro());
  ok(compteursSynchro().quarantinedBrut === 40, 'le brut reste visible : 40 entrées (la trace n\'est pas effacée)', compteursSynchro());

  // 2. Deux lignes différentes = deux lignes.
  quar.run('grades', 'a2', 'upsert', T0, 8, 'PGRST204', T0);
  ok(compteursSynchro().quarantined === 2, 'deux lignes distinctes → 2');

  // 3. L'OMBRE NE RÉSOUT RIEN, qu'elle soit antérieure ou postérieure à la mise de côté.
  quar.run('student_fees', 'b1', 'upsert', T0, 8, 'duplicate key', T0);
  ombre.run('student_fees', 'b1', '{}', T1);
  quar.run('student_fees', 'c1', 'upsert', T1, 8, 'duplicate key', T1);
  ombre.run('student_fees', 'c1', '{}', T0);
  ok(compteursSynchro().quarantined === 4,
    'une ombre, postérieure ou non, ne retire aucune ligne du compteur', compteursSynchro());

  // 4. Une ligne actuellement réenfilée est « en attente », pas « refusée » : pas comptée deux fois.
  quar.run('students', 'd1', 'upsert', T0, 8, 'RLS', T0);
  file.run('students', 'd1', 'upsert', T1, 0);
  ok(compteursSynchro().quarantined === 4, 'une ligne réenfilée (la réparation s\'en occupe) n\'est pas comptée deux fois');
  ok(compteursSynchro().pending === 1, 'elle est comptée en attente');

  // 5. Si elle sort de la file sans avoir été acceptée (refusée de nouveau), elle revient au compteur.
  db.exec('DELETE FROM sync_outbox;');
  ok(compteursSynchro().quarantined === 5, 'sortie de la file sans accord → de nouveau refusée');
} finally {
  try { db.close(); } catch { /* */ }
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* */ }
}

console.log(ko ? `\n❌ ${ko} échec(s)` : '\n✅ Tous les contrôles passent');
process.exit(ko ? 1 : 0);
