// Test d'AUTORISATION — ESPACE PARENT (cahier des charges §16, tests 1 à 22 + §17).
//
// Rejoue chaque scénario contre le VRAI serveur Fastify, par requêtes HTTP
// réelles : /api/rpc/parent_* pour l'espace parent, et /api/db pour le chemin
// qu'emprunterait quelqu'un qui contourne l'interface. Aucune protection
// frontend n'intervient ici — c'est tout l'objet du test.
//
// FIXTURE — un parent, deux enfants, deux secteurs :
//
//   THE GENIUS (école durcie, strict_role_enforcement = 1)
//     ├── Collège  · 5e   → Jean Dupont     ─┐ enfants du PARENT A
//     ├── Primaire · CM2  → Marie Dupont    ─┘
//     ├── Collège  · 5e   → Paul Martin      → enfant du PARENT B
//     └── Primaire · CM2  → Alice Nkoa       → aucun parent rattaché
//   AUTRE ÉCOLE
//     └── 6e              → Eleve Autre
//
// Le parent A doit voir Jean ET Marie (deux secteurs), et RIEN d'autre — ni
// Paul (même classe que Jean), ni Alice (même classe que Marie), ni l'élève de
// l'autre école.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-parent-'));
const PORT = 8157;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label}${got === undefined ? '' : ` (obtenu: ${JSON.stringify(got)?.slice(0, 300)})`}`); fail++; }
};

const SCHOOL = 'sch-genius';
const AUTRE  = 'sch-autre';
const YEAR   = '2026-2027';
const PW = 'MotDePasseTest1!';

function seed() {
  process.env.NOTESCAM_DATA_DIR = dir;
  return import('./db.js').then(async ({ db }) => {
    const { hashPassword } = await import('./security.js');
    db.exec('PRAGMA foreign_keys = OFF');

    const U = (id, mail) => db.prepare(
      'INSERT INTO users (id,email,password_hash,full_name,email_confirmed_at) VALUES (?,?,?,?,?)',
    ).run(id, mail, hashPassword(PW), mail, new Date().toISOString());
    const SU = (id, school, uid, role, cycles, global) => db.prepare(
      `INSERT INTO school_users (id,school_id,user_id,role,full_name,active,scope_cycles,scope_global)
       VALUES (?,?,?,?,?,1,?,?)`,
    ).run(id, school, uid, role, uid, cycles, global);

    db.prepare('INSERT INTO schools (id,name,current_year,currency,strict_role_enforcement,parent_show_rank) VALUES (?,?,?,?,?,?)')
      .run(SCHOOL, 'THE GENIUS', YEAR, 'XAF', 1, 1);
    db.prepare('INSERT INTO schools (id,name,current_year) VALUES (?,?,?)')
      .run(AUTRE, 'AUTRE ECOLE', YEAR);

    const C = (id, school, name, cycle, section) => db.prepare(
      'INSERT INTO classes (id,school_id,name,cycle,section,system,current_year) VALUES (?,?,?,?,?,?,?)',
    ).run(id, school, name, cycle, section, 'FR', YEAR);
    C('cl-5eme', SCHOOL, '5e',  'secondaire', 'premier_cycle');
    C('cl-cm2',  SCHOOL, 'CM2', 'primaire',   'primaire');
    C('cl-autre', AUTRE, '6e',  'secondaire', 'premier_cycle');

    const E = (id, school, name, cls, mat) => db.prepare(
      'INSERT INTO students (id,school_id,name,class_id,matricule) VALUES (?,?,?,?,?)',
    ).run(id, school, name, cls, mat);
    E('el-jean',  SCHOOL, 'Jean Dupont',  'cl-5eme', 'M001');
    E('el-marie', SCHOOL, 'Marie Dupont', 'cl-cm2',  'M002');
    E('el-paul',  SCHOOL, 'Paul Martin',  'cl-5eme', 'M003');
    E('el-alice', SCHOOL, 'Alice Nkoa',   'cl-cm2',  'M004');
    E('el-autre', AUTRE,  'Eleve Autre',  'cl-autre', 'M005');

    // Matières + notes : de quoi produire une moyenne et un rang.
    const S = (id, cls, name, coef) => db.prepare(
      'INSERT INTO subjects (id,school_id,class_id,name,coef,max) VALUES (?,?,?,?,?,20)',
    ).run(id, SCHOOL, cls, name, coef);
    S('sb-math5', 'cl-5eme', 'Mathematiques', 4);
    S('sb-fr5',   'cl-5eme', 'Francais', 3);
    S('sb-math-cm2', 'cl-cm2', 'Mathematiques', 2);

    const G = (id, cls, st, sb, seq, val) => db.prepare(
      'INSERT INTO grades (id,school_id,class_id,student_id,subject_id,sequence,value) VALUES (?,?,?,?,?,?,?)',
    ).run(id, SCHOOL, cls, st, sb, seq, val);
    G('g1', 'cl-5eme', 'el-jean', 'sb-math5', 1, '15');
    G('g2', 'cl-5eme', 'el-jean', 'sb-fr5',   1, '12');
    G('g3', 'cl-5eme', 'el-paul', 'sb-math5', 1, '18');
    G('g4', 'cl-5eme', 'el-paul', 'sb-fr5',   1, '17');
    G('g5', 'cl-cm2',  'el-marie', 'sb-math-cm2', 1, '14');
    G('g6', 'cl-cm2',  'el-alice', 'sb-math-cm2', 1, '9');

    // Frais + versements
    const F = (id, st, du, paye) => db.prepare(
      'INSERT INTO student_fees (id,school_id,student_id,academic_year,frais_annuels,frais_payes,tranches) VALUES (?,?,?,?,?,?,?)',
    ).run(id, SCHOOL, st, YEAR, du, paye, '[]');
    F('f-jean',  'el-jean',  150000, 50000);
    F('f-marie', 'el-marie', 100000, 100000);
    F('f-paul',  'el-paul',  150000, 0);
    const P = (id, st, amount, no) => db.prepare(
      'INSERT INTO fee_payments (id,school_id,student_id,academic_year,amount,date,receipt_no) VALUES (?,?,?,?,?,?,?)',
    ).run(id, SCHOOL, st, YEAR, amount, '2026-09-15', no);
    P('pay-jean', 'el-jean', 50000, 1);
    P('pay-paul-secret', 'el-paul', 75000, 2);

    // Vie scolaire
    db.prepare('INSERT INTO attendance (id,school_id,student_id,class_id,year_label,date,session,status,motif) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('att-jean', SCHOOL, 'el-jean', 'cl-5eme', YEAR, '2026-10-02', 'matin', 'absent', 'Maladie');
    db.prepare('INSERT INTO attendance (id,school_id,student_id,class_id,year_label,date,session,status,motif) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('att-paul', SCHOOL, 'el-paul', 'cl-5eme', YEAR, '2026-10-03', 'matin', 'absent', 'Non justifie');
    db.prepare('INSERT INTO late_arrivals (id,school_id,student_id,class_id,year_label,date,arrival_time,reason,justified) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('lt-marie', SCHOOL, 'el-marie', 'cl-cm2', YEAR, '2026-10-05', '08:15', 'Transport', 1);
    db.prepare('INSERT INTO student_absences (id,school_id,class_id,student_id,sequence,abs_j,abs_nj) VALUES (?,?,?,?,?,?,?)')
      .run('sa-jean', SCHOOL, 'cl-5eme', 'el-jean', 1, 2, 1);

    // Notifications : une pour chaque parent, plus une pour le personnel.
    const N = (id, rid, role, title) => db.prepare(
      'INSERT INTO notifications (id,school_id,recipient_id,recipient_role,type,title,body) VALUES (?,?,?,?,?,?,?)',
    ).run(id, SCHOOL, rid, role, 'info', title, 'corps');
    N('n-a', 'u-parentA', 'parent', 'Bulletin de Jean disponible');
    N('n-b', 'u-parentB', 'parent', 'Rappel de frais pour Paul');
    N('n-staff', null, 'admin', 'Note de service interne');

    // ── Comptes ──────────────────────────────────────────────────────────────
    U('u-admin', 'admin@genius.cm');       SU('su-adm', SCHOOL, 'u-admin', 'admin',   null,             1);
    U('u-caissier', 'caisse@genius.cm');   SU('su-cai', SCHOOL, 'u-caissier', 'censeur', null,          1);
    U('u-college', 'principal@genius.cm'); SU('su-col', SCHOOL, 'u-college', 'censeur', '["secondaire"]', 0);
    U('u-prof', 'prof@genius.cm');         SU('su-prf', SCHOOL, 'u-prof', 'teacher',  '["secondaire"]', 0);

    // Autorité financière GLOBALE du caissier (test 22).
    db.prepare(`INSERT INTO user_governance_roles (id,school_id,user_id,role,status)
                VALUES (?,?,?,?,?)`).run('ugr-cai', SCHOOL, 'u-caissier', 'caissier', 'active');

    // Les PARENTS : aucune ligne school_users. C'est la définition même du rôle.
    U('u-parentA', 'parentA@famille.cm');
    U('u-parentB', 'parentB@famille.cm');
    const PA = (id, uid, name) => db.prepare(
      'INSERT INTO parent_accounts (id,user_id,full_name,active) VALUES (?,?,?,1)',
    ).run(id, uid, name);
    PA('pa-a', 'u-parentA', 'M. Dupont');
    PA('pa-b', 'u-parentB', 'Mme Martin');
    const L = (id, uid, st, rel) => db.prepare(
      `INSERT INTO parent_student_links (id,parent_user_id,school_id,student_id,relationship,active)
       VALUES (?,?,?,?,?,1)`,
    ).run(id, uid, SCHOOL, st, rel);
    L('lk-a1', 'u-parentA', 'el-jean',  'pere');
    L('lk-a2', 'u-parentA', 'el-marie', 'pere');
    L('lk-b1', 'u-parentB', 'el-paul',  'mere');

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
// Un serveur qui meurt au démarrage doit le DIRE : sans ceci, l'échec se lit
// « serveur non prêt » avec un journal vide, ce qui n'apprend rien.
srv.on('error', (e) => { log += `\n[spawn] ${e.message}`; });
srv.on('exit', (code, sig) => { log += `\n[exit] code=${code} signal=${sig}`; });

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

// Appel RPC — le SEUL chemin ouvert à un parent.
const rpc = (token, name, params = {}) => fetch(`${BASE}/api/rpc/${name}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(params),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// Requête BRUTE sur /api/db — le chemin d'un contournement de l'interface.
const q = (token, body) => fetch(`${BASE}/api/db`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const sel = (token, table, filters = []) => q(token, { table, action: 'select', columns: '*', filters });

try {
  await ready();

  const T = {};
  for (const [k, mail] of Object.entries({
    parentA: 'parentA@famille.cm', parentB: 'parentB@famille.cm',
    admin: 'admin@genius.cm', caissier: 'caisse@genius.cm',
    college: 'principal@genius.cm', prof: 'prof@genius.cm',
  })) T[k] = await login(mail);
  ok(Object.values(T).every(Boolean), 'Tous les comptes de test se connectent');

  // ══════════════════ TEST 1 — Parent A voit son enfant A ══════════════════
  const ctxA = (await rpc(T.parentA, 'parent_context')).body?.data;
  const namesA = (ctxA?.children || []).map((c) => c.student.name).sort();
  ok(ctxA && namesA.length === 2 && namesA[0] === 'Jean Dupont' && namesA[1] === 'Marie Dupont',
    'TEST 1  · Parent A voit ses 2 enfants (Jean + Marie)', namesA);

  // ══════════════════ TEST 2 — Parent A ne voit pas l'enfant B ═════════════
  ok(!namesA.includes('Paul Martin') && !namesA.includes('Alice Nkoa'),
    'TEST 2  · Parent A ne voit NI Paul (même classe que Jean) NI Alice (même classe que Marie)', namesA);

  // ══════════════════ TEST 3 / 4 — Notes ═══════════════════════════════════
  const gJean = (await rpc(T.parentA, 'parent_child_grades', { p_student: 'el-jean' })).body?.data;
  ok(gJean && gJean.grades.length === 2, 'TEST 3  · Parent A voit les notes de Jean', gJean?.grades?.length);
  const gPaul = (await rpc(T.parentA, 'parent_child_grades', { p_student: 'el-paul' })).body?.data;
  ok(gPaul === null, 'TEST 4  · Parent A ne voit PAS les notes de Paul → null', gPaul);

  // Les notes des CAMARADES ne traversent pas le réseau : seuls des agrégats.
  const jsonJean = JSON.stringify(gJean);
  ok(!jsonJean.includes('el-paul') && !jsonJean.includes('Paul Martin'),
    'TEST 4b · Aucune trace d\'un autre élève dans la réponse (agrégats seuls)');
  ok(Array.isArray(gJean.class_stats) && gJean.class_stats[0]?.size === 2,
    'TEST 4c · Moyenne de classe rendue comme agrégat (effectif 2)', gJean.class_stats);
  ok(gJean.ranks?.[0]?.rank === 2,
    'TEST 4d · Rang publié (école parent_show_rank = 1) : Jean 2e sur 2', gJean.ranks);

  // ══════════════════ TEST 5 / 6 — Absences et retards ═════════════════════
  const aJean = (await rpc(T.parentA, 'parent_child_attendance', { p_student: 'el-jean' })).body?.data;
  ok(aJean?.events?.length === 1 && aJean.events[0].motif === 'Maladie',
    'TEST 5  · Parent A voit les absences de Jean (avec motif)', aJean?.events);
  const aPaul = (await rpc(T.parentA, 'parent_child_attendance', { p_student: 'el-paul' })).body?.data;
  ok(aPaul === null, 'TEST 6  · Parent A ne voit PAS les absences de Paul → null', aPaul);

  // ══════════════════ TEST 7 / 8 — Frais ═══════════════════════════════════
  const fJean = (await rpc(T.parentA, 'parent_child_fees', { p_student: 'el-jean' })).body?.data;
  ok(fJean?.fee?.frais_annuels === 150000 && fJean.payments.length === 1,
    'TEST 7  · Parent A voit les frais et versements de Jean', fJean?.fee);
  const fPaul = (await rpc(T.parentA, 'parent_child_fees', { p_student: 'el-paul' })).body?.data;
  ok(fPaul === null, 'TEST 8  · Parent A ne voit PAS les frais de Paul → null', fPaul);

  // ══════════════════ TEST 9 / 10 — Bulletins et documents ═════════════════
  const bJean = (await rpc(T.parentA, 'parent_child_bulletins', { p_student: 'el-jean' })).body?.data;
  ok(bJean && bJean.student_id === 'el-jean',
    'TEST 9  · Parent A accède au bulletin de Jean', bJean?.student_id);
  const bPaul = (await rpc(T.parentA, 'parent_child_bulletins', { p_student: 'el-paul' })).body?.data;
  const dPaul = (await rpc(T.parentA, 'parent_child_documents', { p_student: 'el-paul' })).body?.data;
  ok(bPaul === null && dPaul === null,
    'TEST 10 · Parent A ne peut PAS télécharger le bulletin ni les documents de Paul', { bPaul, dPaul });

  const dJean = (await rpc(T.parentA, 'parent_child_documents', { p_student: 'el-jean' })).body?.data;
  ok(dJean?.receipts?.length === 1 && dJean.receipts[0].receipt_no === 1,
    'TEST 10b · Parent A retrouve le reçu n°1 de Jean, et lui seul', dJean?.receipts);

  // ══════════════════ TEST 11 / 12 — Écriture de notes ═════════════════════
  const w11 = await q(T.parentA, {
    table: 'grades', action: 'update', values: { value: '20' },
    filters: [{ col: 'id', op: 'eq', val: 'g1' }],
  });
  ok(!!w11.body?.error, 'TEST 11 · Parent A ne peut PAS modifier une note', w11.body);
  const w12 = await q(T.parentA, {
    table: 'grades', action: 'insert',
    values: { id: 'g-x', school_id: SCHOOL, class_id: 'cl-5eme', student_id: 'el-jean', subject_id: 'sb-math5', sequence: 2, value: '20' },
  });
  ok(!!w12.body?.error, 'TEST 12 · Parent A ne peut PAS créer une note', w12.body);

  // ══════════════════ TEST 13 / 14 — Écriture financière ═══════════════════
  const w13 = await q(T.parentA, {
    table: 'fee_payments', action: 'update', values: { amount: 150000 },
    filters: [{ col: 'id', op: 'eq', val: 'pay-jean' }],
  });
  ok(!!w13.body?.error, 'TEST 13 · Parent A ne peut PAS modifier un paiement', w13.body);
  const w14 = await q(T.parentA, {
    table: 'fee_payments', action: 'delete',
    filters: [{ col: 'id', op: 'eq', val: 'pay-jean' }],
  });
  ok(!!w14.body?.error, 'TEST 14 · Parent A ne peut PAS supprimer un paiement', w14.body);

  // ══════════════════ TEST 15 / 16 / 17 — Administration et personnel ══════
  const r15 = await sel(T.parentA, 'school_users');
  ok(!!r15.body?.error, 'TEST 15 · Parent A n\'accède PAS à l\'administration (school_users)', r15.body);
  const r16 = await sel(T.parentA, 'staff');
  ok(!!r16.body?.error, 'TEST 16 · Parent A n\'accède PAS à la gestion du personnel', r16.body);
  const r17 = await sel(T.parentA, 'teachers');
  ok(!!r17.body?.error, 'TEST 17 · Parent A n\'accède PAS à la gestion des enseignants', r17.body);

  // ══════════════════ TEST 18 — Accès direct par ID ════════════════════════
  const r18 = await sel(T.parentA, 'students', [{ col: 'id', op: 'eq', val: 'el-paul' }]);
  ok(!!r18.body?.error || (r18.body?.data || []).length === 0,
    'TEST 18 · Parent A n\'atteint PAS un autre élève par son ID direct', r18.body);
  const r18b = await sel(T.parentA, 'students');
  ok(!!r18b.body?.error || (r18b.body?.data || []).length === 0,
    'TEST 18b · L\'API générique est fermée au parent, même sur ses propres enfants', r18b.body);

  // ══════════════════ TEST 19 — Autre école ════════════════════════════════
  const r19 = await sel(T.parentA, 'students', [{ col: 'school_id', op: 'eq', val: AUTRE }]);
  ok(!!r19.body?.error || (r19.body?.data || []).length === 0,
    'TEST 19 · Parent A n\'accède PAS aux données d\'une autre école', r19.body);

  // ══════════════════ TEST 20 — Non authentifié ════════════════════════════
  const r20 = await rpc(null, 'parent_context');
  ok(r20.status === 401, 'TEST 20 · Un visiteur non authentifié n\'accède PAS à l\'espace parent (401)', r20.status);
  const r20b = await rpc(null, 'parent_child_grades', { p_student: 'el-jean' });
  ok(r20b.status === 401, 'TEST 20b · Même sur une RPC nommant un élève : 401', r20b.status);

  // ══════════════════ TEST 21 — Non-régression du personnel ════════════════
  const admStudents = (await sel(T.admin, 'students')).body?.data || [];
  ok(admStudents.length === 4,
    'TEST 21 · L\'administrateur conserve ses permissions (4 élèves de son école)', admStudents.length);
  const colStudents = ((await sel(T.college, 'students')).body?.data || []).map((s) => s.id).sort();
  ok(JSON.stringify(colStudents) === JSON.stringify(['el-jean', 'el-paul']),
    'TEST 21b · Le cloisonnement Collège / Primaire est INTACT (2 élèves du Collège)', colStudents);
  const profGrades = (await sel(T.prof, 'grades')).body?.data || [];
  ok(profGrades.length === 4,
    'TEST 21c · L\'enseignant du Collège conserve l\'accès aux notes de son secteur', profGrades.length);

  // ══════════════════ TEST 22 — Autorité financière préservée ══════════════
  const caiFees = ((await sel(T.caissier, 'student_fees')).body?.data || []).map((f) => f.id).sort();
  ok(caiFees.length === 3,
    'TEST 22 · Le caissier (GLOBAL) lit les frais des DEUX secteurs', caiFees);
  const encaisse = await q(T.caissier, {
    table: 'fee_payments', action: 'insert',
    values: { id: 'pay-test', school_id: SCHOOL, student_id: 'el-marie', academic_year: YEAR, amount: 10000, date: '2026-10-10' },
  });
  ok(!encaisse.body?.error,
    'TEST 22b · Le caissier encaisse toujours, y compris hors de son secteur', encaisse.body?.error);

  // ══════════════════ §17 — MULTI-ENFANTS, MULTI-SECTEURS ══════════════════
  const secteurs = (ctxA?.children || []).map((c) => c.class?.cycle).sort();
  ok(JSON.stringify(secteurs) === JSON.stringify(['primaire', 'secondaire']),
    '§17     · Parent A suit un enfant au Primaire ET un au Collège', secteurs);
  const gMarie = (await rpc(T.parentA, 'parent_child_grades', { p_student: 'el-marie' })).body?.data;
  ok(gMarie?.grades?.length === 1, '§17b    · Parent A voit les notes de Marie (Primaire)', gMarie?.grades);
  const gAlice = (await rpc(T.parentA, 'parent_child_grades', { p_student: 'el-alice' })).body?.data;
  ok(gAlice === null,
    '§17c    · Parent A ne voit AUCUN autre élève du Primaire (Alice, même classe que Marie) → null', gAlice);

  // ══════════════════ CLOISONNEMENT ENTRE PARENTS ══════════════════════════
  const ctxB = (await rpc(T.parentB, 'parent_context')).body?.data;
  const namesB = (ctxB?.children || []).map((c) => c.student.name);
  ok(JSON.stringify(namesB) === JSON.stringify(['Paul Martin']),
    'ISO-1   · Parent B ne voit QUE Paul', namesB);
  const fJeanParB = (await rpc(T.parentB, 'parent_child_fees', { p_student: 'el-jean' })).body?.data;
  ok(fJeanParB === null, 'ISO-2   · Parent B ne voit pas les frais de Jean (réciprocité)', fJeanParB);

  // ══════════════════ NOTIFICATIONS ════════════════════════════════════════
  const nA = (await rpc(T.parentA, 'parent_notifications')).body?.data || [];
  ok(nA.length === 1 && nA[0].title === 'Bulletin de Jean disponible',
    'NOTIF-1 · Parent A ne reçoit QUE ses notifications', nA.map((n) => n.title));
  const nB = (await rpc(T.parentB, 'parent_notifications')).body?.data || [];
  ok(nB.length === 1 && nB[0].title === 'Rappel de frais pour Paul',
    'NOTIF-2 · Parent B ne reçoit QUE les siennes (aucune fuite croisée)', nB.map((n) => n.title));

  // ══════════════════ AUTO-RATTACHEMENT INTERDIT ═══════════════════════════
  const escalade = await rpc(T.parentA, 'admin_link_parent_student', {
    p_parent_user_id: 'u-parentA', p_student_id: 'el-paul',
  });
  ok(!!escalade.body?.error,
    'ESC-1   · Parent A ne peut PAS se rattacher un élève dont il connaît l\'UUID', escalade.body);
  const escalade2 = await rpc(T.parentA, 'admin_create_parent_account', {
    p_user_id: 'u-parentA', p_full_name: 'Pirate',
  });
  ok(!!escalade2.body?.error,
    'ESC-2   · Parent A ne peut PAS appeler les RPC d\'administration', escalade2.body);

  // ══════════════════ SECTEUR APPLIQUÉ AU RATTACHEMENT ═════════════════════
  // Le principal du Collège rattache un parent à un élève du Collège : OK.
  // Au même parent, sur un élève du Primaire : REFUSÉ — le cloisonnement joue
  // à la création du lien, sans qu'aucune règle de secteur soit réécrite.
  const linkOk = await rpc(T.college, 'admin_link_parent_student', {
    p_parent_user_id: 'u-parentB', p_student_id: 'el-jean', p_relationship: 'tuteur',
  });
  ok(!linkOk.body?.error, 'SEC-1   · Principal Collège rattache un parent à un élève du Collège', linkOk.body);
  const linkKo = await rpc(T.college, 'admin_link_parent_student', {
    p_parent_user_id: 'u-parentB', p_student_id: 'el-alice', p_relationship: 'tuteur',
  });
  ok(!!linkKo.body?.error,
    'SEC-2   · Principal Collège NE PEUT PAS rattacher un parent à un élève du Primaire', linkKo.body);

  // ══════════════════ LA SEULE ÉCRITURE AUTORISÉE ══════════════════════════
  const prof = await rpc(T.parentA, 'parent_update_profile', { p_full_name: 'M. Dupont Jean-Pierre', p_phone: '699000000' });
  ok(prof.body?.data?.parent?.full_name === 'M. Dupont Jean-Pierre',
    'PROF-1  · Le parent met à jour SON profil (seule écriture de l\'espace)', prof.body?.error);

  // ══════════════════ LE PORTAIL PUBLIC PAR JETON N'EST PAS CASSÉ ══════════
  const tokenRpc = await rpc(null, 'get_parent_portal_data', { p_token: 'inconnu' });
  ok(tokenRpc.status === 200,
    'COMPAT  · Le portail public /parent/:token reste ouvert et fonctionnel', tokenRpc.status);
} finally {
  srv.stdout.removeAllListeners('data');
  srv.stderr.removeAllListeners('data');
  srv.kill();
  await new Promise((r) => { srv.on('exit', r); setTimeout(r, 3000); });
}

try { rmSync(dir, { recursive: true, force: true }); } catch { /* verrou Windows */ }
console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
