// SECTEUR DU PERSONNEL — enseignants ET personnel administratif.
//
// Décisions du 26/08/2026, après l'audit de THE GENIUS (11 enseignants rattachés
// à aucune classe, registre `staff` vide) :
//
//   • le secteur est DÉCLARÉ sur la fiche ; la dérivation par les classes n'est
//     plus qu'un repli quand rien n'est déclaré ;
//   • NULL n'est PAS un secteur. C'est « non défini » — ni « transverse », ni
//     « secondaire ». Aucun responsable sectoriel ne voit une fiche non définie ;
//   • à la CRÉATION, le serveur impose le secteur du créateur s'il n'en a qu'un,
//     et n'accepte qu'un des siens s'il en a plusieurs ; l'administrateur choisit,
//     mais ne peut pas laisser le champ vide ;
//   • MODIFIER le secteur est réservé à l'administrateur — sans quoi un
//     responsable s'approprierait n'importe quelle fiche d'un simple update.
//
// Le test attaque `runQuery`, la couche qui sert l'API générique /api/db : c'est
// elle la frontière, pas l'écran.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-secteur-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

const { db } = await import('./db.js');
const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── École DURCIE + une école témoin, jamais durcie ──────────────────────────
db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,1)').run('DUR', 'THE GENIUS');
db.prepare('INSERT INTO schools (id,name,strict_role_enforcement) VALUES (?,?,0)').run('AUTRE', 'AUTRE ECOLE');

const C = (id, school, name, cycle) => db.prepare('INSERT INTO classes (id,school_id,name,cycle) VALUES (?,?,?,?)').run(id, school, name, cycle);
C('c-mat', 'DUR', 'NURSERY 1', 'maternelle');
C('c-pri', 'DUR', 'CM2', 'primaire');
C('c-col', 'DUR', 'FORM2', 'secondaire');
C('c-a', 'AUTRE', 'CM1', 'primaire');

const U = (id) => db.prepare('INSERT INTO users (id,email,password_hash,full_name) VALUES (?,?,?,?)').run(id, `${id}@x.cm`, 'h', id);
// PÉRIMÈTRE EXPRIMÉ EN CYCLES, et non en sections — c'est la forme qu'impose la
// donnée réelle de THE GENIUS : ses classes déclarent `cycle` et laissent
// `section` à NULL, or `allowsClass` ne rapproche un périmètre en SECTIONS que de
// `classes.section`. Un périmètre en sections n'y couvrirait aucune classe, donc
// aucun secteur, et le responsable ne pourrait même plus créer de personnel.
const SU = (id, school, uid, role, cycles, global) => db.prepare(
  `INSERT INTO school_users (id,school_id,user_id,role,full_name,active,scope_cycles,scope_global)
   VALUES (?,?,?,?,?,1,?,?)`).run(id, school, uid, role, uid, cycles, global);

for (const u of ['u-admin', 'u-pri', 'u-mat', 'u-col', 'u-secr', 'u-autre']) U(u);
SU('su1', 'DUR', 'u-admin', 'admin', null, 1);
SU('su2', 'DUR', 'u-pri', 'censeur', '["primaire"]', 0);
SU('su3', 'DUR', 'u-mat', 'censeur', '["maternelle"]', 0);
SU('su4', 'DUR', 'u-col', 'censeur', '["secondaire"]', 0);
SU('su5', 'DUR', 'u-secr', 'censeur', '["maternelle","primaire"]', 0);  // Secrétariat : DEUX secteurs
SU('su6', 'AUTRE', 'u-autre', 'censeur', '["primaire"]', 0);

// Les chefs de secteur portent l'autorité RH sectorielle.
db.prepare(
  `INSERT INTO governance_roles (id,school_id,code,name,description,rank,scope,sector,permissions,pages,dashboards,workflows,active,is_system)
   VALUES (?,?,?,?,'',50,'sector',NULL,?,'[]','[]','[]',1,1)`,
).run('gr1', 'DUR', 'chef_secteur', 'chef_secteur', JSON.stringify(['staff.manage.sector']));
const AS = (uid) => db.prepare('INSERT INTO user_governance_roles (id,school_id,user_id,role) VALUES (?,?,?,?)')
  .run(`ug-${uid}`, 'DUR', uid, 'chef_secteur');
for (const u of ['u-pri', 'u-mat', 'u-col', 'u-secr']) AS(u);

const q = (op, userId) => runQuery(op, { userId });
const creerEns = (id, userId, values = {}) => q({
  table: 'teachers', action: 'insert',
  values: { id, school_id: 'DUR', name: id, ...values },
}, userId);
const secteurDe = (t, id) => db.prepare(`SELECT sector FROM ${t} WHERE id = ?`).get(id)?.sector ?? null;
const lus = (userId, table) => {
  const r = q({ table, action: 'select', filters: [{ col: 'school_id', op: 'eq', val: 'DUR' }] }, userId);
  return (r.data || []).map((x) => x.id);
};

// ══ A. ENSEIGNANTS ════════════════════════════════════════════════════════
// Fiche héritée, sans secteur — l'état réel des 11 de THE GENIUS.
db.prepare('INSERT INTO teachers (id,school_id,name) VALUES (?,?,?)').run('t-null', 'DUR', 'HERITE SANS SECTEUR');

ok(secteurDe('teachers', 't-null') === null, 'A1. enseignant existant sans secteur -> reste NULL', secteurDe('teachers', 't-null'));
ok(lus('u-admin', 'teachers').includes('t-null'), 'A2. NULL -> visible de l administrateur (il doit pouvoir corriger)');
ok(!lus('u-col', 'teachers').includes('t-null'), 'A3. NULL -> PAS assimile au secondaire : invisible du responsable College');
ok(!lus('u-pri', 'teachers').includes('t-null'), 'A3bis. NULL -> invisible de la Directrice du Primaire aussi');

const cPri = creerEns('t-1', 'u-pri', { sector: 'college' });   // tente d'imposer un autre secteur
ok(!cPri.error && secteurDe('teachers', 't-1') === 'primaire',
  'A4/A10. Directrice Primaire cree -> secteur IMPOSE primaire, le college envoye est ecrase',
  { err: cPri.error, sec: secteurDe('teachers', 't-1') });

const cCol = creerEns('t-2', 'u-col');
ok(!cCol.error && secteurDe('teachers', 't-2') === 'college', 'A5. Responsable Secondaire cree -> college', { err: cCol.error, sec: secteurDe('teachers', 't-2') });

const cMat = creerEns('t-3', 'u-mat');
ok(!cMat.error && secteurDe('teachers', 't-3') === 'maternelle', 'A6. Responsable Maternelle cree -> maternelle', { err: cMat.error, sec: secteurDe('teachers', 't-3') });

const cAdminVide = creerEns('t-4', 'u-admin');
ok(!!cAdminVide.error, 'A7. Administrateur cree SANS secteur -> REFUS', cAdminVide.error);
const cAdminOk = creerEns('t-5', 'u-admin', { sector: 'maternelle' });
ok(!cAdminOk.error && secteurDe('teachers', 't-5') === 'maternelle', 'A7bis. Administrateur cree AVEC secteur -> accepte', cAdminOk.error);

const majAdmin = q({ table: 'teachers', action: 'update', values: { sector: 'primaire' }, filters: [{ col: 'id', op: 'eq', val: 't-null' }] }, 'u-admin');
ok(!majAdmin.error && secteurDe('teachers', 't-null') === 'primaire', 'A8. Administrateur affecte un NULL -> secteur enregistre', { err: majAdmin.error, sec: secteurDe('teachers', 't-null') });

const majVol = q({ table: 'teachers', action: 'update', values: { sector: 'college' }, filters: [{ col: 'id', op: 'eq', val: 't-null' }] }, 'u-col');
ok(!!majVol.error && secteurDe('teachers', 't-null') === 'primaire',
  'A9. non-admin tente de deplacer une fiche dans SON secteur -> REFUS', { err: majVol.error, sec: secteurDe('teachers', 't-null') });

// ══ B. PERSONNEL ADMINISTRATIF ════════════════════════════════════════════
db.prepare('INSERT INTO staff (id,school_id,name,department) VALUES (?,?,?,?)').run('s-null', 'DUR', 'AGENT SANS SECTEUR', 'administration');
ok(secteurDe('staff', 's-null') === null, 'B11. staff existant sans secteur -> reste NULL');
ok(lus('u-admin', 'staff').includes('s-null'), 'B12. administrateur voit les fiches non affectees');

const creerStaff = (id, userId, values = {}) => q({
  table: 'staff', action: 'insert',
  values: { id, school_id: 'DUR', name: id, department: 'administration', ...values },
}, userId);
ok(!creerStaff('s-1', 'u-pri').error && secteurDe('staff', 's-1') === 'primaire', 'B13. staff cree par le Primaire -> primaire');
ok(!creerStaff('s-2', 'u-col').error && secteurDe('staff', 's-2') === 'college', 'B14. staff cree par le Secondaire -> college');
ok(!creerStaff('s-3', 'u-mat').error && secteurDe('staff', 's-3') === 'maternelle', 'B15. staff cree par la Maternelle -> maternelle');

// Secrétariat : DEUX secteurs -> il choisit, le serveur ne devine pas.
const sSecrVide = creerStaff('s-4', 'u-secr');
ok(!!sSecrVide.error, 'B16. createur multi-secteurs SANS choix -> REFUS (le serveur ne choisit pas a sa place)', sSecrVide.error);
const sSecrOk = creerStaff('s-5', 'u-secr', { sector: 'maternelle' });
ok(!sSecrOk.error && secteurDe('staff', 's-5') === 'maternelle', 'B16bis. createur multi-secteurs choisit DANS ses secteurs -> accepte', sSecrOk.error);
const sSecrHors = creerStaff('s-6', 'u-secr', { sector: 'college' });
ok(!!sSecrHors.error, 'B17. createur multi-secteurs tente un secteur HORS perimetre -> REFUS', sSecrHors.error);

// ══ C. VISIBILITÉ ═════════════════════════════════════════════════════════
const vuPri = lus('u-pri', 'staff');
const vuSecr = lus('u-secr', 'staff');
const vuCol = lus('u-col', 'staff');
ok(vuPri.includes('s-1') && !vuPri.includes('s-2'), 'C18/C19. Directrice Primaire -> son personnel, AUCUN du Secondaire', vuPri);
ok(vuSecr.includes('s-1') && vuSecr.includes('s-3') && vuSecr.includes('s-5'), 'C20. Secretariat mat+pri -> personnel des DEUX secteurs', vuSecr);
ok(!vuSecr.includes('s-2'), 'C21. Secretariat mat+pri -> AUCUN personnel du Secondaire', vuSecr);
ok(vuCol.includes('s-2'), 'C22. Secretariat College -> personnel du Secondaire', vuCol);
ok(!vuCol.includes('s-1') && !vuCol.includes('s-3'), 'C23. Secretariat College -> AUCUN Primaire ni Maternelle', vuCol);
ok(lus('u-mat', 'teachers').includes('t-3') && !lus('u-mat', 'teachers').includes('t-2'), 'C24. Responsable Maternelle -> ses enseignants seuls');
ok(lus('u-col', 'teachers').includes('t-2') && !lus('u-col', 'teachers').includes('t-1'), 'C25. Responsable Secondaire -> ses enseignants seuls');

// Accès DIRECT par identifiant : le contournement le plus évident.
const direct = q({ table: 'staff', action: 'select', filters: [{ col: 'id', op: 'eq', val: 's-2' }] }, 'u-pri');
ok((direct.data || []).length === 0, 'C26. acces direct par ID hors perimetre -> aucune ligne', direct.data);

// ══ D. NON-RÉGRESSION : école jamais durcie ═══════════════════════════════
db.prepare('INSERT INTO teachers (id,school_id,name) VALUES (?,?,?)').run('t-autre', 'AUTRE', 'PROF AUTRE ECOLE');
const rAutre = q({ table: 'teachers', action: 'select', filters: [{ col: 'school_id', op: 'eq', val: 'AUTRE' }] }, 'u-autre');
ok((rAutre.data || []).some((x) => x.id === 't-autre'), 'D27. ecole NON durcie : fiche sans secteur toujours visible (comportement inchange)', rAutre.error);
const cAutre = q({ table: 'teachers', action: 'insert', values: { id: 't-autre2', school_id: 'AUTRE', name: 'X' } }, 'u-autre');
ok(!cAutre.error, 'D28. ecole NON durcie : creation sans secteur toujours acceptee', cAutre.error);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ECHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
