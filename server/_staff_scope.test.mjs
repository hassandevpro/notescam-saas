// Test LAN — PÉRIMÈTRE de responsabilité (admin_set_staff_scope / admin_list_staff).
//
// Dans un complexe scolaire, le directeur du fondamental (MINEDUB) et le
// proviseur du secondaire (MINESEC) ne règlent pas les mêmes dates de calendrier.
// SQLite n'ayant pas de type tableau, le périmètre est stocké en TEXT JSON —
// ce test verrouille l'aller-retour écriture → lecture → normalisation client.
//
//   node server/_staff_scope.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-scope-'));
process.env.NOTESCAM_DATA_DIR = dir;
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { runRpc: rawRpc } = await import('./rpc.js');
// runRpc renvoie { data, error } au lieu de lever : on déballe pour lire clairement.
const runRpc = (name, params, ctx) => rawRpc(name, params, ctx);
const callOk = (name, params, ctx) => { const r = runRpc(name, params, ctx); if (r.error) throw new Error(r.error.message); return r.data; };
const { normalizeScope, isGlobalScope, filterClassesByScope } =
  await import('../src/core/surveillantScope.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { if (c) { console.log(`✅ ${label}`); pass++; } else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; } };

// ── Seed : une école, un admin (directeur), un admin (proviseur), un censeur ──
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch1', 'Complexe Scolaire');
db.prepare('INSERT INTO schools (id, name) VALUES (?,?)').run('sch2', 'Autre école');

const addUser = (id, name) => db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)')
  .run(id, `${id}@ex.cm`, 'x', name);
const addMember = (id, userId, role, school = 'sch1') =>
  db.prepare('INSERT INTO school_users (id, school_id, user_id, role, full_name, active) VALUES (?,?,?,?,?,1)')
    .run(id, school, userId, role, id);

addUser('u_dir', 'Directeur');   addMember('su_dir', 'u_dir', 'admin');
addUser('u_prov', 'Proviseur');  addMember('su_prov', 'u_prov', 'admin');
addUser('u_cens', 'Censeur');    addMember('su_cens', 'u_cens', 'censeur');
addUser('u_prof', 'Prof');       addMember('su_prof', 'u_prof', 'teacher');
addUser('u_other', 'Admin 2');   addMember('su_other', 'u_other', 'admin', 'sch2');

const asDir = { userId: 'u_dir' };

// ── Écriture du périmètre ───────────────────────────────────────────────────
runRpc('admin_set_staff_scope', {
  p_school_user_id: 'su_dir', p_sections: [], p_cycles: ['fondamental'], p_class_ids: [],
}, asDir);
runRpc('admin_set_staff_scope', {
  p_school_user_id: 'su_prov', p_sections: [], p_cycles: ['secondaire'], p_class_ids: [],
}, asDir);
runRpc('admin_set_staff_scope', {
  p_school_user_id: 'su_cens', p_sections: ['maternelle'], p_cycles: [], p_class_ids: [],
}, asDir);

const rowOf = (id) => db.prepare('SELECT * FROM school_users WHERE id = ?').get(id);

ok(rowOf('su_dir').scope_cycles === '["fondamental"]',
  'un ADMIN peut désormais porter un périmètre', rowOf('su_dir').scope_cycles);
ok(rowOf('su_cens').scope_sections === '["maternelle"]',
  'le censeur garde le sien', rowOf('su_cens').scope_sections);
ok(rowOf('su_dir').scope_sections === '[]' && rowOf('su_dir').scope_class_ids === '[]',
  'les dimensions vides sont écrites en tableau JSON vide');

// ── Rôles et écoles refusés ─────────────────────────────────────────────────
runRpc('admin_set_staff_scope', { p_school_user_id: 'su_prof', p_sections: ['primaire'], p_cycles: [], p_class_ids: [] }, asDir);
ok(rowOf('su_prof').scope_sections == null, 'un enseignant ne reçoit pas de périmètre', rowOf('su_prof').scope_sections);

runRpc('admin_set_staff_scope', { p_school_user_id: 'su_other', p_sections: ['primaire'], p_cycles: [], p_class_ids: [] }, asDir);
ok(rowOf('su_other').scope_sections == null, 'aucune fuite vers une autre école', rowOf('su_other').scope_sections);

const refus = runRpc('admin_set_staff_scope', { p_school_user_id: 'su_dir', p_sections: [], p_cycles: [], p_class_ids: [] }, { userId: 'u_cens' });
ok(!!refus.error, 'un censeur ne peut pas redistribuer les périmètres', refus.error);

// Un administrateur RESTREINT garde le droit de se redonner un périmètre global
// (l'autorisation dépend du rôle, jamais du périmètre) — aucun verrouillage.
runRpc('admin_set_staff_scope', { p_school_user_id: 'su_dir', p_sections: [], p_cycles: [], p_class_ids: [] }, asDir);
ok(rowOf('su_dir').scope_cycles === '[]', 'un admin restreint peut se libérer lui-même');
runRpc('admin_set_staff_scope', { p_school_user_id: 'su_dir', p_sections: [], p_cycles: ['fondamental'], p_class_ids: [] }, asDir);

// ── Relecture par admin_list_staff ──────────────────────────────────────────
const admins = callOk('admin_list_staff', { p_role: 'admin' }, asDir);
ok(admins.length === 2, 'les deux administrateurs de l’école sont listés', admins.length);
const dir1 = admins.find((r) => r.id === 'su_dir');
ok(dir1 && 'scope_cycles' in dir1, 'admin_list_staff renvoie bien les colonnes de périmètre');
ok(dir1 && 'role' in dir1 && 'permissions' in dir1, 'parité cloud : rôle et capacités aussi');
ok(dir1.scope_cycles === '["fondamental"]', 'le périmètre relu est celui enregistré', dir1.scope_cycles);

// ── Le client sait lire cette forme (TEXT JSON) ─────────────────────────────
// C'est l'étape qui manquait : sans elle le périmètre était lu comme vide.
ok(!isGlobalScope(dir1), 'côté client : le périmètre relu n’est pas « global »');
ok(normalizeScope(dir1).cycles.join(',') === 'fondamental', 'côté client : JSON TEXT désérialisé');

const classes = [
  { id: 'c1', level: 'Petite Section' }, { id: 'c2', level: 'CM2' },
  { id: 'c3', level: '6ème' }, { id: 'c4', level: 'Terminale C' },
];
ok(filterClassesByScope(dir1, classes).map((c) => c.id).join(',') === 'c1,c2',
  'le directeur ne pilote que maternelle + primaire');
const prov = admins.find((r) => r.id === 'su_prov');
ok(filterClassesByScope(prov, classes).map((c) => c.id).join(',') === 'c3,c4',
  'le proviseur ne pilote que collège + lycée');

// Un compte jamais réglé reste global (rétro-compatible : écoles déjà installées).
const censeurs = callOk('admin_list_staff', { p_role: 'teacher' }, asDir);
ok(isGlobalScope(censeurs[0]), 'périmètre jamais posé → tout l’établissement (aucune régression)');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
