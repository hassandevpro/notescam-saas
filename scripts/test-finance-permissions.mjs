// Tests des DROITS FINANCIERS (E6 §5) — au niveau du CATALOGUE PAR DÉFAUT (source
// de vérité applicative). Vérifie qu'Administrateur, Fondatrice et Coordonnateur
// disposent des capacités financières complètes (création/gestion budgets, lignes,
// allocations, dépenses, réallocations, révisions) via permissions configurables —
// aucun test de rôle codé en dur ailleurs. Complète le test serveur (RPC).

import { DEFAULT_CATALOG } from '../src/governance/defaultCatalog.js';
import { hasPermission } from '../src/governance/governanceEngine.js';
import { GOV_PERM as P } from '../src/governance/permissions.js';

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
const bad = (m) => { fail++; console.log(`  ❌ ${m}`); };

const FINANCE = [
  ['budget.view', P.BUDGET_VIEW], ['budget.prepare', P.BUDGET_PREPARE], ['budget.submit', P.BUDGET_SUBMIT],
  ['budget.approve', P.BUDGET_APPROVE], ['budget.close', P.BUDGET_CLOSE],
  ['expense.view', P.EXPENSE_VIEW], ['expense.prepare', P.EXPENSE_PREPARE], ['expense.submit', P.EXPENSE_SUBMIT], ['expense.pay', P.EXPENSE_PAY],
  ['unlock.request', P.UNLOCK_REQUEST], ['reallocate.request', P.REALLOCATE_REQUEST], ['reallocate.decide', P.REALLOCATE_DECIDE],
  ['revise.request', P.ANNUAL_REVISE_REQUEST], ['revise', P.ANNUAL_REVISE],
];

function check(label, baseRole, assignments) {
  let all = true;
  for (const [name, perm] of FINANCE) {
    const has = hasPermission(baseRole, DEFAULT_CATALOG, assignments, perm);
    if (!has) { all = false; console.log(`     ✗ manque ${name}`); }
  }
  all ? ok(`${label} : toutes les capacités financières`) : bad(`${label} : capacités financières incomplètes`);
}

console.log('\n▶ CAPACITÉS FINANCIÈRES COMPLÈTES');
check('Administrateur', 'admin', []);
check('Fondatrice', 'censeur', [{ role: 'fondatrice', status: 'active' }]);
check('Coordonnateur', 'censeur', [{ role: 'coordonnateur_general', status: 'active' }]);

console.log('\n▶ CONFIGURABLE (aucun rôle codé en dur) — un rôle restreint N’a PAS tout');
{
  // Caissier : consulte + décaisse, mais ne CRÉE pas de budget ni ne réalloue.
  const caissier = [{ role: 'caissier', status: 'active' }];
  !hasPermission('censeur', DEFAULT_CATALOG, caissier, P.BUDGET_PREPARE) ? ok('Caissier n’a PAS budget.prepare') : bad('Caissier a budget.prepare (inattendu)');
  !hasPermission('censeur', DEFAULT_CATALOG, caissier, P.REALLOCATE_DECIDE) ? ok('Caissier n’a PAS reallocate.decide') : bad('Caissier a reallocate.decide (inattendu)');
  hasPermission('censeur', DEFAULT_CATALOG, caissier, P.EXPENSE_PAY) ? ok('Caissier a bien expense.pay') : bad('Caissier privé de expense.pay');
}

console.log(`\n═══ RÉSULTAT DROITS FINANCIERS : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
