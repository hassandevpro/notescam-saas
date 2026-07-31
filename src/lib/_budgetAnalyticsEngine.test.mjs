// Tests du moteur d'analyse budgétaire (PRÉVISIONS).  node src/lib/_budgetAnalyticsEngine.test.mjs
// (P7) globalBudget / topExpenseChapters retirés → le budget global consolidé est
// désormais calculé par le moteur hiérarchique P2 (cf. _budget_engine.test / P2).
import { elapsedFraction, forecast, feeForecast } from './budgetAnalyticsEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Fraction d'année écoulée (sept → sept, 12 mois pleins) -----------------
ok(elapsedFraction('2025-2026', new Date(2025, 8, 1)) === 0, 'début d’année (1er sept) = 0');
ok(elapsedFraction('2025-2026', new Date(2026, 8, 1)) === 1, 'fin d’année (1er sept suivant) = 1');
ok(Math.abs(elapsedFraction('2025-2026', new Date(2026, 2, 1)) - 0.5) < 0.03, 'mi-année (1er mars) ≈ 0,5');
ok(elapsedFraction('2025-2026', new Date(2027, 0, 1)) === 1, 'après la fin borné à 1');
ok(elapsedFraction('2025-2026', new Date(2025, 7, 1)) === 0, 'avant le début borné à 0');

// --- Prévision (projection fin d'année) -------------------------------------
// `forecast` prend une synthèse { depensesPrevues, engage, executionRate } — elle
// vient désormais du nœud annuel P2 (nodeConsumption). Ici on la fournit directement.
{
  const g = { recettes: 8000000, depensesPrevues: 10000000, engage: 4000000, executionRate: 40 };
  const f = forecast(g, 0.5);                 // à mi-année, 40% consommé
  ok(f.projectedSpend === 8000000, 'projection fin d’année = engagé / fraction (4M/0,5)');
  ok(f.projectedBalance === 2000000, 'solde projeté = prévu − projeté');
  ok(f.onTrack === true, 'dans les clous (40% consommé à 50% écoulé, écart ≤ 10)');
  ok(f.overspendRisk === false, 'pas de risque de dépassement');

  const f2 = forecast({ ...g, engage: 9000000, executionRate: 90 }, 0.5); // 90% à mi-année
  ok(f2.overspendRisk === true && f2.onTrack === false, 'risque de dépassement détecté (rythme trop rapide)');

  // Début d'exercice : la projection ne doit PAS exploser (plancher d'1 mois).
  const early = forecast({ ...g, engage: 1000000, executionRate: 10 }, 0.01); // 1% écoulé
  ok(early.projectedSpend === 12000000, 'début d’exercice : projection = engagé ÷ (1/12), pas ÷0,01');
  ok(early.elapsed === 1, 'temps écoulé affiché reste réel (1%)');

  // Sans dépenses prévues : pas de « risque » ni « hors clous » absurdes.
  const noPlan = forecast({ recettes: 0, depensesPrevues: 0, engage: 0, executionRate: 0 }, 0.5);
  ok(noPlan.overspendRisk === false && noPlan.onTrack === true, 'aucun budget prévu → pas de risque, dans les clous');
}

// --- Prévision de recouvrement des frais ------------------------------------
{
  const ff = feeForecast([{ frais_annuels: 100000, frais_payes: 30000 }], 0.5);
  ok(ff.projectedCollection === 60000 && ff.projectedShortfall === 40000, 'recouvrement projeté + manque à gagner');
  ok(feeForecast([{ frais_annuels: 100000, frais_payes: 90000 }], 0.5).projectedCollection === 100000, 'projection plafonnée à l’attendu');
}

console.log(failed ? '\n❌ Budget analytics KO' : '\n✅ Budget analytics OK');
process.exit(failed ? 1 : 0);
