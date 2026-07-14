// Tests du moteur pur Immobilisations.  node src/lib/_assetEngine.test.mjs
import {
  ASSET_CATEGORIES, ASSET_STATUSES, totalRepairCost, totalAssetExpenses,
  openBreakdowns, assetSummary, fleetStats,
} from './assetEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Catégories demandées ----------------------------------------------------
ok(['vehicule', 'batiment', 'ordinateur', 'imprimante', 'groupe_electrogene', 'mobilier'].every((c) => ASSET_CATEGORIES.includes(c)), 'les 6 catégories sont gérées');
ok(ASSET_STATUSES.includes('out_of_service'), 'statut hors service');

// --- Coûts consolidés d'un actif --------------------------------------------
{
  const breakdowns = [{ status: 'open' }, { status: 'resolved' }, { status: 'open' }];
  const repairs = [{ cost: 50000 }, { cost: 30000 }];
  const expenses = [{ amount: 20000 }, { amount: 5000 }];
  ok(totalRepairCost(repairs) === 80000, 'coût total réparations');
  ok(totalAssetExpenses(expenses) === 25000, 'total dépenses');
  ok(openBreakdowns(breakdowns) === 2, 'pannes ouvertes = 2');

  const s = assetSummary({ value: 1000000 }, breakdowns, repairs, expenses);
  ok(s.maintenanceCost === 105000, 'coût d’entretien = réparations + dépenses');
  ok(s.tco === 1105000, 'coût total de possession = valeur + entretien');
  ok(s.open === 2 && s.breakdowns === 3, 'compteurs pannes');
}

// --- Statistiques de parc ----------------------------------------------------
{
  const assets = [
    { category: 'vehicule', status: 'active', value: 5000000 },
    { category: 'vehicule', status: 'maintenance', value: 3000000 },
    { category: 'ordinateur', status: 'active', value: 400000 },
  ];
  const f = fleetStats(assets);
  ok(f.count === 3 && f.value === 8400000, 'parc : nombre + valeur totale');
  ok(f.byCategory.vehicule === 2 && f.byStatus.active === 2, 'parc : comptages par catégorie/statut');
}

console.log(failed ? '\n❌ Asset engine KO' : '\n✅ Asset engine OK');
process.exit(failed ? 1 : 0);
