// L'ÉCOLE PEUT-ELLE MODIFIER SON RÉFÉRENTIEL EN ÉDITION LAN ?
//
// L'écran « Modifier les compétences » (ReferentielEditor) fait exactement trois
// gestes, et chacun écrit dans la base :
//
//   • AJOUTER une ligne maison      -> INSERT dans apc_competences / prim_competences
//                                      / mat_domaines, avec `school_id` renseigné ;
//   • MASQUER une ligne officielle  -> UPSERT dans <table>_masques ;
//   • RENOMMER une ligne officielle -> UPSERT dans referentiel_libelles.
//
// Le Cloud porte tout cela (supabase_*_par_ecole.sql + supabase_referentiel_libelles.sql).
// Le LAN ne l'avait JAMAIS reçu : ni la colonne `school_id`, ni les trois tables
// de masques, ni la table des libellés. Les trois gestes échouaient donc TOUS en
// édition LAN — « Enregistrement refusé par le serveur », sans que l'école puisse
// comprendre ni contourner. Ce test tient la parité.
//
// Lancer : node server/_referentiel_ecole.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-ref-ecole-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');
const { db, ALLOWED_TABLES } = await import('./db.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
const essaie = (op, ctx) => { try { const r = runQuery(op, ctx); return r.error ? r.error.message : null; } catch (e) { return e.message; } };

const cols = (t) => new Set(db.prepare(`PRAGMA table_info("${t}")`).all().map((r) => r.name));

// ── 1) Le schéma porte la propriété et les deux mécanismes ───────────────────
for (const t of ['apc_competences', 'prim_competences', 'mat_domaines']) {
  ok(cols(t).has('school_id'), `${t}.school_id existe (NULL = national, renseigné = maison)`);
}
for (const t of ['apc_competences_masques', 'prim_competences_masques', 'mat_domaines_masques', 'referentiel_libelles']) {
  ok(cols(t).size > 0, `table ${t} présente en SQLite`);
  ok(ALLOWED_TABLES.has(t), `${t} exposée par l'API générique`);
}

// ── 2) Le décor : une école, et le référentiel NATIONAL tel qu'il est livré ──
// On ne fabrique pas de faux national : `officiel-seed.sql` est chargé au
// démarrage, et c'est exactement sur ces lignes-là que l'école travaille.
const SCHOOL = 'ecole-ref';
must({ table: 'schools', action: 'insert', values: { id: SCHOOL, name: 'École de test' } });

const NAT_APC = db.prepare(
  'SELECT id, cycle_id, classe_id, trimestre_id, matiere_id, intitule FROM apc_competences WHERE school_id IS NULL LIMIT 1',
).get();
const NAT_PRIM = db.prepare('SELECT id FROM prim_competences WHERE school_id IS NULL LIMIT 1').get();
const NAT_MAT  = db.prepare('SELECT id FROM mat_domaines WHERE school_id IS NULL LIMIT 1').get();
ok(!!NAT_APC && !!NAT_PRIM && !!NAT_MAT, 'le référentiel national est bien en base (seed officiel)',
  { apc: NAT_APC?.id, prim: NAT_PRIM?.id, mat: NAT_MAT?.id });

// ── 3) AJOUTER une ligne maison, pour les trois moteurs ─────────────────────
// `ordre` 900 : l'unicité APC porte sur (classe, trimestre, matière, ordre), et
// les lignes nationales occupent les premiers rangs.
ok(!essaie({ table: 'apc_competences', action: 'upsert', onConflict: 'id', values: {
  id: 'cmp-maison-1', school_id: SCHOOL, cycle_id: NAT_APC.cycle_id, classe_id: NAT_APC.classe_id,
  trimestre_id: NAT_APC.trimestre_id, matiere_id: NAT_APC.matiere_id, ordre: 900,
  intitule: 'Competence de l ecole', actif: 1,
} }), 'APC : une compétence maison s’enregistre');
ok(!essaie({ table: 'mat_domaines', action: 'upsert', onConflict: 'id', values: {
  id: 'ec_dom_maison', school_id: SCHOOL, intitule: 'Domaine de l ecole', ordre: 90, actif: 1,
} }), 'Maternelle : un domaine maison s’enregistre');
ok(!essaie({ table: 'prim_competences', action: 'upsert', onConflict: 'id', values: {
  id: 'ec_cmp_maison', school_id: SCHOOL, code: 'EC1', intitule: 'Competence de l ecole', ordre: 90, actif: 1,
} }), 'Primaire : une compétence maison s’enregistre');

const maison = db.prepare('SELECT school_id, intitule FROM apc_competences WHERE id = ?').get('cmp-maison-1');
ok(maison?.school_id === SCHOOL, 'la ligne maison porte bien son école (sinon elle passerait pour nationale)', maison);

// Renommer sa propre ligne : upsert complet sur le même id.
ok(!essaie({ table: 'apc_competences', action: 'upsert', onConflict: 'id', values: {
  id: 'cmp-maison-1', school_id: SCHOOL, cycle_id: NAT_APC.cycle_id, classe_id: NAT_APC.classe_id,
  trimestre_id: NAT_APC.trimestre_id, matiere_id: NAT_APC.matiere_id, ordre: 900,
  intitule: 'Intitule corrige', actif: 1,
} }), 'APC : la ligne maison se renomme');
ok(db.prepare('SELECT intitule FROM apc_competences WHERE id = ?').get('cmp-maison-1')?.intitule === 'Intitule corrige',
  'le nouvel intitulé est bien en base');

// ── 4) MASQUER une ligne officielle (upsert sur une clé composite) ──────────
// `setMasque` ne vise pas une colonne `id` : le conflit porte sur (school_id, item).
ok(!essaie({ table: 'apc_competences_masques', action: 'upsert', onConflict: 'school_id,competence_id',
  values: { school_id: SCHOOL, competence_id: NAT_APC.id } }), 'APC : une compétence nationale se masque');
ok(!essaie({ table: 'apc_competences_masques', action: 'upsert', onConflict: 'school_id,competence_id',
  values: { school_id: SCHOOL, competence_id: NAT_APC.id } }), 'masquer deux fois ne casse rien (idempotent)');
ok(db.prepare('SELECT count(*) c FROM apc_competences_masques').get().c === 1,
  'un seul masque en base, pas de doublon');
ok(!essaie({ table: 'mat_domaines_masques', action: 'upsert', onConflict: 'school_id,domaine_id',
  values: { school_id: SCHOOL, domaine_id: NAT_MAT.id } }), 'Maternelle : un domaine national se masque');
ok(!essaie({ table: 'prim_competences_masques', action: 'upsert', onConflict: 'school_id,competence_id',
  values: { school_id: SCHOOL, competence_id: NAT_PRIM.id } }), 'Primaire : une compétence nationale se masque');

// Rétablir = supprimer le masque.
must({ table: 'apc_competences_masques', action: 'delete', filters: [
  { op: 'eq', col: 'school_id', val: SCHOOL }, { op: 'eq', col: 'competence_id', val: NAT_APC.id },
] });
ok(db.prepare('SELECT count(*) c FROM apc_competences_masques').get().c === 0, 'le masque se retire (rétablir)');

// ── 5) RENOMMER une ligne officielle = surcharge de libellé ─────────────────
ok(!essaie({ table: 'referentiel_libelles', action: 'upsert', onConflict: 'school_id,kind,item_id', values: {
  school_id: SCHOOL, kind: 'apc', item_id: NAT_APC.id, intitule: 'Notre formulation', maj_le: new Date().toISOString(),
} }), 'une ligne nationale se renomme CHEZ SOI');
ok(!essaie({ table: 'referentiel_libelles', action: 'upsert', onConflict: 'school_id,kind,item_id', values: {
  school_id: SCHOOL, kind: 'apc', item_id: NAT_APC.id, intitule: 'Formulation revue', maj_le: new Date().toISOString(),
} }), 'le libellé se corrige une seconde fois');
const lib = db.prepare('SELECT intitule FROM referentiel_libelles WHERE school_id=? AND kind=? AND item_id=?')
  .get(SCHOOL, 'apc', NAT_APC.id);
ok(lib?.intitule === 'Formulation revue', 'la surcharge est bien celle de la dernière écriture', lib);
ok(db.prepare('SELECT count(*) c FROM referentiel_libelles').get().c === 1, 'une seule surcharge, pas de doublon');
// La ligne OFFICIELLE n'a pas bougé : c'est tout l'intérêt de la surcharge.
ok(db.prepare('SELECT intitule FROM apc_competences WHERE id = ?').get(NAT_APC.id)?.intitule === NAT_APC.intitule,
  'la compétence nationale garde son intitulé ministériel');

// Rendre le libellé officiel = supprimer la surcharge.
must({ table: 'referentiel_libelles', action: 'delete', filters: [
  { op: 'eq', col: 'school_id', val: SCHOOL }, { op: 'eq', col: 'kind', val: 'apc' },
  { op: 'eq', col: 'item_id', val: NAT_APC.id },
] });
ok(db.prepare('SELECT count(*) c FROM referentiel_libelles').get().c === 0, 'la surcharge se retire');

// ── 6) LE NATIONAL RESTE INTOUCHABLE ────────────────────────────────────────
// Au Cloud c'est la RLS qui l'interdit ; en LAN il n'y a pas de RLS, donc le
// garde doit le dire. Abîmer une ligne nationale casserait le bulletin officiel
// de toutes les classes qui s'y rattachent, et le seed la réécrirait sans
// prévenir au redémarrage suivant.
const ctx = { userId: 'u-ens' };
db.prepare('INSERT INTO users (id, email, password_hash, full_name) VALUES (?,?,?,?)')
  .run('u-ens', 'ens@test.local', 'x:y', 'Enseignant');
must({ table: 'school_users', action: 'insert', values: {
  id: 'su-1', school_id: SCHOOL, user_id: 'u-ens', role: 'teacher', active: 1,
} });
const refusNat = essaie({ table: 'apc_competences', action: 'update', values: { intitule: 'Detournee' },
  filters: [{ op: 'eq', col: 'id', val: NAT_APC.id }] }, ctx);
ok(!!refusNat, 'modifier une ligne NATIONALE est refusé', refusNat);
ok(db.prepare('SELECT intitule FROM apc_competences WHERE id = ?').get(NAT_APC.id)?.intitule === NAT_APC.intitule,
  'et elle est restée intacte');
const okMaison = essaie({ table: 'apc_competences', action: 'update', values: { intitule: 'Encore corrigee' },
  filters: [{ op: 'eq', col: 'id', val: 'cmp-maison-1' }] }, ctx);
ok(!okMaison, 'mais sa propre ligne se modifie toujours', okMaison);

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Référentiel de l'école en LAN : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
