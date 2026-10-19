// Test — UNE LIGNE REFUSÉE PAR LE CLOUD NE DOIT PLUS DISPARAÎTRE DE LA FILE.
//
// Incident terrain (école GENIUS, octobre 2026) : 430 élèves au Cloud, plus de 700
// à l'école. `sync-push` renvoie 200 même quand il REFUSE des lignes (FK vers une
// classe absente, CHECK, périmètre) ; le serveur LAN lisait ce 200 comme un succès
// et purgeait son outbox en bloc. La ligne refusée quittait la file pour toujours,
// sans message. Seul `autoRepair` pouvait encore la rattraper — et il suffisait
// d'un HTTP 400 sur les tombstones pour qu'il ne tourne plus du tout.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-refus-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.NOTESCAM_PUSH_MAX_ATTEMPTS = '3';

const { db } = await import('./db.js');
const { syncOnce } = await import('./cloudSync.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'GENIUS');
db.prepare('INSERT INTO classes (id, school_id, name) VALUES (?,?,?)').run('cA', 'sch1', '6eme');
const nowIso = () => new Date().toISOString();
const addEleve = (id) => {
  db.prepare('INSERT INTO students (id, school_id, class_id, name, updated_at) VALUES (?,?,?,?,?)')
    .run(id, 'sch1', 'cA', id, nowIso());
  db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)')
    .run('students', id, 'upsert', nowIso());
};
addEleve('e-ok');       // accepté
addEleve('e-refuse');   // refusé par le Cloud (classe absente là-bas)

// Cloud qui ACCEPTE l'un et REFUSE l'autre, en renvoyant 200 — comme le vrai.
let recus = [];
const edge = async (path, body) => {
  if (path === 'sync-push') {
    recus = body.changes.map((c) => c.row.id);
    return {
      applied: 1, skipped: 1,
      rejected: [{ table: 'students', id: 'e-refuse', reason: 'insert or update on table "students" violates foreign key constraint "students_class_id_fkey"' }],
    };
  }
  if (path === 'sync-pull') return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
  throw new Error('path ' + path);
};

const reste = () => db.prepare('SELECT tablename, row_id, attempts, last_error FROM sync_outbox ORDER BY id').all();
const quarantaine = () => db.prepare('SELECT row_id, attempts, last_error FROM sync_outbox_quarantine').all();

await syncOnce({ edge });
ok(recus.includes('e-ok') && recus.includes('e-refuse'), '1. les deux élèves ont bien été envoyés', recus);
ok(!reste().some((r) => r.row_id === 'e-ok'), '2. l\'élève ACCEPTÉ est purgé de la file', reste());
const r1 = reste().find((r) => r.row_id === 'e-refuse');
ok(!!r1, '3. l\'élève REFUSÉ reste dans la file (plus de perte silencieuse)', reste());
ok(r1?.attempts === 1, '4. la tentative est comptée', r1?.attempts);
ok(/foreign key/i.test(r1?.last_error || ''), '5. le MOTIF du refus est conservé', r1?.last_error);

// Refus persistant → quarantaine au seuil, avec sa raison. Jamais un oubli muet.
await syncOnce({ edge });
await syncOnce({ edge });
ok(reste().length === 0, '6. la file ne garde pas indéfiniment un refus persistant', reste());
const q = quarantaine().find((x) => x.row_id === 'e-refuse');
ok(!!q, '7. l\'entrée part en QUARANTAINE (visible), pas à la poubelle', quarantaine());
ok(/foreign key/i.test(q?.last_error || ''), '8. la quarantaine porte le motif exact', q?.last_error);
ok(!!db.prepare("SELECT 1 FROM students WHERE id='e-refuse'").get(), '9. la DONNÉE reste en base (c\'est une entrée de file qu\'on écarte)', null);

// Cloud NON redéployé (pas de champ `rejected`) → comportement d'avant, sans régression.
addEleve('e-vieux-cloud');
const edgeAncien = async (path, body) => {
  if (path === 'sync-push') { recus = body.changes.map((c) => c.row.id); return { applied: 1, skipped: 0 }; }
  if (path === 'sync-pull') return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
  throw new Error('path ' + path);
};
await syncOnce({ edge: edgeAncien });
ok(!reste().some((r) => r.row_id === 'e-vieux-cloud'), '10. Cloud non redéployé : purge inchangée (rétrocompatible)', reste());

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
