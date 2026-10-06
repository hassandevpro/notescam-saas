// Test HTTP de bout en bout — « PÉRIMÈTRE MORT » : le compte qui naît aveugle.
//
//   node server/_perimetre_mort.test.mjs
//
// LE DÉFAUT (constaté le 2026-10-01, rapporté « quand j'ai créé une classe ça
// refuse d'enregistrer ») : `school_users.scope_global` a pour défaut 0 (db.js) et
// aucune création de compte ne le renseignait côté LAN. scopeGuard considérait
// alors le compte comme cloisonné SUR RIEN : sa première classe était refusée
// avec « Hors périmètre : cette donnée appartient à un autre secteur ».
// L'administrateur qui venait d'installer l'école ne pouvait donc rien créer.
// Le rattrapage de db.js ne passant qu'au DÉMARRAGE, un redémarrage du serveur
// « réparait » la panne — d'où une panne qui semblait aléatoire.
//
// Le cloud avait déjà reçu ce correctif (supabase_fix_perimetre_mort.sql) ; ce
// test verrouille la parité LAN, sur le VRAI serveur (HTTP + JWT + /api/db).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-perim-'));
const PORT = 8129;
const BASE = `http://127.0.0.1:${PORT}`;

const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });

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

const post = (path, body, token) => fetch(BASE + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then((r) => r.json());

try {
  await waitReady();

  // ── Parcours exact de la première ouverture : Inscription ──────────────────
  const sign = await post('/api/auth/signup', {
    email: 'dir@ecole.test', password: 'secret123', full_name: 'Directrice',
  });
  const token = sign?.data?.session?.access_token || '';
  ok(!!token, 'inscription : token JWT obtenu', sign);

  const rpc = await post('/api/rpc/signup_school_and_admin', {
    p_school_name: 'École Test LAN', p_school_type: 'secondaire', p_region: 'Centre',
    p_director: 'Directrice', p_email: 'dir@ecole.test', p_academic_year: '2026-2027',
    p_full_name: 'Directrice', p_language: 'fr',
  }, token);
  ok(!rpc?.error, 'école + admin créés (RPC signup_school_and_admin)', rpc?.error);

  const schools = await post('/api/db', { table: 'schools', action: 'select', columns: '*' }, token);
  const schoolId = schools?.data?.[0]?.id;
  ok(!!schoolId, 'école relue', schools?.error || schools?.data);

  // ── LE TEST : la première classe, SANS redémarrage du serveur ──────────────
  const ins = await post('/api/db', {
    table: 'classes', action: 'upsert', onConflict: 'id', returning: true, single: true,
    values: {
      id: 'cls-perim-1', school_id: schoolId, name: '6e A', level: '6e',
      system: 'FR', cycle: 'secondaire', current_year: '2026-2027', max_students: 45,
    },
  }, token);
  ok(!ins?.error, 'l’admin qui vient d’installer l’école CRÉE sa première classe', ins?.error);

  const back = await post('/api/db', { table: 'classes', action: 'select', columns: '*' }, token);
  ok((back?.data || []).some((c) => c.id === 'cls-perim-1'),
    'la classe est bien EN BASE (pas seulement acceptée)', back?.error || back?.data);

  // Les tables dépendantes suivent le même garde : matière puis élève.
  const sub = await post('/api/db', {
    table: 'subjects', action: 'upsert', onConflict: 'id',
    values: { id: 'sub-perim-1', school_id: schoolId, class_id: 'cls-perim-1', name: 'Mathématiques', coef: 4, max: 20 },
  }, token);
  ok(!sub?.error, 'matière créée dans cette classe', sub?.error);

  const stu = await post('/api/db', {
    table: 'students', action: 'upsert', onConflict: 'id',
    values: { id: 'stu-perim-1', school_id: schoolId, class_id: 'cls-perim-1', name: 'Élève Test' },
  }, token);
  ok(!stu?.error, 'élève inscrit dans cette classe', stu?.error);

  // ── Le cloisonnement RESTE entier quand un périmètre est VRAIMENT posé ─────
  // Compte enseignant, périmètre explicite sur le fondamental : la classe de
  // secondaire ci-dessus doit lui être refusée en écriture.
  const t2 = await post('/api/auth/signup', { email: 'prof@ecole.test', password: 'secret123', full_name: 'Prof' });
  const tok2 = t2?.data?.session?.access_token || '';
  const link = await post('/api/rpc/signup_teacher', { p_full_name: 'Prof' }, tok2);
  ok(!link?.error, 'compte enseignant rattaché à l’école', link?.error);

  const uid2 = t2?.data?.user?.id;
  const scope = await post('/api/db', {
    table: 'school_users', action: 'update',
    values: { scope_global: 0, scope_cycles: JSON.stringify(['fondamental']) },
    filters: [{ col: 'user_id', op: 'eq', val: uid2 }],
  }, token);
  ok(!scope?.error, 'l’admin pose un périmètre « fondamental » sur ce compte', scope?.error);

  const refus = await post('/api/db', {
    table: 'classes', action: 'upsert', onConflict: 'id',
    values: { id: 'cls-perim-2', school_id: schoolId, name: '5e B', cycle: 'secondaire', system: 'FR' },
  }, tok2);
  ok(!!refus?.error && /périmètre/i.test(refus.error.message || ''),
    'un compte au périmètre POSÉ reste cloisonné (création hors secteur refusée)', refus);
} catch (e) {
  console.log('❌ exception :', e.message);
  fail++;
} finally {
  srv.kill();
  await new Promise((r) => setTimeout(r, 300));
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'KO'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
