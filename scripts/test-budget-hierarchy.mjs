// Tests d'INTÉGRITÉ du modèle budgétaire hiérarchique (P1) — LAN / node:sqlite.
// Charge le VRAI server/schema.sql dans une base :memory:, puis exerce chaque
// règle : forme par niveau, cohérence parent, cross-tenant, unicité, garde
// d'activation (Σ % secteurs = 100, Σ enveloppes ≤ annuel), non-régression des
// budgets hérités (tier NULL), CHECK des tables réallocation/révision, et une
// simulation de synchro (application FK-safe des budgets triés par tier).
//
// Usage : node scripts/test-budget-hierarchy.mjs   (exit ≠ 0 si une règle casse)

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID as uuid } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(__dirname, '..', 'server', 'schema.sql'), 'utf8');
// Même ordre que server/db.js : schéma de base PUIS DDL d'intégrité de hiérarchie.
const HIER = readFileSync(join(__dirname, '..', 'server', 'budget-hierarchy.sql'), 'utf8');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log(`  ✅ ${m}`); };
const bad = (m) => { fail++; console.log(`  ❌ ${m}`); };

// Attend un SUCCÈS.
function allow(db, label, fn) {
  try { fn(); ok(label); } catch (e) { bad(`${label} — a échoué : ${e.message}`); }
}
// Attend un REJET (contrainte/trigger).
function deny(db, label, fn) {
  try { fn(); bad(`${label} — aurait dû être rejeté`); }
  catch { ok(`${label} — rejeté comme attendu`); }
}

function open() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  db.exec(HIER);
  return db;
}

// Insert générique { table, ...cols }.
function ins(db, table, row) {
  const keys = Object.keys(row);
  const sql = `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  db.prepare(sql).run(...keys.map((k) => row[k]));
}

function seed(db) {
  const A = 'schoolA', B = 'schoolB';
  ins(db, 'schools', { id: A, name: 'École A' });
  ins(db, 'schools', { id: B, name: 'École B' });
  // Périodes académiques (A: 2 périodes en 2026-2027 ; B: 1 période).
  const pA1 = uuid(), pA2 = uuid(), pB1 = uuid();
  ins(db, 'academic_periods', { id: pA1, school_id: A, school_year: '2026-2027', type: 'trimestre', name: 'T1' });
  ins(db, 'academic_periods', { id: pA2, school_id: A, school_year: '2026-2027', type: 'trimestre', name: 'T2' });
  ins(db, 'academic_periods', { id: pB1, school_id: B, school_year: '2026-2027', type: 'trimestre', name: 'T1 (B)' });
  // Unités structurelles (secteurs).
  const uMat = uuid(), uPrim = uuid(), uSec = uuid(), uB = uuid();
  ins(db, 'school_units', { id: uMat,  school_id: A, name: 'Maternelle', section_key: 'maternelle' });
  ins(db, 'school_units', { id: uPrim, school_id: A, name: 'Primaire',   section_key: 'primaire' });
  ins(db, 'school_units', { id: uSec,  school_id: A, name: 'Secondaire', section_key: 'second_cycle' });
  ins(db, 'school_units', { id: uB,    school_id: B, name: 'Primaire B', section_key: 'primaire' });
  return { A, B, pA1, pA2, pB1, uMat, uPrim, uSec, uB };
}

const YEAR = '2026-2027';
const annual = (id, school, env) => ({ id, school_id: school, academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: env });
const period = (id, school, parent, ap, env) => ({ id, school_id: school, academic_year: YEAR, tier: 'period', label: 'Période', parent_budget_id: parent, academic_period_id: ap, envelope_amount: env });
const sector = (id, school, parent, unit, pct) => ({ id, school_id: school, academic_year: YEAR, tier: 'sector', label: 'Secteur', parent_budget_id: parent, school_unit_id: unit, allocation_pct: pct });

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ FORME & COHÉRENCE');
{
  const db = open(); const s = seed(db);
  const an = uuid();
  allow(db, 'annuel racine valide', () => ins(db, 'budgets', annual(an, s.A, 100000000)));
  deny (db, 'deuxième annuel même (école, année)', () => ins(db, 'budgets', annual(uuid(), s.A, 50000000)));

  deny (db, 'annuel avec un parent (forme invalide)', () => ins(db, 'budgets', { ...annual(uuid(), s.A, 10), parent_budget_id: an }));
  deny (db, 'auto-parenté', () => { const id = uuid(); ins(db, 'budgets', { ...annual(id, s.A, 10), tier: 'period', parent_budget_id: id, academic_period_id: s.pA1 }); });

  const per = uuid();
  allow(db, 'période enfant d’un annuel', () => ins(db, 'budgets', period(per, s.A, an, s.pA1, 35000000)));
  deny (db, 'période dupliquée (même parent + même période)', () => ins(db, 'budgets', period(uuid(), s.A, an, s.pA1, 10000000)));
  deny (db, 'période avec période académique d’une AUTRE école', () => ins(db, 'budgets', period(uuid(), s.A, an, s.pB1, 10000000)));
  deny (db, 'période dont le parent n’est pas un annuel', () => ins(db, 'budgets', period(uuid(), s.A, per, s.pA2, 10000000)));

  const sec = uuid();
  allow(db, 'secteur enfant d’une période', () => ins(db, 'budgets', sector(sec, s.A, per, s.uMat, 40)));
  deny (db, 'secteur dupliqué (même période + même unité)', () => ins(db, 'budgets', sector(uuid(), s.A, per, s.uMat, 10)));
  deny (db, 'secteur avec unité d’une AUTRE école', () => ins(db, 'budgets', sector(uuid(), s.A, per, s.uB, 10)));
  deny (db, 'secteur dont le parent n’est pas une période', () => ins(db, 'budgets', sector(uuid(), s.A, an, s.uPrim, 10)));
  deny (db, 'secteur sans pourcentage (forme invalide)', () => ins(db, 'budgets', { id: uuid(), school_id: s.A, academic_year: YEAR, tier: 'sector', label: 'X', parent_budget_id: per, school_unit_id: s.uPrim }));
  deny (db, 'pourcentage > 100', () => ins(db, 'budgets', sector(uuid(), s.A, per, s.uPrim, 150)));
  db.close();
}

console.log('\n▶ GARDE D’ACTIVATION');
{
  const db = open(); const s = seed(db);
  const an = uuid(); ins(db, 'budgets', annual(an, s.A, 100000000));
  const per = uuid(); ins(db, 'budgets', period(per, s.A, an, s.pA1, 35000000));
  const activate = (id) => db.prepare(`UPDATE budgets SET status='active' WHERE id=?`).run(id);

  ins(db, 'budgets', sector(uuid(), s.A, per, s.uMat, 20));
  ins(db, 'budgets', sector(uuid(), s.A, per, s.uPrim, 35));
  deny (db, 'activer une période dont Σ secteurs = 55% (≠100)', () => activate(per));
  ins(db, 'budgets', sector(uuid(), s.A, per, s.uSec, 45));  // total → 100
  allow(db, 'activer une période dont Σ secteurs = 100%', () => activate(per));

  // Σ enveloppes de période ≤ annuel (annuel=100M ; p1=35M déjà, p2=80M → 115M).
  const per2 = uuid(); ins(db, 'budgets', period(per2, s.A, an, s.pA2, 80000000));
  ins(db, 'budgets', sector(uuid(), s.A, per2, s.uPrim, 100));
  deny (db, 'activer une période qui fait dépasser l’annuel (35+80 > 100)', () => activate(per2));
  db.close();
}

console.log('\n▶ NON-RÉGRESSION (budgets hérités tier=NULL)');
{
  const db = open(); const s = seed(db);
  allow(db, 'budget hérité à plat (tier NULL) accepté', () => ins(db, 'budgets', { id: uuid(), school_id: s.A, academic_year: YEAR, period_type: 'annuel', sector: 'general', label: 'Ancien budget', status: 'draft' }));
  allow(db, 'plusieurs budgets hérités même année autorisés (pas d’unicité)', () => ins(db, 'budgets', { id: uuid(), school_id: s.A, academic_year: YEAR, period_type: 'trimestriel', sector: 'primaire', label: 'Ancien 2' }));
  allow(db, 'activer un budget hérité (aucune garde)', () => {
    const id = uuid();
    ins(db, 'budgets', { id, school_id: s.A, academic_year: YEAR, sector: 'maternelle', label: 'Ancien 3' });
    db.prepare(`UPDATE budgets SET status='active' WHERE id=?`).run(id);
  });
  db.close();
}

console.log('\n▶ TABLES RÉALLOCATION / RÉVISION');
{
  const db = open(); const s = seed(db);
  const an = uuid(); ins(db, 'budgets', annual(an, s.A, 100000000));
  const per = uuid(); ins(db, 'budgets', period(per, s.A, an, s.pA1, 35000000));
  const secM = uuid(); ins(db, 'budgets', sector(secM, s.A, per, s.uMat, 50));
  const secP = uuid(); ins(db, 'budgets', sector(secP, s.A, per, s.uPrim, 50));

  allow(db, 'réallocation valide (secteur → secteur)', () => ins(db, 'budget_reallocations', { id: uuid(), school_id: s.A, academic_year: YEAR, source_budget_id: secP, dest_budget_id: secM, amount: 400000, reason: 'ajustement' }));
  deny (db, 'réallocation montant ≤ 0', () => ins(db, 'budget_reallocations', { id: uuid(), school_id: s.A, academic_year: YEAR, source_budget_id: secP, dest_budget_id: secM, amount: 0 }));
  deny (db, 'réallocation source = destination', () => ins(db, 'budget_reallocations', { id: uuid(), school_id: s.A, academic_year: YEAR, source_budget_id: secM, dest_budget_id: secM, amount: 100 }));
  deny (db, 'réallocation statut invalide', () => ins(db, 'budget_reallocations', { id: uuid(), school_id: s.A, academic_year: YEAR, source_budget_id: secP, dest_budget_id: secM, amount: 100, status: 'wat' }));

  allow(db, 'révision annuelle valide', () => ins(db, 'budget_revisions', { id: uuid(), school_id: s.A, academic_year: YEAR, annual_budget_id: an, initial_amount: 100000000, old_amount: 100000000, new_amount: 120000000, reason: 'rallonge' }));
  deny (db, 'révision nouveau montant négatif', () => ins(db, 'budget_revisions', { id: uuid(), school_id: s.A, academic_year: YEAR, annual_budget_id: an, new_amount: -5 }));
  db.close();
}

console.log('\n▶ SYNCHRO : application FK-safe (budgets triés par tier)');
{
  const src = open(); const s = seed(src);
  const an = uuid(); ins(src, 'budgets', annual(an, s.A, 100000000));
  const per = uuid(); ins(src, 'budgets', period(per, s.A, an, s.pA1, 35000000));
  ins(src, 'budgets', sector(uuid(), s.A, per, s.uMat, 100));

  // Base destination « vierge » avec les MÊMES parents (école/périodes/unités).
  const dst = new DatabaseSync(':memory:');
  dst.exec('PRAGMA foreign_keys = ON');
  dst.exec(SCHEMA);
  dst.exec(HIER);
  // Recrée les référentiels avec les mêmes ids (comme le ferait un pull complet).
  for (const t of ['schools', 'academic_periods', 'school_units']) {
    for (const r of src.prepare(`SELECT * FROM "${t}"`).all()) ins(dst, t, r);
  }
  // Applique les budgets DÉSORDONNÉS mais triés par tier (annual<period<sector).
  const rank = (r) => (r.tier === 'sector' ? 2 : r.tier === 'period' ? 1 : 0);
  const rows = src.prepare('SELECT * FROM budgets').all().sort((a, b) => rank(a) - rank(b));
  allow(dst, 'appliquer une hiérarchie triée par tier sans violation de FK', () => {
    for (const r of rows) ins(dst, 'budgets', r);
  });
  const n = dst.prepare('SELECT COUNT(*) c FROM budgets').get().c;
  n === 3 ? ok(`3 budgets répliqués (${n})`) : bad(`attendu 3 budgets, obtenu ${n}`);
  src.close(); dst.close();
}

console.log(`\n═══ RÉSULTAT : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
