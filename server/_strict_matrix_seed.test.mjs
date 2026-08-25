// Test d'AMORÇAGE de la matrice stricte — le chemin d'une VRAIE installation LAN.
//
// Ce que _genius_permissions.test.mjs ne pouvait pas prouver : il pose lui-même
// les rôles de gouvernance et leurs clés `fees.manage` dans sa fixture. Or, sur
// une école réellement installée, personne ne les pose à la main. Le seed LAN
// (server/db.js) ne connaissait pas ces clés : dans une école DURCIE fraîchement
// installée ou restaurée, plus AUCUN compte hormis le rôle de base `admin`
// n'aurait pu encaisser. Le durcissement aurait fermé la caisse.
//
// Ce fichier part donc d'une base VIERGE de tout catalogue et vérifie que :
//   • le catalogue de l'école durcie reçoit les clés d'autorité ;
//   • le Contrôleur, absent des 9 rôles système, est créé en LECTURE SEULE ;
//   • une école NON durcie ne reçoit RIEN — ni clé, ni rôle (§16) ;
//   • le drapeau qui arrive APRÈS le démarrage (sync cloud, restauration)
//     déclenche quand même la matrice ;
//   • et qu'au bout du compte le caissier encaisse pour de vrai, par HTTP.
//
//   node server/_strict_matrix_seed.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-strictseed-'));
const PORT = 8154;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const DUR = 'sch-durcie';    // drapeau levé AVANT le démarrage
const TARD = 'sch-tardive';  // drapeau levé APRÈS le démarrage
const AUTRE = 'sch-autre';   // jamais durcie — le témoin de non-régression
const PW = 'MotDePasseTest1!';

function seed() {
  process.env.NOTESCAM_DATA_DIR = dir;
  return import('./db.js').then(async ({ db }) => {
    const { hashPassword } = await import('./security.js');
    db.exec('PRAGMA foreign_keys = OFF');

    const U = (id, mail) => db.prepare(
      'INSERT INTO users (id,email,password_hash,full_name,email_confirmed_at) VALUES (?,?,?,?,?)',
    ).run(id, mail, hashPassword(PW), mail, new Date().toISOString());
    const SU = (id, school, uid, role, cycles, global, pages = null) => db.prepare(
      `INSERT INTO school_users (id,school_id,user_id,role,full_name,active,scope_cycles,scope_global,permissions)
       VALUES (?,?,?,?,?,1,?,?,?)`,
    ).run(id, school, uid, role, uid, cycles, global, pages);
    // AUCUN INSERT dans governance_roles : c'est tout l'objet du test. Le
    // catalogue doit naître du seed du serveur, puis recevoir la matrice.
    const AS = (uid, school, code) => db.prepare(
      'INSERT INTO user_governance_roles (id,school_id,user_id,role) VALUES (?,?,?,?)',
    ).run(`ug-${uid}-${code}`, school, uid, code);

    db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,1)').run(DUR, 'ECOLE DURCIE');
    db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,0)').run(TARD, 'ECOLE TARDIVE');
    db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,0)').run(AUTRE, 'AUTRE ECOLE');

    const C = (id, school, name, cycle) => db.prepare(
      'INSERT INTO classes (id,school_id,name,cycle) VALUES (?,?,?,?)',
    ).run(id, school, name, cycle);
    const E = (id, school, name, cls) => db.prepare(
      'INSERT INTO students (id,school_id,name,class_id) VALUES (?,?,?,?)',
    ).run(id, school, name, cls);

    for (const s of [DUR, TARD]) {
      C(`cl-col-${s}`, s, '6eme', 'secondaire');
      C(`cl-pri-${s}`, s, 'CM2', 'primaire');
      E(`el-col-${s}`, s, 'Eleve College', `cl-col-${s}`);
      E(`el-pri-${s}`, s, 'Eleve Primaire', `cl-pri-${s}`);
    }

    // Personnel : secteurs déclarés, pour éprouver `staff.manage.sector`.
    const ST = (id, school, name, sector) => db.prepare(
      'INSERT INTO staff (id,school_id,name,sector) VALUES (?,?,?,?)',
    ).run(id, school, name, sector);
    ST('st-col', DUR, 'Agent College', 'college');
    ST('st-pri', DUR, 'Agent Primaire', 'primaire');

    // ── Comptes ─────────────────────────────────────────────────────────────
    // Le caissier est SECTORIEL (secondaire). S'il encaisse au Primaire, c'est
    // que son ROLE le lui permet — pas un périmètre global.
    U('u-adm',  'admin@durcie.cm');      SU('s1', DUR,  'u-adm',  'admin',   null, 1);
    U('u-cai',  'caisse@durcie.cm');     SU('s2', DUR,  'u-cai',  'censeur', '["secondaire"]', 0);
    U('u-ctl',  'controle@durcie.cm');   SU('s3', DUR,  'u-ctl',  'censeur', '["secondaire"]', 0);
    U('u-prin', 'principal@durcie.cm');  SU('s4', DUR,  'u-prin', 'censeur', '["secondaire"]', 0);
    AS('u-cai', DUR, 'caissier'); AS('u-ctl', DUR, 'controleur'); AS('u-prin', DUR, 'principal');

    U('u-tadm', 'admin@tardive.cm');     SU('s5', TARD, 'u-tadm', 'admin',   null, 1);
    U('u-tcai', 'caisse@tardive.cm');    SU('s6', TARD, 'u-tcai', 'censeur', '["secondaire"]', 0);
    AS('u-tcai', TARD, 'caissier');

    // Témoin : un censeur porteur de /app/fees dans une école NON durcie. Sous
    // la règle historique il encaisse ; il doit continuer de le faire.
    U('u-aadm', 'admin@autre.cm');       SU('s7', AUTRE, 'u-aadm', 'admin',   null, 1);
    U('u-acens', 'censeur@autre.cm');    SU('s8', AUTRE, 'u-acens', 'censeur', null, 1, '["/app/fees"]');
    C('cl-autre', AUTRE, '6eme', 'secondaire');
    E('el-autre', AUTRE, 'Eleve Autre', 'cl-autre');

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
  throw new Error('serveur non prêt:\n' + log.slice(-1500));
}

const login = (email) => fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: PW }),
}).then((r) => r.json()).then((j) => j?.data?.session?.access_token);

const q = (token, body) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
}).then((r) => r.json());

const sel = (token, table, filters = []) =>
  q(token, { table, action: 'select', columns: '*', filters });

// Permissions posées sur un rôle du catalogue, telles que la base les stocke.
async function rolePerms(token, school, code) {
  const r = await sel(token, 'governance_roles', [
    { col: 'school_id', op: 'eq', val: school },
    { col: 'code', op: 'eq', val: code },
  ]);
  const row = (r.data || [])[0];
  if (!row) return null;
  try { const p = JSON.parse(row.permissions || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}

let n = 0;
const step = () => String(++n).padStart(2, '0');

try {
  await ready();
  const T = {};
  for (const [k, mail] of Object.entries({
    adm: 'admin@durcie.cm', cai: 'caisse@durcie.cm', ctl: 'controle@durcie.cm',
    prin: 'principal@durcie.cm', tadm: 'admin@tardive.cm', tcai: 'caisse@tardive.cm',
    aadm: 'admin@autre.cm', acens: 'censeur@autre.cm',
  })) T[k] = await login(mail);
  ok(Object.values(T).every(Boolean), `${step()}. tous les comptes de test se connectent`);

  // ══ 1. L'ÉCOLE DURCIE reçoit la matrice, sans qu'on l'ait posée ═══════════
  const cai = await rolePerms(T.adm, DUR, 'caissier');
  ok(cai?.includes('fees.manage'),
    `${step()}. Ecole durcie : le caissier recoit fees.manage a l'installation`, cai);

  const raf = await rolePerms(T.adm, DUR, 'raf');
  ok(raf?.includes('fees.manage') && raf?.includes('staff.manage.all'),
    `${step()}. Ecole durcie : le RAF recoit la caisse ET la RH transverse`, raf);

  const prin = await rolePerms(T.adm, DUR, 'principal');
  ok(prin?.includes('staff.manage.sector'),
    `${step()}. Ecole durcie : le Principal gere le personnel de SON secteur`, prin);

  const ctl = await rolePerms(T.adm, DUR, 'controleur');
  ok(ctl?.includes('fees.view') && !ctl?.includes('fees.manage'),
    `${step()}. Ecole durcie : le Controleur est CREE, en lecture seule`, ctl);

  // Les permissions d'origine du rôle ne doivent pas avoir été remplacées.
  ok(cai?.includes('budget.view') && cai?.includes('expense.view'),
    `${step()}. La matrice AJOUTE sans jamais retirer une permission existante`, cai);

  // ══ 2. NON-RÉGRESSION : l'autre école ne reçoit RIEN (§16) ════════════════
  const caiAutre = await rolePerms(T.aadm, AUTRE, 'caissier');
  ok(caiAutre && !caiAutre.includes('fees.manage'),
    `${step()}. AUTRE ecole : aucune cle d'autorite posee sur son catalogue`, caiAutre);
  ok((await rolePerms(T.aadm, AUTRE, 'controleur')) === null,
    `${step()}. AUTRE ecole : aucun role Controleur cree`);

  // Et son censeur porteur de /app/fees encaisse TOUJOURS, comme avant.
  const wAutre = await q(T.acens, {
    table: 'fee_payments', action: 'insert',
    values: { id: 'p-autre', school_id: AUTRE, student_id: 'el-autre', amount: 1000, academic_year: '2026-2027' },
  });
  ok(!wAutre.error,
    `${step()}. AUTRE ecole : le censeur encaisse toujours (comportement d'avant)`, wAutre);

  // ══ 3. LA CAISSE FONCTIONNE VRAIMENT dans l'école durcie ══════════════════
  // Le point qui compte : sans la matrice, cet appel échouerait et l'école
  // durcie n'aurait tout simplement plus de caisse.
  const wCai = await q(T.cai, {
    table: 'fee_payments', action: 'insert',
    values: { id: 'p-dur', school_id: DUR, student_id: `el-pri-${DUR}`, amount: 1000, academic_year: '2026-2027' },
  });
  ok(!wCai.error,
    `${step()}. Ecole durcie : le caissier SECTORIEL encaisse au Primaire`, wCai);

  // Le Contrôleur lit les deux secteurs et n'écrit rien.
  const wCtl = await q(T.ctl, {
    table: 'fee_payments', action: 'insert',
    values: { id: 'p-ctl', school_id: DUR, student_id: `el-pri-${DUR}`, amount: 1000, academic_year: '2026-2027' },
  });
  ok(!!wCtl.error, `${step()}. Ecole durcie : le Controleur ne peut pas encaisser`, wCtl);

  // Le Principal gère le personnel de son secteur, pas celui de l'autre.
  const okStaff = await q(T.prin, {
    table: 'staff', action: 'update', values: { name: 'Agent College bis' },
    filters: [{ col: 'id', op: 'eq', val: 'st-col' }],
  });
  ok(!okStaff.error, `${step()}. Principal : gere le personnel du College`, okStaff);
  const koStaff = await q(T.prin, {
    table: 'staff', action: 'update', values: { name: 'Agent Primaire bis' },
    filters: [{ col: 'id', op: 'eq', val: 'st-pri' }],
  });
  ok(!!koStaff.error, `${step()}. Principal : personnel du Primaire REFUSE`, koStaff);

  // ══ 4. DRAPEAU LEVÉ APRÈS LE DÉMARRAGE ═══════════════════════════════════
  // Cas réel : le drapeau descend du cloud par la synchronisation, ou apparaît
  // au montage d'une sauvegarde. Le serveur tourne déjà — la matrice doit
  // quand même se poser, sinon l'école se retrouve durcie et sans caisse.
  const avant = await rolePerms(T.tadm, TARD, 'caissier');
  ok(avant && !avant.includes('fees.manage'),
    `${step()}. Ecole tardive : rien n'est pose tant que le drapeau est baisse`, avant);

  const flip = await q(T.tadm, {
    table: 'schools', action: 'update', values: { strict_role_enforcement: 1 },
    filters: [{ col: 'id', op: 'eq', val: TARD }],
  });
  ok(!flip.error, `${step()}. Ecole tardive : le drapeau est leve en cours de route`, flip);

  // La toute PREMIÈRE requête après le durcissement est un LOT qui échoue. Tout
  // le lot est joué dans une transaction : la pose de la matrice y est annulée
  // avec le reste. L'école ne doit donc PAS être tenue pour traitée — sinon son
  // catalogue resterait nu jusqu'au prochain redémarrage, et elle serait durcie
  // sans caisse. C'est exactement le défaut que ce test verrouille.
  const lot = await fetch(`${BASE}/api/db/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T.tcai}` },
    body: JSON.stringify({ ops: [{ table: 'table_inexistante', action: 'insert', values: { id: 'x' } }] }),
  }).then((r) => r.json());
  ok(!!lot.error, `${step()}. Ecole tardive : un lot invalide echoue et annule sa transaction`, lot);

  // La requête suivante, elle, doit bien poser la matrice.
  await sel(T.tcai, 'students');
  const apres = await rolePerms(T.tadm, TARD, 'caissier');
  ok(apres?.includes('fees.manage'),
    `${step()}. Ecole tardive : la matrice se pose des le drapeau leve`, apres);

  const wTard = await q(T.tcai, {
    table: 'fee_payments', action: 'insert',
    values: { id: 'p-tard', school_id: TARD, student_id: `el-pri-${TARD}`, amount: 1000, academic_year: '2026-2027' },
  });
  ok(!wTard.error, `${step()}. Ecole tardive : la caisse fonctionne apres durcissement`, wTard);

  // ══ 5. IDEMPOTENCE ═══════════════════════════════════════════════════════
  // Rejouer la pose ne doit ni dupliquer une clé ni en perdre une.
  await sel(T.cai, 'students');
  const rejoue = await rolePerms(T.adm, DUR, 'caissier');
  ok(rejoue && rejoue.filter((p) => p === 'fees.manage').length === 1,
    `${step()}. Idempotence : la cle n'est posee qu'une fois`, rejoue);
} catch (e) {
  console.error('💥', e.message);
  fail++;
} finally {
  srv.kill();
  await new Promise((r) => setTimeout(r, 300));
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* verrou Windows */ }
}

console.log(`\n=== ${fail ? 'ECHEC' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
