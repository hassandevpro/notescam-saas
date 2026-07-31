// Test — Fondations OTA + garde de parité (server/updateService.js).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-upd-'));
process.env.NOTESCAM_DATA_DIR = dir;

const { db, DATA_DIR } = await import('./db.js');
const { setSetting } = await import('./syncFlag.js');
const { markVerification } = await import('./syncHealth.js');
const { currentVersion, checkUpdate, updateStatus, applyUpdate } = await import('./updateService.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'T');

// Edge check-update simulé : annonce 9.9.9 disponible.
const edgeAvail = async ({ version }) => ({ available: version !== '9.9.9', latest: { version: '9.9.9', mandatory: false, notes: 'test' } });
const edgeNone = async () => ({ available: false, latest: null });

ok(typeof currentVersion() === 'string' && currentVersion() !== '?', 'version courante lue', currentVersion());
ok((await checkUpdate({ edge: edgeAvail })).available === true, 'checkUpdate : nouvelle version détectée', null);
ok((await checkUpdate({ edge: edgeNone })).available === false, 'checkUpdate : à jour', null);

// Passe en hybride + DÉSYNCHRO connue → mise à jour interdite.
writeFileSync(join(DATA_DIR, 'server-token.key'), 'seal');
setSetting('cloud_sync', '1');
markVerification({ ok: false, at: new Date().toISOString(), mismatches: ['grades'] });

const st1 = await updateStatus({ edge: edgeAvail });
ok(st1.available === true && st1.allowed === false && st1.parity.desync === true, 'updateStatus : disponible mais BLOQUÉ (désynchro)', st1);
let threw = null; try { await applyUpdate({ edge: edgeAvail }); } catch (e) { threw = e; }
ok(threw && threw.blocked && /grades/.test(threw.message), 'applyUpdate BLOQUÉ en désynchro avec détail des tables', threw?.message);

// Parité rétablie → mise à jour autorisée (mode manuel : installeur externe).
markVerification({ ok: true, at: new Date().toISOString(), mismatches: [] });
const st2 = await updateStatus({ edge: edgeAvail });
ok(st2.allowed === true, 'updateStatus : autorisé après retour à la parité', st2);
const applied = await applyUpdate({ edge: edgeAvail });
ok(applied.ok === true && applied.mode === 'manual' && applied.to === '9.9.9', 'applyUpdate : mode manuel (fondations, installeur à brancher)', applied);
ok(applied.steps && ['download', 'verifySignature', 'install', 'restart'].every((s) => applied.steps[s]?.pending), 'applyUpdate : étapes enfichables en attente (extensible)', applied.steps);

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
