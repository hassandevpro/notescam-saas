// Test — Garde de parité + sauvegarde d'urgence (server/parityGate.js, backup.js).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-parity-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.NOTESCAM_BACKUP_DIR = join(dir, 'bk');

const { db, DATA_DIR } = await import('./db.js');
const { setSetting } = await import('./syncFlag.js');
const { markVerification } = await import('./syncHealth.js');
const { parityStatus, parityOk, assertParity } = await import('./parityGate.js');
const { runBackup, listBackups } = await import('./backup.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'T');

// (1) Non hybride → aucune garde.
ok(parityOk() === true && parityStatus().applicable === false, 'non hybride : parité non applicable (pas de garde)', parityStatus());

// Passe en hybride (jeton scellé + drapeau).
writeFileSync(join(DATA_DIR, 'server-token.key'), 'seal');
setSetting('cloud_sync', '1');

// (2) Aucun contrôle encore → on ne bloque pas (inconnu ≠ désynchro).
ok(parityOk() === true, 'hybride sans contrôle : pas de blocage (état inconnu)', parityStatus());

// (3) Désynchro CONNUE → blocage + message explicite.
markVerification({ ok: false, at: new Date().toISOString(), mismatches: ['grades', 'fee_payments'], mismatchLabels: ['Notes', 'Paiements'] });
const st = parityStatus();
ok(st.desync === true && st.ok === false, 'désynchro connue : parité KO', st);
let threw = null; try { assertParity('Mise à jour'); } catch (e) { threw = e; }
ok(threw && threw.blocked && /grades/.test(threw.message) && !/^Erreur$/.test(threw.message), 'assertParity bloque avec le détail des tables (jamais « Erreur »)', threw?.message);

// (4) Sauvegarde pendant désynchro → AUTORISÉE mais marquée urgence.
const b1 = await runBackup();
ok(b1.emergency === true && /urgence/i.test(b1.label) && /-URGENCE\.db$/.test(b1.path), 'sauvegarde d\'urgence marquée (autorisée, non bloquée)', b1);
ok(listBackups().some((x) => x.emergency && /Synchronisation incomplète/.test(x.label)), 'listBackups signale la sauvegarde d\'urgence', listBackups());

// (5) Retour à la parité → plus de blocage, sauvegarde normale.
markVerification({ ok: true, at: new Date().toISOString(), mismatches: [] });
ok(parityOk() === true, 'parité rétablie : plus de blocage', parityStatus());
let threw2 = false; try { assertParity('Mise à jour'); } catch { threw2 = true; }
ok(!threw2, 'assertParity ne bloque plus', threw2);
const b2 = await runBackup();
ok(b2.emergency === false && !/-URGENCE/.test(b2.path), 'sauvegarde normale hors désynchro', b2);

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
