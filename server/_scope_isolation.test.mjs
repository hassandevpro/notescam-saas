// Test d'AUTORISATION — cloisonnement par secteur (Collège / Primaire).
//
// Rejoue les scénarios de la Phase 2 contre le VRAI serveur Fastify, par des
// requêtes HTTP réelles sur /api/db — c'est-à-dire par le chemin qu'emprunterait
// quelqu'un contournant l'interface. Aucune protection frontend n'intervient ici.
//
// Prouve : la sécurité ne dépend PAS du frontend.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-scope-'));
const PORT = 8149;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Fixture : une école, deux secteurs, des comptes aux périmètres distincts ──
const SCHOOL = 'sch-genius';
const AUTRE  = 'sch-autre';
const PW = 'MotDePasseTest1!';

function seed() {
  process.env.NOTESCAM_DATA_DIR = dir;
  return import('./db.js').then(async ({ db }) => {
    const { hashPassword } = await import('./security.js');
    db.exec('PRAGMA foreign_keys = OFF');
    const U = (id, mail) => db.prepare(
      'INSERT INTO users (id,email,password_hash,full_name,email_confirmed_at) VALUES (?,?,?,?,?)',
    ).run(id, mail, hashPassword(PW), mail, new Date().toISOString());
    const SU = (id, school, uid, role, scopeCycles, global) => db.prepare(
      `INSERT INTO school_users (id,school_id,user_id,role,full_name,active,scope_cycles,scope_global)
       VALUES (?,?,?,?,?,1,?,?)`,
    ).run(id, school, uid, role, uid, scopeCycles, global);

    db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(SCHOOL, 'THE GENIUS');
    db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(AUTRE, 'AUTRE ECOLE');

    const C = (id, school, name, cycle) => db.prepare(
      'INSERT INTO classes (id,school_id,name,cycle) VALUES (?,?,?,?)',
    ).run(id, school, name, cycle);
    C('cl-6eme', SCHOOL, '6eme', 'secondaire');
    C('cl-5eme', SCHOOL, '5eme', 'secondaire');
    C('cl-cm2',  SCHOOL, 'CM2',  'primaire');
    C('cl-sil',  SCHOOL, 'SIL',  'primaire');
    C('cl-nur',  SCHOOL, 'NURSERY', 'maternelle');
    C('cl-autre', AUTRE, 'Classe X', 'secondaire');

    const E = (id, school, name, cls) => db.prepare(
      'INSERT INTO students (id,school_id,name,class_id) VALUES (?,?,?,?)',
    ).run(id, school, name, cls);
    E('el-col1', SCHOOL, 'Eleve College 1', 'cl-6eme');
    E('el-col2', SCHOOL, 'Eleve College 2', 'cl-5eme');
    E('el-pri1', SCHOOL, 'Eleve Primaire 1', 'cl-cm2');
    E('el-pri2', SCHOOL, 'Eleve Primaire 2', 'cl-sil');
    E('el-mat1', SCHOOL, 'Eleve Maternelle', 'cl-nur');
    E('el-autre', AUTRE, 'Eleve Autre', 'cl-autre');

    const F = (id, st) => db.prepare(
      'INSERT INTO student_fees (id,school_id,student_id,academic_year,tranches) VALUES (?,?,?,?,?)',
    ).run(id, SCHOOL, st, '2026-2027', '[]');
    F('f-col', 'el-col1');
    F('f-pri', 'el-pri1');

    U('u-col', 'principal.college@test.cm');   SU('su1', SCHOOL, 'u-col', 'censeur',     '["secondaire"]',  0);
    U('u-pri', 'principal.primaire@test.cm');  SU('su2', SCHOOL, 'u-pri', 'censeur',     '["fondamental"]', 0);
    U('u-surv', 'surveillant.pri@test.cm');    SU('su3', SCHOOL, 'u-surv', 'surveillant','["fondamental"]', 0);
    U('u-ens', 'enseignant.col@test.cm');      SU('su4', SCHOOL, 'u-ens', 'teacher',     '["secondaire"]',  0);
    U('u-raf', 'raf@test.cm');                 SU('su5', SCHOOL, 'u-raf', 'censeur',     null,              1);
    U('u-cai', 'caisse@test.cm');              SU('su6', SCHOOL, 'u-cai', 'censeur',     null,              1);
    U('u-ctl', 'controle@test.cm');            SU('su7', SCHOOL, 'u-ctl', 'censeur',     null,              1);
    U('u-aut', 'admin@autre.cm');              SU('su8', AUTRE,  'u-aut', 'admin',       null,              1);
    db.exec('PRAGMA foreign_keys = ON');
    db.close();
  });
}

await seed();

const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
srv.stdout.on('data', (d) => { log += d; });
srv.stderr.on('data', (d) => { log += d; });

async function ready(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return; } catch { /* pas prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt:\n' + log.slice(-1200));
}

const login = (email) => fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: PW }),
}).then((r) => r.json()).then((j) => j?.data?.session?.access_token);

// Requête BRUTE sur /api/db — le chemin d'un contournement de l'interface.
const q = (token, body) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
}).then((r) => r.json());

const sel = (token, table, filters = []) =>
  q(token, { table, action: 'select', columns: '*', filters });

try {
  await ready();
  const T = {};
  for (const [k, mail] of Object.entries({
    col: 'principal.college@test.cm', pri: 'principal.primaire@test.cm',
    surv: 'surveillant.pri@test.cm', ens: 'enseignant.col@test.cm',
    raf: 'raf@test.cm', cai: 'caisse@test.cm', ctl: 'controle@test.cm',
    aut: 'admin@autre.cm',
  })) T[k] = await login(mail);
  ok(Object.values(T).every(Boolean), 'tous les comptes de test se connectent');

  const ids = (r) => (r.data || []).map((x) => x.id).sort();

  // 1-2. Principal Collège
  ok(JSON.stringify(ids(await sel(T.col, 'classes'))) === JSON.stringify(['cl-5eme', 'cl-6eme']),
    '1. Principal College -> UNIQUEMENT les classes College', ids(await sel(T.col, 'classes')));
  ok(JSON.stringify(ids(await sel(T.col, 'students'))) === JSON.stringify(['el-col1', 'el-col2']),
    '2. Principal College -> 0 eleve Primaire', ids(await sel(T.col, 'students')));

  // 3-4. Accès direct par id de l'autre secteur -> vide (équivalent 404)
  ok((await sel(T.col, 'students', [{ col: 'id', op: 'eq', val: 'el-pri1' }])).data.length === 0,
    '3. Acces DIRECT a un eleve Primaire depuis College -> vide');
  ok((await sel(T.col, 'classes', [{ col: 'id', op: 'eq', val: 'cl-cm2' }])).data.length === 0,
    '4. Acces DIRECT a une classe Primaire depuis College -> vide');

  // 5. Principal Primaire
  const priCls = ids(await sel(T.pri, 'classes'));
  ok(JSON.stringify(priCls) === JSON.stringify(['cl-cm2', 'cl-nur', 'cl-sil']),
    '5. Principal Primaire -> 0 donnee College (maternelle+primaire seules)', priCls);
  ok((await sel(T.pri, 'students', [{ col: 'id', op: 'eq', val: 'el-col1' }])).data.length === 0,
    '5b. Acces DIRECT a un eleve College depuis Primaire -> vide');

  // 6. Enseignant / Surveillant sectoriels
  ok(JSON.stringify(ids(await sel(T.ens, 'students'))) === JSON.stringify(['el-col1', 'el-col2']),
    '6. Enseignant College -> aucun eleve Primaire');
  ok(!ids(await sel(T.surv, 'students')).includes('el-col1'),
    '6b. Surveillant Primaire -> aucun eleve College');

  // 7-9. Finance GLOBALE : les deux secteurs
  for (const [k, nom] of [['raf', 'RAF'], ['cai', 'Caisse'], ['ctl', 'Controle']]) {
    const f = ids(await sel(T[k], 'student_fees'));
    ok(f.length === 2 && f.includes('f-col') && f.includes('f-pri'),
      `7. ${nom} (GLOBAL) -> frais des DEUX secteurs`, f);
  }

  // 10. Le compte sectoriel ne voit QUE les frais de son secteur (pas de fuite d'id)
  ok(JSON.stringify(ids(await sel(T.col, 'student_fees'))) === JSON.stringify(['f-col']),
    '8. Compte sectoriel College -> frais College seuls (aucune fuite Primaire)');

  // 11. Étanchéité inter-écoles
  ok((await sel(T.col, 'students', [{ col: 'school_id', op: 'eq', val: AUTRE }])).data.length === 0,
    '9. GENIUS -> 0 donnee d une AUTRE ecole');
  ok((await sel(T.aut, 'students', [{ col: 'school_id', op: 'eq', val: SCHOOL }])).data.length === 0,
    '10. Autre ecole -> 0 donnee THE GENIUS');

  // 12. Sans jeton
  const anon = await fetch(`${BASE}/api/db`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'students', action: 'select', columns: '*' }),
  });
  ok(anon.status === 401, '11. Compte inconnu / sans jeton -> 401', anon.status);

  // 13. ÉCRITURE hors périmètre refusée (le test qui compte le plus)
  const w = await q(T.col, {
    table: 'students', action: 'update', values: { name: 'PIRATE' },
    filters: [{ col: 'id', op: 'eq', val: 'el-pri1' }],
  });
  ok(!!w.error, '12. ECRITURE sur un eleve Primaire depuis College -> REFUSEE', w);

  const w2 = await q(T.col, {
    table: 'students', action: 'insert',
    values: { id: 'el-x', school_id: SCHOOL, name: 'Injecte', class_id: 'cl-cm2' },
  });
  ok(!!w2.error, '13. INSERT dans une classe Primaire depuis College -> REFUSE', w2);

  // 14. Dashboard : les compteurs ne fuient pas
  const nCol = (await sel(T.col, 'students')).data.length;
  const nPri = (await sel(T.pri, 'students')).data.length;
  const nGlo = (await sel(T.raf, 'students')).data.length;
  ok(nCol === 2 && nPri === 3 && nGlo === 5,
    '14. Dashboard : compteurs cloisonnes (College 2 / Primaire 3 / GLOBAL 5)', { nCol, nPri, nGlo });

  // 15. Non-régression : un compte GLOBAL garde tout
  ok(ids(await sel(T.raf, 'classes')).length === 5,
    '15. NON-REGRESSION compte GLOBAL -> voit les 5 classes de son ecole');
} finally {
  srv.stdout.removeAllListeners('data');
  srv.stderr.removeAllListeners('data');
  srv.kill();
  await new Promise((r) => { srv.on('exit', r); setTimeout(r, 3000); });
}

try { rmSync(dir, { recursive: true, force: true }); } catch { /* verrou Windows */ }
console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
