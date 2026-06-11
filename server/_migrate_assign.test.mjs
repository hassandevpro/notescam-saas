// Vérifie la MIGRATION d'une base LAN déjà installée (ancien schéma sans
// classes.teacher_id) : ensureColumn doit ajouter les colonnes au démarrage,
// sinon les écoles existantes garderaient le bug après mise à jour.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-mig-'));
const dbPath = join(dir, 'notescam.db');

// 1) Fabrique une base "ancienne" : classes SANS cycle/teacher_id/max_students.
{
  const old = new DatabaseSync(dbPath);
  old.exec(`CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT NOT NULL);`);
  old.exec(`CREATE TABLE classes (
    id TEXT PRIMARY KEY, school_id TEXT NOT NULL, name TEXT NOT NULL,
    level TEXT, section TEXT, system TEXT, current_year TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  old.exec(`INSERT INTO schools (id,name) VALUES ('sch1','École');`);
  old.exec(`INSERT INTO classes (id,school_id,name) VALUES ('cls1','sch1','3ème');`);
  const cols = old.prepare(`PRAGMA table_info(classes)`).all().map((r) => r.name);
  console.log('avant migration, colonnes classes:', cols.join(', '));
  old.close();
}

// 2) Démarre le serveur sur cette base -> ensureColumn s'exécute à l'import.
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

// 3) La classe existante est conservée ; teacher_id désormais assignable.
const r = runQuery({ table: 'classes', action: 'update', values: { teacher_id: 'tch1', cycle: 'secondaire', max_students: 30 },
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] });
ok(!r.error, "update teacher_id sur classe existante sans erreur", r.error);

const cls = runQuery({ table: 'classes', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] }).data;
ok(cls && cls.name === '3ème', 'données existantes préservées par la migration', cls?.name);
ok(cls && cls.teacher_id === 'tch1', 'colonne teacher_id ajoutée et persistée', cls?.teacher_id);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé */ }
process.exit(fail === 0 ? 0 : 1);
