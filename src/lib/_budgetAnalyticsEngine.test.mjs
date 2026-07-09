// Tests du moteur d'analyse budgétaire.  node src/lib/_budgetAnalyticsEngine.test.mjs
import {
  elapsedFraction, globalBudget, forecast, feeForecast, topExpenseChapters,
} from './budgetAnalyticsEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Fraction d'année écoulée -----------------------------------------------
ok(elapsedFraction('2025-2026', new Date(2025, 8, 1)) === 0, 'début d’année = 0');
ok(elapsedFraction('2025-2026', new Date(2026, 7, 31)) === 1, 'fin d’année = 1');
ok(Math.abs(elapsedFraction('2025-2026', new Date(2026, 1, 28)) - 0.5) < 0.05, 'mi-année ≈ 0,5');
ok(elapsedFraction('2025-2026', new Date(2027, 0, 1)) === 1, 'après la fin borné à 1');

// --- Budget global consolidé -------------------------------------------------
const budgets = [
  { id: 'b1', label: 'Primaire', sector: 'primaire', status: 'active' },
  { id: 'b2', label: 'Collège', sector: 'college', status: 'active' },
];
const chapters = [
  { id: 'r1', budget_id: 'b1', kind: 'recette', planned_amount: 8000000 },
  { id: 'd1', budget_id: 'b1', kind: 'depense', planned_amount: 6000000 },
  { id: 'd2', budget_id: 'b2', kind: 'depense', planned_amount: 4000000 },
];
const expenses = [
  { budget_id: 'b1', budget_chapter_id: 'd1', amount: 3000000, status: 'paid' },
  { budget_id: 'b2', budget_chapter_id: 'd2', amount: 1000000, status: 'approved' },
];
const g = globalBudget(budgets, chapters, expenses);
ok(g.depensesPrevues === 10000000 && g.engage === 4000000 && g.reste === 6000000, 'global : prévu/engagé/reste');
ok(g.recettes === 8000000 && g.solde === -2000000, 'global : recettes + solde prévisionnel');
ok(g.executionRate === 40, 'taux d’exécution global = 40%');
ok(g.bySector[0].sector === 'primaire' && g.bySector[0].depensesPrevues === 6000000, 'ventilation par secteur triée');
ok(g.byBudget.length === 2, 'détail par budget');

// --- Prévision (projection fin d'année) -------------------------------------
{
  const f = forecast(g, 0.5);                 // à mi-année, 40% consommé
  ok(f.projectedSpend === 8000000, 'projection fin d’année = engagé / fraction (4M/0,5)');
  ok(f.projectedBalance === 2000000, 'solde projeté = prévu − projeté');
  ok(f.onTrack === true, 'dans les clous (40% consommé à 50% écoulé, écart ≤ 10)');
  ok(f.overspendRisk === false, 'pas de risque de dépassement');

  const f2 = forecast({ ...g, engage: 9000000, executionRate: 90 }, 0.5); // 90% à mi-année
  ok(f2.overspendRisk === true && f2.onTrack === false, 'risque de dépassement détecté (rythme trop rapide)');
}

// --- Prévision de recouvrement des frais ------------------------------------
{
  const ff = feeForecast([{ frais_annuels: 100000, frais_payes: 30000 }], 0.5);
  ok(ff.projectedCollection === 60000 && ff.projectedShortfall === 40000, 'recouvrement projeté + manque à gagner');
  ok(feeForecast([{ frais_annuels: 100000, frais_payes: 90000 }], 0.5).projectedCollection === 100000, 'projection plafonnée à l’attendu');
}

// --- Top postes de dépense ---------------------------------------------------
{
  const top = topExpenseChapters(chapters, expenses);
  ok(top[0].label === 'Primaire' || top[0].engage === 3000000, 'top postes trié par engagé');
  ok(top.find((r) => r.id === 'd1').variance === 3000000, 'variance prévu − engagé');
}

console.log(failed ? '\n❌ Budget analytics KO' : '\n✅ Budget analytics OK');
process.exit(failed ? 1 : 0);
