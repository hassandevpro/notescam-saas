// Test — Tableau de bord de santé de la synchro (server/syncMetrics.js).
// Vérifie : événements en attente (backlog outbox), temps moyen de réplication,
// et l'absence de faux « bloqué » quand une synchro vient de réussir.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-metrics-'));

const { db } = await import('./db.js');
const { setSetting } = await import('./syncFlag.js');
const { recordSyncAudit } = await import('./syncAudit.js');
const { markSyncStart, markSyncSuccess, markVerification } = await import('./syncHealth.js');
const { syncMetrics } = await import('./syncMetrics.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

setSetting('cloud_sync', '1'); // hybride activé

// Backlog : 3 événements en attente de push.
for (let i = 0; i < 3; i++) db.prepare('INSERT INTO sync_outbox (tablename, row_id, op, at) VALUES (?,?,?,?)').run('grades', 'g' + i, 'upsert', new Date().toISOString());

// Deux cycles réussis mesurés + un succès récent (santé en mémoire).
recordSyncAudit({ kind: 'sync', pushed: 2, pulled: 5, deleted: 0, duration_ms: 100, ok: true });
recordSyncAudit({ kind: 'sync', pushed: 1, pulled: 0, deleted: 0, duration_ms: 300, ok: true });
markSyncStart();
markSyncSuccess({ pushed: 1, pulled: 0 });

const m = syncMetrics();
ok(m.enabled === true, 'hybride activé', m.enabled);
ok(m.pendingEvents === 3, 'événements en attente = 3 (backlog outbox)', m.pendingEvents);
ok(m.avgReplicationMs === 200, 'temps moyen de réplication = (100+300)/2 = 200 ms', m.avgReplicationMs);
ok(m.stuck === false, 'non bloquée (succès récent)', m);
ok(m.lastSuccessAgeMs != null && m.lastSuccessAgeMs < 5000, 'âge du dernier succès cohérent', m.lastSuccessAgeMs);

// Le rapport de synchro AUTOMATIQUE est exposé via /api/sync/health (lastReport).
markVerification({ ok: false, at: new Date().toISOString(), mismatches: ['grades'], mismatchLabels: ['Notes'], dashboard: [{ key: 'grades', label: 'Notes', lan: 10, cloud: 11, match: false }], globalChecksum: { lan: 'aaaa', cloud: 'bbbb', match: false }, summary: { total: 54, mismatched: 1 } });
const m2 = syncMetrics();
ok(m2.lastReport && m2.lastReport.ok === false, 'lastReport publié dans /api/sync/health', m2.lastReport?.ok);
ok(m2.lastReport.globalChecksum.match === false && m2.lastReport.mismatchLabels.includes('Notes'), 'lastReport porte empreinte globale + libellés', m2.lastReport);

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
