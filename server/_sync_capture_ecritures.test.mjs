// Test — AUCUNE ÉCRITURE NE CONTOURNE PLUS LA FILE DE POUSSÉE.
//
// LE DÉFAUT, MESURÉ LE 01/11/2026. `recordOutbox()` n'était appelé que par
// `query.js`. Or `server/rpc.js` écrit EN DIRECT, par `db.prepare(...).run()`,
// dans HUIT tables synchronisées, sur 32 emplacements — et n'enfilait RIEN.
// Une classe créée par RPC, un enseignant renommé, un rôle de gouvernance
// attribué : rien n'entrait dans la file. Ces changements ne remontaient au
// Cloud que si l'audit Merkle finissait par les remarquer — tard, ou jamais.
//
// C'était la DEUXIÈME cause structurelle de « mes modifications ne remontent
// pas », distincte de l'engorgement (I35) : l'une retardait la file, l'autre
// n'y mettait rien.
//
// La capture est posée en base, par déclencheur, et non dans les 32 appels :
// corriger les appels laisserait le trou ouvert pour le 33e.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-capture-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db, sansEcho } = await import('./db.js');
const { rawUpsert } = await import('./cloudSync.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
const enFile = (table, id) => db.prepare(
  'SELECT op FROM sync_outbox WHERE tablename = ? AND row_id = ?').get(table, String(id))?.op;
const viderFile = () => db.prepare('DELETE FROM sync_outbox').run();

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'GENIUS');
viderFile();

// ── 1. Une écriture DIRECTE, comme rpc.js en fait 32 ──────────────────────
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('c1', 'sch1', '6e');
ok(enFile('classes', 'c1') === 'upsert',
  '1. un INSERT direct (hors query.js) entre dans la file', enFile('classes', 'c1'));

// ── 2. Un UPDATE direct aussi ─────────────────────────────────────────────
viderFile();
db.prepare('UPDATE classes SET name = ? WHERE id = ?').run('6e B', 'c1');
ok(enFile('classes', 'c1') === 'upsert',
  '2. un UPDATE direct entre dans la file', enFile('classes', 'c1'));

// ── 3. Un DELETE direct part en « delete », pas en « upsert » ─────────────
viderFile();
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('c2', 'sch1', '5e');
db.prepare('DELETE FROM classes WHERE id = ?').run('c2');
ok(enFile('classes', 'c2') === 'delete',
  '3. une suppression directe s’enfile comme suppression', enFile('classes', 'c2'));

// ── 4. L'ANTI-ÉCHO : appliquer une ligne du Cloud ne la renvoie PAS ───────
// Sans cette garde, chaque ligne descendue repartirait aussitôt vers le
// Cloud : une boucle sans fin, et une file qui se remplit toute seule.
viderFile();
rawUpsert('classes', { id: 'c3', school_id: 'sch1', name: 'Venue du Cloud',
  updated_at: new Date().toISOString() });
const existe = db.prepare("SELECT name FROM classes WHERE id = 'c3'").get()?.name;
ok(existe === 'Venue du Cloud', '4. la ligne distante est bien écrite en base', existe);
ok(enFile('classes', 'c3') === undefined,
  '5. …mais elle n’est PAS renvoyée au Cloud (anti-écho)', enFile('classes', 'c3'));

// ── 6. Le drapeau d'écho se relève même si l'écriture échoue ──────────────
// S'il restait levé, la synchronisation cesserait silencieusement d'enfiler
// QUOI QUE CE SOIT — une panne bien pire que celle qu'on corrige.
try { sansEcho(() => { throw new Error('échec simulé'); }); } catch { /* attendu */ }
viderFile();
db.prepare('UPDATE classes SET name = ? WHERE id = ?').run('6e C', 'c1');
ok(enFile('classes', 'c1') === 'upsert',
  '6. une erreur sous sansEcho() ne laisse pas la capture éteinte', enFile('classes', 'c1'));

// ── 7. Les déclencheurs couvrent les tables synchronisées, pas les autres ─
const avecDeclencheur = new Set(db.prepare(
  "SELECT DISTINCT tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_outbox_%'")
  .all().map((r) => r.tbl_name));
ok(avecDeclencheur.has('classes') && avecDeclencheur.has('students')
  && avecDeclencheur.has('fee_payments'),
  '7. les tables synchronisées portent la capture', [...avecDeclencheur].length);
ok(!avecDeclencheur.has('sync_outbox') && !avecDeclencheur.has('license_activation'),
  '8. les tables locales ne la portent PAS', {
    outbox: avecDeclencheur.has('sync_outbox'),
    licence: avecDeclencheur.has('license_activation'),
  });

// ── 9. Deux écritures de suite laissent UNE entrée (I35 tient) ────────────
viderFile();
for (let i = 0; i < 50; i++) db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(`n${i}`, 'c1');
const n = db.prepare("SELECT COUNT(*) n FROM sync_outbox WHERE row_id = 'c1'").get().n;
ok(n === 1, '9. 50 écritures de la même ligne = une entrée (la file ne regonfle pas)', n);

console.log('');
console.log(`=== ${fail ? 'KO' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
