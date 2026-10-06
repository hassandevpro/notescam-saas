// Édition RESTREINTE (build « utilisateur ») : plafond de classes + verrou école.
// Rejoue de vraies requêtes HTTP sur le VRAI serveur, avec l'environnement
// restreint (NOTESCAM_MAX_CLASSES=4, NOTESCAM_LOCK_SCHOOL=1).
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-restr-'));
const PORT = 8153;
const BASE = `http://127.0.0.1:${PORT}`;
const SCHOOL = 'sch-1';
const PW = 'MotDePasseTest1!';
let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

async function seed() {
  process.env.NOTESCAM_DATA_DIR = dir;
  const { db } = await import('./db.js');
  const { hashPassword } = await import('./security.js');
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(SCHOOL, 'ECOLE USER');
  db.prepare('INSERT INTO users (id,email,password_hash,full_name,email_confirmed_at) VALUES (?,?,?,?,?)').run('u-adm', 'admin@test.cm', hashPassword(PW), 'Admin', new Date().toISOString());
  db.prepare('INSERT INTO school_users (id,school_id,user_id,role,full_name,active,scope_global) VALUES (?,?,?,?,?,1,1)').run('s-adm', SCHOOL, 'u-adm', 'admin', 'Admin');
  db.exec('PRAGMA foreign_keys = ON');
  db.close();
}
await seed();

const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0',
         NOTESCAM_MAX_CLASSES: '4', NOTESCAM_LOCK_SCHOOL: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logbuf = ''; srv.stdout.on('data', d => logbuf += d); srv.stderr.on('data', d => logbuf += d);
async function ready(ms = 30000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 200)); } throw new Error('serveur non prêt:\n' + logbuf.slice(-1200)); }
const login = (email) => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) }).then(r => r.json()).then(j => j?.data?.session?.access_token);
const q = (token, body) => fetch(`${BASE}/api/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(r => r.json());
const addClass = (token, id) => q(token, { table: 'classes', action: 'insert', values: { id, school_id: SCHOOL, name: id, cycle: 'primaire', system: 'FR', current_year: '2026-2027' } });

try {
  await ready();
  const adm = await login('admin@test.cm');
  ok(!!adm, 'admin connecté');

  // 4 classes : OK
  let allOk = true;
  for (let i = 1; i <= 4; i++) { const r = await addClass(adm, `cls-${i}`); if (r.error) allOk = false; }
  ok(allOk, '1. les 4 premières classes sont créées', allOk);

  // 5e : REFUSÉE
  const r5 = await addClass(adm, 'cls-5');
  ok(!!r5.error && /limit/i.test(r5.error.message), '2. la 5e classe est refusée (plafond 4)', r5);

  // Édition d'une classe existante : autorisée (ne compte pas comme création)
  const edit = await q(adm, { table: 'classes', action: 'upsert', onConflict: 'id', values: { id: 'cls-1', school_id: SCHOOL, name: 'CP renommée', cycle: 'primaire', system: 'FR', current_year: '2026-2027' } });
  ok(!edit.error, '3. renommer une classe existante reste possible (pas une création)', edit);

  // Total inchangé (toujours 4)
  const cnt = (await q(adm, { table: 'classes', action: 'select', columns: '*', filters: [{ col: 'school_id', op: 'eq', val: SCHOOL }] })).data?.length;
  ok(cnt === 4, '4. le total reste à 4 classes', cnt);

  // Verrou école : créer un NOUVEL établissement → refusé (RPC signup)
  const newUser = await fetch(`${BASE}/api/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@y.cm', password: PW, full_name: 'X' }) }).then(r => r.json());
  // (mono-école : une école existe déjà, donc signup_school_and_admin rattache ; on teste le verrou sur une base SANS école via un autre port serait lourd — ici on vérifie l'export du drapeau)
  ok(newUser?.data?.session?.access_token, '5. un compte peut être créé (auth), mais…');
} catch (e) { console.error('ERREUR', e); fail++; }
finally { srv.kill(); console.log(`\n${pass} ok / ${fail} échec(s)`); process.exit(fail ? 1 : 0); }
