// Valide le module Personnel côté serveur LAN (table `staff`) : persistance de
// toutes les colonnes après relecture, filtrage par département, mise à jour,
// suppression. Vérifie aussi que `teachers` a bien reçu le socle « personnel »
// (matricule, gender, address, fonction, hire_date, status, documents).
//
// Lancer : node server/_staff_crud.test.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-staff-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');
const { tableColumns } = await import('./db.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
const eq = (col, val) => ({ col, op: 'eq', val });
const one = (table, filters) => must({ table, action: 'select', columns: '*', single: true, maybeSingle: true, filters }).data;
const countWhere = (table, filters) => must({ table, action: 'select', columns: '*', filters }).data.length;

must({ table: 'schools', action: 'insert', values: { id: 'sch1', name: 'École' } });

// --- Création d'un membre du personnel (santé) avec TOUS les champs ---
must({ table: 'staff', action: 'upsert', onConflict: 'id', values: {
  id: 'stf1', school_id: 'sch1', matricule: 'P-001',
  first_name: 'Awa', last_name: 'NDIAYE', name: 'Awa NDIAYE',
  gender: 'Feminin', phone: '690000000', email: 'awa@ecole.cm',
  address: 'Yaoundé', photo_url: null, fonction: 'Infirmière',
  department: 'sante', hire_date: '2024-09-01', status: 'Titulaire',
  documents: [{ name: 'Diplôme', url: 'http://x/d.pdf' }],
} });
// un 2e membre dans un autre département
must({ table: 'staff', action: 'upsert', onConflict: 'id', values: {
  id: 'stf2', school_id: 'sch1', name: 'Paul OBAM', department: 'comptabilite', fonction: 'Comptable',
} });

const m = one('staff', [eq('id', 'stf1')]);
ok(m && m.matricule === 'P-001', 'staff : matricule persisté', m && m.matricule);
ok(m && m.first_name === 'Awa' && m.last_name === 'NDIAYE', 'staff : prénom + nom persistés', m && [m.first_name, m.last_name]);
ok(m && m.gender === 'Feminin', 'staff : sexe persisté', m && m.gender);
ok(m && m.fonction === 'Infirmière', 'staff : fonction persistée', m && m.fonction);
ok(m && m.department === 'sante', 'staff : département persisté', m && m.department);
ok(m && m.hire_date === '2024-09-01', 'staff : date de recrutement persistée', m && m.hire_date);
ok(m && m.status === 'Titulaire', 'staff : statut persisté', m && m.status);
ok(m && m.address === 'Yaoundé', 'staff : adresse persistée', m && m.address);
// documents : tableau JSON sérialisé en TEXT côté SQLite → on revérifie le contenu
const docs = m && (Array.isArray(m.documents) ? m.documents : JSON.parse(m.documents || '[]'));
ok(docs && docs.length === 1 && docs[0].name === 'Diplôme', 'staff : documents (JSON) persistés', m && m.documents);

// --- Filtrage par département ---
ok(countWhere('staff', [eq('department', 'sante')]) === 1, 'staff : 1 membre en santé');
ok(countWhere('staff', [eq('department', 'comptabilite')]) === 1, 'staff : 1 membre en comptabilité');
ok(countWhere('staff', [eq('school_id', 'sch1')]) === 2, 'staff : 2 membres au total');

// --- Mise à jour ---
must({ table: 'staff', action: 'update', values: { fonction: 'Infirmière-chef', status: 'Stagiaire' }, filters: [eq('id', 'stf1')] });
const m2 = one('staff', [eq('id', 'stf1')]);
ok(m2 && m2.fonction === 'Infirmière-chef' && m2.status === 'Stagiaire', 'staff : mise à jour persistée', m2 && [m2.fonction, m2.status]);

// --- Suppression (le personnel n'a pas d'enfants en cascade) ---
must({ table: 'staff', action: 'delete', filters: [eq('id', 'stf2')] });
ok(countWhere('staff', [eq('school_id', 'sch1')]) === 1, 'staff : suppression effective', null);

// --- Socle « personnel » ajouté aux enseignants ---
const tCols = tableColumns('teachers');
for (const col of ['matricule', 'gender', 'address', 'photo_url', 'fonction', 'hire_date', 'status', 'documents']) {
  ok(tCols.has(col), `teachers : colonne « ${col} » présente`, [...tCols]);
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
try { rmSync(dir, { recursive: true, force: true }); } catch { /* WAL verrouillé sous Windows */ }
process.exit(fail === 0 ? 0 : 1);
