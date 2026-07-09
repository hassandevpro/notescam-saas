// Tests du moteur pur Budgets (aucune dépendance réseau / Vite / React).
//   node src/lib/_budgetEngine.test.mjs
import {
  periodRefOptions, buildChapterTree, chapterRollup, computeBudgetTotals,
  canTransition, isBudgetLocked, BUDGET_PERIOD_TYPES, BUDGET_STATUSES,
} from './budgetEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Options de période ------------------------------------------------------
ok(periodRefOptions('annuel').length === 0, 'annuel : aucun rang de période');
ok(periodRefOptions('trimestriel').join(',') === '1,2,3', 'trimestriel : 3 rangs');
ok(periodRefOptions('mensuel').length === 12, 'mensuel : 12 rangs');
ok(BUDGET_PERIOD_TYPES.length === 3 && BUDGET_STATUSES.length === 3, 'énumérations exposées');

// --- Totaux : recettes / dépenses / solde -----------------------------------
{
  const chapters = [
    { id: 'r1', kind: 'recette', planned_amount: 12000000 },
    { id: 'r2', kind: 'recette', planned_amount: 2000000 },
    { id: 'd1', kind: 'depense', planned_amount: 8000000 },
    { id: 'd2', kind: 'depense', planned_amount: 1500000 },
    { id: 'd3', kind: 'depense', planned_amount: 800000 },
  ];
  const t = computeBudgetTotals(chapters);
  ok(t.recettes === 14000000, 'total recettes');
  ok(t.depenses === 10300000, 'total dépenses');
  ok(t.solde === 3700000, 'solde prévisionnel = recettes - dépenses');
}

// --- Consolidation : un chapitre porteur de sous-chapitres = somme des enfants
{
  const chapters = [
    { id: 'c1', kind: 'depense', planned_amount: 999 }, // ignoré (parent)
    { id: 'c1a', parent_id: 'c1', kind: 'depense', planned_amount: 300000 },
    { id: 'c1b', parent_id: 'c1', kind: 'depense', planned_amount: 200000 },
    { id: 'c2', kind: 'depense', planned_amount: 100000 }, // feuille
  ];
  const { amountOf } = chapterRollup(chapters);
  ok(amountOf(chapters[0]) === 500000, 'montant consolidé du parent = somme des enfants');
  const t = computeBudgetTotals(chapters);
  ok(t.depenses === 600000, 'pas de double comptage parent/enfants (500k + 100k)');
}

// --- Arbre d'affichage -------------------------------------------------------
{
  const chapters = [
    { id: 'b', label: 'B', position: 2 },
    { id: 'a', label: 'A', position: 1 },
    { id: 'a1', parent_id: 'a', label: 'A1', position: 1 },
  ];
  const tree = buildChapterTree(chapters);
  ok(tree.length === 2 && tree[0].id === 'a', 'racines triées par position');
  ok(tree[0].children.length === 1 && tree[0].children[0].id === 'a1', 'sous-chapitres imbriqués');
}

// --- Machine à états (statut) ------------------------------------------------
ok(canTransition('draft', 'active'), 'draft -> active autorisé');
ok(canTransition('active', 'closed'), 'active -> closed (clôture) autorisé');
ok(canTransition('closed', 'active'), 'closed -> active (réouverture) autorisé');
ok(!canTransition('draft', 'closed'), 'draft -> closed refusé (passe par active)');
ok(isBudgetLocked({ status: 'closed' }) === true, 'budget clôturé = verrouillé');
ok(isBudgetLocked({ status: 'active' }) === false, 'budget actif = éditable');

console.log(failed ? '\n❌ Budget engine KO' : '\n✅ Budget engine OK');
process.exit(failed ? 1 : 0);
