// Vérifie que l'affectation d'enseignant persiste côté serveur LAN
// (régression: classes.teacher_id / subjects.teacher_id étaient avalés par
// pickColumns faute de colonne -> l'assignation disparaissait au rechargement).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-assign-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };

must({ table: 'schools',  action: 'insert', values: { id: 'sch1', name: 'École' } });
must({ table: 'teachers', action: 'insert', values: { id: 'tch1', school_id: 'sch1', name: 'M. Atangana' } });

// Création + assignation du titulaire et de la matière, comme l'UI Classes.
must({ table: 'classes', action: 'upsert', onConflict: 'id', values: {
  id: 'cls1', school_id: 'sch1', name: 'Terminale C', level: 'Terminale C',
  system: 'FR', cycle: 'secondaire', current_year: '2025-2026',
  teacher_id: 'tch1', max_students: 40,
} });
must({ table: 'subjects', action: 'upsert', onConflict: 'id', values: {
  id: 'sub1', school_id: 'sch1', class_id: 'cls1', name: 'Maths', coef: 4, max: 20, teacher_id: 'tch1',
} });

// Relecture serveur (= ce que fait fetchClasses au rechargement de l'app).
const cls = must({ table: 'classes', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] }).data;
ok(cls.teacher_id === 'tch1', 'classe : titulaire persisté après relecture', cls.teacher_id);
ok(cls.cycle === 'secondaire', 'classe : cycle persisté', cls.cycle);
ok(cls.max_students === 40, 'classe : max_students persisté', cls.max_students);

const sub = must({ table: 'subjects', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'sub1' }] }).data;
ok(sub.teacher_id === 'tch1', 'matière : enseignant persisté après relecture', sub.teacher_id);

// Réassignation (changement de prof) puis retrait (null).
must({ table: 'teachers', action: 'insert', values: { id: 'tch2', school_id: 'sch1', name: 'Mme Nkolo' } });
must({ table: 'classes', action: 'update', values: { teacher_id: 'tch2' },
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] });
let c2 = must({ table: 'classes', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] }).data;
ok(c2.teacher_id === 'tch2', 'classe : réassignation persistée', c2.teacher_id);

must({ table: 'classes', action: 'update', values: { teacher_id: null },
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] });
c2 = must({ table: 'classes', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] }).data;
ok(c2.teacher_id === null, 'classe : retrait du titulaire persisté (null)', c2.teacher_id);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé sous Windows */ }
process.exit(fail === 0 ? 0 : 1);
