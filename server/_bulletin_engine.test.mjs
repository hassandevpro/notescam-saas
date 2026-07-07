// Vérifie que la bascule du moteur de bulletin persiste côté serveur LAN
// (régression: schools.bulletin_engine / classes.serie / classes.bulletin_engine
// étaient avalés par pickColumns faute de colonne -> le choix « Officiel Cameroun »
// ne se sauvegardait pas et le moteur ne basculait jamais).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-engine-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };

// École créée en 'classic' par défaut, puis bascule sur 'officiel' comme le fait
// l'écran Paramètres (authStore.updateSchool).
must({ table: 'schools', action: 'insert', values: { id: 'sch1', name: 'École' } });
let sch = must({ table: 'schools', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'sch1' }] }).data;
ok(sch.bulletin_engine === 'classic', 'école : moteur par défaut = classic', sch.bulletin_engine);

must({ table: 'schools', action: 'update', values: { bulletin_engine: 'officiel' },
  filters: [{ type: 'eq', col: 'id', val: 'sch1' }] });
sch = must({ table: 'schools', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'sch1' }] }).data;
ok(sch.bulletin_engine === 'officiel', 'école : bascule « Officiel Cameroun » persistée', sch.bulletin_engine);

// Classe lycée : série + surcharge de moteur persistées.
must({ table: 'classes', action: 'upsert', onConflict: 'id', values: {
  id: 'cls1', school_id: 'sch1', name: 'Terminale C', level: 'Terminale C',
  serie: 'C', bulletin_engine: 'minesec', system: 'FR', current_year: '2025-2026',
} });
const cls = must({ table: 'classes', action: 'select', columns: '*', single: true,
  filters: [{ type: 'eq', col: 'id', val: 'cls1' }] }).data;
ok(cls.serie === 'C', 'classe : série lycée persistée', cls.serie);
ok(cls.bulletin_engine === 'minesec', 'classe : surcharge de moteur persistée', cls.bulletin_engine);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé sous Windows */ }
process.exit(fail === 0 ? 0 : 1);
