// Moteur PUR des statistiques CONSOLIDÉES du groupe scolaire (tableau de bord
// Coordonnateur Général / Fondatrice). Aucune I/O — RÉUTILISE les moteurs des
// modules (budget V3, dépenses, RH, reports) au lieu de recalculer. Testable Node.
//
// Modèle budgétaire = CIBLE V3 EXCLUSIVEMENT : budget annuel → lignes → allocations
// par période / par secteur → dépenses. Plus AUCUNE dépendance aux anciens champs
// `budgets.sector`/`period_type` ni aux nœuds tier=period/sector legacy.
import {
  indexAllocations, isLine, lines as linesOf, annualConsumption, lineConsumption,
  sectorTotals,
} from './budgetLinesEngine.js';
import { isContractActive, attendanceSummary } from './hrEngine.js';
import { severityRank } from './reportEngine.js';

const OPEN_REPORT = ['new', 'triaged', 'assigned', 'in_progress'];
const GLOBAL_KEY = '__global__';

// ── Finances (scolarité encaissée) ────────────────────────────────────────────
export function financeStats(fees = []) {
  const expected = fees.reduce((s, f) => s + (Number(f.frais_annuels) || 0), 0);
  const collected = fees.reduce((s, f) => s + (Number(f.frais_payes) || 0), 0);
  return { expected, collected, outstanding: expected - collected, rate: expected > 0 ? Math.round((collected / expected) * 100) : 0 };
}

// ── Budgets (prévisionnel consolidé) — modèle V3 ──────────────────────────────
// `depensesPrevues` = enveloppe ANNUELLE ; `bySector` = ventilation par UNITÉ via
// les ALLOCATIONS sectorielles des lignes (+ un poste « Complexe / Global » pour les
// lignes sans secteur). Anti double comptage : une ligne multi-secteurs contribue à
// chaque secteur SA PART (%) — Σ des parts = montant de la ligne, jamais dupliqué.
export function budgetStats({ budgets = [], chapters = [], linePeriods = [], lineSectors = [], units = [] } = {}) {
  const annual = budgets.find((b) => b.tier === 'annual') || null;
  const annualChapters = annual ? chapters.filter((c) => c.budget_id === annual.id) : chapters;
  const lines = linesOf(annualChapters);
  const idx = indexAllocations(linePeriods, lineSectors);
  const recettes = annualChapters.reduce((s, c) => s + (c.kind === 'recette' ? Number(c.planned_amount) || 0 : 0), 0);
  const depensesPrevues = annual ? Number(annual.envelope_amount) || 0 : 0;

  const unitName = new Map((units || []).map((u) => [u.id, u.name || u.section_key || '—']));
  const map = new Map();
  for (const u of units) {
    const planned = sectorTotals(lines, u.id, idx).ceiling;
    if (planned > 0) map.set(u.id, { sector: u.id, label: unitName.get(u.id) || '—', planned });
  }
  // Lignes « tout le complexe » (sans allocation sectorielle) → poste global.
  const globalPlanned = lines.filter((l) => l.scope === 'complex').reduce((s, l) => s + (Number(l.planned_amount) || 0), 0);
  if (globalPlanned > 0) map.set(GLOBAL_KEY, { sector: GLOBAL_KEY, label: 'Complexe / Global', planned: globalPlanned });

  return {
    count: lines.length, recettes, depensesPrevues,
    bySector: [...map.values()].sort((a, b) => b.planned - a.planned),
  };
}

// ── Dépenses (exécution consolidée) — via le nœud ANNUEL V3 ───────────────────
export function expenseStats({ budgets = [], chapters = [], linePeriods = [], lineSectors = [], expenses = [] } = {}) {
  const annual = budgets.find((b) => b.tier === 'annual') || null;
  const annualChapters = annual ? chapters.filter((c) => c.budget_id === annual.id) : chapters;
  const lines = linesOf(annualChapters);
  const a = annual ? annualConsumption(annual, { expenses }) : { ceiling: 0, committed: 0, paid: 0, available: 0, taux: 0 };
  // Dépassement au niveau LIGNE (jamais recompté depuis des nœuds legacy).
  const overBudget = lines.filter((l) => lineConsumption(l, { expenses }).depassement).length;
  return { plannedDepenses: a.ceiling, engage: a.committed, paid: a.paid, reste: a.available, rate: a.taux, overBudget };
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
export function buildAlerts(data = {}) {
  const alerts = [];
  const exp = expenseStats(data);
  if (exp.overBudget > 0) alerts.push({ key: 'budget_over', severity: 'critical', count: exp.overBudget, label: 'Budgets en dépassement', link: '/app/depenses' });

  const pendingUnlocks = (data.unlockRequests || []).filter((r) => r.status === 'pending').length;
  if (pendingUnlocks > 0) alerts.push({ key: 'unlock_pending', severity: 'high', count: pendingUnlocks, label: 'Déblocages en attente', link: '/app/depenses' });

  const pendingLeaves = (data.leaves || []).filter((l) => l.status === 'pending').length;
  if (pendingLeaves > 0) alerts.push({ key: 'leave_pending', severity: 'normal', count: pendingLeaves, label: 'Congés en attente', link: '/app/rh' });

  const critical = (data.reports || []).filter((r) => OPEN_REPORT.includes(r.status) && r.priority === 'critical').length;
  if (critical > 0) alerts.push({ key: 'report_critical', severity: 'critical', count: critical, label: 'Signalements critiques ouverts', link: '/app/signalements' });

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

// ── Synthèse complète (une passe) ─────────────────────────────────────────────
export function consolidate(data = {}) {
  return {
    finance: financeStats(data.fees),
    budget: budgetStats(data),
    expense: expenseStats(data),
    hr: hrStats(data.staff, data.contracts, data.leaves, data.attendance),
    academic: academicStats(data.students, data.classes, data.units),
    discipline: disciplineStats(data.reports),
    alerts: buildAlerts(data),
  };
}
