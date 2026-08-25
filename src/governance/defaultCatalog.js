// CATALOGUE PAR DÉFAUT des rôles de gouvernance (les 9 rôles « système »).
//
// Sert à DEUX choses :
//   1. AMORCER la table governance_roles (le seed SQL de supabase_governance_catalog.sql
//      et server/schema.sql en est le miroir) ;
//   2. REPLI hors-ligne / rétro-compatibilité : quand la table est vide (migration
//      pas encore appliquée, école non encore seedée), le moteur consomme ce
//      catalogue pour que les droits fonctionnent quand même.
//
// À partir de la Phase 2, la table DB fait autorité : ce fichier n'est plus qu'un
// point de départ dupliquable/éditable par établissement.

import { GOV_PERM as P, STRICT_ROLE_MATRIX } from './permissions.js';

// Pages budgétaires de base ouvertes à tout rôle porteur d'un droit budget.
const BUDGET_PAGES = ['/app/budgets', '/app/budget-global', '/app/depenses'];
// Pages « direction générale » (consolidation du groupe).
// `/app/approbations` : en gouvernance financière distante, c'est LÀ que se prend
// l'approbation d'une dépense (le Cloud émet une intention, le LAN applique).
// Sans cette page, un porteur de rôle non-admin voyait la file « Dépenses à
// approuver » sur son tableau de bord mais était REDIRIGÉ en cliquant — la route
// est gardée allow={['admin','censeur']} et seul le catalogue peut l'ouvrir.
const DIRECTION_PAGES = ['/app/groupe', '/app/reports', '/app/approbations', ...BUDGET_PAGES];

// Un rôle = { code, name, description, rank, scope, sector, permissions, pages,
//             dashboards, workflows, active, is_system }.
// `permissions` = droits de consultation/préparation ; `workflows` = droits
// d'approbation/validation/décaissement/décision (le moteur unit les deux).
export const DEFAULT_CATALOG = [
  // Fondatrice & Coordonnateur : mêmes CAPACITÉS FINANCIÈRES que l'Administrateur
  // (créer/gérer budgets, lignes, allocations, dépenses, opérations) — via
  // permissions configurables, jamais un test de rôle codé en dur. L'autorité de
  // validation/approbation reste soumise aux règles de gouvernance existantes.
  {
    code: 'fondatrice', name: 'Fondatrice', description: 'Autorité suprême du complexe',
    rank: 100, scope: 'complex', sector: null,
    permissions: [P.MANAGE, P.VIEW, P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT,
      P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST,
      P.REALLOCATE_REQUEST, P.ANNUAL_REVISE_REQUEST],
    workflows: [P.BUDGET_VALIDATE_SECTOR, P.BUDGET_VALIDATE_FINANCE, P.BUDGET_APPROVE,
      P.BUDGET_CLOSE, P.BUDGET_REOPEN, P.EXPENSE_APPROVE, P.EXPENSE_REJECT, P.EXPENSE_PAY,
      P.UNLOCK_DECIDE, P.REALLOCATE_DECIDE, P.ANNUAL_REVISE],
    pages: DIRECTION_PAGES, dashboards: ['group', 'budget-global'],
  },
  {
    code: 'coordonnateur_general', name: 'Coordonnateur Général', description: 'Direction générale du complexe',
    rank: 90, scope: 'complex', sector: null,
    permissions: [P.MANAGE, P.VIEW, P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT,
      P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST,
      P.REALLOCATE_REQUEST, P.ANNUAL_REVISE_REQUEST],
    workflows: [P.BUDGET_VALIDATE_SECTOR, P.BUDGET_VALIDATE_FINANCE, P.BUDGET_APPROVE,
      P.BUDGET_CLOSE, P.BUDGET_REOPEN, P.EXPENSE_APPROVE, P.EXPENSE_REJECT, P.EXPENSE_PAY,
      P.UNLOCK_DECIDE, P.REALLOCATE_DECIDE, P.ANNUAL_REVISE],
    pages: DIRECTION_PAGES, dashboards: ['group', 'budget-global'],
  },
  {
    code: 'raf', name: 'Responsable Administratif et Financier (RAF)', description: 'Gestion administrative et financière',
    rank: 80, scope: 'complex', sector: null,
    permissions: [P.VIEW, P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.UNLOCK_REQUEST],
    workflows: [P.BUDGET_VALIDATE_FINANCE, P.BUDGET_CLOSE, P.EXPENSE_APPROVE, P.EXPENSE_REJECT, P.EXPENSE_PAY],
    pages: DIRECTION_PAGES, dashboards: ['group', 'budget-global'],
  },
  {
    code: 'principal', name: 'Principal', description: 'Chef du secteur collège',
    rank: 60, scope: 'sector', sector: 'college',
    permissions: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
    workflows: [P.BUDGET_VALIDATE_SECTOR],
    pages: BUDGET_PAGES, dashboards: ['budget-global'],
  },
  {
    code: 'directrice_primaire', name: 'Directrice du primaire', description: 'Chef du secteur primaire',
    rank: 60, scope: 'sector', sector: 'primaire',
    permissions: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
    workflows: [P.BUDGET_VALIDATE_SECTOR],
    pages: BUDGET_PAGES, dashboards: ['budget-global'],
  },
  {
    code: 'responsable_maternelle', name: 'Responsable de la maternelle', description: 'Chef du secteur maternelle',
    rank: 60, scope: 'sector', sector: 'maternelle',
    permissions: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
    workflows: [P.BUDGET_VALIDATE_SECTOR],
    pages: BUDGET_PAGES, dashboards: ['budget-global'],
  },
  {
    code: 'vice_principal', name: 'Vice-principal', description: 'Adjoint du secteur collège',
    rank: 50, scope: 'sector', sector: 'college',
    permissions: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
    workflows: [],
    pages: BUDGET_PAGES, dashboards: ['budget-global'],
  },
  {
    code: 'directrice_adjointe_primaire', name: 'Directrice adjointe du primaire', description: 'Adjointe du secteur primaire',
    rank: 50, scope: 'sector', sector: 'primaire',
    permissions: [P.BUDGET_VIEW, P.BUDGET_PREPARE, P.BUDGET_SUBMIT, P.EXPENSE_VIEW, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT, P.UNLOCK_REQUEST],
    workflows: [],
    pages: BUDGET_PAGES, dashboards: ['budget-global'],
  },
  {
    code: 'caissier', name: 'Caissier', description: 'Exécute les décaissements',
    rank: 30, scope: 'complex', sector: null,
    permissions: [P.BUDGET_VIEW, P.EXPENSE_VIEW],
    workflows: [P.EXPENSE_PAY],
    pages: ['/app/depenses'], dashboards: [],
  },
].map((r) => ({ ...r, active: true, is_system: true }))
  // MATRICE STRICTE : les clés d'autorité de la Phase 3/4 sont ajoutées ici aussi.
  // Pourquoi ce repli compte : si `governance_roles` n'a pas pu être lue (école pas
  // encore amorcée, poste hors-ligne), le moteur consomme ce catalogue. Sans ces
  // clés, le caissier d'une école DURCIE perdrait la caisse le jour où la lecture
  // du catalogue échoue — un incident réseau deviendrait une panne métier.
  // Ailleurs, elles ne sont interrogées par personne : le drapeau est baissé.
  .map((r) => {
    const extra = Object.entries(STRICT_ROLE_MATRIX)
      .filter(([, codes]) => codes.includes(r.code))
      .map(([perm]) => perm)
      .filter((perm) => !r.permissions.includes(perm));
    return extra.length ? { ...r, permissions: [...r.permissions, ...extra] } : r;
  });

// Repli : renvoie le catalogue par défaut si la table est vide/indisponible.
export function catalogOrDefault(catalog) {
  return Array.isArray(catalog) && catalog.length ? catalog : DEFAULT_CATALOG;
}
