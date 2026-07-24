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

  // ── Opérations budgétaires DISTINCTES (modèle hiérarchique — cf. G3) ─────────
  // Séparation stricte des responsabilités : réallouer entre enveloppes et réviser
  // le budget annuel sont deux autorités différentes, chacune configurable via le
  // catalogue de gouvernance (aucun rôle codé en dur). Déclarées ici (inertes) ;
  // enforcement serveur + câblage catalogue en P3/P5.
  REALLOCATE_REQUEST:    'budget.reallocate.request', // proposer un transfert entre enveloppes sœurs
  REALLOCATE_DECIDE:     'budget.reallocate.decide',  // valider/refuser une réallocation
  ANNUAL_REVISE_REQUEST: 'budget.annual.revise.request', // proposer une révision du budget annuel
  ANNUAL_REVISE:         'budget.annual.revise',      // AUTORITÉ de révision du budget annuel (exceptionnelle)
};

const P = GOV_PERM;

// ── Grants par rôle de gouvernance ────────────────────────────────────────────
// (n'affecte pas les grants des rôles de base admin/censeur/… du kernel.)
export const GOVERNANCE_GRANTS = {
  // Fondatrice & Coordonnateur : mêmes CAPACITÉS FINANCIÈRES que l'Administrateur
  // (préparer/soumettre budgets & dépenses, demander déblocage/réallocation/révision)
  // EN PLUS de leur autorité de validation. Configurable, aucun rôle codé en dur.
  fondatrice: [
    P.MANAGE, P.VIEW,
    P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT,
    P.BUDGET_VALIDATE_SECTOR, P.BUDGET_VALIDATE_FINANCE,
    P.BUDGET_APPROVE, P.BUDGET_CLOSE, P.BUDGET_REOPEN,
    P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.EXPENSE_APPROVE, P.EXPENSE_REJECT, P.EXPENSE_PAY,
    P.UNLOCK_REQUEST, P.UNLOCK_DECIDE,
    P.REALLOCATE_REQUEST, P.REALLOCATE_DECIDE, P.ANNUAL_REVISE_REQUEST, P.ANNUAL_REVISE,
  ],
  coordonnateur_general: [
    P.MANAGE, P.VIEW,
    P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT,
    P.BUDGET_VALIDATE_SECTOR, P.BUDGET_VALIDATE_FINANCE,
    P.BUDGET_APPROVE, P.BUDGET_CLOSE, P.BUDGET_REOPEN,
    P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.EXPENSE_APPROVE, P.EXPENSE_REJECT, P.EXPENSE_PAY,
    P.UNLOCK_REQUEST, P.UNLOCK_DECIDE,
    P.REALLOCATE_REQUEST, P.REALLOCATE_DECIDE, P.ANNUAL_REVISE_REQUEST, P.ANNUAL_REVISE,
  ],
  raf: [
    P.VIEW,
    P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT,
    P.BUDGET_VALIDATE_FINANCE, P.BUDGET_CLOSE,
    P.EXPENSE_VIEW, P.EXPENSE_APPROVE, P.EXPENSE_REJECT, P.EXPENSE_PAY,
    P.UNLOCK_REQUEST,
    // Le RAF PROPOSE une réallocation ; la décision revient à l'autorité configurée.
    P.REALLOCATE_REQUEST, P.ANNUAL_REVISE_REQUEST,
  ],
  // Chefs de secteur : préparent, soumettent et donnent l'aval de LEUR secteur
  // (la portée secteur est vérifiée par le workflow, pas par le grant).
  responsable_maternelle: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.BUDGET_VALIDATE_SECTOR, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST, P.REALLOCATE_REQUEST],
  directrice_primaire:    [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.BUDGET_VALIDATE_SECTOR, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST, P.REALLOCATE_REQUEST],
  principal:              [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.BUDGET_VALIDATE_SECTOR, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST, P.REALLOCATE_REQUEST],
  // Adjoints : préparent et soumettent (aval réservé au titulaire du secteur).
  directrice_adjointe_primaire: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
  vice_principal:               [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
  // Caissier : CONSULTE et EXÉCUTE le décaissement (approved → paid). Ne crée ni ne
  // modifie budget/dépense, n'est PAS un valideur (Phase F, décision + brief F1/F3/F4).
  caissier: [P.BUDGET_VIEW, P.EXPENSE_VIEW, P.EXPENSE_PAY],
};
