// Test — Verrou de licence node-locked (empreinte machine).
//
// Base jetable (NOTESCAM_DATA_DIR). Régression du bug terrain : sous Linux
// l'empreinte se calculait sur la 1ʳᵉ MAC remontée par os.networkInterfaces(),
// qui n'y liste que les interfaces déjà pourvues d'une IP. Serveur démarré
// avant le DHCP, docker0 qui apparaît -> empreinte différente au redémarrage,
// et la licence émise la veille POUR CETTE MACHINE était refusée. On vérifie
// donc qu'une clé liée à une empreinte historique du poste reste acceptée.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-lic-'));
process.env.NOTESCAM_DATA_DIR = dir;

const { machineFingerprint, machineFingerprints, verifyLicenseKey } = await import('./security.js');
const { signLicense } = await import('../packaging/license/sign-core.mjs');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

const FUTURE = '2099-01-01';
const key = (machine, expires = FUTURE) => signLicense({ school: 'Test', plan: 'ecole', expires, machine }).licenseKey;

// --- Empreintes -------------------------------------------------------
const fps = machineFingerprints();
ok(Array.isArray(fps) && fps.length >= 1, 'au moins une empreinte', fps);
ok(fps.every((f) => /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(f)), 'format A1B2-C3D4-E5F6-7890', fps);
ok(fps[0] === machineFingerprint(), 'la 1ʳᵉ empreinte est celle affichée', machineFingerprint());
ok(new Set(fps).size === fps.length, 'pas de doublon', fps);
ok(JSON.stringify(machineFingerprints()) === JSON.stringify(fps), 'stable d’un appel à l’autre');

// --- Verrou machine ---------------------------------------------------
ok(verifyLicenseKey(key(fps[0])).ok, 'clé liée à l’empreinte affichée -> acceptée');
ok(verifyLicenseKey(key(fps[fps.length - 1])).ok, 'clé liée à une empreinte historique du poste -> acceptée');
ok(verifyLicenseKey(key(null)).ok, 'clé sans verrou -> acceptée partout');

const other = verifyLicenseKey(key('AAAA-BBBB-CCCC-DDDD'));
ok(!other.ok && other.reason === 'machine_mismatch', 'clé d’un autre poste -> refusée', other.reason);
ok(other.payload?.machine_id === 'AAAA-BBBB-CCCC-DDDD', 'le refus expose l’empreinte attendue (diagnostic support)', other.payload);

// Un poste ne doit pas accepter une clé expirée, même bien verrouillée.
const old = verifyLicenseKey(key(fps[0], '2000-01-01'));
ok(!old.ok && old.reason === 'expired', 'clé expirée -> refusée même sur le bon poste', old.reason);

// Clé illisible / signée par une autre autorité.
ok(verifyLicenseKey('nimportequoi').reason === 'malformed', 'clé mal formée -> malformed');
const [p, s] = key(fps[0]).split('.');
ok(verifyLicenseKey(`${p}x.${s}`).reason !== null, 'payload altéré -> refusé');

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);
