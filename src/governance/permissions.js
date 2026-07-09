// Permissions de la gouvernance (PUR). Déclarées ici, fusionnées dans le registre
// RBAC du kernel au câblage (src/kernel/index.js). Un rôle -> un ensemble de
// permissions. Le module Budgets actuel n'utilise AUCUNE de ces permissions
// (elles sont inertes) : elles servent aux workflows de validation À VENIR.

// ── Permissions ───────────────────────────────────────────────────────────────
export const GOV_PERM = {
  // Administration de l'organigramme (attribution/révocation de rôles).
  MANAGE: 'governance.manage',
  VIEW:   'governance.view',

  // Cycle de validation budgétaire (workflow FUTUR — cf. budgetWorkflow.js).
  BUDGET_VIEW:             'budget.view',
  BUDGET_PREPARE:          'budget.prepare',           // rédiger un brouillon
  BUDGET_SUBMIT:           'budget.submit',            // soumettre à validation
  BUDGET_VALIDATE_SECTOR:  'budget.validate.sector',   // aval du responsable de secteur
  BUDGET_VALIDATE_FINANCE: 'budget.validate.finance',  // aval du RAF
  BUDGET_APPROVE:          'budget.approve',           // approbation finale -> actif
  BUDGET_CLOSE:            'budget.close',              // clôture
  BUDGET_REOPEN:           'budget.reopen',            // réouverture

  // Cycle de la DÉPENSE (module Dépenses). Statut piloté par l'admin aujourd'hui ;
  // ces permissions préparent le circuit de validation gouverné (drapeau école).
  EXPENSE_VIEW:    'expense.view',
  EXPENSE_PREPARE: 'expense.prepare',   // saisir un brouillon de dépense
  EXPENSE_SUBMIT:  'expense.submit',    // soumettre pour validation
  EXPENSE_APPROVE: 'expense.approve',   // approuver la dépense
  EXPENSE_REJECT:  'expense.reject',    // rejeter
  EXPENSE_PAY:     'expense.pay',       // exécuter le paiement (caissier)

  // Déblocage d'une ligne budgétaire épuisée.
  UNLOCK_REQUEST:  'budget.unlock.request', // créer une demande de déblocage
  UNLOCK_DECIDE:   'budget.unlock.decide',  // refuser / autoriser / augmenter
};

const P = GOV_PERM;

// ── Grants par rôle de gouvernance ────────────────────────────────────────────
// (n'affecte pas les grants des rôles de base admin/censeur/… du kernel.)
export const GOVERNANCE_GRANTS = {
  fondatrice: [
    P.MANAGE, P.VIEW,
    P.BUDGET_VIEW, P.BUDGET_VALIDATE_SECTOR, P.BUDGET_VALIDATE_FINANCE,
    P.BUDGET_APPROVE, P.BUDGET_CLOSE, P.BUDGET_REOPEN,
    P.EXPENSE_VIEW, P.EXPENSE_APPROVE, P.EXPENSE_REJECT,
    P.UNLOCK_DECIDE,   // autorité de déblocage des lignes épuisées
  ],
  coordonnateur_general: [
    P.MANAGE, P.VIEW,
    P.BUDGET_VIEW, P.BUDGET_VALIDATE_SECTOR, P.BUDGET_VALIDATE_FINANCE,
    P.BUDGET_APPROVE, P.BUDGET_CLOSE, P.BUDGET_REOPEN,
    P.EXPENSE_VIEW, P.EXPENSE_APPROVE, P.EXPENSE_REJECT,
    P.UNLOCK_DECIDE,   // autorité de déblocage des lignes épuisées
  ],
  raf: [
    P.VIEW,
    P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT,
    P.BUDGET_VALIDATE_FINANCE, P.BUDGET_CLOSE,
    P.EXPENSE_VIEW, P.EXPENSE_APPROVE, P.EXPENSE_REJECT, P.EXPENSE_PAY,
    P.UNLOCK_REQUEST,
  ],
  // Chefs de secteur : préparent, soumettent et donnent l'aval de LEUR secteur
  // (la portée secteur est vérifiée par le workflow, pas par le grant).
  responsable_maternelle: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.BUDGET_VALIDATE_SECTOR, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
  directrice_primaire:    [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.BUDGET_VALIDATE_SECTOR, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
  principal:              [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.BUDGET_VALIDATE_SECTOR, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
  // Adjoints : préparent et soumettent (aval réservé au titulaire du secteur).
  directrice_adjointe_primaire: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
  vice_principal:               [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
  // Caissier : prépare la dépense et EXÉCUTE le paiement ; n'est PAS un valideur.
  caissier: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.EXPENSE_PAY, P.UNLOCK_REQUEST],
};
