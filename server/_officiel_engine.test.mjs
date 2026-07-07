// Vérifie le portage LAN du moteur « Officiel Cameroun » :
//   1. le référentiel (APC collège, SC lycée, maternelle, primaire) est bien
//      chargé en SQLite par le seed et interrogeable via l'API générique ;
//   2. les filtres booléens (.eq('actif', true)) fonctionnent comme en cloud ;
//   3. les notes officielles (apc_notes/mat_observations/prim_notes) s'écrivent
//      en respectant les FK vers le référentiel seedé (régression: ces tables
//      renvoyaient « Table non autorisée » et rien n'était persisté en LAN).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-officiel-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
const rows = (table, filters = []) => must({ table, action: 'select', columns: '*', filters }).data;
const T = { op: 'eq', col: 'actif', val: true };

// ── 1) Référentiel seedé ─────────────────────────────────────────────────────
ok(rows('apc_matieres').length >= 20,          'APC : matières seedées', rows('apc_matieres').length);
ok(rows('apc_classes').length === 4,           'APC : 4 classes (6e–3e)', rows('apc_classes').length);
const comps = rows('apc_competences', [T]);
ok(comps.length > 400,                          'APC : compétences actives chargées', comps.length);
ok(rows('apc_referentiel_versions', [T]).length === 1, 'APC : une version active', rows('apc_referentiel_versions', [T]).length);
ok(rows('apc_classe_matieres').length >= 60,   'APC : coefficients par classe', rows('apc_classe_matieres').length);

const scRows = rows('sc_serie_matieres', [T]);
ok(scRows.length > 400,                         'SC : lignes coef/charge chargées', scRows.length);
ok(rows('sc_series').length >= 12,             'SC : séries seedées', rows('sc_series').length);
ok(rows('sc_matieres').length >= 30,           'SC : matières seedées', rows('sc_matieres').length);

ok(rows('mat_domaines').length === 8,          'Maternelle : 8 domaines', rows('mat_domaines').length);
ok(rows('mat_niveaux').length === 3,           'Maternelle : PS/MS/GS', rows('mat_niveaux').length);

ok(rows('prim_competences').length === 11,     'Primaire : 11 compétences 1A–6B', rows('prim_competences').length);
ok(rows('prim_criteres').length === 4,         'Primaire : 4 critères', rows('prim_criteres').length);
ok(rows('prim_cote_bareme').length === 4,      'Primaire : barème de cotes', rows('prim_cote_bareme').length);

// Idempotence : recharger le module ne doit pas casser la version active
// (les UPDATE actif=false sont écartés du seed). On revérifie après coup.
ok(rows('sc_referentiel_versions', [T]).length === 1, 'SC : une version active (idempotent)', rows('sc_referentiel_versions', [T]).length);

// ── 2) Écriture des notes officielles (FK vers le référentiel) ───────────────
must({ table: 'schools',  action: 'insert', values: { id: 'sch1', name: 'École' } });
must({ table: 'classes',  action: 'insert', values: { id: 'cls1', school_id: 'sch1', name: '6ème A', level: '6ème A' } });
must({ table: 'students', action: 'insert', values: { id: 'stu1', school_id: 'sch1', class_id: 'cls1', name: 'Awa' } });

// apc_note : upsert sur le triplet (comme upsertApcNote côté client).
const compId = comps[0].id;
must({ table: 'apc_notes', action: 'upsert', onConflict: 'eleve_id,competence_id,sequence_id', returning: true, single: true, values: {
  id: 'note1', school_id: 'sch1', eleve_id: 'stu1', competence_id: compId, sequence_id: 's1', note: 15,
} });
let note = rows('apc_notes', [{ op: 'eq', col: 'id', val: 'note1' }])[0];
ok(note && Number(note.note) === 15, 'APC : note par compétence persistée', note?.note);

// Mise à jour via le même triplet → pas de doublon.
must({ table: 'apc_notes', action: 'upsert', onConflict: 'eleve_id,competence_id,sequence_id', values: {
  id: 'note1', school_id: 'sch1', eleve_id: 'stu1', competence_id: compId, sequence_id: 's1', note: 18,
} });
ok(rows('apc_notes').length === 1, 'APC : upsert idempotent (pas de doublon)', rows('apc_notes').length);

// mat_observation (domaine + trimestre seedés).
must({ table: 'mat_observations', action: 'insert', values: {
  id: 'obs1', school_id: 'sch1', eleve_id: 'stu1', domaine_id: 'langage_communication',
  trimestre_id: 't1', niveau_acquis: 'A',
} });
ok(rows('mat_observations').length === 1, 'Maternelle : observation persistée', rows('mat_observations').length);

// prim_note (compétence + critère + trimestre seedés).
must({ table: 'prim_notes', action: 'insert', values: {
  id: 'pn1', school_id: 'sch1', eleve_id: 'stu1', competence_id: '1a',
  critere_id: 'oral', trimestre_id: 't1', note: 8,
} });
ok(rows('prim_notes').length === 1, 'Primaire : note critère persistée', rows('prim_notes').length);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé sous Windows */ }
process.exit(fail === 0 ? 0 : 1);
