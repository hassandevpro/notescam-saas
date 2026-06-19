// Test bout-en-bout — synchronisation continue LAN ↔ Cloud (Phase 2).
//
// Sans réseau : transport edge INJECTÉ (stub). Base jetable via NOTESCAM_DATA_DIR.
// Vérifie : push des changements locaux, pull avec résolution LWW (le plus récent
// gagne), suppression via tombstone, ANTI-ÉCHO (les lignes distantes appliquées
// ne réalimentent pas l'outbox), avancée du curseur.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-sync-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { syncOnce, remoteWins } = await import('./cloudSync.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };
const OLD = '2025-01-01T00:00:00.000Z', MID = '2025-06-01T00:00:00.000Z', NEW = '2025-12-01T00:00:00.000Z';

// --- Seed local (direct = sans outbox) --------------------------------
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('clsX', 'sch1', 'Classe X');
db.prepare('INSERT INTO students (id, school_id, class_id, name, updated_at) VALUES (?,?,?,?,?)').run('stuOld', 'sch1', 'clsX', 'Ancien local', OLD);
db.prepare('INSERT INTO students (id, school_id, class_id, name, updated_at) VALUES (?,?,?,?,?)').run('stuLocal', 'sch1', 'clsX', 'Récent local', NEW);
db.prepare('INSERT INTO students (id, school_id, class_id, name, updated_at) VALUES (?,?,?,?,?)').run('stuDel', 'sch1', 'clsX', 'À supprimer', OLD);

// --- Changement LOCAL via runQuery (alimente l'outbox → doit être poussé) ---
runQuery({ table: 'classes', action: 'upsert', onConflict: 'id', values: { id: 'cls1', school_id: 'sch1', name: '6e A' } });
ok(db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n === 1, 'changement local empilé dans l\'outbox', db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n);

// --- Transport edge stub ----------------------------------------------
const pushReceived = [];
const edge = async (path, body) => {
  if (path === 'sync-pull') {
    return {
      rows: {
        students: [
          { id: 'stuRemote', school_id: 'sch1', class_id: 'clsX', name: 'Nouveau distant', updated_at: '2025-11-01T00:00:00.000Z' },
          { id: 'stuOld',    school_id: 'sch1', class_id: 'clsX', name: 'Mis à jour distant', updated_at: '2025-11-15T00:00:00.000Z' },
          { id: 'stuLocal',  school_id: 'sch1', class_id: 'clsX', name: 'Distant plus ancien', updated_at: MID },
        ],
      },
      tombstones: [{ tablename: 'students', row_id: 'stuDel', deleted_at: MID }],
      cursor: '2025-11-15T00:00:00.000Z',
      tomb_cursor: MID,
    };
  }
  if (path === 'sync-push') { pushReceived.push(...body.changes); return { applied: body.changes.length }; }
  throw new Error('path inattendu ' + path);
};

// --- Synchronisation -------------------------------------------------
const res = await syncOnce({ edge });
ok(res.pulled === 3 && res.pushed === 1, 'syncOnce : 3 tirés, 1 poussé', res);

// PULL + LWW
const get = (id) => db.prepare('SELECT * FROM students WHERE id = ?').get(id);
ok(get('stuRemote')?.name === 'Nouveau distant', 'pull : nouvelle ligne distante insérée', get('stuRemote'));
ok(get('stuOld')?.name === 'Mis à jour distant', 'LWW : distant plus récent écrase le local', get('stuOld')?.name);
ok(get('stuLocal')?.name === 'Récent local', 'LWW : local plus récent CONSERVÉ', get('stuLocal')?.name);
ok(!get('stuDel'), 'tombstone : ligne supprimée localement', get('stuDel'));

// PUSH + ANTI-ÉCHO : seul le changement local (cls1) est envoyé, pas les lignes
// distantes ré-appliquées (sinon boucle infinie).
ok(pushReceived.length === 1 && pushReceived[0].row.id === 'cls1', 'push : seul le vrai changement local est envoyé (anti-écho)', pushReceived.map((c) => c.row.id));
ok(db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n === 0, 'outbox vidé après push', db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n);

// CURSEUR
ok(db.prepare("SELECT value FROM sync_cursor WHERE name='pull_at'").get()?.value === '2025-11-15T00:00:00.000Z', 'curseur de tirage avancé', db.prepare("SELECT value FROM sync_cursor WHERE name='pull_at'").get()?.value);

// DELETE local → tombstone poussé au prochain cycle
runQuery({ table: 'students', action: 'delete', filters: [{ col: 'id', op: 'eq', val: 'stuRemote' }] });
const res2 = await syncOnce({ edge });
ok(pushReceived.some((c) => c.op === 'delete' && c.row.id === 'stuRemote'), 'suppression locale propagée (tombstone poussé)', pushReceived.filter((c) => c.op === 'delete'));

// --- remoteWins (unitaire) -------------------------------------------
ok(remoteWins({ updated_at: OLD }, { updated_at: NEW }) === true, 'remoteWins : distant plus récent gagne');
ok(remoteWins({ updated_at: NEW }, { updated_at: OLD }) === false, 'remoteWins : local plus récent gagne');
ok(remoteWins({ updated_at: NEW, device_id: 'a' }, { updated_at: NEW, device_id: 'b' }) === true, 'remoteWins : départage par device_id');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(fail === 0 ? 0 : 1);
