// Tests d'INTÉGRITÉ des PÉRIODES budgétaires (modèle CIBLE v3, E1) — LAN / node:sqlite.
// Charge le VRAI server/schema.sql + budget-hierarchy.sql + budget-lines.sql dans une
// base :memory:, puis exerce : borne des dates (fin > début), chevauchement interdit
// dans une même (école, année), intervalles jointifs autorisés, unicité du libellé,
// isolation par école/année, et verrou ON DELETE RESTRICT d'une période utilisée.
//
// Usage : node scripts/test-budget-periods.mjs   (exit ≠ 0 si une règle casse)

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID as uuid } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(__dirname, '..', 'server', 'schema.sql'), 'utf8');
const HIER   = readFileSync(join(__dirname, '..', 'server', 'budget-hierarchy.sql'), 'utf8');
const LINES  = readFileSync(join(__dirname, '..', 'server', 'budget-lines.sql'), 'utf8');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log(`  ✅ ${m}`); };
const bad = (m) => { fail++; console.log(`  ❌ ${m}`); };
function allow(label, fn) { try { fn(); ok(label); } catch (e) { bad(`${label} — a échoué : ${e.message}`); } }
function deny(label, fn) { try { fn(); bad(`${label} — aurait dû être rejeté`); } catch { ok(`${label} — rejeté comme attendu`); } }

function open() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA); db.exec(HIER); db.exec(LINES);
  return db;
}
function ins(db, table, row) {
  const keys = Object.keys(row);
  const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  db.prepare(sql).run(...keys.map((k) => row[k]));
}
const YEAR = '2026-2027';
const per = (id, school, name, start, end, extra = {}) =>
  ({ id, school_id: school, academic_year: YEAR, name, start_date: start, end_date: end, ...extra });

function seed(db) {
  const A = 'schoolA', B = 'schoolB';
  ins(db, 'schools', { id: A, name: 'École A' });
  ins(db, 'schools', { id: B, name: 'École B' });
  return { A, B };
}

console.log('\n▶ BORNE DES DATES');
{
  const db = open(); const s = seed(db);
  allow('période valide (fin > début)', () => ins(db, 'budget_periods', per(uuid(), s.A, 'T1', '2026-09-01', '2026-12-20')));
  deny ('fin = début (durée nulle)',     () => ins(db, 'budget_periods', per(uuid(), s.A, 'Vide', '2026-09-01', '2026-09-01')));
  deny ('fin < début',                   () => ins(db, 'budget_periods', per(uuid(), s.A, 'Inversée', '2026-12-01', '2026-09-01')));
  db.close();
}

console.log('\n▶ CHEVAUCHEMENT');
{
  const db = open(); const s = seed(db);
  ins(db, 'budget_periods', per(uuid(), s.A, 'T1', '2026-09-01', '2026-12-20'));
  allow('période disjointe postérieure',        () => ins(db, 'budget_periods', per(uuid(), s.A, 'T2', '2027-01-05', '2027-03-31')));
  allow('période jointive (début = fin de T1)',  () => ins(db, 'budget_periods', per(uuid(), s.A, 'Jointive', '2026-12-20', '2026-12-31')));
  deny ('période chevauchant T1 (englobe)',      () => ins(db, 'budget_periods', per(uuid(), s.A, 'Chev1', '2026-08-01', '2026-10-01')));
  deny ('période chevauchant T1 (incluse)',      () => ins(db, 'budget_periods', per(uuid(), s.A, 'Chev2', '2026-10-01', '2026-11-01')));
  allow('même dates que T1 mais AUTRE école',    () => ins(db, 'budget_periods', per(uuid(), s.B, 'T1', '2026-09-01', '2026-12-20')));
  db.close();
}

console.log('\n▶ CHEVAUCHEMENT À LA MODIFICATION');
{
  const db = open(); const s = seed(db);
  ins(db, 'budget_periods', per(uuid(), s.A, 'T1', '2026-09-01', '2026-12-20'));
  const t2 = uuid(); ins(db, 'budget_periods', per(t2, s.A, 'T2', '2027-01-05', '2027-03-31'));
  allow('déplacer T2 sans chevauchement', () => db.prepare('UPDATE budget_periods SET start_date=?, end_date=? WHERE id=?').run('2027-02-01', '2027-04-30', t2));
  deny ('déplacer T2 sur T1 (chevauchement)', () => db.prepare('UPDATE budget_periods SET start_date=?, end_date=? WHERE id=?').run('2026-12-01', '2027-01-15', t2));
  db.close();
}

console.log('\n▶ UNICITÉ DU LIBELLÉ');
{
  const db = open(); const s = seed(db);
  ins(db, 'budget_periods', per(uuid(), s.A, 'Premier trimestre', '2026-09-01', '2026-12-20'));
  deny ('même libellé, même école, même année',  () => ins(db, 'budget_periods', per(uuid(), s.A, 'Premier trimestre', '2027-01-05', '2027-03-31')));
  allow('même libellé, AUTRE année',             () => ins(db, 'budget_periods', { ...per(uuid(), s.A, 'Premier trimestre', '2027-09-01', '2027-12-20'), academic_year: '2027-2028' }));
  allow('même libellé, AUTRE école',             () => ins(db, 'budget_periods', per(uuid(), s.B, 'Premier trimestre', '2026-09-01', '2026-12-20')));
  db.close();
}

console.log('\n▶ VERROU D’UNE PÉRIODE UTILISÉE (ON DELETE RESTRICT)');
{
  const db = open(); const s = seed(db);
  const p1 = uuid(); ins(db, 'budget_periods', per(p1, s.A, 'T1', '2026-09-01', '2026-12-20'));
  const bud = uuid(); ins(db, 'budgets', { id: bud, school_id: s.A, academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 6000000 });
  const rub = uuid(); ins(db, 'budget_chapters', { id: rub, school_id: s.A, budget_id: bud, label: 'FONCTIONNEMENT' });
  const ligne = uuid(); ins(db, 'budget_chapters', { id: ligne, school_id: s.A, budget_id: bud, parent_id: rub, label: 'Carburant', planned_amount: 6000000, scope: 'complex' });
  const p2 = uuid(); ins(db, 'budget_periods', per(p2, s.A, 'T2 (libre)', '2027-01-05', '2027-03-31'));

  ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: ligne, budget_period_id: p1, pct: 100 });
  deny ('supprimer une période RÉFÉRENCÉE par une allocation', () => db.prepare('DELETE FROM budget_periods WHERE id=?').run(p1));
  allow('supprimer une période NON référencée',                () => db.prepare('DELETE FROM budget_periods WHERE id=?').run(p2));
  db.close();
}

console.log(`\n═══ RÉSULTAT : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
