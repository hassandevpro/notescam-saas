// Dashboards budgétaires PERSONNALISÉS par rôle — logique PURE, testable.
// Catalogue-driven : ne connaît AUCUN nom de rôle. Filtre les DONNÉES fournies
// aux moteurs métier (budgetAnalyticsEngine…) et construit les « files d'attente »
// d'actions du rôle courant, à partir des permissions effectives (governanceEngine)
// et du barème (validationEngine, inchangé).

import {
  hasPermission, canValidateAmount, effectiveDashboards, coveredSectors,
} from './governanceEngine.js';
import { GOV_PERM } from './permissions.js';

// Un budget/dépense de secteur `sector` est-il visible ? covered null = tout.
export function sectorVisible(covered, sector) {
  if (covered == null) return true;
  return covered.includes(sector);
}

// (P7) `filterBudgetDataBySector` retiré : reposait sur `budgets.sector` plat et
// n'avait plus aucun appelant (le dashboard Budget global scope désormais via la
// hiérarchie + `school_units.section_key`). `sectorVisible` reste utilisé ci-dessous
// par `roleBudgetQueues` (périmètre PRÉSENTATIONNEL des files d'action ; la sécurité
// reste serveur — RLS/P3/P5).

// ── Files d'attente d'actions par rôle ──────────────────────────────────────
// Éléments sur lesquels CET utilisateur peut agir MAINTENANT, bornés au secteur.
//   toValidate      : dépenses `submitted` qu'il peut approuver (permission ET montant).
//   toPay           : dépenses `approved` en attente de décaissement.
//   unlocksToDecide : demandes de déblocage `pending`.
export function roleBudgetQueues({
  role, catalog = [], assignments = [], expenses = [], unlockRequests = [],
  validationRules = null, covered = null,
}) {
  const inSector = (row) => sectorVisible(covered, row?.sector ?? null) || (covered != null && row?.sector == null);
  const canApprove = hasPermission(role, catalog, assignments, GOV_PERM.EXPENSE_APPROVE);
  const canPay     = hasPermission(role, catalog, assignments, GOV_PERM.EXPENSE_PAY);
  const canDecide  = hasPermission(role, catalog, assignments, GOV_PERM.UNLOCK_DECIDE);

  const toValidate = !canApprove ? [] : (expenses || []).filter((e) =>
    e && e.status === 'submitted' && inSector(e)
    && canValidateAmount(role, catalog, assignments, validationRules, e.amount));

  const toPay = !canPay ? [] : (expenses || []).filter((e) =>
    e && e.status === 'approved' && inSector(e));

  const unlocksToDecide = !canDecide ? [] : (unlockRequests || []).filter((r) =>
    r && r.status === 'pending');

  return {
    toValidate, toPay, unlocksToDecide,
    counts: { toValidate: toValidate.length, toPay: toPay.length, unlocksToDecide: unlocksToDecide.length },
  };
}

// ── Profil de dashboard d'un utilisateur (que MONTRER) ──────────────────────
// Décrit, sans rien rendre, quelles sections afficher. Piloté par les dashboards
// et permissions du catalogue (aucun nom de rôle codé en dur).
export function dashboardProfile(role, catalog = [], assignments = []) {
  const covered = coveredSectors(role, catalog, assignments);
  const dashboards = effectiveDashboards(role, catalog, assignments);
  const admin = role === 'admin';
  const showValidationQueue = admin || hasPermission(role, catalog, assignments, GOV_PERM.EXPENSE_APPROVE);
  const showPaymentQueue    = admin || hasPermission(role, catalog, assignments, GOV_PERM.EXPENSE_PAY);
  const showUnlockQueue     = admin || hasPermission(role, catalog, assignments, GOV_PERM.UNLOCK_DECIDE);
  return {
    covered,                                   // null = tous secteurs
    scopedToSector: covered != null,           // chef de secteur → vue restreinte
    showGlobalFigures: admin || dashboards.has('group') || dashboards.has('budget-global'),
    showGroupDashboard: admin || dashboards.has('group'),
    showValidationQueue,
    showPaymentQueue,
    showUnlockQueue,
    // Caissier-type : seulement une file de décaissement, aucun chiffre global.
    cashierOnly: !admin && showPaymentQueue && !showValidationQueue && dashboards.size === 0,
  };
}
