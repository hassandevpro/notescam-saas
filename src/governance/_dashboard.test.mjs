// Test pur des dashboards par rôle (catalogue-driven). node src/governance/_dashboard.test.mjs
import { filterBudgetDataBySector, roleBudgetQueues, dashboardProfile } from './dashboard.js';
import { DEFAULT_CATALOG } from './defaultCatalog.js';

const CAT = DEFAULT_CATALOG;
const A = (role) => ({ role, status: 'active' }); // affectation active

let failed = false;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed = true; };

// ── filterBudgetDataBySector ────────────────────────────────────────────────
const data = {
  budgets: [ { id: 'b1', sector: 'college' }, { id: 'b2', sector: 'primaire' } ],
  chapters: [ { id: 'c1', budget_id: 'b1' }, { id: 'c2', budget_id: 'b2' } ],
  expenses: [
    { id: 'e1', sector: 'college', budget_id: 'b1', amount: 10000, status: 'submitted' },
    { id: 'e2', sector: 'primaire', budget_id: 'b2', amount: 300000, status: 'approved' },
    { id: 'e3', sector: null, budget_id: 'b1', amount: 5000, status: 'submitted' }, // secteur via budget
  ],
};

ok(filterBudgetDataBySector(data, null) === data, 'covered=null (admin/transverse) → données inchangées');
const college = filterBudgetDataBySector(data, ['college']);
ok(college.budgets.length === 1 && college.budgets[0].id === 'b1', 'secteur college → 1 budget');
ok(college.chapters.length === 1 && college.chapters[0].id === 'c1', 'chapitres du budget college seulement');
ok(college.expenses.some((e) => e.id === 'e1') && college.expenses.some((e) => e.id === 'e3') && !college.expenses.some((e) => e.id === 'e2'),
  'dépenses college (e1 direct + e3 via budget), pas primaire (e2)');

// ── roleBudgetQueues ────────────────────────────────────────────────────────
// RAF (barème par défaut : <25k → RAF). e1=10k / e3=5k submitted → à valider.
const rafQ = roleBudgetQueues({ role: 'teacher', catalog: CAT, assignments: [A('raf')], expenses: data.expenses });
ok(rafQ.toValidate.some((e) => e.id === 'e1') && rafQ.toValidate.some((e) => e.id === 'e3'), 'RAF : valide les dépenses <25k soumises (palier RAF)');
ok(rafQ.toPay.some((e) => e.id === 'e2'), 'RAF : e2 (approved) à décaisser — RAF détient EXPENSE_PAY');

// Coordonnateur (rang 90, PAS l'autorité suprême) : ne valide PAS un palier RAF.
const coordQ = roleBudgetQueues({ role: 'teacher', catalog: CAT, assignments: [A('coordonnateur_general')], expenses: data.expenses });
ok(coordQ.toValidate.length === 0, 'Coordonnateur : ne valide PAS une dépense de palier RAF (10k/5k)');

// Fondatrice (rang max) : dernier recours → valide même un palier RAF.
const fondValidateQ = roleBudgetQueues({ role: 'teacher', catalog: CAT, assignments: [A('fondatrice')], expenses: data.expenses });
ok(fondValidateQ.toValidate.some((e) => e.id === 'e1'), 'Fondatrice : dernier recours → valide un palier RAF');

// Caissier : approved en attente de décaissement (e2 approved).
const caisQ = roleBudgetQueues({ role: 'teacher', catalog: CAT, assignments: [A('caissier')], expenses: data.expenses });
ok(caisQ.toPay.some((e) => e.id === 'e2'), 'Caissier : e2 (approved) à décaisser');
ok(caisQ.toValidate.length === 0, 'Caissier : ne valide rien');

// Unlock decide : fondatrice.
const fondQ = roleBudgetQueues({ role: 'teacher', catalog: CAT, assignments: [A('fondatrice')], expenses: data.expenses,
  unlockRequests: [{ id: 'u1', status: 'pending' }, { id: 'u2', status: 'approved' }] });
ok(fondQ.unlocksToDecide.length === 1 && fondQ.unlocksToDecide[0].id === 'u1', 'Fondatrice : 1 déblocage en attente');

// Principal : pas approve/pay/decide → files vides.
const prinQ = roleBudgetQueues({ role: 'teacher', catalog: CAT, assignments: [A('principal')], expenses: data.expenses,
  unlockRequests: [{ id: 'u1', status: 'pending' }] });
ok(prinQ.toValidate.length === 0 && prinQ.toPay.length === 0 && prinQ.unlocksToDecide.length === 0, 'Principal : aucune file d\'action (jamais valideur de dépense)');

// ── dashboardProfile ────────────────────────────────────────────────────────
const admin = dashboardProfile('admin', CAT, []);
ok(admin.covered === null && admin.showGlobalFigures && admin.showValidationQueue, 'admin : vue complète');
const fond = dashboardProfile('teacher', CAT, [A('fondatrice')]);
ok(fond.showGlobalFigures && fond.showGroupDashboard && fond.showUnlockQueue && !fond.scopedToSector, 'Fondatrice : global + groupe + déblocages, non borné secteur');
const caissier = dashboardProfile('teacher', CAT, [A('caissier')]);
ok(caissier.cashierOnly && caissier.showPaymentQueue && !caissier.showGlobalFigures, 'Caissier : file de paiement, PAS de chiffres globaux');
const principal = dashboardProfile('teacher', CAT, [A('principal')]);
ok(principal.scopedToSector && JSON.stringify(principal.covered) === '["college"]' && !principal.showValidationQueue, 'Principal : borné college, pas de file de validation');
const enseignant = dashboardProfile('teacher', CAT, []);
ok(!enseignant.showGlobalFigures && !enseignant.showValidationQueue && !enseignant.showPaymentQueue, 'Enseignant : aucun widget budget');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
