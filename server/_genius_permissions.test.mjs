// Test d'AUTORISATION — permissions fonctionnelles strictes (Phase 3).
//
// Rejoue les règles métier de THE GENIUS contre le VRAI serveur Fastify, par des
// requêtes HTTP réelles sur /api/db — c'est-à-dire par le chemin qu'emprunterait
// quelqu'un contournant l'interface. Aucune protection frontend n'intervient ici.
//
// Ce que ce fichier PROUVE :
//   • PÉDAGOGIE  : Collège → Collège, Primaire → Primaire, y compris sur les
//                  10 tables de vie scolaire laissées ouvertes par la Phase 2 ;
//   • FINANCE    : le service financier traverse les DEUX secteurs sur l'argent,
//                  et lui seul — un compte non financier ne peut pas encaisser,
//                  même s'il voit l'élève, même s'il porte la page /app/fees ;
//   • CONTRÔLEUR : lecture des deux secteurs, AUCUNE écriture ;
//   • SÉPARATION : un caissier traverse l'argent SANS obtenir la pédagogie des
//                  deux secteurs (c'est le point 4 du cahier des charges) ;
//   • PERSONNEL  : chaque chef de secteur gère le personnel de SON secteur ;
//   • NON-RÉGRESSION : une AUTRE école, drapeau baissé, ne change en rien.
//
//   node server/_genius_permissions.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-genius-'));
const PORT = 8153;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Fixture ─────────────────────────────────────────────────────────────────
// GENIUS : drapeau strict LEVÉ. AUTRE : drapeau baissé — c'est le témoin de
// non-régression, il doit se comporter exactement comme avant la Phase 3.
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

    const SU = (id, school, uid, role, cycles, global, pages = null) => db.prepare(
      `INSERT INTO school_users (id,school_id,user_id,role,full_name,active,scope_cycles,scope_global,permissions)
       VALUES (?,?,?,?,?,1,?,?,?)`,
    ).run(id, school, uid, role, uid, cycles, global, pages);

    // GENIUS est durcie ; AUTRE ne l'est pas.
    db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,1)').run(SCHOOL, 'THE GENIUS');
    db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,0)').run(AUTRE, 'AUTRE ECOLE');

    const C = (id, school, name, cycle) => db.prepare(
      'INSERT INTO classes (id,school_id,name,cycle) VALUES (?,?,?,?)',
    ).run(id, school, name, cycle);
    C('cl-6eme', SCHOOL, '6eme', 'secondaire');
    C('cl-5eme', SCHOOL, '5eme', 'secondaire');
    C('cl-cm2',  SCHOOL, 'CM2',  'primaire');
    C('cl-sil',  SCHOOL, 'SIL',  'primaire');
    C('cl-autre', AUTRE, 'Classe X', 'secondaire');

    const E = (id, school, name, cls) => db.prepare(
      'INSERT INTO students (id,school_id,name,class_id) VALUES (?,?,?,?)',
    ).run(id, school, name, cls);
    E('el-col1', SCHOOL, 'Eleve College 1', 'cl-6eme');
    E('el-pri1', SCHOOL, 'Eleve Primaire 1', 'cl-cm2');
    E('el-autre', AUTRE, 'Eleve Autre', 'cl-autre');

    // Enseignants : leur secteur est DÉRIVÉ des classes/matières qu'ils assurent.
    const T = (id, school, name, uid) => db.prepare(
      'INSERT INTO teachers (id,school_id,name,auth_user_id) VALUES (?,?,?,?)',
    ).run(id, school, name, uid);
    T('t-col', SCHOOL, 'Prof College', 'u-ens');
    T('t-pri', SCHOOL, 'Prof Primaire', 'u-enspri');
    T('t-sans', SCHOOL, 'Prof Sans Classe', null);   // secteur indéterminé
    db.prepare('INSERT INTO subjects (id,school_id,class_id,name,teacher_id) VALUES (?,?,?,?,?)')
      .run('s-col', SCHOOL, 'cl-6eme', 'Maths', 't-col');
    db.prepare('INSERT INTO subjects (id,school_id,class_id,name,teacher_id) VALUES (?,?,?,?,?)')
      .run('s-pri', SCHOOL, 'cl-cm2', 'Lecture', 't-pri');

    // Personnel administratif : secteur DÉCLARÉ (NULL = transverse).
    const ST = (id, school, name, sector) => db.prepare(
      'INSERT INTO staff (id,school_id,name,sector) VALUES (?,?,?,?)',
    ).run(id, school, name, sector);
    ST('st-col',  SCHOOL, 'Secretaire College', 'college');
    ST('st-pri',  SCHOOL, 'Secretaire Primaire', 'primaire');
    ST('st-tous', SCHOOL, 'Gardien', null);

    const F = (id, st) => db.prepare(
      'INSERT INTO student_fees (id,school_id,student_id,academic_year,tranches) VALUES (?,?,?,?,?)',
    ).run(id, SCHOOL, st, '2026-2027', '[]');
    F('f-col', 'el-col1');
    F('f-pri', 'el-pri1');

    db.prepare('INSERT INTO grades (id,school_id,class_id,student_id,subject_id,sequence,value) VALUES (?,?,?,?,?,?,?)')
      .run('g-pri', SCHOOL, 'cl-cm2', 'el-pri1', 's-pri', 1, '12');

    // Vie scolaire — les tables que la Phase 2 avait laissées ouvertes.
    db.prepare('INSERT INTO late_arrivals (id,school_id,student_id,class_id,date) VALUES (?,?,?,?,?)')
      .run('la-pri', SCHOOL, 'el-pri1', 'cl-cm2', '2026-09-01');
    db.prepare('INSERT INTO disciplinary_incidents (id,school_id,student_id,class_id,date) VALUES (?,?,?,?,?)')
      .run('di-pri', SCHOOL, 'el-pri1', 'cl-cm2', '2026-09-01');

    // ── Catalogue de gouvernance de GENIUS : l'autorité par le RÔLE ──────────
    const GR = (code, scope, sector, perms) => db.prepare(
      `INSERT INTO governance_roles (id,school_id,code,name,scope,sector,permissions,active)
       VALUES (?,?,?,?,?,?,?,1)`,
    ).run(`gr-${code}`, SCHOOL, code, code, scope, sector, JSON.stringify(perms));
    GR('caissier',   'complex', null,      ['fees.manage']);
    GR('raf',        'complex', null,      ['fees.manage', 'staff.manage.all']);
    GR('controleur', 'complex', null,      ['fees.view']);          // LECTURE SEULE
    GR('principal',  'sector',  'college',  ['staff.manage.sector']);
    GR('directrice_primaire',          'sector', 'primaire', ['staff.manage.sector']);
    GR('directrice_adjointe_primaire', 'sector', 'primaire', ['staff.manage.sector']);

    const AS = (uid, code) => db.prepare(
      'INSERT INTO user_governance_roles (id,school_id,user_id,role) VALUES (?,?,?,?)',
    ).run(`ug-${uid}-${code}`, SCHOOL, uid, code);

    // ── Comptes ─────────────────────────────────────────────────────────────
    // Le caissier et le contrôleur sont SECTORIELS (secondaire) : leur accès aux
    // deux secteurs doit venir de leur RÔLE, pas d'un périmètre global. C'est ce
    // qui distingue « finance transverse » de « tout voir ».
    U('u-col',    'principal@genius.cm');      SU('su1', SCHOOL, 'u-col',    'censeur',     '["secondaire"]',  0);
    U('u-pri',    'primaire@genius.cm');       SU('su2', SCHOOL, 'u-pri',    'censeur',     '["fondamental"]', 0);
    U('u-adjpri', 'adjointe@genius.cm');       SU('su3', SCHOOL, 'u-adjpri', 'censeur',     '["fondamental"]', 0);
    // La secrétaire du Primaire porte /app/fees : sous l'ancienne règle, cela
    // suffisait à lui ouvrir la caisse. C'est LE cas que la Phase 3 ferme.
    U('u-sec',    'secretariat@genius.cm');    SU('su4', SCHOOL, 'u-sec',    'censeur',     '["fondamental"]', 0, '["/app/students","/app/fees"]');
    U('u-surv',   'surveillant@genius.cm');    SU('su5', SCHOOL, 'u-surv',   'surveillant', '["secondaire"]',  0);
    U('u-ens',    'prof.college@genius.cm');   SU('su6', SCHOOL, 'u-ens',    'teacher',     '["secondaire"]',  0);
    U('u-enspri', 'prof.primaire@genius.cm');  SU('su7', SCHOOL, 'u-enspri', 'teacher',     '["fondamental"]', 0);
    U('u-cai',    'caisse@genius.cm');         SU('su8', SCHOOL, 'u-cai',    'censeur',     '["secondaire"]',  0);  AS('u-cai', 'caissier');
    U('u-raf',    'raf@genius.cm');            SU('su9', SCHOOL, 'u-raf',    'censeur',     '["secondaire"]',  0);  AS('u-raf', 'raf');
    U('u-ctl',    'controle@genius.cm');       SU('s10', SCHOOL, 'u-ctl',    'censeur',     '["secondaire"]',  0);  AS('u-ctl', 'controleur');
    AS('u-col', 'principal'); AS('u-pri', 'directrice_primaire'); AS('u-adjpri', 'directrice_adjointe_primaire');
    U('u-adm',    'fondateur@genius.cm');      SU('s11', SCHOOL, 'u-adm',    'admin',       null, 1);

    // ── Témoin de non-régression : école NON durcie ─────────────────────────
    U('u-aut',    'admin@autre.cm');           SU('s12', AUTRE,  'u-aut',    'admin',       null, 1);
    // Un censeur d'une autre école, porteur de /app/fees : sous l'ancienne règle
    // il pouvait encaisser. Il DOIT continuer de le pouvoir.
    U('u-autcens', 'censeur@autre.cm');        SU('s13', AUTRE,  'u-autcens', 'censeur',    null, 1, '["/app/fees"]');

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

// Requête BRUTE sur /api/db — le chemin d'un contournement de l'interface.
const q = (token, body) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
}).then((r) => r.json());

const sel = (token, table, filters = []) =>
  q(token, { table, action: 'select', columns: '*', filters });

const ids = (r) => (r.data || []).map((x) => x.id).sort();

let n = 0;
const step = () => String(++n).padStart(2, '0');

try {
  await ready();
  const T = {};
  for (const [k, mail] of Object.entries({
    col: 'principal@genius.cm', pri: 'primaire@genius.cm', adjpri: 'adjointe@genius.cm',
    sec: 'secretariat@genius.cm', surv: 'surveillant@genius.cm',
    ens: 'prof.college@genius.cm', enspri: 'prof.primaire@genius.cm',
    cai: 'caisse@genius.cm', raf: 'raf@genius.cm', ctl: 'controle@genius.cm',
    adm: 'fondateur@genius.cm', aut: 'admin@autre.cm', autcens: 'censeur@autre.cm',
  })) T[k] = await login(mail);
  ok(Object.values(T).every(Boolean), `${step()}. tous les comptes de test se connectent`);

  // ══ 1. PÉDAGOGIE : le cloisonnement de la Phase 2 tient toujours ══════════
  ok(ids(await sel(T.col, 'students')).join() === 'el-col1',
    `${step()}. Principal College -> 0 eleve Primaire (non-regression Phase 2)`,
    ids(await sel(T.col, 'students')));
  ok((await sel(T.col, 'students', [{ col: 'id', op: 'eq', val: 'el-pri1' }])).data.length === 0,
    `${step()}. Acces DIRECT par id a un eleve Primaire depuis College -> vide`);

  // ══ 2. VIE SCOLAIRE : les tables ajoutées par la Phase 3 ══════════════════
  ok((await sel(T.surv, 'late_arrivals')).data.length === 0,
    `${step()}. Surveillant College -> 0 retard du Primaire (table AJOUTEE)`,
    ids(await sel(T.surv, 'late_arrivals')));
  ok((await sel(T.surv, 'disciplinary_incidents')).data.length === 0,
    `${step()}. Surveillant College -> 0 incident du Primaire (table AJOUTEE)`);
  ok((await sel(T.surv, 'late_arrivals', [{ col: 'id', op: 'eq', val: 'la-pri' }])).data.length === 0,
    `${step()}. Acces DIRECT par id a un retard du Primaire -> vide`);

  // ══ 3. FINANCE : l'autorité est un ROLE, plus un effet de bord ════════════
  // Le coeur du cahier des charges, point 3.
  const encaisse = (tok, id, student) => q(tok, {
    table: 'fee_payments', action: 'insert',
    values: { id, school_id: SCHOOL, student_id: student, amount: 1000, academic_year: '2026-2027' },
  });

  const wSec = await encaisse(T.sec, 'p-x1', 'el-pri1');
  ok(!!wSec.error,
    `${step()}. Secretaire Primaire (porteuse de /app/fees) -> ENCAISSEMENT REFUSE`, wSec);

  const wCol = await encaisse(T.col, 'p-x2', 'el-col1');
  ok(!!wCol.error,
    `${step()}. Principal College (voit l'eleve) -> ENCAISSEMENT REFUSE`, wCol);

  const wGrid = await q(T.sec, {
    table: 'class_fee_grids', action: 'update', values: { amount_comptant: 1 },
    filters: [{ col: 'id', op: 'eq', val: 'grid-x' }],
  });
  ok(!!wGrid.error,
    `${step()}. Secretaire -> MODIFICATION DE GRILLE TARIFAIRE REFUSEE`, wGrid);

  // ══ 4. FINANCE TRANSVERSE : les deux secteurs, par le role ════════════════
  for (const [k, nom] of [['cai', 'Caissier'], ['raf', 'RAF'], ['ctl', 'Controleur']]) {
    const f = ids(await sel(T[k], 'student_fees'));
    ok(f.length === 2 && f.includes('f-col') && f.includes('f-pri'),
      `${step()}. ${nom} (SECTORIEL) -> frais des DEUX secteurs par son ROLE`, f);
  }

  const wCai = await encaisse(T.cai, 'p-ok1', 'el-pri1');
  ok(!wCai.error,
    `${step()}. Caissier -> encaisse sur un eleve PRIMAIRE (hors de son secteur)`, wCai);

  // ══ 5. SÉPARATION PÉDAGOGIE / FINANCE (point 4 du cahier des charges) ═════
  // Le caissier traverse l'ARGENT sans obtenir la PEDAGOGIE des deux secteurs.
  ok((await sel(T.cai, 'grades')).data.length === 0,
    `${step()}. Caissier -> 0 note du Primaire : l'argent traverse, pas la pedagogie`,
    ids(await sel(T.cai, 'grades')));
  ok((await sel(T.cai, 'students')).data.length === 1,
    `${step()}. Caissier -> ne voit QUE les eleves de son secteur pedagogique`,
    ids(await sel(T.cai, 'students')));

  // ══ 6. CONTRÔLEUR : lecture seule (decision de l'etablissement) ═══════════
  const wCtl = await encaisse(T.ctl, 'p-x3', 'el-col1');
  ok(!!wCtl.error,
    `${step()}. Controleur -> LECTURE des deux secteurs mais ECRITURE REFUSEE`, wCtl);
  const wCtlFee = await q(T.ctl, {
    table: 'student_fees', action: 'update', values: { tranches: '[]' },
    filters: [{ col: 'id', op: 'eq', val: 'f-col' }],
  });
  ok(!!wCtlFee.error, `${step()}. Controleur -> modification d'un du REFUSEE`, wCtlFee);

  // ══ 7. ENSEIGNANTS : secteur derive, aucune fuite par l'API ══════════════
  ok((await sel(T.ens, 'students', [{ col: 'id', op: 'eq', val: 'el-pri1' }])).data.length === 0,
    `${step()}. Enseignant College -> eleve Primaire par id direct -> vide`);
  const wEns = await q(T.ens, {
    table: 'grades', action: 'update', values: { value: 20 },
    filters: [{ col: 'id', op: 'eq', val: 'g-pri' }],
  });
  ok(!!wEns.error, `${step()}. Enseignant College -> NOTE du Primaire non modifiable`, wEns);

  const tCol = ids(await sel(T.col, 'teachers'));
  ok(tCol.includes('t-col') && !tCol.includes('t-pri'),
    `${step()}. Principal College -> voit le prof College, PAS le prof Primaire`, tCol);
  ok(tCol.includes('t-sans'),
    `${step()}. Prof sans classe (secteur indetermine) -> reste visible (affectable)`, tCol);
  ok(ids(await sel(T.enspri, 'teachers')).includes('t-pri'),
    `${step()}. Un enseignant voit TOUJOURS sa propre fiche`);

  // ══ 8. PERSONNEL PAR SECTEUR ═════════════════════════════════════════════
  const stPri = ids(await sel(T.pri, 'staff'));
  ok(stPri.includes('st-pri') && stPri.includes('st-tous') && !stPri.includes('st-col'),
    `${step()}. Directrice Primaire -> son personnel + les transverses, PAS le College`, stPri);

  const majStaff = (tok, id) => q(tok, {
    table: 'staff', action: 'update', values: { phone: '699000000' },
    filters: [{ col: 'id', op: 'eq', val: id }],
  });

  ok(!(await majStaff(T.pri, 'st-pri')).error,
    `${step()}. Directrice Primaire -> GERE le personnel du Primaire`);
  ok(!!(await majStaff(T.pri, 'st-col')).error,
    `${step()}. Directrice Primaire -> personnel du College REFUSE`);
  ok(!(await majStaff(T.adjpri, 'st-pri')).error,
    `${step()}. Adjointe du Primaire -> GERE le personnel du Primaire`);
  ok(!!(await majStaff(T.adjpri, 'st-col')).error,
    `${step()}. Adjointe du Primaire -> personnel du College REFUSE`);
  ok(!(await majStaff(T.col, 'st-col')).error,
    `${step()}. Principal College -> GERE le personnel du College`);
  ok(!!(await majStaff(T.col, 'st-pri')).error,
    `${step()}. Principal College -> personnel du Primaire REFUSE`);
  ok(!(await majStaff(T.raf, 'st-col')).error && !(await majStaff(T.raf, 'st-pri')).error,
    `${step()}. RAF (staff.manage.all) -> gere le personnel des DEUX secteurs`);
  ok(!!(await majStaff(T.surv, 'st-col')).error,
    `${step()}. Surveillant (aucune autorite RH) -> personnel REFUSE`);

  // ══ 9. ADMIN : jamais enferme par son propre parametrage ═════════════════
  ok(ids(await sel(T.adm, 'staff')).length === 3 && ids(await sel(T.adm, 'teachers')).length === 3,
    `${step()}. Fondateur (admin) -> voit tout le personnel et tout le corps enseignant`);
  ok(!(await encaisse(T.adm, 'p-ok2', 'el-col1')).error,
    `${step()}. Fondateur (admin) -> encaisse`);

  // ══ 10. NON-RÉGRESSION : l'AUTRE ecole ne change en RIEN ═════════════════
  const wAut = await q(T.autcens, {
    table: 'fee_payments', action: 'insert',
    values: { id: 'p-aut', school_id: AUTRE, student_id: 'el-autre', amount: 500, academic_year: '2026-2027' },
  });
  ok(!wAut.error,
    `${step()}. AUTRE ecole : censeur porteur de /app/fees encaisse TOUJOURS`, wAut);
  ok(ids(await sel(T.aut, 'staff')).length >= 0 && !(await sel(T.aut, 'teachers')).error,
    `${step()}. AUTRE ecole : personnel et enseignants lisibles sans cloisonnement`);

  // ══ 11. ÉTANCHÉITÉ INTER-ÉCOLES (rappel) ════════════════════════════════
  ok((await sel(T.aut, 'students', [{ col: 'school_id', op: 'eq', val: SCHOOL }])).data.length === 0,
    `${step()}. AUTRE ecole -> 0 donnee THE GENIUS`);
  ok((await sel(T.col, 'students', [{ col: 'school_id', op: 'eq', val: AUTRE }])).data.length === 0,
    `${step()}. THE GENIUS -> 0 donnee d'une autre ecole`);
} finally {
  srv.stdout.removeAllListeners('data');
  srv.stderr.removeAllListeners('data');
  srv.kill();
  await new Promise((r) => { srv.on('exit', r); setTimeout(r, 3000); });
}

try { rmSync(dir, { recursive: true, force: true }); } catch { /* verrou Windows */ }
console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
