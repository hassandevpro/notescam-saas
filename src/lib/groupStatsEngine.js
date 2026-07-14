// Moteur PUR des statistiques CONSOLIDÉES du groupe scolaire (tableau de bord
// Coordonnateur Général / Fondatrice). Aucune I/O — RÉUTILISE les moteurs des
// modules (budget, dépenses, RH, reports) au lieu de recalculer. Testable Node.
import { computeBudgetTotals } from './budgetEngine.js';
import { budgetConsumption } from './expenseEngine.js';
import { isContractActive, attendanceSummary } from './hrEngine.js';
import { severityRank } from './reportEngine.js';

const OPEN_REPORT = ['new', 'triaged', 'assigned', 'in_progress'];
function groupBy(arr, key) {
  const m = new Map();
  for (const x of arr) { const k = x[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

// ── Finances (scolarité encaissée) ────────────────────────────────────────────
export function financeStats(fees = []) {
  const expected = fees.reduce((s, f) => s + (Number(f.frais_annuels) || 0), 0);
  const collected = fees.reduce((s, f) => s + (Number(f.frais_payes) || 0), 0);
  return { expected, collected, outstanding: expected - collected, rate: expected > 0 ? Math.round((collected / expected) * 100) : 0 };
}

// ── Budgets (prévisionnel consolidé, par secteur) ─────────────────────────────
export function budgetStats(budgets = [], chapters = []) {
  const byBudget = groupBy(chapters, 'budget_id');
  let recettes = 0, depenses = 0;
  const sector = {};
  for (const b of budgets) {
    const tot = computeBudgetTotals(byBudget.get(b.id) || []);
    recettes += tot.recettes; depenses += tot.depenses;
    sector[b.sector] = (sector[b.sector] || 0) + tot.depenses;
  }
  return {
    count: budgets.length, recettes, depensesPrevues: depenses,
    bySector: Object.entries(sector).map(([s, v]) => ({ sector: s, planned: v })).sort((a, b) => b.planned - a.planned),
  };
}

// ── Dépenses (exécution consolidée) ───────────────────────────────────────────
export function expenseStats(budgets = [], chapters = [], expenses = []) {
  const byBudgetCh = groupBy(chapters, 'budget_id');
  const byBudgetEx = groupBy(expenses, 'budget_id');
  let planned = 0, engage = 0, overBudget = 0;
  for (const b of budgets) {
    const c = budgetConsumption(byBudgetCh.get(b.id) || [], byBudgetEx.get(b.id) || []);
    planned += c.depensesPrevues; engage += c.engage;
    if (c.depassement) overBudget += 1;
  }
  return { plannedDepenses: planned, engage, reste: planned - engage, rate: planned > 0 ? Math.round((engage / planned) * 100) : 0, overBudget };
}

// ── RH ────────────────────────────────────────────────────────────────────────
export function hrStats(staff = [], contracts = [], leaves = [], attendance = []) {
  return {
    staffCount: staff.length,
    activeContracts: contracts.filter((c) => isContractActive(c)).length,
    pendingLeaves: leaves.filter((l) => l.status === 'pending').length,
    presenceRate: attendanceSummary(attendance).presenceRate,
  };
}

// ── Académique ────────────────────────────────────────────────────────────────
export function academicStats(students = [], classes = [], units = []) {
  return { students: students.length, classes: classes.length, units: units.length };
}

// ── Discipline (via reports catégorie vie scolaire) ──────────────────────────
export function disciplineStats(reports = []) {
  const open = reports.filter((r) => OPEN_REPORT.includes(r.status));
  return { open: open.length, vieScolaire: open.filter((r) => r.domain === 'vie_scolaire').length };
}

// ── Alertes consolidées ───────────────────────────────────────────────────────
// Agrège les points d'attention transverses en une liste priorisée.
export function buildAlerts({ budgets = [], chapters = [], expenses = [], unlockRequests = [], leaves = [], reports = [] } = {}) {
  const alerts = [];
  const exp = expenseStats(budgets, chapters, expenses);
  if (exp.overBudget > 0) alerts.push({ key: 'budget_over', severity: 'critical', count: exp.overBudget, label: 'Budgets en dépassement', link: '/app/depenses' });

  const pendingUnlocks = unlockRequests.filter((r) => r.status === 'pending').length;
  if (pendingUnlocks > 0) alerts.push({ key: 'unlock_pending', severity: 'high', count: pendingUnlocks, label: 'Déblocages en attente', link: '/app/depenses' });

  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;
  if (pendingLeaves > 0) alerts.push({ key: 'leave_pending', severity: 'normal', count: pendingLeaves, label: 'Congés en attente', link: '/app/rh' });

  const critical = reports.filter((r) => OPEN_REPORT.includes(r.status) && r.priority === 'critical').length;
  if (critical > 0) alerts.push({ key: 'report_critical', severity: 'critical', count: critical, label: 'Signalements critiques ouverts', link: '/app/signalements' });

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

// ── Synthèse complète (une passe) ─────────────────────────────────────────────
export function consolidate(data = {}) {
  return {
    finance: financeStats(data.fees),
    budget: budgetStats(data.budgets, data.chapters),
    expense: expenseStats(data.budgets, data.chapters, data.expenses),
    hr: hrStats(data.staff, data.contracts, data.leaves, data.attendance),
    academic: academicStats(data.students, data.classes, data.units),
    discipline: disciplineStats(data.reports),
    alerts: buildAlerts(data),
  };
}
