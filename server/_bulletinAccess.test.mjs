// AUDIT D'AUTORISATION — accès aux données de bulletin (LAN).
// Exécution : node server/_bulletinAccess.test.mjs
//
// On ne contrôle PAS l'interface : on attaque la couche qui sert réellement les
// données, `runQuery`, exactement comme le fait /api/db. Chaque test vérifie à la
// fois l'accès AUTORISÉ (la donnée arrive) et l'accès INTERDIT (elle n'arrive pas),
// car une règle qui bloque tout « passe » aussi bien qu'une règle correcte.
//
// Les tables lues par un bulletin sont : classes, students, subjects, grades.
//
// ⚠️ `server/db.js` ouvre une base sur DISQUE au moment de l'import. On redirige
// donc NOTESCAM_DATA_DIR vers un répertoire JETABLE AVANT tout import, et on
// vérifie ensuite que le fichier ouvert s'y trouve bien : ce test ne doit en
// aucun cas toucher la base d'une école.

import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX = mkdtempSync(join(tmpdir(), 'notescam-access-'));
process.env.NOTESCAM_DATA_DIR = SANDBOX;

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('✅ ' + msg); pass++; };
const eq = (a, b, msg) => ok(a === b, `${msg} (${a} === ${b})`);

const { db, DB_PATH } = await import('./db.js');
const { runQuery } = await import('./query.js');

console.log('── 0. Isolation du test ──');
ok(DB_PATH.startsWith(SANDBOX), `base jetable (${DB_PATH.replace(SANDBOX, '<sandbox>')}) — aucune base d'école touchée`);
eq(db.prepare('SELECT COUNT(*) n FROM schools').get().n, 0, 'base neuve et vide au départ');

// ── Jeu d'essai : 2 écoles, 2 secteurs, 4 comptes ───────────────────────────
const ins = (sql, ...a) => db.prepare(sql).run(...a);

ins(`INSERT INTO schools (id, name) VALUES ('sch-a', 'École A'), ('sch-b', 'École B')`);

// École A : une classe de collège (bilingue spécial) et une classe de primaire.
ins(`INSERT INTO classes (id, school_id, name, level, section, cycle) VALUES
  ('cls-6e',  'sch-a', '6e Bilingue', '6e',  'college',  'secondaire'),
  ('cls-ce1', 'sch-a', 'CE1',         'CE1', 'primaire', 'fondamental')`);
// École B : une classe homonyme, pour piéger un filtrage par nom ou par cycle.
ins(`INSERT INTO classes (id, school_id, name, level, section, cycle) VALUES
  ('clsb-6e', 'sch-b', '6e Bilingue', '6e', 'college', 'secondaire')`);

ins(`INSERT INTO students (id, school_id, class_id, name) VALUES
  ('stu-6e',  'sch-a', 'cls-6e',  'Élève Collège A'),
  ('stu-ce1', 'sch-a', 'cls-ce1', 'Élève Primaire A'),
  ('stu-b',   'sch-b', 'clsb-6e', 'Élève École B')`);

ins(`INSERT INTO subjects (id, school_id, class_id, name, coef, max) VALUES
  ('sub-6e',  'sch-a', 'cls-6e',  'Français', 4, 20),
  ('sub-ce1', 'sch-a', 'cls-ce1', 'Lecture',  2, 20),
  ('sub-b',   'sch-b', 'clsb-6e', 'Français', 4, 20)`);

ins(`INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value) VALUES
  ('g-6e',  'sch-a', 'cls-6e',  'stu-6e',  'sub-6e',  1, '15'),
  ('g-ce1', 'sch-a', 'cls-ce1', 'stu-ce1', 'sub-ce1', 1, '12'),
  ('g-b',   'sch-b', 'clsb-6e', 'stu-b',   'sub-b',   1, '18')`);

ins(`INSERT INTO users (id, email, password_hash) VALUES
  ('u-dir',   'dir@a',   'x'), ('u-col', 'col@a', 'x'),
  ('u-prim',  'prim@a',  'x'), ('u-b',   'b@b',   'x')`);

// Périmètres. `scope_class_ids` est explicite ; `scope_sections` passe par le
// secteur de la classe. On couvre les deux mécanismes.
ins(`INSERT INTO school_users (id, school_id, user_id, role, active, scope_global, scope_sections, scope_cycles, scope_class_ids) VALUES
  ('su1', 'sch-a', 'u-dir',  'admin',     1, 1, '[]', '[]', '[]'),
  ('su2', 'sch-a', 'u-col',  'teacher',   1, 0, '[]', '[]', '["cls-6e"]'),
  ('su3', 'sch-a', 'u-prim', 'censeur',  1, 0, '["primaire"]', '[]', '[]'),
  ('su4', 'sch-b', 'u-b',    'admin',     1, 1, '[]', '[]', '[]')`);

// Lecture telle que /api/db la pratique : le userId vient du JETON VÉRIFIÉ,
// jamais du corps de la requête.
const lire = (userId, table, filters = []) => {
  const r = runQuery({ table, action: 'select', columns: '*', filters }, { userId });
  if (r.error) throw new Error(`${table}: ${r.error.message}`);
  return r.data || [];
};
const ids = (rows) => rows.map((x) => x.id).sort().join(',');

console.log('\n── 1. Cloisonnement par SECTEUR à l\'intérieur d\'une école ──');
eq(ids(lire('u-col', 'grades')), 'g-6e', 'enseignant cloisonné 6e : ne voit QUE les notes de sa classe');
eq(ids(lire('u-col', 'students')), 'stu-6e', 'enseignant cloisonné : ne voit QUE ses élèves');
eq(ids(lire('u-col', 'subjects')), 'sub-6e', 'enseignant cloisonné : ne voit QUE ses matières');
eq(ids(lire('u-col', 'classes')), 'cls-6e', 'enseignant cloisonné : ne voit QUE sa classe');
eq(ids(lire('u-prim', 'grades')), 'g-ce1', 'censeur primaire (par SECTION) : ne voit que le primaire');
ok(!ids(lire('u-prim', 'grades')).includes('g-6e'), 'le censeur primaire ne voit pas le collège');

console.log('\n── 2. Un identifiant fourni par le client ne contourne rien ──');
// Le cloisonnement s'applique APRÈS la requête, sur les lignes : viser
// directement l'id d'une ressource interdite renvoie vide, jamais la donnée.
eq(lire('u-col', 'grades', [{ op: 'eq', col: 'class_id', val: 'cls-ce1' }]).length, 0,
  'viser class_id=cls-ce1 depuis le périmètre 6e → 0 ligne');
eq(lire('u-col', 'grades', [{ op: 'eq', col: 'id', val: 'g-ce1' }]).length, 0,
  'viser la note par son id exact → 0 ligne');
eq(lire('u-col', 'students', [{ op: 'eq', col: 'id', val: 'stu-ce1' }]).length, 0,
  'viser l\'élève par son id exact → 0 ligne');
eq(lire('u-prim', 'subjects', [{ op: 'eq', col: 'class_id', val: 'cls-6e' }]).length, 0,
  'viser les matières de l\'autre secteur → 0 ligne');

console.log('\n── 3. Étanchéité INTER-ÉTABLISSEMENTS ──');
eq(ids(lire('u-dir', 'grades')), 'g-6e,g-ce1', 'direction école A : voit toute SON école');
ok(!ids(lire('u-dir', 'grades')).includes('g-b'), 'direction école A : ne voit RIEN de l\'école B');
eq(lire('u-dir', 'grades', [{ op: 'eq', col: 'school_id', val: 'sch-b' }]).length, 0,
  'direction A visant explicitement school_id=sch-b → 0 ligne');
eq(lire('u-dir', 'classes', [{ op: 'eq', col: 'id', val: 'clsb-6e' }]).length, 0,
  'direction A visant la classe homonyme de B par son id → 0 ligne');
eq(ids(lire('u-b', 'grades')), 'g-b', 'direction école B : voit uniquement l\'école B');
eq(ids(lire('u-b', 'students')), 'stu-b', 'direction école B : élèves de B uniquement');

console.log('\n── 4. Génération EN LOT : même chemin, mêmes restrictions ──');
// Un « imprimer toute la classe » lit les mêmes tables par le même runQuery.
// On rejoue la séquence complète qu'effectue un bulletin de classe.
function bulletinsDeClasse(userId, classId) {
  const cls = lire(userId, 'classes', [{ op: 'eq', col: 'id', val: classId }]);
  if (!cls.length) return { refuse: true, eleves: 0, notes: 0 };
  const eleves = lire(userId, 'students', [{ op: 'eq', col: 'class_id', val: classId }]);
  const notes  = lire(userId, 'grades',   [{ op: 'eq', col: 'class_id', val: classId }]);
  return { refuse: false, eleves: eleves.length, notes: notes.length };
}
const lotAutorise = bulletinsDeClasse('u-col', 'cls-6e');
eq(lotAutorise.refuse, false, 'lot sur SA classe : autorisé');
eq(lotAutorise.eleves, 1, 'lot sur sa classe : 1 élève servi');
eq(lotAutorise.notes, 1, 'lot sur sa classe : 1 note servie');
const lotInterdit = bulletinsDeClasse('u-col', 'cls-ce1');
eq(lotInterdit.refuse, true, 'lot sur la classe d\'un autre secteur : rien à imprimer');
const lotEtranger = bulletinsDeClasse('u-dir', 'clsb-6e');
eq(lotEtranger.refuse, true, 'lot sur une classe d\'un AUTRE établissement : rien à imprimer');

console.log('\n── 5. ÉCRITURE hors périmètre ──');
const ecrire = (userId, table, values) =>
  runQuery({ table, action: 'insert', values }, { userId });
const w1 = ecrire('u-col', 'grades', { id: 'g-x', school_id: 'sch-a', class_id: 'cls-ce1', student_id: 'stu-ce1', subject_id: 'sub-ce1', sequence: 1, value: '20' });
ok(!!w1.error, `écrire une note dans l'autre secteur : refusé (${w1.error?.message?.slice(0, 48)}…)`);
// ── CORRIGÉ : étanchéité inter-écoles à l'ÉCRITURE ──────────────────────────
// `guardScopeWrite` court-circuite tout contrôle de périmètre pour un compte
// GLOBAL (`if (isGlobal(scope)) return;`). En ÉCRITURE, l'étanchéité inter-écoles
// n'est donc pas appliquée à ces comptes — alors qu'en LECTURE elle l'est
// (`rowAllowed` compare `school_id` même pour un compte global).
//
// Portée réelle : nulle tant qu'une base LAN n'héberge qu'UNE école, ce qui est
// le cas nominal. Le risque n'apparaît que si une base en contient plusieurs
// (sauvegarde restaurée, poste mutualisé).
//
// Code PRÉEXISTANT, hors du périmètre bilingue, et sans effet sur la lecture des
// bulletins. Le test CONSTATE le comportement actuel au lieu de le corriger
// unilatéralement : la décision appartient à l'équipe.
const w2 = ecrire('u-dir', 'grades', { id: 'g-y', school_id: 'sch-b', class_id: 'clsb-6e', student_id: 'stu-b', subject_id: 'sub-b', sequence: 2, value: '20' });
ok(!!w2.error, `compte GLOBAL écrivant dans une AUTRE école : refusé (${w2.error?.message?.slice(0, 44)}…)`);

// La même garde couvre les autres chemins d'écriture, pas seulement les notes.
const w3 = ecrire('u-dir', 'students', { id: 'stu-y', school_id: 'sch-b', class_id: 'clsb-6e', name: 'Intrus' });
ok(!!w3.error, 'créer un élève dans une autre école : refusé');
const w4 = runQuery({ table: 'grades', action: 'update', values: { value: '20' },
  filters: [{ op: 'eq', col: 'id', val: 'g-b' }] }, { userId: 'u-dir' });
ok(!!w4.error, 'modifier une note d\'une autre école par son id : refusé');
const w5 = runQuery({ table: 'grades', action: 'delete',
  filters: [{ op: 'eq', col: 'id', val: 'g-b' }] }, { userId: 'u-dir' });
ok(!!w5.error, 'supprimer une note d\'une autre école : refusé');
// Écriture de MASSE sans ciblage : refusée dès lors que la base contient une
// autre école (une base mono-école n'est pas affectée).
const w6 = runQuery({ table: 'grades', action: 'update', values: { value: '0' }, filters: [] }, { userId: 'u-dir' });
ok(!!w6.error, `update de masse sur une base multi-écoles : refusé (${w6.error?.message?.slice(0, 40)}…)`);
eq(db.prepare("SELECT value FROM grades WHERE id = 'g-b'").get().value, '18',
  'la note de l\'école B est intacte');

// Et ce qui est LÉGITIME passe toujours : même compte, sa propre école.
const w7 = ecrire('u-dir', 'grades', { id: 'g-ok', school_id: 'sch-a', class_id: 'cls-6e', student_id: 'stu-6e', subject_id: 'sub-6e', sequence: 2, value: '16' });
ok(!w7.error, 'écrire dans SA propre école : toujours autorisé (la garde ne sur-bloque pas)');
db.prepare("DELETE FROM grades WHERE id = 'g-ok'").run();
// La LECTURE, elle, doit rester étanche en toutes circonstances — c'est ce dont
// dépend le bulletin.
eq(lire('u-dir', 'grades', [{ op: 'eq', col: 'school_id', val: 'sch-b' }]).length, 0,
  'la LECTURE inter-écoles reste refusée, y compris pour un compte global');
eq(db.prepare("SELECT COUNT(*) n FROM grades").get().n, 3, 'aucune note parasite ne subsiste');

console.log('\n── 6. Compte PARENT : aucun accès à la table des notes ──');
ins(`INSERT INTO users (id, email, password_hash) VALUES ('u-par', 'p@a', 'x')`);
ins(`INSERT INTO parent_accounts (id, user_id, full_name) VALUES ('pa1', 'u-par', 'Parent')`);
const rp = runQuery({ table: 'grades', action: 'select', columns: '*' }, { userId: 'u-par' });
ok(!!rp.error, `un compte parent est refusé sur /api/db (${rp.error?.message?.slice(0, 44)}…)`);

console.log('\n── 7. Garde-fou du test lui-même ──');
// Si le cloisonnement était désactivé, u-col verrait 3 notes : on le vérifie en
// confrontant à la vérité brute de la base. Un test qui ne voit jamais rien
// « passerait » tout aussi bien qu'un test correct.
eq(db.prepare('SELECT COUNT(*) n FROM grades').get().n, 3, 'la base contient bien 3 notes au total');
ok(lire('u-col', 'grades').length < 3, 'u-col en voit strictement moins que le total : le filtre agit');

console.log(`\n${pass} assertions OK`);
