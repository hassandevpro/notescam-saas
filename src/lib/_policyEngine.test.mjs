// Tests du moteur de politique de déploiement (pur).
//   node src/lib/_policyEngine.test.mjs
import {
  EXECUTION, DEFAULT_MODE, MODULE, moduleOfTable, parsePolicy, isDefaultPolicy,
  moduleConfig, executionMode, shouldPush, shouldPull, governanceChannel,
} from './policyEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── INERTIE : politique absente/vide = comportement actuel (push+pull partout) ──
const FINANCE_TABLES = ['budgets', 'budget_chapters', 'budget_expenses', 'budget_periods', 'budget_line_sectors'];
const OTHER_TABLES = ['grades', 'students', 'schools', 'staff', 'student_fees', 'timetable_slots'];
const ALL = [...FINANCE_TABLES, ...OTHER_TABLES, 'table_inconnue'];

for (const raw of [null, undefined, '', '{}', '   ', '[]', 'not json', {}]) {
  ok(isDefaultPolicy(raw), `politique « ${JSON.stringify(raw)} » = défaut (inerte)`);
  const allReplicate = ALL.every((t) => shouldPush(raw, t) && shouldPull(raw, t));
  ok(allReplicate, `défaut « ${JSON.stringify(raw)} » → push+pull vrais pour TOUTES les tables`);
}
ok(DEFAULT_MODE === EXECUTION.HYBRID, 'mode par défaut = hybride');

// ── Classification table → module ─────────────────────────────────────────────
ok(moduleOfTable('budget_expenses') === MODULE.FINANCE, 'budget_expenses → finance');
ok(moduleOfTable('budget_line_reallocations') === MODULE.FINANCE, 'budget_line_reallocations → finance');
ok(moduleOfTable('grades') === MODULE.NOTES, 'grades → notes');
ok(moduleOfTable('student_fees') === MODULE.FEES, 'student_fees → fees (≠ budget)');
ok(moduleOfTable('students') === MODULE.DEFAULT, 'students → default');
ok(moduleOfTable('inconnue') === MODULE.DEFAULT, 'table inconnue → default');

// ── parsePolicy : objet ou chaîne ; vide/illisible → null ─────────────────────
ok(parsePolicy('{"finance":{"execution":"lan"}}')?.finance.execution === 'lan', 'parse chaîne JSON');
ok(parsePolicy({ finance: { execution: 'lan' } })?.finance.execution === 'lan', 'parse objet');
ok(parsePolicy('{bad json') === null, 'JSON invalide → null');
ok(parsePolicy('{}') === null, 'objet vide → null');

// ── Finance = LAN pur (sans gouvernance distante) : AUCUNE réplication finance ──
const P_LAN_ONLY = { finance: { execution: 'lan' } };
for (const t of FINANCE_TABLES) {
  ok(!shouldPush(P_LAN_ONLY, t) && !shouldPull(P_LAN_ONLY, t), `finance=lan (sans gov) → ${t} ni push ni pull`);
}

// ── H4 : finance LAN-first + GOUVERNANCE DISTANTE → projection LECTURE de la
//    STRUCTURE (push), l'OPÉRATIONNEL reste LAN-only, et JAMAIS de pull (LAN autorité) ──
const P_LAN_GOV = { finance: { execution: 'lan', governance: 'cloud' } };
for (const t of ['budgets', 'budget_chapters', 'budget_periods', 'budget_line_periods', 'budget_line_sectors']) {
  ok(shouldPush(P_LAN_GOV, t) && !shouldPull(P_LAN_GOV, t), `H4 : structure ${t} PROJETÉE (push, jamais pull)`);
}
for (const t of ['budget_expenses', 'budget_unlock_requests', 'budget_reallocations']) {
  ok(!shouldPush(P_LAN_GOV, t) && !shouldPull(P_LAN_GOV, t), `H4 : opérationnel ${t} reste LAN-only (ni push ni pull)`);
}
for (const t of OTHER_TABLES) {
  ok(shouldPush(P_LAN_GOV, t) && shouldPull(P_LAN_GOV, t), `finance=lan → ${t} (autre module) reste répliqué`);
}
ok(governanceChannel(P_LAN_GOV, MODULE.FINANCE) === 'cloud', 'finance.governance=cloud → canal ouvert (cloud)');
ok(governanceChannel(P_LAN_GOV, MODULE.NOTES) === null, 'notes sans governance → canal fermé');
ok(governanceChannel(P_LAN_ONLY, MODULE.FINANCE) === null, 'finance=lan sans governance → canal fermé (pas de projection)');

// ── Mode cloud : pull seul (le LAN reçoit, ne pousse pas) ──────────────────────
const P_CLOUD_NOTES = { notes: { execution: 'cloud' } };
ok(!shouldPush(P_CLOUD_NOTES, 'grades') && shouldPull(P_CLOUD_NOTES, 'grades'), 'notes=cloud → grades pull seul');
ok(executionMode(P_CLOUD_NOTES, MODULE.NOTES) === 'cloud', 'notes=cloud → mode cloud');

// ── Règle default dans la politique s'applique aux modules non cités ──────────
const P_DEFAULT_LAN = { default: { execution: 'lan' }, notes: { execution: 'hybrid' } };
ok(!shouldPush(P_DEFAULT_LAN, 'students'), 'default=lan → students ne pousse pas');
ok(shouldPush(P_DEFAULT_LAN, 'grades'), 'notes=hybrid surcharge default=lan → grades pousse');

// ── H6 : NOTES Cloud→LAN sous politique module (surface COMPLÈTE) ─────────────
// Toute la surface « notes » (saisie classique + moteur officiel) suit la politique
// `notes`, indépendamment de `finance`.
const NOTE_TABLES = ['grades', 'student_absences', 'attendance', 'sequence_dates', 'apc_notes', 'mat_observations', 'prim_notes'];
for (const t of NOTE_TABLES) ok(moduleOfTable(t) === MODULE.NOTES, `H6 : ${t} → notes (surface complète)`);

// (a) notes=hybrid ISOLÉ de finance=lan : les notes se répliquent quand même (les deux sens).
const P_H6 = { finance: { execution: 'lan', governance: 'cloud' }, notes: { execution: 'hybrid' } };
for (const t of NOTE_TABLES) {
  ok(shouldPush(P_H6, t) && shouldPull(P_H6, t), `H6 : finance=lan n'affecte PAS ${t} (push+pull)`);
}
// La finance reste, elle, LAN-first (opérationnel non répliqué) — cloisonnement prouvé.
ok(!shouldPull(P_H6, 'budget_expenses'), 'H6 : cloisonnement — finance opérationnelle reste LAN-only');

// (b) notes=cloud (Cloud fait autorité, saisie en ligne) : PULL cloud→LAN pour TOUTES
// les notes, jamais de push (le LAN reçoit). C'est le flux « Notes Cloud→LAN ».
const P_H6_CLOUD = { finance: { execution: 'lan' }, notes: { execution: 'cloud' } };
for (const t of NOTE_TABLES) {
  ok(!shouldPush(P_H6_CLOUD, t) && shouldPull(P_H6_CLOUD, t), `H6 : notes=cloud → ${t} pull cloud→LAN seul`);
}

// (c) notes=hybrid SURCHARGE default=lan pour TOUTE la surface (y compris officiel) —
// le trou historique (apc_notes/mat_observations/prim_notes classées `default`) est fermé.
const P_H6_DEFLAN = { default: { execution: 'lan' }, notes: { execution: 'hybrid' } };
for (const t of ['apc_notes', 'mat_observations', 'prim_notes']) {
  ok(shouldPush(P_H6_DEFLAN, t) && shouldPull(P_H6_DEFLAN, t), `H6 : notes=hybrid surcharge default=lan pour ${t} (officiel)`);
}
ok(!shouldPush(P_H6_DEFLAN, 'students'), 'H6 : default=lan s\'applique toujours aux non-notes (students)');

// ── Valeur d'exécution invalide → repli sûr (hybride) ─────────────────────────
ok(executionMode({ finance: { execution: 'wtf' } }, MODULE.FINANCE) === 'hybrid', 'execution invalide → hybride (sûr)');

console.log(failed ? '\n❌ Policy engine ÉCHEC' : '\n✅ Policy engine OK');
process.exit(failed ? 1 : 0);
