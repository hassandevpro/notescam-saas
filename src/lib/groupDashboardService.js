// Agrège les données nécessaires au tableau de bord du GROUPE SCOLAIRE.
// N'introduit AUCUNE table : réutilise les services des modules existants.
// Les données déjà chargées dans schoolStore (élèves, classes, personnel, frais)
// sont passées par la page ; ici on tire le reste (finance/RH/reports).
import { fetchBudgets, fetchBudgetChapters } from './budgetService.js';
import { fetchExpenses } from './expenseService.js';
import { fetchUnlockRequests } from './unlockService.js';
import { HR_ENTITIES } from './hrService.js';
import { fetchReports } from './reportService.js';

export async function fetchGroupData(schoolId, { yearLabel } = {}) {
  if (!schoolId) return {};
  const [budgets, chapters, expenses, unlockRequests, contracts, leaves, attendance, reports] = await Promise.all([
    fetchBudgets(schoolId, { yearLabel }),
    fetchBudgetChapters(schoolId, {}),
    fetchExpenses(schoolId, {}),
    fetchUnlockRequests(schoolId, {}),
    HR_ENTITIES.contracts.fetch(schoolId),
    HR_ENTITIES.leaves.fetch(schoolId),
    HR_ENTITIES.attendance.fetch(schoolId),
    fetchReports(schoolId),
  ]);
  return {
    budgets: budgets || [], chapters: chapters || [], expenses: expenses || [],
    unlockRequests: unlockRequests || [], contracts: contracts || [], leaves: leaves || [],
    attendance: attendance || [], reports: reports || [],
  };
}
