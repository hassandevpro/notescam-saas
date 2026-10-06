// LE BARÈME DE SAISIE DE L'ENSEIGNANT TIENT-IL EN ÉDITION LAN ?
//
// Trois choses doivent être vraies côté LAN, et chacune a déjà manqué ailleurs :
//   1. la table existe dans le schéma SQLite (sinon l'écran de saisie écrirait
//      dans le vide) ;
//   2. elle est dans ALLOWED_TABLES (sinon « Table non autorisée », erreur avalée
//      côté client — c'est exactement ce qui était arrivé aux tables de notes) ;
//   3. l'unicité (école, moteur, niveau, compétence, critère) est tenue par la
//      base et pas seulement par le client, y compris en APC où `critere_id` vaut
//      la chaîne vide : un NULL y laisserait entrer autant de doublons que voulu.
//
// Lancer : node server/_bareme_notes.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-bareme-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');
const { db, ALLOWED_TABLES } = await import('./db.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

// ── 1) La table existe, avec ses colonnes ────────────────────────────────────
const cols = new Set(db.prepare('PRAGMA table_info("bareme_notes")').all().map((r) => r.name));
ok(cols.size > 0, 'la table bareme_notes existe en SQLite');
for (const c of ['school_id', 'engine', 'niveau_slug', 'competence_id', 'critere_id', 'points_max', 'enseignant_id']) {
  ok(cols.has(c), `colonne ${c} présente`);
}
ok(ALLOWED_TABLES.has('bareme_notes'), 'table exposée par l’API générique (sinon « Table non autorisée »)');

// ── 2) Une école porteuse, puis un barème APC et un barème primaire ──────────
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
const SCHOOL = 'ecole-bareme';
must({ table: 'schools', action: 'insert', values: { id: SCHOOL, name: 'École de test' } });

// APC : le barème porte la compétence entière, `critere_id` vaut ''.
must({ table: 'bareme_notes', action: 'insert', values: {
  id: 'b-apc', school_id: SCHOOL, engine: 'apc', niveau_slug: '6e',
  competence_id: 'comp-dictee', critere_id: '', points_max: 10,
} });
// Primaire : le barème porte le CRITÈRE (Oral, Écrit…) d'une compétence.
must({ table: 'bareme_notes', action: 'insert', values: {
  id: 'b-prim', school_id: SCHOOL, engine: 'prim', niveau_slug: 'cm2',
  competence_id: '1a', critere_id: 'oral', points_max: 10,
} });

const all = must({ table: 'bareme_notes', action: 'select', columns: '*', filters: [] }).data;
ok(all.length === 2, 'les deux barèmes sont persistés', all.length);
ok(Number(all.find((r) => r.id === 'b-apc').points_max) === 10, 'APC : /10 relu tel quel');
ok(all.find((r) => r.id === 'b-prim').critere_id === 'oral', 'PRIM : le critère est conservé');

// ── 3) Les garde-fous sont tenus par la BASE ─────────────────────────────────
const refuse = (values, label) => {
  const r = runQuery({ table: 'bareme_notes', action: 'insert', values });
  ok(!!r.error, label, r.error ? 'refusé' : 'ACCEPTÉ');
};

refuse({
  id: 'b-doublon', school_id: SCHOOL, engine: 'apc', niveau_slug: '6e',
  competence_id: 'comp-dictee', critere_id: '', points_max: 15,
}, 'deux barèmes pour la même compétence APC : refusé (unicité)');

refuse({
  id: 'b-zero', school_id: SCHOOL, engine: 'apc', niveau_slug: '5e',
  competence_id: 'comp-x', critere_id: '', points_max: 0,
}, 'barème /0 : refusé (une note sur rien n’exprime rien)');

refuse({
  id: 'b-enorme', school_id: SCHOOL, engine: 'apc', niveau_slug: '5e',
  competence_id: 'comp-y', critere_id: '', points_max: 2000,
}, 'barème /2000 : refusé (faute de frappe)');

refuse({
  id: 'b-moteur', school_id: SCHOOL, engine: 'classique', niveau_slug: '5e',
  competence_id: 'comp-z', critere_id: '', points_max: 20,
}, 'moteur inconnu : refusé');

// Un MÊME critère sur un AUTRE niveau reste légitime : le barème est par niveau.
must({ table: 'bareme_notes', action: 'insert', values: {
  id: 'b-prim-sil', school_id: SCHOOL, engine: 'prim', niveau_slug: 'sil',
  competence_id: '1a', critere_id: 'oral', points_max: 5,
} });
ok(true, 'le même critère sur un autre niveau est accepté (barème par niveau)');

// ── 4) Rétablir le barème officiel = supprimer la ligne ──────────────────────
must({ table: 'bareme_notes', action: 'delete', filters: [{ op: 'eq', col: 'id', val: 'b-apc' }] });
const apres = must({ table: 'bareme_notes', action: 'select', columns: '*', filters: [{ op: 'eq', col: 'id', val: 'b-apc' }] }).data;
ok(apres.length === 0, 'retour au barème officiel : la surcharge disparaît');

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Barème LAN : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
