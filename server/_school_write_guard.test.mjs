// Test d'AUTORISATION — nom + paramètres de l'établissement : ADMIN uniquement.
//
// Rejoue de vraies requêtes HTTP sur /api/db (édition LAN) — le chemin qu'emprunte
// quelqu'un qui contourne l'interface (client modifié, requête forgée). Aucune
// protection frontend n'intervient ici : on prouve l'enforcement CÔTÉ SERVEUR.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-school-'));
const PORT = 8151;
const BASE = `http://127.0.0.1:${PORT}`;
const SCHOOL = 'sch-1';
const PW = 'MotDePasseTest1!';

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

async function seed() {
  process.env.NOTESCAM_DATA_DIR = dir;
  const { db } = await import('./db.js');
  const { hashPassword } = await import('./security.js');
  db.exec('PRAGMA foreign_keys = OFF');
  const U = (id, mail) => db.prepare('INSERT INTO users (id,email,password_hash,full_name,email_confirmed_at) VALUES (?,?,?,?,?)').run(id, mail, hashPassword(PW), mail, new Date().toISOString());
  const SU = (id, uid, role) => db.prepare('INSERT INTO school_users (id,school_id,user_id,role,full_name,active,scope_global) VALUES (?,?,?,?,?,1,1)').run(id, SCHOOL, uid, role, uid);
  db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(SCHOOL, 'ECOLE ORIGINE');
  U('u-adm', 'admin@test.cm');   SU('s-adm', 'u-adm', 'admin');
  U('u-ens', 'prof@test.cm');    SU('s-ens', 'u-ens', 'teacher');
  U('u-cen', 'censeur@test.cm'); SU('s-cen', 'u-cen', 'censeur');
  db.exec('PRAGMA foreign_keys = ON');
  db.close();
}

await seed();
const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logbuf = '';
srv.stdout.on('data', (d) => { logbuf += d; });
srv.stderr.on('data', (d) => { logbuf += d; });

async function ready(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return; } catch { /* pas prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt:\n' + logbuf.slice(-1200));
}
const login = (email) => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) }).then((r) => r.json()).then((j) => j?.data?.session?.access_token);
const q = (token, body) => fetch(`${BASE}/api/db`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then((r) => r.json());
const rename = (token, name) => q(token, { table: 'schools', action: 'update', values: { name }, filters: [{ col: 'id', op: 'eq', val: SCHOOL }] });
const readName = (token) => q(token, { table: 'schools', action: 'select', columns: '*', filters: [{ col: 'id', op: 'eq', val: SCHOOL }] }).then((r) => r.data?.[0]?.name);

try {
  await ready();
  const adm = await login('admin@test.cm');
  const ens = await login('prof@test.cm');
  const cen = await login('censeur@test.cm');
  ok(adm && ens && cen, 'les trois comptes se connectent');

  // 1. Enseignant : renommer l'établissement → REFUSÉ
  const r1 = await rename(ens, 'PIRATÉ PAR ENSEIGNANT');
  ok(!!r1.error, '1. enseignant NE PEUT PAS renommer l’établissement', r1);

  // 2. Censeur : idem → REFUSÉ
  const r2 = await rename(cen, 'PIRATÉ PAR CENSEUR');
  ok(!!r2.error, '2. censeur NE PEUT PAS renommer l’établissement', r2);

  // 3. Le nom n’a pas bougé malgré les deux tentatives
  ok((await readName(adm)) === 'ECOLE ORIGINE', '3. le nom est resté « ECOLE ORIGINE »', await readName(adm));

  // 4. Enseignant : modifier un PARAMÈTRE (mode de saisie) → REFUSÉ
  const r4 = await q(ens, { table: 'schools', action: 'update', values: { grade_entry_mode: 'subject' }, filters: [{ col: 'id', op: 'eq', val: SCHOOL }] });
  ok(!!r4.error, '4. enseignant NE PEUT PAS changer un paramètre (grade_entry_mode)', r4);

  // 5. Enseignant : LECTURE de l’école → toujours autorisée (en-tête, contexte)
  ok((await readName(ens)) === 'ECOLE ORIGINE', '5. enseignant LIT toujours son établissement', await readName(ens));

  // 6. Admin : renommer → AUTORISÉ, et le nom change réellement
  const r6 = await rename(adm, 'ECOLE RENOMMEE PAR ADMIN');
  ok(!r6.error, '6. admin PEUT renommer l’établissement', r6);
  ok((await readName(adm)) === 'ECOLE RENOMMEE PAR ADMIN', '7. le nom reflète la modif admin', await readName(adm));
} catch (e) {
  console.error('ERREUR', e); fail++;
} finally {
  srv.kill();
  console.log(`\n${pass} ok / ${fail} échec(s)`);
  process.exit(fail ? 1 : 0);
}
