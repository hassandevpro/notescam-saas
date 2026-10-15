// SÉCURITÉ — intégration de bout en bout sur le VRAI serveur LAN (Fastify + JWT).
// Exécution : node server/_bulletinSecurityE2E.test.mjs
//
// Deux établissements FICTIFS, quatre rôles, et le parcours complet d'un bulletin :
// lecture, création, modification, suppression, génération individuelle et en lot.
// Tout passe par HTTP /api/db et /api/db/batch — donc par l'authentification, le
// routage et la chaîne de gardes réelles, pas seulement par runQuery.
//
// Base jetable, données 100 % fictives, serveur dédié sur un port isolé. Aucune
// base d'école, aucune configuration de production n'est touchée.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'nc-sec-'));
const PORT = 8137;
const BASE = `http://127.0.0.1:${PORT}`;

const srv = spawn(process.execPath, [join(__dirname, 'index.js')], {
  env: { ...process.env, NOTESCAM_DATA_DIR: dir, PORT: String(PORT), HOST: '127.0.0.1', NOTESCAM_LICENSE_ENABLED: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvLog = '';
srv.stdout.on('data', (d) => { srvLog += d; });
srv.stderr.on('data', (d) => { srvLog += d; });

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

async function waitReady(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`${BASE}/api/license`); if (r.ok) return true; } catch { /* pas prêt */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('serveur non prêt — log:\n' + srvLog.slice(-1500));
}

const call = (path, token, body) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}).then((r) => r.json().then((j) => ({ status: r.status, ...j })));

const q = (token, op) => call('/api/db', token, op);
const batch = (token, ops) => call('/api/db/batch', token, { ops });

const signup = (email) => fetch(`${BASE}/api/auth/signup`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'motdepasse-de-test-123', full_name: email }),
}).then((r) => r.json());

const ids = (r) => (r.data || []).map((x) => x.id).sort().join(',');
const refuse = (r) => !!r.error || (r.data || []).length === 0;

try {
  await waitReady();

  // ── Amorçage : compte installateur, NON rattaché (cf. loadScope) ──────────
  const boot = await signup('install@test.local');
  const T0 = boot?.data?.session?.access_token;
  ok(!!T0, 'amorçage : compte installateur authentifié');

  // Quatre comptes de test, un par rôle.
  const comptes = {};
  for (const [cle, email] of Object.entries({
    dirA: 'dir.a@test.local', profA: 'prof.a@test.local',
    censA: 'censeur.a@test.local', dirB: 'dir.b@test.local',
  })) {
    const s = await signup(email);
    comptes[cle] = { token: s?.data?.session?.access_token, id: s?.data?.user?.id };
  }
  ok(Object.values(comptes).every((c) => c.token && c.id), '4 comptes de rôles créés');

  // ── Deux établissements fictifs ──────────────────────────────────────────
  await q(T0, { table: 'schools', action: 'insert', values: [
    { id: 'A', name: 'Collège Alpha (fictif)' }, { id: 'B', name: 'Collège Bravo (fictif)' }] });

  // École A : une 6e bilingue (collège) + un CE1 (primaire). École B : une 6e.
  await q(T0, { table: 'classes', action: 'insert', values: [
    { id: 'A-6e',  school_id: 'A', name: '6e Bilingue', level: '6e',  section: 'college',  cycle: 'secondaire' },
    { id: 'A-ce1', school_id: 'A', name: 'CE1',         level: 'CE1', section: 'primaire', cycle: 'fondamental' },
    { id: 'B-6e',  school_id: 'B', name: '6e Bilingue', level: '6e',  section: 'college',  cycle: 'secondaire' }] });
  await q(T0, { table: 'students', action: 'insert', values: [
    { id: 'A-e1', school_id: 'A', class_id: 'A-6e',  name: 'Élève A6 (fictif)' },
    { id: 'A-e2', school_id: 'A', class_id: 'A-ce1', name: 'Élève ACE1 (fictif)' },
    { id: 'B-e1', school_id: 'B', class_id: 'B-6e',  name: 'Élève B6 (fictif)' }] });
  await q(T0, { table: 'subjects', action: 'insert', values: [
    { id: 'A-m1', school_id: 'A', class_id: 'A-6e',  name: 'Français', coef: 4, max: 20 },
    { id: 'A-m2', school_id: 'A', class_id: 'A-ce1', name: 'Lecture',  coef: 2, max: 20 },
    { id: 'B-m1', school_id: 'B', class_id: 'B-6e',  name: 'Français', coef: 4, max: 20 }] });
  await q(T0, { table: 'grades', action: 'insert', values: [
    { id: 'A-g1', school_id: 'A', class_id: 'A-6e',  student_id: 'A-e1', subject_id: 'A-m1', sequence: 1, value: '15' },
    { id: 'A-g2', school_id: 'A', class_id: 'A-ce1', student_id: 'A-e2', subject_id: 'A-m2', sequence: 1, value: '12' },
    { id: 'B-g1', school_id: 'B', class_id: 'B-6e',  student_id: 'B-e1', subject_id: 'B-m1', sequence: 1, value: '18' }] });

  // Rattachements + périmètres.
  await q(T0, { table: 'school_users', action: 'insert', values: [
    { id: 'su-a',  school_id: 'A', user_id: comptes.dirA.id,  role: 'admin',   active: 1, scope_global: 1, scope_sections: '[]', scope_cycles: '[]', scope_class_ids: '[]' },
    { id: 'su-p',  school_id: 'A', user_id: comptes.profA.id, role: 'teacher', active: 1, scope_global: 0, scope_sections: '[]', scope_cycles: '[]', scope_class_ids: '["A-6e"]' },
    { id: 'su-c',  school_id: 'A', user_id: comptes.censA.id, role: 'censeur', active: 1, scope_global: 0, scope_sections: '["primaire"]', scope_cycles: '[]', scope_class_ids: '[]' },
    { id: 'su-b',  school_id: 'B', user_id: comptes.dirB.id,  role: 'admin',   active: 1, scope_global: 1, scope_sections: '[]', scope_cycles: '[]', scope_class_ids: '[]' }] });
  ok(true, 'jeu d\'essai posé : 2 établissements, 3 classes, 3 élèves, 3 notes');

  const sel = (token, table, filters = []) => q(token, { table, action: 'select', columns: '*', filters });

  // ── 1. LECTURE ───────────────────────────────────────────────────────────
  console.log('\n── 1. Lecture ──');
  ok(ids(await sel(comptes.dirA.token, 'grades')) === 'A-g1,A-g2', 'direction A lit les 2 notes de SON école', ids(await sel(comptes.dirA.token, 'grades')));
  ok(ids(await sel(comptes.dirB.token, 'grades')) === 'B-g1', 'direction B ne lit que l\'école B');
  ok(ids(await sel(comptes.profA.token, 'grades')) === 'A-g1', 'enseignant cloisonné : sa seule classe');
  ok(ids(await sel(comptes.censA.token, 'grades')) === 'A-g2', 'censeur primaire : son seul secteur');
  for (const t of ['classes', 'students', 'subjects', 'grades']) {
    const r = await sel(comptes.dirA.token, t, [{ op: 'eq', col: 'school_id', val: 'B' }]);
    ok((r.data || []).length === 0, `direction A visant school_id=B sur ${t} → 0 ligne`, r.data?.length);
  }
  const cible = await sel(comptes.profA.token, 'grades', [{ op: 'eq', col: 'id', val: 'A-g2' }]);
  ok((cible.data || []).length === 0, 'enseignant visant l\'id exact d\'une note hors périmètre → 0 ligne');

  // ── 2. CRÉATION ──────────────────────────────────────────────────────────
  console.log('\n── 2. Création ──');
  const c1 = await q(comptes.profA.token, { table: 'grades', action: 'insert', values: { id: 'X1', school_id: 'A', class_id: 'A-6e', student_id: 'A-e1', subject_id: 'A-m1', sequence: 2, value: '14' } });
  ok(!c1.error, 'enseignant crée une note DANS sa classe : autorisé', c1.error);
  const c2 = await q(comptes.profA.token, { table: 'grades', action: 'insert', values: { id: 'X2', school_id: 'A', class_id: 'A-ce1', student_id: 'A-e2', subject_id: 'A-m2', sequence: 2, value: '14' } });
  ok(!!c2.error, 'enseignant crée une note dans l\'AUTRE secteur : refusé');
  const c3 = await q(comptes.dirA.token, { table: 'grades', action: 'insert', values: { id: 'X3', school_id: 'B', class_id: 'B-6e', student_id: 'B-e1', subject_id: 'B-m1', sequence: 2, value: '14' } });
  ok(!!c3.error, 'direction A crée une note dans l\'école B : refusé');
  const c4 = await q(comptes.dirB.token, { table: 'students', action: 'insert', values: { id: 'X4', school_id: 'A', class_id: 'A-6e', name: 'Intrus' } });
  ok(!!c4.error, 'direction B crée un élève dans l\'école A : refusé');

  // ── 3. MODIFICATION ──────────────────────────────────────────────────────
  console.log('\n── 3. Modification ──');
  const u1 = await q(comptes.dirA.token, { table: 'grades', action: 'update', values: { value: '16' }, filters: [{ op: 'eq', col: 'id', val: 'A-g1' }] });
  ok(!u1.error, 'direction A modifie une note de SON école : autorisé', u1.error);
  const u2 = await q(comptes.dirA.token, { table: 'grades', action: 'update', values: { value: '0' }, filters: [{ op: 'eq', col: 'id', val: 'B-g1' }] });
  ok(!!u2.error, 'direction A modifie une note de l\'école B : refusé');
  const u3 = await q(comptes.profA.token, { table: 'grades', action: 'update', values: { value: '0' }, filters: [{ op: 'eq', col: 'id', val: 'A-g2' }] });
  ok(!!u3.error, 'enseignant modifie une note hors de son périmètre : refusé');
  const verifB = await sel(comptes.dirB.token, 'grades', [{ op: 'eq', col: 'id', val: 'B-g1' }]);
  ok(verifB.data?.[0]?.value === '18', 'la note de l\'école B est INTACTE', verifB.data?.[0]?.value);

  // ── 4. SUPPRESSION ───────────────────────────────────────────────────────
  console.log('\n── 4. Suppression ──');
  const d1 = await q(comptes.dirA.token, { table: 'grades', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'B-g1' }] });
  ok(!!d1.error, 'direction A supprime une note de l\'école B : refusé');
  const d2 = await q(comptes.profA.token, { table: 'students', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'A-e2' }] });
  ok(!!d2.error, 'enseignant supprime un élève hors périmètre : refusé');
  const d3 = await q(comptes.dirA.token, { table: 'grades', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'X1' }] });
  ok(!d3.error, 'direction A supprime une note de son école : autorisé', d3.error);
  const resteB = await sel(comptes.dirB.token, 'grades');
  ok(ids(resteB) === 'B-g1', 'après toutes ces tentatives, l\'école B est intacte', ids(resteB));

  // ── 5. GÉNÉRATION DE BULLETIN (lecture complète) ─────────────────────────
  console.log('\n── 5. Génération de bulletin ──');
  async function genererBulletins(token, classId) {
    const cls = await sel(token, 'classes', [{ op: 'eq', col: 'id', val: classId }]);
    if (!(cls.data || []).length) return { refuse: true };
    const [el, mat, no] = await Promise.all([
      sel(token, 'students', [{ op: 'eq', col: 'class_id', val: classId }]),
      sel(token, 'subjects', [{ op: 'eq', col: 'class_id', val: classId }]),
      sel(token, 'grades',   [{ op: 'eq', col: 'class_id', val: classId }]),
    ]);
    return { refuse: false, eleves: (el.data || []).length, matieres: (mat.data || []).length, notes: (no.data || []).length };
  }
  const gOK = await genererBulletins(comptes.profA.token, 'A-6e');
  ok(!gOK.refuse && gOK.eleves === 1 && gOK.matieres === 1, 'enseignant génère le bulletin de SA classe', gOK);
  ok((await genererBulletins(comptes.profA.token, 'A-ce1')).refuse, 'génération sur la classe d\'un autre secteur : rien à produire');
  ok((await genererBulletins(comptes.dirA.token, 'B-6e')).refuse, 'génération sur une classe d\'un AUTRE établissement : rien à produire');
  ok((await genererBulletins(comptes.dirB.token, 'A-6e')).refuse, 'réciproque (B vers A) : rien à produire');

  // ── 6. OPÉRATIONS EN LOT ─────────────────────────────────────────────────
  console.log('\n── 6. Opérations en lot ──');
  const bOK = await batch(comptes.profA.token, [
    { table: 'grades', action: 'insert', values: { id: 'L1', school_id: 'A', class_id: 'A-6e', student_id: 'A-e1', subject_id: 'A-m1', sequence: 3, value: '11' } },
    { table: 'grades', action: 'insert', values: { id: 'L2', school_id: 'A', class_id: 'A-6e', student_id: 'A-e1', subject_id: 'A-m1', sequence: 4, value: '13' } },
  ]);
  ok(!bOK.error, 'lot de saisie dans SA classe : appliqué', bOK.error);
  // Lot MIXTE : une op légitime + une op hors école. Doit être refusé ET annulé.
  const bKO = await batch(comptes.profA.token, [
    { table: 'grades', action: 'insert', values: { id: 'L3', school_id: 'A', class_id: 'A-6e', student_id: 'A-e1', subject_id: 'A-m1', sequence: 5, value: '17' } },
    { table: 'grades', action: 'insert', values: { id: 'L4', school_id: 'B', class_id: 'B-6e', student_id: 'B-e1', subject_id: 'B-m1', sequence: 5, value: '17' } },
  ]);
  ok(!!bKO.error, 'lot MIXTE contenant une écriture hors école : refusé', bKO);
  const l3 = await sel(comptes.dirA.token, 'grades', [{ op: 'eq', col: 'id', val: 'L3' }]);
  ok((l3.data || []).length === 0, 'lot refusé → ROLLBACK : l\'op légitime du lot n\'a pas été écrite non plus');
  const l4 = await sel(comptes.dirB.token, 'grades', [{ op: 'eq', col: 'id', val: 'L4' }]);
  ok((l4.data || []).length === 0, 'et rien n\'a atteint l\'école B');
  // Lot franchissant les secteurs à l'intérieur d'une même école.
  const bSect = await batch(comptes.profA.token, [
    { table: 'grades', action: 'insert', values: { id: 'L5', school_id: 'A', class_id: 'A-ce1', student_id: 'A-e2', subject_id: 'A-m2', sequence: 3, value: '9' } },
  ]);
  ok(!!bSect.error, 'lot visant l\'autre secteur de la même école : refusé');

  // ── 7. ACCÈS À L'API ─────────────────────────────────────────────────────
  console.log('\n── 7. Accès à l\'API ──');
  const sansJeton = await q('', { table: 'grades', action: 'select', columns: '*' });
  ok(sansJeton.status === 401, 'aucun jeton → HTTP 401', sansJeton.status);
  const jetonForge = await q('ceci.nest.pas-un-jeton', { table: 'grades', action: 'select', columns: '*' });
  ok(jetonForge.status === 401, 'jeton forgé → HTTP 401', jetonForge.status);
  // Identité revendiquée dans le CORPS : ignorée, seul le jeton fait foi.
  const normal = await sel(comptes.profA.token, 'grades');
  const usurp = await call('/api/db', comptes.profA.token, {
    table: 'grades', action: 'select', columns: '*', userId: comptes.dirA.id, user_id: comptes.dirA.id, school_id: 'B',
  });
  ok(ids(usurp) === ids(normal), 'identité revendiquée dans le corps : IGNORÉE, le jeton fait foi', { usurp: ids(usurp), normal: ids(normal) });
  ok(!(usurp.data || []).some((g) => g.school_id === 'B'), 'et aucune ligne de l\'école B n\'a fuité');
  const tableInterdite = await q(comptes.dirA.token, { table: 'sqlite_master', action: 'select', columns: '*' });
  ok(!!tableInterdite.error, 'table hors allowlist : refusée');

  // ── 8. Garde-fou du test ─────────────────────────────────────────────────
  console.log('\n── 8. Garde-fou ──');
  const toutA = await sel(comptes.dirA.token, 'grades');
  const toutB = await sel(comptes.dirB.token, 'grades');
  ok((toutA.data || []).length >= 2 && (toutB.data || []).length === 1,
    'les deux écoles contiennent bien des données : la comparaison n\'est pas triviale',
    { A: toutA.data?.length, B: toutB.data?.length });
} catch (e) {
  console.error('ERREUR : ' + e.message);
  fail++;
} finally {
  srv.kill();
  await new Promise((r) => setTimeout(r, 300));
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} réussis · ${fail} échoués`);
process.exit(fail ? 1 : 0);
