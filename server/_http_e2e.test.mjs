// Test HTTP de bout en bout sur le VRAI serveur LAN (Fastify + auth JWT +
// /api/db). Démarre le serveur en sous-processus sur une base jetable, rejoue
// le parcours UI (signup -> créer prof -> créer classe avec titulaire ->
// relire), puis l'arrête. Valide la chaîne complète, pas juste runQuery.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-http-'));
const PORT = 8123;
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

async function waitReady(ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return true; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt — log serveur:\n' + srvLog.slice(-1500));
}

let token = '';
const db = (op) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(op),
}).then((r) => r.json());

try {
  await waitReady();

  // Signup -> token
  const sign = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dir@ecole.test', password: 'secret123', full_name: 'Directeur' }),
  }).then((r) => r.json());
  token = sign?.data?.session?.access_token || '';
  ok(!!token, 'signup -> token JWT obtenu', token ? '(token)' : sign);

  // École + enseignant
  await db({ table: 'schools',  action: 'insert', values: { id: 'sch1', name: 'École Test' } });
  await db({ table: 'teachers', action: 'insert', values: { id: 'tch1', school_id: 'sch1', name: 'M. Atangana' } });

  // Créer une classe AVEC titulaire (comme le formulaire Classes).
  const ins = await db({ table: 'classes', action: 'upsert', onConflict: 'id', returning: true, values: {
    id: 'cls1', school_id: 'sch1', name: 'Terminale C', level: 'Terminale C',
    system: 'FR', cycle: 'secondaire', current_year: '2025-2026', teacher_id: 'tch1', max_students: 40,
  } });
  ok(!ins.error, 'upsert classe avec teacher_id sans erreur', ins.error);

  // RELECTURE serveur (= ce que fait l'app au rechargement / changement d'année).
  const sel = await db({ table: 'classes', action: 'select', columns: '*', single: true,
    filters: [{ type: 'eq', col: 'id', val: 'cls1' }] });
  ok(sel?.data?.teacher_id === 'tch1', 'titulaire TOUJOURS présent après relecture HTTP', sel?.data?.teacher_id);
  ok(sel?.data?.cycle === 'secondaire' && sel?.data?.max_students === 40,
    'cycle + max_students persistés via HTTP', { cycle: sel?.data?.cycle, max: sel?.data?.max_students });

  // Sécurité : sans token, /api/db doit refuser.
  const noAuth = await fetch(`${BASE}/api/db`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'classes', action: 'select', columns: '*', filters: [] }),
  });
  ok(noAuth.status === 401, '/api/db sans token -> 401', noAuth.status);
} catch (e) {
  console.error('Erreur test:', e.message); fail++;
} finally {
  // Arrêt propre : attendre la sortie réelle de l'enfant AVANT de nettoyer,
  // sinon kill()+rmSync pendant la fermeture des pipes fait planter libuv
  // (assertion UV_HANDLE_CLOSING) au teardown sous Windows.
  await new Promise((resolve) => {
    if (srv.exitCode != null) return resolve();
    srv.once('exit', () => resolve());
    srv.kill();
    setTimeout(resolve, 2000); // garde-fou si l'enfant ne meurt pas
  });
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé */ }
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
