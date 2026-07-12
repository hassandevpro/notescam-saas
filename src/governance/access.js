// Couche d'ACCÈS gouvernance pour l'UI (PUR, testable). Résout, à partir du rôle
// de base + des rôles de gouvernance d'un utilisateur, ce qu'il peut faire dans le
// module Budgets/Dépenses. Ne DUPLIQUE aucune règle métier : les permissions
// viennent de GOVERNANCE_GRANTS, les seuils de resolveValidatorRole (inchangés).
//
// Principe (brief Phase F) : DEUX couches combinées par un ET logique —
//   1. permission de rôle (ici) : ce rôle peut-il faire cette action EN PRINCIPE ;
//   2. résolution par montant (validationEngine) : qui valide CE montant précis.
// Pour un bouton « valider », il faut can(EXPENSE_APPROVE) ET canRoleValidate(montant).
//
// `admin` (rôle de base) conserve l'accès COMPLET historique (aucune régression).

import { GOVERNANCE_GRANTS, GOV_PERM } from './permissions.js';
import { getGovernanceRole, roleSector } from './roles.js';
import { resolveValidatorRole } from './validationEngine.js';

// A-t-il la permission `perm` (rôle de base OU un de ses rôles de gouvernance) ?
export function hasPerm(baseRole, govRoles, perm) {
  if (baseRole === 'admin') return true; // accès complet préservé
  return (govRoles || []).some((r) => (GOVERNANCE_GRANTS[r] || []).includes(perm));
}

// Ensemble des permissions effectives (union base + gouvernance). Pour l'admin,
// renvoie l'ensemble de TOUTES les permissions connues.
export function effectivePerms(baseRole, govRoles) {
  if (baseRole === 'admin') return new Set(Object.values(GOV_PERM));
  const set = new Set();
  for (const r of govRoles || []) for (const p of GOVERNANCE_GRANTS[r] || []) set.add(p);
  return set;
}

// A-t-il un accès QUELCONQUE au module Budgets (route + menu) ?
export function canAccessBudgetModule(baseRole, govRoles) {
  if (baseRole === 'admin') return true;
  return (govRoles || []).some((r) => (GOVERNANCE_GRANTS[r] || []).length > 0);
}

// Secteurs COUVERTS par l'utilisateur, pour filtrer budgets/dépenses par secteur.
//   - admin ou tout rôle de gouvernance transverse (scope 'complex') → `null`
//     = aucune restriction (voit tous les secteurs).
//   - sinon → tableau des secteurs (surcharge user_governance_roles.sector, sinon
//     secteur natif du rôle).
// `govRolesRows` : [{ role, sector }] (lignes user_governance_roles).
export function coveredSectors(baseRole, govRolesRows) {
  if (baseRole === 'admin') return null;
  const sectors = new Set();
  for (const row of govRolesRows || []) {
    if (!row || !row.role) continue;
    const def = getGovernanceRole(row.role);
    if (!def) continue;
    if (def.scope === 'complex') return null; // autorité transverse → tous secteurs
    const s = row.sector || roleSector(row.role);
    if (s == null) return null; // secteur indéterminé → prudence : pas de blocage
    sectors.add(s);
  }
  return [...sectors];
}

// Un budget/une dépense de secteur `sector` est-il visible pour cet utilisateur ?
// `covered` = résultat de coveredSectors (null = tout).
export function sectorVisible(covered, sector) {
  if (covered == null) return true;
  return covered.includes(sector);
}

// L'utilisateur est-il habilité à VALIDER ce montant ? Règle STRICTE PAR PALIER
// (décision Hassan : « valider selon les seuils définis » = sa borne exacte), la
// Fondatrice conservant le droit de DERNIER RECOURS (tout palier). LIT
// resolveValidatorRole (barème de l'école) — ne le MODIFIE pas. À combiner en ET
// avec la permission EXPENSE_APPROVE (cf. hasPerm) côté appelant.
//   admin → true. Sinon : le rôle résolu pour ce montant est-il détenu, ou l'un
//   des rôles est-il « fondatrice » ?
export function isResolvedValidator(validationRules, amount, role, govRoles = []) {
  if (role === 'admin') return true; // accès complet préservé
  const required = resolveValidatorRole(validationRules, 'expense', amount);
  if (!required) return false;
  if ((govRoles || []).includes(required)) return true;      // palier exact
  if ((govRoles || []).includes('fondatrice')) return true;  // dernier recours
  return false;
}
