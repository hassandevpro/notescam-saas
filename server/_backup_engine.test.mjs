// EXPORT / RESTAURATION COMPLÈTE — bout en bout sur le vrai serveur SQLite.
//
// Le moteur client (src/lib/backupEngine.js) tourne ici contre runQuery /
// runRpc, c'est-à-dire exactement le chemin de l'édition LAN (mêmes gardes,
// même catalogue découvert, même pagination LIMIT/OFFSET).
//
// Questions posées :
//   1. Le catalogue découvre-t-il un MODULE AJOUTÉ sans toucher au code ?
//   2. L'export contient-il tout, pagination comprise ?
//   3. Après suppression d'élèves/notes, la restauration les ramène-t-elle,
//      sans toucher ce qui existe et sans rien supprimer ?
//   4. Le mode « écraser » annule-t-il une modification ?
//   5. Une sauvegarde d'une autre école est-elle refusée ?
//   6. La restauration programmée du fichier .db conserve-t-elle l'ancienne base ?
//
// Lancer : node server/_backup_engine.test.mjs
import { mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-backup-engine-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { db, ALLOWED_TABLES } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { runRpc } = await import('./rpc.js');
const { exportSchoolData, restoreSchoolData } = await import('../src/lib/backupEngine.js');

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label}${got !== undefined ? ` (obtenu: ${JSON.stringify(got)})` : ''}`), fail++); };

// Client minimal à l'interface supabase-js, branché sur le serveur LAN.
const ctx = { userId: 'u-admin' };
function makeClient() {
  class Q {
    constructor(table) { Object.assign(this, { table, action: 'select', columns: '*', filters: [], _order: [], limit: null, offset: 0, values: null, onConflict: null }); }
    select(c = '*') { if (this.action === 'select') this.columns = c; return this; }
    insert(v) { this.action = 'insert'; this.values = v; return this; }
    upsert(v, o = {}) { this.action = 'upsert'; this.values = v; this.onConflict = o.onConflict || 'id'; return this; }
    eq(col, val) { this.filters.push({ col, op: 'eq', val }); return this; }
    order(col, o = {}) { this._order.push({ col, ascending: o.ascending !== false }); return this; }
    range(a, b) { this.offset = a; this.limit = b - a + 1; return this; }
    then(res, rej) {
      try { const { _order, ...op } = this; res(runQuery({ ...op, order: _order, returning: this.action === 'select' }, ctx)); } catch (e) { rej(e); }
    }
  }
  return {
    from: (t) => new Q(t),
    rpc: async (name, params) => runRpc(name, params, ctx),
  };
}
const client = makeClient();
const S = 'sch1';
const must = (op) => { const r = runQuery(op, ctx); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
const count = (table, extra = []) => must({ table, action: 'select', columns: '*', filters: [{ col: 'school_id', op: 'eq', val: S }, ...extra] }).data.length;

// --- Données de départ ---
db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-admin','a@x.cm','x')").run();
must({ table: 'schools', action: 'insert', values: { id: S, name: 'École Test' } });
db.prepare("INSERT INTO school_users (id, school_id, user_id, role) VALUES ('su1', ?, 'u-admin', 'admin')").run(S);
must({ table: 'classes', action: 'insert', values: { id: 'c1', school_id: S, name: '6e A', level: '6e', system: 'FR', current_year: '2026-2027' } });
must({ table: 'subjects', action: 'insert', values: { id: 'sub1', school_id: S, class_id: 'c1', name: 'Maths', coef: 4, max: 20 } });
// > 1000 élèves : la pagination doit tout ramener.
const N = 1205;
for (let i = 0; i < N; i++) {
  must({ table: 'students', action: 'insert', values: { id: `st${String(i).padStart(4, '0')}`, school_id: S, class_id: 'c1', name: `Élève ${i}`, matricule: `M${i}` } });
}
for (let i = 0; i < 30; i++) {
  must({ table: 'grades', action: 'insert', values: { id: `g${i}`, school_id: S, class_id: 'c1', student_id: `st${String(i).padStart(4, '0')}`, subject_id: 'sub1', sequence: 1, value: '12' } });
}

// Un paiement (table immuable côté serveur) : le mode « écraser » ne doit pas le heurter.
must({ table: 'student_fees', action: 'insert', values: { id: 'f1', school_id: S, student_id: 'st0000', academic_year: '2026-2027', frais_annuels: 100000, frais_payes: 40000 } });
must({ table: 'fee_payments', action: 'insert', values: { id: 'p1', school_id: S, student_id: 'st0000', academic_year: '2026-2027', amount: 40000, date: '2026-10-01' } });

// 1. Module ajouté APRÈS coup : table neuve avec school_id, inconnue du code.
db.exec(`CREATE TABLE module_cantine (id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id), menu TEXT, updated_at TEXT)`);
ALLOWED_TABLES.add('module_cantine'); // ce que fait tout nouveau module LAN pour être utilisable
must({ table: 'module_cantine', action: 'insert', values: { id: 'm1', school_id: S, menu: 'Riz sauce arachide' } });

const catalog = runRpc('backup_catalog', { p_school: S }, ctx).data;
ok(catalog.some((t) => t.table === 'module_cantine'), 'catalogue : module ajouté découvert automatiquement');
ok(catalog.find((t) => t.table === 'module_cantine')?.deps.includes('schools'), 'catalogue : dépendances FK lues du schéma');
ok(runRpc('backup_catalog', { p_school: S }, { userId: 'inconnu' }).error, 'catalogue : refusé à un non-admin');

// 2. Export
const bundle = await exportSchoolData(client, { schoolId: S, edition: 'lan' });
ok(bundle.tables.students.length === N, `export : ${N} élèves (pagination LIMIT/OFFSET)`, bundle.tables.students.length);
ok(bundle.tables.grades.length === 30 && bundle.tables.module_cantine?.length === 1, 'export : notes + module ajouté présents');
ok(bundle.tables.schools.length === 1, 'export : fiche établissement présente');
ok(!Object.keys(bundle.tables).some((t) => /token|secret|pairing|credential|^sync_/.test(t)), 'export : aucun secret');
const json = JSON.parse(JSON.stringify(bundle)); // aller-retour fichier

// 3. Sinistre : suppression d'élèves (et de leurs notes, par cascade ou à la main)
db.exec("DELETE FROM grades WHERE id IN ('g0','g1','g2')");
db.exec("DELETE FROM students WHERE id IN ('st1100','st1101')");
db.exec("DELETE FROM module_cantine");
must({ table: 'students', action: 'upsert', onConflict: 'id', values: { id: 'st0005', school_id: S, class_id: 'c1', name: 'NOM CORRIGÉ APRÈS SAUVEGARDE', matricule: 'M5' } });
must({ table: 'students', action: 'insert', values: { id: 'st-nouveau', school_id: S, class_id: 'c1', name: 'Inscrit après', matricule: 'MX' } });

const preview = await restoreSchoolData(client, json, { schoolId: S, dryRun: true });
ok(preview.totals.toInsert === 6 && preview.totals.inserted === 0, 'aperçu : 6 lignes à réinsérer, rien d’écrit', preview.totals);
ok(count('students') === N - 2 + 1, 'aperçu : base inchangée');

const res = await restoreSchoolData(client, json, { schoolId: S, mode: 'missing' });
ok(res.ok && res.totals.inserted === 6, 'restauration : 6 lignes réinsérées', res.totals);
ok(count('students') === N + 1, 'restauration : élèves revenus, inscrit postérieur conservé (rien supprimé)');
ok(count('grades') === 30 && count('module_cantine') === 1, 'restauration : notes + module revenus');
const st5 = must({ table: 'students', action: 'select', columns: '*', filters: [{ col: 'id', op: 'eq', val: 'st0005' }] }).data[0];
ok(st5.name === 'NOM CORRIGÉ APRÈS SAUVEGARDE', 'mode « manquantes » : la correction postérieure n’est pas écrasée');
const back = must({ table: 'students', action: 'select', columns: '*', filters: [{ col: 'id', op: 'eq', val: 'st1100' }] }).data[0];
ok(back && back.updated_at > json.createdAt, 'ligne restaurée datée de maintenant (gagne à la synchronisation)');
const outbox = db.prepare("SELECT COUNT(*) n FROM sync_outbox WHERE tablename = 'students' AND row_id IN ('st1100','st1101')").get().n;
ok(outbox >= 2, 'ligne restaurée mise en file pour le Cloud (mode hybride)');

const again = await restoreSchoolData(client, json, { schoolId: S });
ok(again.totals.inserted === 0 && again.totals.failed === 0, 'idempotent : relancer ne crée aucun doublon', again.totals);

// 4. Mode écraser
const ow = await restoreSchoolData(client, json, { schoolId: S, mode: 'overwrite' });
const st5b = must({ table: 'students', action: 'select', columns: '*', filters: [{ col: 'id', op: 'eq', val: 'st0005' }] }).data[0];
ok(st5b.name === 'Élève 5', 'mode « écraser » : retour à l’état sauvegardé', st5b.name);
ok(count('students') === N + 1, 'mode « écraser » : l’inscrit postérieur n’est toujours pas supprimé');
ok(ow.totals.failed === 0, 'mode « écraser » : aucune ligne refusée', ow.tables && Object.entries(ow.tables).filter(([, r]) => r.failed).map(([t, r]) => [t, r.errors]));

// 5. Autre école
const foreign = { ...json, schoolId: 'autre-ecole' };
const r5 = await restoreSchoolData(client, foreign, { schoolId: S });
ok(!r5.ok && /AUTRE établissement/.test(r5.errors.join(' ')), 'sauvegarde d’une autre école refusée');

// 6. Restauration programmée du fichier .db
const { applyPendingRestore } = await import('./db.js');
const target = mkdtempSync(join(tmpdir(), 'nc-pending-'));
const dbPath = join(target, 'notescam.db');
writeFileSync(dbPath, 'BASE-ACTUELLE');
writeFileSync(dbPath + '-wal', 'WAL-ACTUEL');
const src = join(target, 'sauvegarde.db');
writeFileSync(src, 'BASE-SAUVEGARDEE');
writeFileSync(join(target, 'restore-pending.json'), JSON.stringify({ source: src }));
const r6 = applyPendingRestore(target, dbPath);
ok(r6.ok && readFileSync(dbPath, 'utf8') === 'BASE-SAUVEGARDEE', 'restauration .db appliquée au démarrage');
const kept = readdirSync(join(target, 'pre-restore'));
ok(kept.some((f) => f.endsWith('.db')) && kept.some((f) => f.endsWith('.db-wal')), 'ancienne base ET son WAL conservés dans pre-restore/');
ok(!existsSync(join(target, 'restore-pending.json')) && existsSync(join(target, 'restore-last.json')), 'marqueur consommé, résultat journalisé');
writeFileSync(join(target, 'restore-pending.json'), JSON.stringify({ source: join(target, 'absent.db') }));
const r6b = applyPendingRestore(target, dbPath);
ok(!r6b.ok && readFileSync(dbPath, 'utf8') === 'BASE-SAUVEGARDEE', 'source absente : base actuelle intacte, pas de boucle');

// Rotation des sauvegardes
const { selectToDelete } = await import('./backup.js');
const H = 3600000, now = Date.parse('2026-10-15T12:00:00Z');
const files = Array.from({ length: 24 * 12 }, (_, i) => ({ f: `b${i}`, t: now - i * 2 * H })); // 24 jours, toutes les 2 h
const del = new Set(selectToDelete(files, { keep: 14, keepDays: 14, now }));
const kept2 = files.filter((x) => !del.has(x.f));
ok(kept2.slice(0, 14).every((x, i) => x.f === `b${i}`), 'rotation : les 14 plus récentes gardées');
ok(kept2.some((x) => now - x.t > 10 * 24 * H) && !kept2.some((x) => now - x.t > 15 * 24 * H), 'rotation : une par jour sur 14 jours, rien au-delà');

console.log(`\n${pass} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
