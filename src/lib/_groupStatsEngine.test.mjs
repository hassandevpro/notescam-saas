// Tests du moteur de stats consolidées. node src/lib/_groupStatsEngine.test.mjs
// (E6) budgetStats / expenseStats consomment le modèle V3 (annuel → lignes →
// allocations période/secteur → dépenses). Plus AUCUNE dépendance à budgets.sector
// ni aux nœuds tier=period/sector legacy. Inclut un test ANTI-DOUBLE-COMPTAGE.
import {
  financeStats, budgetStats, expenseStats, hrStats, academicStats, disciplineStats,
  buildAlerts, consolidate,
} from './groupStatsEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const annual = (env) => ({ id: 'AN', tier: 'annual', envelope_amount: env, academic_year: '2026-2027' });
const line = (id, scope, amount) => ({ id, budget_id: 'AN', parent_id: 'R', label: id, kind: 'depense', scope, status: 'active', planned_amount: amount });
const pa = (line, period, pct) => ({ budget_chapter_id: line, budget_period_id: period, pct });
const sa = (line, unit, pct) => ({ budget_chapter_id: line, school_unit_id: unit, pct });

// --- Finances ----------------------------------------------------------------
{
  const f = financeStats([{ frais_annuels: 100000, frais_payes: 60000 }, { frais_annuels: 100000, frais_payes: 40000 }]);
  ok(f.expected === 200000 && f.collected === 100000 && f.outstanding === 100000 && f.rate === 50, 'finances : attendu/encaissé/reste/taux');
}

// --- Budgets (V3 : ventilation par UNITÉ via allocations sectorielles) --------
{
  const units = [{ id: 'uP', name: 'Primaire' }, { id: 'uM', name: 'Maternelle' }];
  const budgets = [annual(1000000)];
  const chapters = [
    { id: 'R', budget_id: 'AN', scope: null, kind: 'depense', label: 'Fonctionnement' },
    { id: 'REC', budget_id: 'AN', scope: null, kind: 'recette', planned_amount: 700000 },
    line('Lp', 'sectors', 500000), line('Lm', 'sectors', 200000), line('Lc', 'complex', 100000),
  ];
  const lineSectors = [sa('Lp', 'uP', 100), sa('Lm', 'uM', 100)];
  const s = budgetStats({ budgets, chapters, lineSectors, units });
  ok(s.depensesPrevues === 1000000, 'budgets : prévu = enveloppe annuelle');
  ok(s.recettes === 700000, 'budgets : recettes = chapitres recette');
  ok(s.count === 3, 'budgets : count = nombre de LIGNES (rubrique/recette exclues)');
  ok(s.bySector[0].label === 'Primaire' && s.bySector[0].planned === 500000, 'ventilation secteur (unité) triée, via allocations V3');
  ok(!!s.bySector.find((x) => x.sector === '__global__' && x.planned === 100000), 'poste « Complexe / Global » = lignes sans secteur');
}

// --- ANTI DOUBLE COMPTAGE : une ligne multi-secteurs -------------------------
{
  const units = [{ id: 'uP', name: 'Primaire' }, { id: 'uM', name: 'Maternelle' }, { id: 'uS', name: 'Secondaire' }];
  const budgets = [annual(1000000)];
  const chapters = [line('Lmulti', 'sectors', 300000)];
  const lineSectors = [sa('Lmulti', 'uP', 40), sa('Lmulti', 'uM', 60)]; // uS non concerné
  const s = budgetStats({ budgets, chapters, lineSectors, units });
  const sumSectors = s.bySector.reduce((acc, x) => acc + x.planned, 0);
  ok(s.bySector.find((x) => x.sector === 'uP').planned === 120000, 'part Primaire = 40% × 300k');
  ok(s.bySector.find((x) => x.sector === 'uM').planned === 180000, 'part Maternelle = 60% × 300k');
  ok(!s.bySector.find((x) => x.sector === 'uS'), 'secteur non concerné absent (pas de 0)');
  ok(sumSectors === 300000, 'ANTI-DOUBLE-COMPTAGE : Σ des parts = montant de la ligne (jamais dupliqué)');
}

// --- Dépenses (exécution consolidée + dépassement LIGNE) ----------------------
{
  const budgets = [annual(1000000)];
  const chapters = [line('Lp', 'complex', 500000)];
  const linePeriods = [pa('Lp', 'p1', 100)];
  const expenses = [{ budget_chapter_id: 'Lp', budget_period_id: 'p1', amount: 600000, status: 'paid' }];
  const e = expenseStats({ budgets, chapters, linePeriods, expenses });
  ok(e.engage === 600000 && e.overBudget === 1, 'dépenses : engagé (annuel) + dépassement LIGNE détecté');
  ok(e.paid === 600000, 'payé (décaissé) consolidé');
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
    budgets: [annual(1000)],
    chapters: [line('L1', 'complex', 100)],
    linePeriods: [pa('L1', 'p1', 100)],
    expenses: [{ budget_chapter_id: 'L1', budget_period_id: 'p1', amount: 200, status: 'paid' }], // dépassement ligne
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
  const c = consolidate({ fees: [{ frais_annuels: 100, frais_payes: 100 }], budgets: [], chapters: [], expenses: [], staff: [{}], students: [{}], classes: [{}], units: [], reports: [] });
  ok(c.finance.rate === 100 && c.hr.staffCount === 1 && c.academic.students === 1 && Array.isArray(c.alerts), 'consolidate() renvoie tous les domaines');
}

console.log(failed ? '\n❌ Group stats KO' : '\n✅ Group stats OK');
process.exit(failed ? 1 : 0);
