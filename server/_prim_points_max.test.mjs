// LE BARÈME D'UNE ÉVALUATION PRIMAIRE TIENT-IL EN ÉDITION LAN ?
//
// `prim_notes.points_max` doit exister côté SQLite, sinon `pickColumns` l'écarte
// en silence à l'écriture : l'Oral noté /10 repartirait sur le barème officiel du
// critère au prochain rechargement — donc faux, et en défaveur de l'élève. C'est
// exactement le défaut que `apc_notes.note_max` avait déjà rencontré, documenté
// dans supabase_apc_note_max.sql.
//
// Lancer : node server/_prim_points_max.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-prim-bareme-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');
const { db, ALLOWED_TABLES } = await import('./db.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };

// ── 1) La colonne existe ─────────────────────────────────────────────────────
const cols = new Set(db.prepare('PRAGMA table_info("prim_notes")').all().map((r) => r.name));
ok(cols.has('points_max'), 'prim_notes.points_max existe en SQLite');
ok(cols.has('note'), 'prim_notes.note toujours là (non-régression)');
ok(ALLOWED_TABLES.has('prim_notes'), 'prim_notes reste exposée par l’API générique');
// La table d'une version antérieure du barème ne doit PLUS être servie.
ok(!ALLOWED_TABLES.has('bareme_notes'), 'bareme_notes n’est plus exposée (barème porté par la note)');

// ── 2) Le barème fait l'aller-retour ─────────────────────────────────────────
const SCHOOL = 'ecole-prim-bareme';
must({ table: 'schools', action: 'insert', values: { id: SCHOOL, name: 'École de test' } });
must({ table: 'classes', action: 'insert', values: { id: 'cls-cm2', school_id: SCHOOL, name: 'CM2', level: 'CM2' } });
must({ table: 'students', action: 'insert', values: { id: 'stu-1', school_id: SCHOOL, class_id: 'cls-cm2', name: 'Élève Un' } });

// Oral interrogé sur 10 en UA1 : la ligne porte son propre barème.
must({ table: 'prim_notes', action: 'insert', values: {
  id: 'pn-ua1', school_id: SCHOOL, eleve_id: 'stu-1',
  competence_id: '1a', critere_id: 'oral', ua: 1, note: 8, points_max: 10,
} });
// Oral interrogé sur le barème officiel en UA3 : points_max reste NULL.
must({ table: 'prim_notes', action: 'insert', values: {
  id: 'pn-ua3', school_id: SCHOOL, eleve_id: 'stu-1',
  competence_id: '1a', critere_id: 'oral', ua: 3, note: 15,
} });

const lignes = must({ table: 'prim_notes', action: 'select', columns: '*', filters: [] }).data;
const ua1 = lignes.find((r) => r.id === 'pn-ua1');
const ua3 = lignes.find((r) => r.id === 'pn-ua3');
ok(Number(ua1.points_max) === 10, 'UA1 : le barème /10 survit au rechargement', ua1.points_max);
ok(Number(ua1.note) === 8, 'UA1 : la note est intacte', ua1.note);
ok(ua3.points_max === null, 'UA3 : pas de barème explicite → NULL = barème officiel', ua3.points_max);
ok(Number(ua3.note) === 15, 'UA3 : la note est intacte', ua3.note);

// ── 3) Le même critère sur deux UA garde DEUX barèmes distincts ──────────────
// C'est tout l'intérêt de porter le barème sur la note : une surcharge par niveau
// n'aurait pu exprimer qu'une seule valeur pour la colonne « Oral ».
ok(Number(ua1.points_max) === 10 && ua3.points_max === null,
   'un critère porte un barème DIFFÉRENT selon l’unité d’apprentissage');

// ── 4) Mise à jour du barème seul ────────────────────────────────────────────
must({ table: 'prim_notes', action: 'update',
  values: { points_max: 20 },
  filters: [{ op: 'eq', col: 'id', val: 'pn-ua1' }] });
const apres = must({ table: 'prim_notes', action: 'select', columns: '*',
  filters: [{ op: 'eq', col: 'id', val: 'pn-ua1' }] }).data[0];
ok(Number(apres.points_max) === 20, 'le barème se corrige sans toucher la note', apres.points_max);
ok(Number(apres.note) === 8, 'la note n’a pas bougé', apres.note);

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Barème primaire LAN : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
