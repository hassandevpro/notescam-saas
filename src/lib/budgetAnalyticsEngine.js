// Moteur PUR d'ANALYSE BUDGÉTAIRE : budget global consolidé + prévisions +
// statistiques avancées. Aucune I/O → testable. RÉUTILISE les moteurs budget
// et dépenses (pas de recalcul en double).
import { computeBudgetTotals, chapterRollup } from './budgetEngine.js';
import { totalSpent, spentByChapter } from './expenseEngine.js';

const groupBy = (arr, key) => {
  const m = new Map();
  for (const x of arr) { const k = x[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};

// Fraction ÉCOULÉE de l'année scolaire (sept → août). `year` = 'YYYY-YYYY'.
export function elapsedFraction(year, today = new Date()) {
  const startY = parseInt(String(year).slice(0, 4), 10);
  if (!startY) return 0;
  const start = new Date(startY, 8, 1);          // 1er septembre (début exercice)
  const end = new Date(startY + 1, 8, 1);        // 1er septembre suivant (fin, exclusif) → 12 mois pleins
  const t = today instanceof Date ? today : new Date(today);
  const f = (t - start) / (end - start);
  return Math.max(0, Math.min(1, f));
}

// Budget GLOBAL consolidé (tous budgets confondus) + ventilations.
export function globalBudget(budgets = [], chapters = [], expenses = []) {
  const chByBudget = groupBy(chapters, 'budget_id');
  const exByBudget = groupBy(expenses, 'budget_id');
  let recettes = 0, depensesPrevues = 0, engage = 0;
  const byBudget = [], sectorMap = {};
  for (const b of budgets) {
    const ch = chByBudget.get(b.id) || [];
    const ex = exByBudget.get(b.id) || [];
    const tot = computeBudgetTotals(ch);           // UN SEUL passage sur les chapitres
    const engageB = totalSpent(ex);                 // engagé du budget (statuts « committing »)
    const depassement = engageB > tot.depenses;
    recettes += tot.recettes; depensesPrevues += tot.depenses; engage += engageB;
    byBudget.push({
      id: b.id, label: b.label, sector: b.sector, status: b.status,
      recettes: tot.recettes, depensesPrevues: tot.depenses, engage: engageB,
      reste: tot.depenses - engageB, rate: tot.depenses > 0 ? Math.round((engageB / tot.depenses) * 100) : 0,
      depassement,
    });
    const secKey = b.sector || 'general';
    const s = sectorMap[secKey] || (sectorMap[secKey] = { sector: secKey, depensesPrevues: 0, engage: 0 });
    s.depensesPrevues += tot.depenses; s.engage += engageB;
  }
  const bySector = Object.values(sectorMap)
    .map((s) => ({ ...s, reste: s.depensesPrevues - s.engage, rate: s.depensesPrevues > 0 ? Math.round((s.engage / s.depensesPrevues) * 100) : 0 }))
    .sort((a, b) => b.depensesPrevues - a.depensesPrevues);
  return {
    recettes, depensesPrevues, engage,
    reste: depensesPrevues - engage,
    solde: recettes - depensesPrevues,
    executionRate: depensesPrevues > 0 ? Math.round((engage / depensesPrevues) * 100) : 0,
    overBudget: byBudget.filter((b) => b.depassement).length,
    byBudget: byBudget.sort((a, b) => b.depensesPrevues - a.depensesPrevues),
    bySector,
  };
}

// PRÉVISION : projection de la dépense de fin d'année selon le rythme (burn rate).
// À `f` (fraction écoulée), on projette linéairement engage/f sur l'année entière.
export function forecast(global, f) {
  // Projection linéaire (run-rate) : engagé rapporté à l'année entière. On
  // PLANCHE la fraction à ~1 mois (1/12) : extrapoler une année sur moins d'un
  // mois de données produirait un chiffre absurde (règle de gestion budgétaire).
  const frac = Math.min(1, Math.max(f, 1 / 12));
  const elapsed = Math.round(Math.max(0, Math.min(1, f)) * 100);
  const projectedSpend = Math.round(global.engage / frac);
  const projectedBalance = global.depensesPrevues - projectedSpend;
  const burnMonthly = Math.round(global.engage / (frac * 12));
  return {
    elapsed,
    projectedSpend,
    projectedBalance,
    burnMonthly,
    // Dépassement projeté (marge 5 %). Sans budget prévu, tout engagement = dépassement.
    overspendRisk: global.depensesPrevues > 0
      ? projectedSpend > global.depensesPrevues * 1.05
      : global.engage > 0,
    // « Dans les clous » si la consommation suit le temps écoulé (±10 pts).
    // Sans dépenses prévues, rien à dépasser -> considéré dans les clous.
    onTrack: global.depensesPrevues === 0 ? true : Math.abs(global.executionRate - elapsed) <= 10,
  };
}

// Prévision de recouvrement des frais (recettes réelles).
export function feeForecast(fees = [], f) {
  const expected = fees.reduce((s, x) => s + (Number(x.frais_annuels) || 0), 0);
  const collected = fees.reduce((s, x) => s + (Number(x.frais_payes) || 0), 0);
  const frac = Math.min(1, Math.max(f, 1 / 12)); // même plancher d'1 mois que forecast
  const projectedCollection = Math.min(expected, Math.round(collected / frac));
  return {
    expected, collected, rate: expected > 0 ? Math.round((collected / expected) * 100) : 0,
    projectedCollection, projectedShortfall: Math.max(0, expected - projectedCollection),
  };
}

// Top postes de dépense (par chapitre de dépense : prévu vs engagé + variance).
export function topExpenseChapters(chapters = [], expenses = [], n = 8) {
  const { amountOf, childrenByParent } = chapterRollup(chapters);
  const spent = spentByChapter(expenses);
  const rows = chapters
    .filter((c) => c.kind === 'depense' && !(childrenByParent.get(c.id)?.length)) // feuilles
    .map((c) => {
      const planned = amountOf(c);
      const engage = spent.get(c.id) || 0;
      return { id: c.id, label: c.label, planned, engage, variance: planned - engage, rate: planned > 0 ? Math.round((engage / planned) * 100) : 0 };
    })
    .sort((a, b) => b.engage - a.engage);
  return rows.slice(0, n);
}
