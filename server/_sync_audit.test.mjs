// Test — Journal d'audit persistant de la synchro (server/syncAudit.js).
// Vérifie l'enregistrement, la lecture (plus récent d'abord) et le caractère
// best-effort (ne lève jamais). Base jetable.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-audit-'));

const { recordSyncAudit, listSyncAudit } = await import('./syncAudit.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

recordSyncAudit({ kind: 'sync', pushed: 3, pulled: 10, deleted: 1, duration_ms: 42, ok: true });
recordSyncAudit({ kind: 'error', ok: false, detail: { message: 'réseau' } });
recordSyncAudit({ kind: 'verify', ok: false, detail: { trigger: 'ondemand', mismatches: ['grades'] } });

const rows = listSyncAudit(10);
ok(rows.length === 3, 'trois entrées enregistrées', rows.length);
ok(rows[0].kind === 'verify', 'plus récent d’abord', rows[0]?.kind);
ok(rows[0].ok === 0 && rows[0].detail.mismatches.includes('grades'), 'détail verify désérialisé', rows[0]);
const sync = rows.find((r) => r.kind === 'sync');
ok(sync.pushed === 3 && sync.pulled === 10 && sync.deleted === 1 && sync.duration_ms === 42, 'métriques de cycle persistées', sync);

// Best-effort : une entrée malformée ne lève pas.
let threw = false;
try { recordSyncAudit(undefined); } catch { threw = true; }
ok(!threw, 'recordSyncAudit ne lève jamais', threw);

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
