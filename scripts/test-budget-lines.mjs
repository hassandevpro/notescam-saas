// Tests d'INTÉGRITÉ des LIGNES budgétaires + allocations (modèle CIBLE v3, E1) — LAN.
// Charge server/schema.sql + budget-hierarchy.sql + budget-lines.sql (:memory:) et exerce :
//   • répartition temporelle : période même école/année, unicité, bornes du % ;
//   • répartition sectorielle : réservée aux lignes de portée 'sectors', unité de l'école,
//     unicité, bornes du % ;
//   • garde d'ACTIVATION d'une ligne : Σ % temporel = 100 (+ Σ % sectoriel = 100 si 'sectors') ;
//     le reste n'est JAMAIS réparti automatiquement.
//
// Usage : node scripts/test-budget-lines.mjs   (exit ≠ 0 si une règle casse)

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

// Établissement A complet : 3 unités, budget annuel, 1 rubrique, 2 lignes (sectorielle + complexe),
// 3 périodes budgétaires ; + établissement B (isolation) avec sa propre période et unité.
function seed(db) {
  const A = 'schoolA', B = 'schoolB';
  ins(db, 'schools', { id: A, name: 'École A' });
  ins(db, 'schools', { id: B, name: 'École B' });
  const uMat = uuid(), uPrim = uuid(), uSec = uuid(), uB = uuid();
  ins(db, 'school_units', { id: uMat,  school_id: A, name: 'Maternelle', section_key: 'maternelle' });
  ins(db, 'school_units', { id: uPrim, school_id: A, name: 'Primaire',   section_key: 'primaire' });
  ins(db, 'school_units', { id: uSec,  school_id: A, name: 'Secondaire', section_key: 'second_cycle' });
  ins(db, 'school_units', { id: uB,    school_id: B, name: 'Primaire B', section_key: 'primaire' });

  const bud = uuid();
  ins(db, 'budgets', { id: bud, school_id: A, academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 20000000 });
  const rub = uuid();
  ins(db, 'budget_chapters', { id: rub, school_id: A, budget_id: bud, label: 'FONCTIONNEMENT' }); // rubrique (scope NULL)
  const ligneSec = uuid();  // ligne sectorielle (Fournitures)
  ins(db, 'budget_chapters', { id: ligneSec, school_id: A, budget_id: bud, parent_id: rub, label: 'Fournitures', planned_amount: 3000000, scope: 'sectors' });
  const ligneCx = uuid();   // ligne complexe (Carburant)
  ins(db, 'budget_chapters', { id: ligneCx, school_id: A, budget_id: bud, parent_id: rub, label: 'Carburant', planned_amount: 6000000, scope: 'complex' });

  const p1 = uuid(), p2 = uuid(), p3 = uuid();
  ins(db, 'budget_periods', { id: p1, school_id: A, academic_year: YEAR, name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20', position: 1 });
  ins(db, 'budget_periods', { id: p2, school_id: A, academic_year: YEAR, name: 'T2', start_date: '2027-01-05', end_date: '2027-03-31', position: 2 });
  ins(db, 'budget_periods', { id: p3, school_id: A, academic_year: YEAR, name: 'T3', start_date: '2027-04-12', end_date: '2027-06-30', position: 3 });
  // Établissement B : période + budget dans la même année (pour tester l'isolation).
  const pB = uuid(); ins(db, 'budget_periods', { id: pB, school_id: B, academic_year: YEAR, name: 'T1 (B)', start_date: '2026-09-01', end_date: '2026-12-20' });
  return { A, B, bud, rub, ligneSec, ligneCx, uMat, uPrim, uSec, uB, p1, p2, p3, pB };
}

const activate = (db, id) => db.prepare("UPDATE budget_chapters SET status='active' WHERE id=?").run(id);

console.log('\n▶ RÉPARTITION TEMPORELLE');
{
  const db = open(); const s = seed(db);
  allow('allocation temporelle valide (T1 40%)', () => ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: s.p1, pct: 40 }));
  deny ('période d’une AUTRE école',             () => ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: s.pB, pct: 10 }));
  deny ('doublon (même ligne + même période)',   () => ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: s.p1, pct: 30 }));
  deny ('pourcentage > 100',                     () => ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: s.p2, pct: 140 }));
  db.close();
}

console.log('\n▶ RÉPARTITION TEMPORELLE — période hors année');
{
  const db = open(); const s = seed(db);
  // Période valide côté forme mais année ≠ celle du budget annuel.
  const pOtherYear = uuid();
  ins(db, 'budget_periods', { id: pOtherYear, school_id: s.A, academic_year: '2027-2028', name: 'T1 (autre année)', start_date: '2027-09-01', end_date: '2027-12-20' });
  deny('période d’une AUTRE année que le budget', () => ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: pOtherYear, pct: 50 }));
  db.close();
}

console.log('\n▶ RÉPARTITION SECTORIELLE');
{
  const db = open(); const s = seed(db);
  allow('allocation sectorielle sur ligne « sectors »', () => ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, school_unit_id: s.uMat, pct: 20 }));
  deny ('allocation sectorielle sur ligne « complex »', () => ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, school_unit_id: s.uMat, pct: 100 }));
  deny ('allocation sectorielle sur une RUBRIQUE (scope NULL)', () => ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.rub, school_unit_id: s.uMat, pct: 100 }));
  deny ('unité d’une AUTRE école',                      () => ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, school_unit_id: s.uB, pct: 10 }));
  deny ('doublon (même ligne + même unité)',            () => ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, school_unit_id: s.uMat, pct: 35 }));
  deny ('pourcentage > 100',                            () => ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, school_unit_id: s.uPrim, pct: 120 }));
  db.close();
}

console.log('\n▶ ACTIVATION — ligne COMPLEXE (Σ temporel = 100)');
{
  const db = open(); const s = seed(db);
  ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: s.p1, pct: 40 });
  ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: s.p2, pct: 30 });
  deny ('activer avec Σ temporel = 70% (≠100)', () => activate(db, s.ligneCx));
  ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneCx, budget_period_id: s.p3, pct: 30 }); // → 100
  allow('activer avec Σ temporel = 100%',        () => activate(db, s.ligneCx));
  db.close();
}

console.log('\n▶ ACTIVATION — ligne SECTORIELLE (Σ temporel ET Σ sectoriel = 100)');
{
  const db = open(); const s = seed(db);
  // Temporel complet (50/30/20).
  ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, budget_period_id: s.p1, pct: 50 });
  ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, budget_period_id: s.p2, pct: 30 });
  ins(db, 'budget_line_periods', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, budget_period_id: s.p3, pct: 20 });
  // Sectoriel incomplet (20 + 35 = 55).
  ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, school_unit_id: s.uMat,  pct: 20 });
  ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, school_unit_id: s.uPrim, pct: 35 });
  deny ('activer avec Σ sectoriel = 55% (≠100)', () => activate(db, s.ligneSec));
  ins(db, 'budget_line_sectors', { id: uuid(), school_id: s.A, budget_chapter_id: s.ligneSec, school_unit_id: s.uSec, pct: 45 }); // → 100
  allow('activer avec Σ temporel ET sectoriel = 100%', () => activate(db, s.ligneSec));
  db.close();
}

console.log(`\n═══ RÉSULTAT : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
