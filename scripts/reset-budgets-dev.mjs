// Reset des données budgétaires de DÉVELOPPEMENT uniquement (LAN / SQLite).
//
// Contexte : aucune école en production → aucune donnée budgétaire client à
// préserver. Ce script vide EXCLUSIVEMENT les tables du domaine budgétaire pour
// repartir sur le modèle hiérarchique cible. Il NE TOUCHE AUCUN autre module
// (élèves, notes, paiements scolaires, personnel, utilisateurs, classes, etc.).
//
// Usage :  node scripts/reset-budgets-dev.mjs           (aperçu, ne supprime rien)
//          node scripts/reset-budgets-dev.mjs --apply   (exécute la suppression)
//
// Garde-fou : refuse de s'exécuter si NODE_ENV=production.

import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

if (process.env.NODE_ENV === 'production') {
  console.error('✋ Refus : NODE_ENV=production. Ce reset est réservé au développement.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.NOTESCAM_DATA_DIR || join(__dirname, '..', 'server', 'data');
const DB_PATH = join(DATA_DIR, 'notescam.db');

// SEULES ces tables sont vidées. Ordre enfants → parents (FK).
const BUDGET_TABLES = [
  'budget_reallocations',
  'budget_revisions',
  'budget_unlock_requests',
  'budget_expenses',
  'budget_chapters',
  'budgets',
];

const apply = process.argv.includes('--apply');

if (!existsSync(DB_PATH)) {
  console.log(`ℹ️  Base LAN absente (${DB_PATH}) — rien à réinitialiser.`);
  process.exit(0);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

function count(t) {
  try { return db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c; }
  catch { return null; }               // table absente : ignore
}

console.log(`Base : ${DB_PATH}`);
console.log(apply ? '── MODE APPLICATION ──' : '── APERÇU (ajouter --apply pour exécuter) ──');
for (const t of BUDGET_TABLES) {
  const n = count(t);
  if (n === null) { console.log(`  ${t.padEnd(24)} (table absente)`); continue; }
  console.log(`  ${t.padEnd(24)} ${n} ligne(s)${apply ? ' → suppression' : ''}`);
}

if (apply) {
  db.exec('BEGIN');
  try {
    for (const t of BUDGET_TABLES) {
      try { db.prepare(`DELETE FROM "${t}"`).run(); } catch { /* table absente */ }
    }
    db.exec('COMMIT');
    console.log('✅ Tables budgétaires vidées. Aucun autre module touché.');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('❌ Échec, rollback :', e.message);
    process.exit(1);
  }
}
db.close();
