// Test — Orchestrateur d'appairage LAN (parcours industrialisé Cloud → Hybride).
//
// Base jetable (NOTESCAM_DATA_DIR). Vérifie la machine à états FAIL-SAFE :
// bascule hybride UNIQUEMENT si appairage + sync + contrôles + admin réussissent ;
// à la moindre erreur, PAS d'activation hybride (on reste en Cloud).
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-pair-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db, DATA_DIR } = await import('./db.js');
const { getSetting, setSetting } = await import('./syncFlag.js');
const { attachViaPairing } = await import('./pairing.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// École présente localement (pour le contrôle verifyAttached par défaut).
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'École Test');

const TOKEN = join(DATA_DIR, 'server-token.key');
const hybridActivated = () => getSetting('cloud_sync') === '1';

// Réinitialise l'état entre les cas + compteur d'activation.
let enableCalls;
function reset() { setSetting('cloud_sync', '0'); enableCalls = 0; }
const spyEnable = async () => { enableCalls++; setSetting('cloud_sync', '1'); };
const okRedeem = async () => ({ token: 'seal-token-xyz', schoolId: 'sch1', cloudUrl: 'https://test.supabase.co' });
const noop = async () => {};
const goodAdmin = { email: 'admin@lan.test', password: 'secret123' };
// Contrôle d'intégrité injecté (hors-ligne) : par défaut « identique au Cloud ».
const okIntegrity = async () => ({ ok: true, mismatches: [] });

// ── A. Succès complet → hybride activé ────────────────────────────────────────
reset();
{
  const r = await attachViaPairing({ code: 'AAAAA-BBBBB', localAdmin: goodAdmin },
    { redeem: okRedeem, initialSync: noop, enableHybrid: spyEnable, verifyIntegrity: okIntegrity });
  ok(r.ok === true && r.hybrid === true && r.stage === 'done', 'A: succès complet → ok+hybride', r);
  ok(enableCalls === 1, 'A: enableHybrid appelé exactement une fois', enableCalls);
  ok(hybridActivated(), 'A: cloud_sync = 1 (hybride actif)', getSetting('cloud_sync'));
  ok(existsSync(TOKEN), 'A: jeton scellé écrit', existsSync(TOKEN));
  ok(r.integrity?.school === 'École Test', 'A: contrôle intégrité renvoyé', r.integrity);
}

// ── B. Échec APPAIRAGE → aucune bascule, aucun effet ──────────────────────────
reset();
{
  const r = await attachViaPairing({ code: 'BAD', localAdmin: goodAdmin },
    { redeem: async () => { throw new Error('code invalide'); }, initialSync: noop, enableHybrid: spyEnable });
  ok(r.ok === false && r.stage === 'redeem', 'B: échec appairage → stage redeem', r);
  ok(enableCalls === 0, 'B: enableHybrid JAMAIS appelé', enableCalls);
  ok(!hybridActivated(), 'B: reste en Cloud (cloud_sync ≠ 1)', getSetting('cloud_sync'));
}

// ── C. Échec SYNCHRONISATION initiale → pas de bascule ────────────────────────
reset();
{
  const r = await attachViaPairing({ code: 'AAAAA-BBBBB', localAdmin: goodAdmin },
    { redeem: okRedeem, initialSync: async () => { throw new Error('réseau'); }, enableHybrid: spyEnable });
  ok(r.ok === false && r.stage === 'sync', 'C: échec sync → stage sync', r);
  ok(enableCalls === 0, 'C: enableHybrid JAMAIS appelé', enableCalls);
  ok(!hybridActivated(), 'C: reste en Cloud', getSetting('cloud_sync'));
}

// ── D. Échec CONTRÔLE (école absente localement) → pas de bascule ─────────────
reset();
{
  const r = await attachViaPairing({ code: 'AAAAA-BBBBB', localAdmin: goodAdmin },
    { redeem: async () => ({ token: 't', schoolId: 'ghost', cloudUrl: null }), initialSync: noop, enableHybrid: spyEnable });
  ok(r.ok === false && r.stage === 'verify', 'D: contrôle échoué → stage verify', r);
  ok(enableCalls === 0, 'D: enableHybrid JAMAIS appelé', enableCalls);
}

// ── E. Échec ADMIN LOCAL (mot de passe trop court) → pas de bascule ───────────
reset();
{
  const r = await attachViaPairing({ code: 'AAAAA-BBBBB', localAdmin: { email: 'a@b.c', password: '123' } },
    { redeem: okRedeem, initialSync: noop, enableHybrid: spyEnable, verifyIntegrity: okIntegrity });
  ok(r.ok === false && r.stage === 'admin', 'E: admin local invalide → stage admin', r);
  ok(enableCalls === 0, 'E: enableHybrid JAMAIS appelé', enableCalls);
}

// ── F. Échec ACTIVATION → retour Cloud sûr (cloud_sync remis à 0) ─────────────
reset();
{
  const r = await attachViaPairing({ code: 'AAAAA-BBBBB', localAdmin: goodAdmin },
    { redeem: okRedeem, initialSync: noop, enableHybrid: async () => { throw new Error('sync KO'); }, verifyIntegrity: okIntegrity });
  ok(r.ok === false && r.stage === 'activate' && r.hybrid === false, 'F: activation échouée → stage activate, hybride false', r);
  ok(!hybridActivated(), 'F: cloud_sync remis à 0 (fail-safe)', getSetting('cloud_sync'));
}

// ── H. Données NON IDENTIQUES au Cloud → pas de bascule (stage integrity) ──────
reset();
{
  const mismatch = async () => {
    const e = new Error('Données non identiques au Cloud : 2 table(s) divergente(s) (grades, students).');
    e.report = { ok: false, mismatches: ['grades', 'students'] };
    throw e;
  };
  const r = await attachViaPairing({ code: 'AAAAA-BBBBB', localAdmin: goodAdmin },
    { redeem: okRedeem, initialSync: noop, enableHybrid: spyEnable, verifyIntegrity: mismatch });
  ok(r.ok === false && r.stage === 'integrity' && r.hybrid === false, 'H: intégrité divergente → stage integrity, pas de bascule', r);
  ok(enableCalls === 0, 'H: enableHybrid JAMAIS appelé', enableCalls);
  ok(Array.isArray(r.report?.mismatches) && r.report.mismatches.includes('grades'), 'H: rapport des tables divergentes renvoyé', r.report);
  ok(!hybridActivated(), 'H: reste en Cloud', getSetting('cloud_sync'));
}

// ── G. Code vide → refus immédiat ─────────────────────────────────────────────
reset();
{
  const r = await attachViaPairing({ code: '  ', localAdmin: goodAdmin }, { redeem: okRedeem, enableHybrid: spyEnable });
  ok(r.ok === false && r.stage === 'redeem', 'G: code vide → refus (stage redeem)', r);
  ok(enableCalls === 0, 'G: enableHybrid JAMAIS appelé', enableCalls);
}

console.log(`\n=== ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
