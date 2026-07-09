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

async function waitReady(ms = 30000) {   // marge pour un démarrage à froid sous charge (spawn Windows)
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
const batch = (ops) => fetch(`${BASE}/api/db/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ ops }),
}).then((r) => r.json());

try {
  await waitReady();

  // Signup -> token
  const sign = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dir@ecole.test', password: 'secret123', full_name: 'Directeur' }),
  }).then((r) => r.json());
  token = sign?.data?.session?.access_token || '';
  const userId = sign?.data?.user?.id || '';
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

  // --- Batch atomique (transactional outbox du kernel) ---------------------
  // Commit d'une donnée métier + son event d'outbox EN UNE transaction.
  const okBatch = await batch([
    { table: 'signalements', action: 'insert', values: {
      id: 'sg1', school_id: 'sch1', domain: 'maintenance', title: 'Fuite bloc B', status: 'new', priority: 'high' } },
    { table: 'domain_events', action: 'insert', values: {
      id: 'ev1', school_id: 'sch1', aggregate_type: 'signalement', aggregate_id: 'sg1',
      event_type: 'SignalementRaised', payload: '{}' } },
  ]);
  ok(!okBatch.error && okBatch.data?.applied === 2, 'batch atomique applique données + event outbox', okBatch);
  const sg = await db({ table: 'signalements', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'sg1' }] });
  const ev = await db({ table: 'domain_events', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'ev1' }] });
  ok(sg?.data?.id === 'sg1' && ev?.data?.id === 'ev1', 'batch : la donnée ET l’event sont persistés');

  // Rollback : une op invalide dans le lot annule TOUT le lot.
  const badBatch = await batch([
    { table: 'signalements', action: 'insert', values: { id: 'sg2', school_id: 'sch1', domain: 'rh', title: 'X', status: 'new' } },
    { table: 'table_interdite', action: 'insert', values: { id: 'zz' } }, // hors ALLOWED_TABLES
  ]);
  ok(!!badBatch.error, 'batch avec op invalide -> erreur', badBatch);
  const sg2 = await db({ table: 'signalements', action: 'select', single: true, maybeSingle: true, filters: [{ op: 'eq', col: 'id', val: 'sg2' }] });
  ok(sg2?.data == null, 'batch ROLLBACK : aucune écriture partielle (sg2 absent)', sg2?.data);

  // --- #8 Non-répudiation : acteur estampillé par le serveur -----------------
  // Un client forge actor_id : le serveur DOIT l'écraser avec l'utilisateur de
  // la session (userId), pas la valeur envoyée.
  await batch([{ table: 'domain_events', action: 'insert', values: {
    id: 'evx', school_id: 'sch1', aggregate_type: 'x', event_type: 'Test', payload: '{}', actor_id: 'FORGED' } }]);
  const evx = await db({ table: 'domain_events', action: 'select', single: true, maybeSingle: true, filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(evx?.data?.actor_id === userId && userId, 'actor_id estampillé par le serveur (forge « FORGED » ignorée)', evx?.data?.actor_id);

  // --- #8 Immuabilité : domain_events est append-only ------------------------
  const updEv = await db({ table: 'domain_events', action: 'update', values: { id: 'evx', event_type: 'Hacked' }, filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(!!updEv.error, 'domain_events : UPDATE refusé (append-only)', updEv);
  const delEv = await db({ table: 'domain_events', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(!!delEv.error, 'domain_events : DELETE refusé (append-only)', delEv);
  const stillEvent = await db({ table: 'domain_events', action: 'select', single: true, maybeSingle: true, filters: [{ op: 'eq', col: 'id', val: 'evx' }] });
  ok(stillEvent?.data?.event_type === 'Test', 'domain_events : l’event est resté intact', stillEvent?.data?.event_type);

  // --- #4 version monotone : chaque update incrémente le compteur ------------
  await db({ table: 'classes', action: 'update', values: { max_students: 41 }, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  const cv1 = await db({ table: 'classes', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  await db({ table: 'classes', action: 'update', values: { max_students: 42 }, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  const cv2 = await db({ table: 'classes', action: 'select', single: true, filters: [{ op: 'eq', col: 'id', val: 'cls1' }] });
  ok(cv2?.data?.version > cv1?.data?.version, 'version incrémentée à chaque update (départage LWW fiable)', { v1: cv1?.data?.version, v2: cv2?.data?.version });

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
