// Tests unitaires du MOTEUR PUR v3 (E2) — src/lib/budgetLinesEngine.js.
// Aucune I/O : fixtures en mémoire. Couvre : montants dérivés, contrôles 100 %,
// anomalies de configuration, activation, statut annuel dérivé, cycle de vie,
// consommation (engagé/payé/disponible + exclusion), agrégats période/secteur/annuel,
// prédicats d'imputation (secteur autorisé / global / interdit / période / brouillon),
// et chaîne de dépassement (4 niveaux bloquants + blocage d'imputation).
//
// Usage : node scripts/test-budget-lines-engine.mjs   (exit ≠ 0 si un test casse)

import {
  isLine, indexAllocations, linePeriodAmount, lineSectorAmount, cellAmount,
  periodPctTotal, sectorPctTotal, lineSectorIds, lineAllocationErrors, canActivateLine,
  isLineDraft, isLineActive, isLineClosed, lineEngageable, annualStatus,
  annualCommittedAmount, annualActivationRoom, canActivateLineAnnual, activationErrors,
  lineConsumption, linePeriodConsumption, lineSectorConsumption,
  periodTotals, sectorTotals, annualConsumption,
  expenseImputationErrors, canImputeExpense, chainAvailability, checkExpense, computeBudget,
  resolvePeriodForDate,
} from '../src/lib/budgetLinesEngine.js';

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log(`  ✅ ${m}`); };
const bad = (m) => { fail++; console.log(`  ❌ ${m}`); };
const eq  = (label, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? ok(`${label} = ${JSON.stringify(want)}`) : bad(`${label} : obtenu ${JSON.stringify(got)}, attendu ${JSON.stringify(want)}`));
const truthy = (label, v) => (v ? ok(label) : bad(`${label} — attendu vrai`));
const falsy  = (label, v) => (!v ? ok(label) : bad(`${label} — attendu faux`));

// ── Fixtures ─────────────────────────────────────────────────────────────────
const annual = { id: 'AN', label: 'Annuel', envelope_amount: 20000000, status: 'draft' };
const R = { id: 'R', budget_id: 'AN', parent_id: null, label: 'FONCTIONNEMENT', scope: null, position: 0 };
const Lc = { id: 'Lc', budget_id: 'AN', parent_id: 'R', label: 'Carburant',   planned_amount: 6000000, scope: 'complex', status: 'draft', position: 0 };
const Lf = { id: 'Lf', budget_id: 'AN', parent_id: 'R', label: 'Fournitures', planned_amount: 3000000, scope: 'sectors', status: 'draft', position: 1 };
const periods = [{ id: 'p1', name: 'T1', position: 1 }, { id: 'p2', name: 'T2', position: 2 }, { id: 'p3', name: 'T3', position: 3 }];
const uMat = 'uMat', uPrim = 'uPrim', uSec = 'uSec';

const per = (line, period, pct) => ({ id: `${line}-${period}`, budget_chapter_id: line, budget_period_id: period, pct });
const sec = (line, unit, pct) => ({ id: `${line}-${unit}`, budget_chapter_id: line, school_unit_id: unit, pct });
// Répartitions complètes.
const periodAllocs = [per('Lc', 'p1', 40), per('Lc', 'p2', 30), per('Lc', 'p3', 30), per('Lf', 'p1', 50), per('Lf', 'p2', 30), per('Lf', 'p3', 20)];
const sectorAllocs = [sec('Lf', uMat, 20), sec('Lf', uPrim, 35), sec('Lf', uSec, 45)];
const idx = indexAllocations(periodAllocs, sectorAllocs);

console.log('\n▶ IDENTIFICATION & MONTANTS DÉRIVÉS');
truthy('Lc est une ligne', isLine(Lc));
falsy ('R (rubrique) n’est pas une ligne', isLine(R));
eq('linePeriodAmount(Carburant, T1 40%)', linePeriodAmount(Lc, per('Lc', 'p1', 40)), 2400000);
eq('lineSectorAmount(Fournitures, Primaire 35%)', lineSectorAmount(Lf, sec('Lf', uPrim, 35)), 1050000);
eq('cellAmount(Fournitures, T1 50% × Primaire 35%)', cellAmount(Lf, 50, 35), 525000);

console.log('\n▶ CONTRÔLES DES 100 %');
eq('Σ % périodes Carburant', periodPctTotal('Lc', idx), 100);
eq('Σ % secteurs Fournitures', sectorPctTotal('Lf', idx), 100);
eq('secteurs autorisés Fournitures', [...lineSectorIds('Lf', idx)].sort(), [uMat, uPrim, uSec].sort());
eq('secteurs autorisés Carburant (complexe)', [...lineSectorIds('Lc', idx)], []);

console.log('\n▶ ANOMALIES DE CONFIGURATION');
eq('Carburant complet → aucune anomalie', lineAllocationErrors(Lc, idx), []);
eq('Fournitures complet → aucune anomalie', lineAllocationErrors(Lf, idx), []);
truthy('canActivateLine(Carburant)', canActivateLine(Lc, idx));
{
  // Σ secteurs = 55 (incomplet).
  const idxBad = indexAllocations(periodAllocs, [sec('Lf', uMat, 20), sec('Lf', uPrim, 35)]);
  truthy('Σ secteurs 55% → erreur sector_pct_not_100', lineAllocationErrors(Lf, idxBad).includes('sector_pct_not_100'));
  falsy ('… donc non activable', canActivateLine(Lf, idxBad));
}
{
  // Allocation sectorielle sur une ligne complexe.
  const idxBad = indexAllocations(periodAllocs, [...sectorAllocs, sec('Lc', uMat, 100)]);
  truthy('secteur sur ligne complexe → sector_alloc_on_complex', lineAllocationErrors(Lc, idxBad).includes('sector_alloc_on_complex'));
}
{
  const noAmount = { ...Lc, planned_amount: 0 };
  truthy('montant annuel = 0 → amount_missing', lineAllocationErrors(noAmount, idx).includes('amount_missing'));
  const idxNeg = indexAllocations([per('Lc', 'p1', -10), per('Lc', 'p2', 110)], []);
  truthy('% négatif → period_pct_negative', lineAllocationErrors(Lc, idxNeg).includes('period_pct_negative'));
  const idx70 = indexAllocations([per('Lc', 'p1', 40), per('Lc', 'p2', 30)], []);
  truthy('Σ périodes 70% → period_pct_not_100', lineAllocationErrors(Lc, idx70).includes('period_pct_not_100'));
}

console.log('\n▶ CYCLE DE VIE & STATUT ANNUEL DÉRIVÉ');
truthy('ligne brouillon', isLineDraft(Lc));
falsy ('ligne brouillon non engageable', lineEngageable(Lc));
truthy('ligne active engageable', lineEngageable({ ...Lc, status: 'active' }));
truthy('isLineClosed', isLineClosed({ ...Lc, status: 'closed' }));
eq('annuel : aucune ligne active → draft', annualStatus(annual, [R, Lc, Lf]), 'draft');
eq('annuel : une seule active → partial', annualStatus(annual, [R, { ...Lc, status: 'active' }, Lf]), 'partial');
eq('annuel : toutes actives → active', annualStatus(annual, [R, { ...Lc, status: 'active' }, { ...Lf, status: 'active' }]), 'active');
eq('annuel : active + clôturée (closed = finalisée) → active', annualStatus(annual, [R, { ...Lc, status: 'active' }, { ...Lf, status: 'closed' }]), 'active');
eq('annuel : brouillon + clôturée → partial', annualStatus(annual, [R, Lc, { ...Lf, status: 'closed' }]), 'partial');
eq('annuel clôturé → closed', annualStatus({ ...annual, status: 'closed' }, [R, { ...Lc, status: 'active' }]), 'closed');

console.log('\n▶ PLAFOND ANNUEL FERME À L’ACTIVATION');
{
  // Annuel 100M ; lignes déjà finalisées = 95M ; nouvelle ligne 10M → refus.
  const an = { id: 'AN', envelope_amount: 100000000, status: 'draft' };
  const l1 = { id: 'l1', budget_id: 'AN', scope: 'complex', status: 'active', planned_amount: 95000000 };
  const lNew = { id: 'lNew', budget_id: 'AN', scope: 'complex', status: 'draft', planned_amount: 10000000 };
  const chapters = [l1, lNew];
  eq('Σ lignes finalisées', annualCommittedAmount(chapters), 95000000);
  eq('marge activable (hors lNew)', annualActivationRoom(an, chapters, { excludeLineId: 'lNew' }), 5000000);
  falsy('activer lNew (10M > 5M restants) refusée', canActivateLineAnnual(lNew, an, chapters));
  truthy('une ligne 5M passerait', canActivateLineAnnual({ ...lNew, planned_amount: 5000000 }, an, chapters));
  const idxOk = indexAllocations([per('lNew', 'p1', 100)], []);
  truthy('activationErrors inclut annual_cap_exceeded', activationErrors(lNew, an, chapters, idxOk).includes('annual_cap_exceeded'));
}

console.log('\n▶ CONSOMMATION (engagé / payé / disponible)');
{
  const expenses = [
    { id: 'e1', budget_chapter_id: 'Lc', budget_period_id: 'p1', school_unit_id: null, amount: 1000000, status: 'approved' }, // engagé
    { id: 'e2', budget_chapter_id: 'Lc', budget_period_id: 'p1', school_unit_id: null, amount: 500000, status: 'paid' },      // engagé + payé
    { id: 'e3', budget_chapter_id: 'Lc', budget_period_id: 'p2', school_unit_id: null, amount: 999999, status: 'draft' },     // NON engagé
  ];
  const c = lineConsumption(Lc, { expenses });
  eq('ligne Carburant : plafond', c.ceiling, 6000000);
  eq('ligne Carburant : engagé (approved+paid, draft exclu)', c.committed, 1500000);
  eq('ligne Carburant : payé', c.paid, 500000);
  eq('ligne Carburant : disponible', c.available, 4500000);
  eq('cellule Carburant×T1 : disponible (2.4M − 1.5M)', linePeriodConsumption(Lc, 'p1', idx, { expenses }).available, 900000);
  eq('annuel : engagé (toutes dépenses)', annualConsumption(annual, { expenses }).committed, 1500000);
  eq('exclusion d’une dépense en édition (e1) → engagé 500k', lineConsumption(Lc, { expenses, excludeExpenseId: 'e1' }).committed, 500000);
}
{
  // Agrégats période/secteur sur dépenses sectorielles de Fournitures.
  const expenses = [
    { id: 'f1', budget_chapter_id: 'Lf', budget_period_id: 'p1', school_unit_id: uPrim, amount: 200000, status: 'approved' },
    { id: 'f2', budget_chapter_id: 'Lf', budget_period_id: 'p1', school_unit_id: uMat, amount: 100000, status: 'submitted' },
  ];
  eq('période T1 (Σ lignes) : plafond', periodTotals([Lc, Lf], 'p1', idx, { expenses }).ceiling, 2400000 + 1500000);
  eq('période T1 : engagé (toutes lignes/secteurs)', periodTotals([Lc, Lf], 'p1', idx, { expenses }).committed, 300000);
  eq('secteur Primaire : plafond (Σ lignes sectorielles)', sectorTotals([Lc, Lf], uPrim, idx, { expenses }).ceiling, 1050000);
  eq('secteur Primaire : engagé', sectorTotals([Lc, Lf], uPrim, idx, { expenses }).committed, 200000);
  eq('cellule Fournitures×Primaire : disponible (1.05M − 200k)', lineSectorConsumption(Lf, uPrim, idx, { expenses }).available, 850000);
}

console.log('\n▶ IMPUTATION (cohérence secteur / période / ligne)');
{
  const LcA = { ...Lc, status: 'active' };
  const LfA = { ...Lf, status: 'active' };
  truthy('Carburant actif : imputation GLOBALE (T1) autorisée', canImputeExpense(LcA, { periodId: 'p1', sectorId: null }, idx));
  eq('Carburant : secteur précis interdit (ligne complexe)', expenseImputationErrors(LcA, { periodId: 'p1', sectorId: uMat }, idx), ['sector_not_allowed']);
  truthy('Fournitures actif : imputation Primaire autorisée', canImputeExpense(LfA, { periodId: 'p1', sectorId: uPrim }, idx));
  truthy('Fournitures : imputation globale autorisée', canImputeExpense(LfA, { periodId: 'p1', sectorId: null }, idx));
  // Ligne Prim+Sec uniquement → Maternelle interdite.
  const Lg = { ...Lf, id: 'Lg', scope: 'sectors', status: 'active' };
  const idxG = indexAllocations([per('Lg', 'p1', 100)], [sec('Lg', uPrim, 50), sec('Lg', uSec, 50)]);
  eq('ligne Primaire+Secondaire : Maternelle interdite', expenseImputationErrors(Lg, { periodId: 'p1', sectorId: uMat }, idxG), ['sector_not_allowed']);
  truthy('… Secondaire autorisé', canImputeExpense(Lg, { periodId: 'p1', sectorId: uSec }, idxG));
  eq('période non répartie → period_not_allocated', expenseImputationErrors(LcA, { periodId: 'pX', sectorId: null }, idx), ['period_not_allocated']);
  truthy('ligne brouillon → line_not_active', expenseImputationErrors(Lc, { periodId: 'p1', sectorId: null }, idx).includes('line_not_active'));
}

console.log('\n▶ CHAÎNE DE DÉPASSEMENT (maillon contraignant)');
{
  const LcA = { ...Lc, status: 'active' };
  // Aucune dépense : le maillon le plus serré est la cellule période T1 (2.4M).
  const empty = checkExpense({ amount: 2400000, line: LcA, periodId: 'p1', sectorId: null, annual, idx, expenses: [] });
  truthy('dépense = disponible période → autorisée', empty.ok);
  const over = checkExpense({ amount: 2400001, line: LcA, periodId: 'p1', sectorId: null, annual, idx, expenses: [] });
  falsy ('dépense = disponible période + 1 → refusée', over.ok);
  eq('… niveau bloquant = période', over.blockingLevel, 'period');
  eq('… dépassement de 1', over.overBy, 1);
}
{
  // Blocage LIGNE : période très large mais ligne petite.
  const line = { id: 'L', budget_id: 'AN', parent_id: 'R', label: 'X', planned_amount: 1000000, scope: 'complex', status: 'active' };
  const idxL = indexAllocations([per('L', 'p1', 100)], []); // période = 100% → cellule = 1M = ligne
  const r = checkExpense({ amount: 1000001, line, periodId: 'p1', sectorId: null, annual, idx: idxL, expenses: [] });
  falsy('au-delà de la ligne → refusée', r.ok);
  truthy('… niveau bloquant ligne ou période', ['line', 'period'].includes(r.blockingLevel));
}
{
  // Blocage SECTEUR : cellule secteur plus serrée que période.
  const line = { id: 'L', budget_id: 'AN', parent_id: 'R', label: 'X', planned_amount: 3000000, scope: 'sectors', status: 'active' };
  const idxS = indexAllocations([per('L', 'p1', 100)], [sec('L', uPrim, 10), sec('L', uMat, 90)]); // Primaire = 300k
  const r = checkExpense({ amount: 300001, line, periodId: 'p1', sectorId: uPrim, annual, idx: idxS, expenses: [] });
  falsy('au-delà de l’allocation sectorielle Primaire → refusée', r.ok);
  eq('… niveau bloquant = secteur', r.blockingLevel, 'sector');
}
{
  // Blocage ANNUEL : ligne/période OK mais enveloppe annuelle presque épuisée.
  const smallAnnual = { id: 'AN2', envelope_amount: 1000000, status: 'draft' };
  const line = { id: 'L', budget_id: 'AN2', parent_id: 'R', label: 'X', planned_amount: 6000000, scope: 'complex', status: 'active' };
  const idxA = indexAllocations([per('L', 'p1', 100)], []);
  const expenses = [{ id: 'x', budget_chapter_id: 'L', budget_period_id: 'p1', school_unit_id: null, amount: 900000, status: 'approved' }];
  const r = checkExpense({ amount: 500000, line, periodId: 'p1', sectorId: null, annual: smallAnnual, idx: idxA, expenses });
  falsy('au-delà de l’annuel → refusée', r.ok);
  eq('… niveau bloquant = annuel', r.blockingLevel, 'annual');
  eq('… disponible annuel = 100k', r.available, 100000);
}
{
  // Blocage IMPUTATION : secteur interdit → refus avant même le montant.
  const LcA = { ...Lc, status: 'active' };
  const r = checkExpense({ amount: 1, line: LcA, periodId: 'p1', sectorId: uMat, annual, idx, expenses: [] });
  falsy('imputation incohérente → refusée', r.ok);
  eq('… niveau bloquant = imputation', r.blockingLevel, 'imputation');
}

console.log('\n▶ ARBRE ANNOTÉ (computeBudget)');
{
  const expenses = [{ id: 'e1', budget_chapter_id: 'Lc', budget_period_id: 'p1', school_unit_id: null, amount: 1000000, status: 'approved' }];
  const model = computeBudget({ ...annual, status: 'draft' }, [R, { ...Lc, status: 'active' }, Lf], { periodAllocs, sectorAllocs, periods, expenses });
  eq('statut annuel dérivé', model.annual.status, 'partial');
  eq('annuel : engagé', model.annual.consumption.committed, 1000000);
  const rub = model.tree.find((n) => n.id === 'R');
  eq('rubrique agrège le plafond de ses lignes (6M + 3M)', rub.consumption.ceiling, 9000000);
  const lc = rub.children.find((n) => n.id === 'Lc');
  eq('ligne Carburant : engagé', lc.consumption.committed, 1000000);
  eq('période T1 dans le modèle : plafond', model.periods.find((p) => p.id === 'p1').ceiling, 2400000 + 1500000);
}

console.log('\n▶ PÉRIODE DÉRIVÉE DE LA DATE (jamais choisie manuellement)');
{
  const ps = [
    { id: 'p1', name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20' },
    { id: 'p2', name: 'T2', start_date: '2027-01-05', end_date: '2027-03-31' },
  ];
  eq('date au cœur de T1 → T1', resolvePeriodForDate(ps, '2026-10-15').period?.id, 'p1');
  eq('date au cœur de T2 → T2', resolvePeriodForDate(ps, '2027-02-10').period?.id, 'p2');
  eq('borne de début incluse', resolvePeriodForDate(ps, '2026-09-01').period?.id, 'p1');
  eq('borne de fin incluse', resolvePeriodForDate(ps, '2026-12-20').period?.id, 'p1');
  eq('date dans un trou → no_period', resolvePeriodForDate(ps, '2026-12-25').error, 'no_period');
  eq('aucune date → no_date', resolvePeriodForDate(ps, '').error, 'no_date');
  const overlap = [{ id: 'a', start_date: '2026-01-01', end_date: '2026-12-31' }, { id: 'b', start_date: '2026-06-01', end_date: '2026-08-31' }];
  eq('deux périodes couvrent la date → overlap', resolvePeriodForDate(overlap, '2026-07-01').error, 'overlap');
}

console.log(`\n═══ RÉSULTAT E2 : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
