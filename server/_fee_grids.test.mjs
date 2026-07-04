// Test HTTP de bout en bout : grilles tarifaires par classe + nouvelles colonnes
// student_fees (tranches/payment_mode/adjustments) via le VRAI serveur LAN.
// Valide notamment le round-trip des colonnes JSON (tableaux → TEXT → relecture).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-fees-'));
const PORT = 8124;
const BASE = `http://127.0.0.1:${PORT}`;

const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });
srv.on('exit', (code) => { if (code) srvLog += `\n[serveur sorti code ${code}]`; });

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

async function waitReady(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return true; } catch { /* pas prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt — log:\n' + srvLog.slice(-1500));
}

let token = '';
const db = (op) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(op),
}).then((r) => r.json());

// Le serveur LAN renvoie les colonnes JSON en CHAÎNE → on parse comme l'app.
const asArr = (v) => Array.isArray(v) ? v : JSON.parse(v || '[]');

try {
  await waitReady();

  const sign = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dir@ecole.test', password: 'secret123', full_name: 'Directeur' }),
  }).then((r) => r.json());
  token = sign?.data?.session?.access_token || '';
  ok(!!token, 'signup -> token', token ? '(token)' : sign);

  await db({ table: 'schools', action: 'insert', values: { id: 'sch1', name: 'École Test' } });
  await db({ table: 'classes', action: 'insert', values: { id: 'cls1', school_id: 'sch1', name: 'Terminale C', current_year: '2025-2026' } });
  await db({ table: 'students', action: 'insert', values: { id: 'stu1', school_id: 'sch1', class_id: 'cls1', name: 'Élève Un' } });

  // 1. Grille tarifaire avec tranches (colonne JSON).
  const tranches = [
    { id: 'insc', label: 'Inscription', amount: 100000, due_date: '2025-08-31' },
    { id: 't1', label: 'Tranche 1', amount: 200000, due_date: '2025-10-15' },
  ];
  const upG = await db({ table: 'class_fee_grids', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'grid1', school_id: 'sch1', class_id: 'cls1', academic_year: '2025-2026',
    amount_comptant: 600000, amount_echelonne: 650000, tranches,
  } });
  ok(!upG.error, 'upsert grille tarifaire sans erreur', upG.error);

  const selG = await db({ table: 'class_fee_grids', action: 'select', columns: '*', single: true,
    filters: [{ type: 'eq', col: 'id', val: 'grid1' }] });
  ok(selG?.data?.amount_comptant === 600000, 'tarif comptant persisté', selG?.data?.amount_comptant);
  const trRead = asArr(selG?.data?.tranches);
  ok(trRead.length === 2 && trRead[0].amount === 100000, 'tranches JSON round-trip', trRead);

  // 2. student_fees avec mode + instantané tranches + ajustements.
  const upF = await db({ table: 'student_fees', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'fee1', school_id: 'sch1', student_id: 'stu1', academic_year: '2025-2026',
    frais_annuels: 650000, frais_payes: 100000, payment_mode: 'echelonne',
    tranches, adjustments: [{ id: 'b1', type: 'bourse', label: 'Bourse', mode: 'percent', value: 10 }],
  } });
  ok(!upF.error, 'upsert student_fees (mode+tranches+ajustements) sans erreur', upF.error);

  const selF = await db({ table: 'student_fees', action: 'select', columns: '*', single: true,
    filters: [{ type: 'eq', col: 'id', val: 'fee1' }] });
  ok(selF?.data?.payment_mode === 'echelonne', 'payment_mode persisté', selF?.data?.payment_mode);
  ok(asArr(selF?.data?.tranches).length === 2, 'instantané tranches élève persisté', selF?.data?.tranches);
  ok(asArr(selF?.data?.adjustments)[0]?.type === 'bourse', 'ajustements persistés', selF?.data?.adjustments);

  // 3. Contrainte d'unicité (class_id, academic_year).
  const dup = await db({ table: 'class_fee_grids', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'grid2', school_id: 'sch1', class_id: 'cls1', academic_year: '2025-2026', amount_comptant: 1,
  } });
  ok(!!dup.error, 'doublon (class_id, academic_year) rejeté', dup.error ? '(rejeté)' : dup);
} catch (e) {
  console.error('Erreur test:', e.message); fail++;
} finally {
  await new Promise((resolve) => {
    if (srv.exitCode != null) return resolve();
    srv.once('exit', () => resolve());
    srv.kill();
    setTimeout(resolve, 2000);
  });
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL */ }
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
