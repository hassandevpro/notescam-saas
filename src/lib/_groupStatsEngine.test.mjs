// Tests du moteur de stats consolidées.  node src/lib/_groupStatsEngine.test.mjs
import {
  financeStats, budgetStats, expenseStats, hrStats, academicStats, disciplineStats,
  buildAlerts, consolidate,
} from './groupStatsEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Finances ----------------------------------------------------------------
{
  const f = financeStats([{ frais_annuels: 100000, frais_payes: 60000 }, { frais_annuels: 100000, frais_payes: 40000 }]);
  ok(f.expected === 200000 && f.collected === 100000 && f.outstanding === 100000 && f.rate === 50, 'finances : attendu/encaissé/reste/taux');
}

// --- Budgets par secteur -----------------------------------------------------
{
  const budgets = [{ id: 'b1', sector: 'primaire' }, { id: 'b2', sector: 'maternelle' }];
  const chapters = [
    { budget_id: 'b1', kind: 'depense', planned_amount: 500000 },
    { budget_id: 'b1', kind: 'recette', planned_amount: 700000 },
    { budget_id: 'b2', kind: 'depense', planned_amount: 200000 },
  ];
  const s = budgetStats(budgets, chapters);
  ok(s.depensesPrevues === 700000 && s.recettes === 700000, 'budgets : dépenses/recettes consolidées');
  ok(s.bySector[0].sector === 'primaire' && s.bySector[0].planned === 500000, 'budgets : ventilation par secteur triée');
}

// --- Dépenses (dépassement) --------------------------------------------------
{
  const budgets = [{ id: 'b1', sector: 'primaire' }];
  const chapters = [{ id: 'c1', budget_id: 'b1', kind: 'depense', planned_amount: 500000 }];
  const expenses = [{ budget_id: 'b1', budget_chapter_id: 'c1', amount: 600000, status: 'paid' }];
  const e = expenseStats(budgets, chapters, expenses);
  ok(e.engage === 600000 && e.overBudget === 1, 'dépenses : engagé + dépassement détecté');
}

// --- RH ----------------------------------------------------------------------
{
  const h = hrStats(
    [{ id: 's1' }, { id: 's2' }],
    [{ status: 'active', start_date: '2025-09-01', end_date: null }, { status: 'ended', start_date: '2023-01-01', end_date: '2024-01-01' }],
    [{ status: 'pending' }, { status: 'approved' }],
    [{ status: 'present' }, { status: 'absent' }],
  );
  ok(h.staffCount === 2 && h.activeContracts === 1 && h.pendingLeaves === 1 && h.presenceRate === 50, 'RH : effectif/contrats/congés/présence');
}

// --- Académique + discipline -------------------------------------------------
ok(academicStats([{}, {}, {}], [{}, {}], [{}]).students === 3, 'académique : effectif élèves');
{
  const d = disciplineStats([{ status: 'assigned', domain: 'vie_scolaire' }, { status: 'closed', domain: 'vie_scolaire' }, { status: 'new', domain: 'maintenance' }]);
  ok(d.open === 2 && d.vieScolaire === 1, 'discipline : ouverts + vie scolaire');
}

// --- Alertes consolidées (priorisées) ---------------------------------------
{
  const alerts = buildAlerts({
    budgets: [{ id: 'b1', sector: 'x' }],
    chapters: [{ id: 'c1', budget_id: 'b1', kind: 'depense', planned_amount: 100 }],
    expenses: [{ budget_id: 'b1', budget_chapter_id: 'c1', amount: 200, status: 'paid' }], // dépassement
    unlockRequests: [{ status: 'pending' }],
    leaves: [{ status: 'pending' }],
    reports: [{ status: 'new', priority: 'critical' }],
  });
  ok(alerts.length === 4, '4 alertes agrégées');
  ok(alerts[0].severity === 'critical', 'alertes triées par gravité (critique en tête)');
  ok(alerts.find((a) => a.key === 'unlock_pending')?.count === 1, 'compte des déblocages en attente');
}

// --- Synthèse complète -------------------------------------------------------
{
  const c = consolidate({ fees: [{ frais_annuels: 100, frais_payes: 100 }], budgets: [], chapters: [], expenses: [], staff: [{}], contracts: [], leaves: [], attendance: [], students: [{}], classes: [{}], units: [], reports: [] });
  ok(c.finance.rate === 100 && c.hr.staffCount === 1 && c.academic.students === 1 && Array.isArray(c.alerts), 'consolidate() renvoie tous les domaines');
}

console.log(failed ? '\n❌ Group stats KO' : '\n✅ Group stats OK');
process.exit(failed ? 1 : 0);
