// Seed minimal pour tester le TRANSFERT en LAN (usage dev/test uniquement).
// Importer server/db.js déclenche les migrations (ensureColumn + backfill).
import { db } from '../server/db.js';
import { hashPassword } from '../server/security.js';

const YEAR = '2025-2026';
const now = new Date().toISOString();
const put = (sql, ...args) => db.prepare(sql).run(...args);

// 1. Utilisateur admin (mot de passe : test1234)
put(`INSERT OR REPLACE INTO users (id, email, password_hash, full_name, email_confirmed_at, created_at)
     VALUES (?,?,?,?,?,?)`,
  'u-test', 'test@notescam.local', hashPassword('test1234'), 'Test Admin', now, now);

// 2. École
put(`INSERT OR REPLACE INTO schools (id, name, type, current_year, currency, language, country_system)
     VALUES (?,?,?,?,?,?,?)`,
  'sch-test', 'École Test Transfert', 'college', YEAR, 'XAF', 'fr', 'cameroon_fr');

// 3. Lien admin ↔ école
put(`INSERT OR REPLACE INTO school_users (id, school_id, user_id, role, full_name, active, created_at)
     VALUES (?,?,?,?,?,1,?)`,
  'su-test', 'sch-test', 'u-test', 'admin', 'Test Admin', now);

// 4. Deux classes, niveaux différents (→ transfert = changement_niveau)
put(`INSERT OR REPLACE INTO classes (id, school_id, name, level, section, system, cycle, current_year, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  'cls-6a', 'sch-test', '6e A', '6e', 'college', 'FR', 'secondaire', YEAR, now);
put(`INSERT OR REPLACE INTO classes (id, school_id, name, level, section, system, cycle, current_year, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  'cls-5a', 'sch-test', '5e A', '5e', 'college', 'FR', 'secondaire', YEAR, now);

// 5. Grilles tarifaires DIFFÉRENTES (→ recalcul des frais au transfert)
const tr6 = JSON.stringify([
  { id: 't1', label: 'Tranche 1', amount: 30000, due_date: '2025-10-01' },
  { id: 't2', label: 'Tranche 2', amount: 30000, due_date: '2026-01-01' },
]);
const tr5 = JSON.stringify([
  { id: 't1', label: 'Tranche 1', amount: 40000, due_date: '2025-10-01' },
  { id: 't2', label: 'Tranche 2', amount: 40000, due_date: '2026-01-01' },
]);
put(`INSERT OR REPLACE INTO class_fee_grids (id, school_id, class_id, academic_year, amount_comptant, amount_echelonne, tranches, currency)
     VALUES (?,?,?,?,?,?,?,?)`,
  'grid-6a', 'sch-test', 'cls-6a', YEAR, 50000, 60000, tr6, 'XAF');
put(`INSERT OR REPLACE INTO class_fee_grids (id, school_id, class_id, academic_year, amount_comptant, amount_echelonne, tranches, currency)
     VALUES (?,?,?,?,?,?,?,?)`,
  'grid-5a', 'sch-test', 'cls-5a', YEAR, 70000, 80000, tr5, 'XAF');

// 6. Un élève en 6e A, mode échelonné, avec 1 remise % + 1 remise montant fixe
put(`INSERT OR REPLACE INTO students (id, school_id, class_id, name, matricule, gender, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  'stu-1', 'sch-test', 'cls-6a', 'Awa Test', 'M-001', 'Feminin', now);

const adjustments = JSON.stringify([
  { id: 'p1', type: 'remise', label: 'Remise 10%', mode: 'percent', value: 10 },
  { id: 'f1', type: 'bourse', label: 'Bourse 5000', mode: 'amount', value: 5000 },
]);
put(`INSERT OR REPLACE INTO student_fees (id, school_id, student_id, academic_year, frais_annuels, frais_payes, tranches, payment_mode, adjustments, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  'fee-1', 'sch-test', 'stu-1', YEAR, 60000, 20000, tr6, 'echelonne', adjustments, now, now);

// 7. Affectation INITIALE en cours (comme le ferait le backfill / addStudent)
put(`INSERT OR REPLACE INTO student_class_assignments
     (id, school_id, student_id, class_id, class_name, section, date_debut, date_fin, type_transfert, reason, assigned_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  'asg-1', 'sch-test', 'stu-1', 'cls-6a', '6e A', 'college', now, null, 'initial', 'Seed', now, now);

// Récap
const c = (t) => db.prepare(`SELECT count(*) n FROM ${t}`).get().n;
console.log('Seed OK :',
  'users', c('users'), '| schools', c('schools'), '| classes', c('classes'),
  '| students', c('students'), '| grids', c('class_fee_grids'),
  '| assignments', c('student_class_assignments'), '| fees', c('student_fees'));
console.log('Login : test@notescam.local / test1234');
