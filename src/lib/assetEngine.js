// Moteur PUR du module IMMOBILISATIONS (patrimoine). Aucune I/O — testable Node.
//
// Un actif (véhicule, bâtiment, ordinateur, imprimante, groupe électrogène,
// mobilier) porte un numéro + une valeur, et trois journaux : pannes,
// réparations, dépenses. Le moteur calcule les coûts consolidés d'un actif.

export const ASSET_CATEGORIES = ['vehicule', 'batiment', 'ordinateur', 'imprimante', 'groupe_electrogene', 'mobilier'];
export const ASSET_STATUSES   = ['active', 'maintenance', 'out_of_service', 'disposed'];
export const BREAKDOWN_STATUSES = ['open', 'resolved'];
export const REPAIR_STATUSES  = ['planned', 'done'];

function sum(records, field) {
  return (records || []).reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

export function totalRepairCost(repairs = []) { return sum(repairs, 'cost'); }
export function totalAssetExpenses(expenses = []) { return sum(expenses, 'amount'); }
export function openBreakdowns(breakdowns = []) { return (breakdowns || []).filter((b) => b.status !== 'resolved').length; }

// Synthèse d'un actif : valeur + coûts d'entretien + coût total de possession.
export function assetSummary(asset, breakdowns = [], repairs = [], expenses = []) {
  const value = Number(asset?.value) || 0;
  const repairCost = totalRepairCost(repairs);
  const expenseTotal = totalAssetExpenses(expenses);
  const maintenanceCost = repairCost + expenseTotal;
  return {
    value,
    open: openBreakdowns(breakdowns),
    breakdowns: (breakdowns || []).length,
    repairs: (repairs || []).length,
    repairCost,
    expenseTotal,
    maintenanceCost,
    tco: value + maintenanceCost,          // coût total de possession
  };
}

// Statistiques de parc : comptages par catégorie / statut + valeur totale.
export function fleetStats(assets = []) {
  const byCategory = {}; const byStatus = {};
  let value = 0;
  for (const a of assets) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    value += Number(a.value) || 0;
  }
  return { count: assets.length, value, byCategory, byStatus };
}
