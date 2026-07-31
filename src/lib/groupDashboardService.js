// Agrège les données nécessaires au tableau de bord du GROUPE SCOLAIRE.
// N'introduit AUCUNE table : réutilise les services des modules existants.
// Les données déjà chargées dans schoolStore (élèves, classes, personnel, frais)
// sont passées par la page ; ici on tire le reste (finance/RH/reports).
import { fetchBudgets, fetchBudgetChapters } from './budgetService.js';
import { fetchBudgetPeriods } from './budgetPeriodService.js';
import { fetchLinePeriods, fetchLineSectors } from './budgetLineService.js';
import { fetchExpenses } from './expenseService.js';
import { fetchUnlockRequests } from './unlockService.js';
import { HR_ENTITIES } from './hrService.js';
import { fetchReports } from './reportService.js';

export async function fetchGroupData(schoolId, { yearLabel } = {}) {
  if (!schoolId) return {};
  const [budgets, chapters, linePeriods, lineSectors, periods, expenses, unlockRequests, contracts, leaves, attendance, reports] = await Promise.all([
    fetchBudgets(schoolId, { yearLabel }),
    fetchBudgetChapters(schoolId, {}),
    fetchLinePeriods(schoolId),
    fetchLineSectors(schoolId),
    fetchBudgetPeriods(schoolId, { yearLabel }),
    fetchExpenses(schoolId, {}),
    fetchUnlockRequests(schoolId, {}),
    HR_ENTITIES.contracts.fetch(schoolId),
    HR_ENTITIES.leaves.fetch(schoolId),
    HR_ENTITIES.attendance.fetch(schoolId),
    fetchReports(schoolId),
  ]);
  return {
    budgets: budgets || [], chapters: chapters || [],
    // Modèle V3 : allocations par ligne + périodes budgétaires dédiées.
    linePeriods: linePeriods || [], lineSectors: lineSectors || [], periods: periods || [],
    expenses: expenses || [], unlockRequests: unlockRequests || [], contracts: contracts || [],
    leaves: leaves || [], attendance: attendance || [], reports: reports || [],
  };
}
