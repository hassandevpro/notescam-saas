// Workflow de VALIDATION budgétaire (PUR) — PRÉPARÉ, non activé.
//
// Le module Budgets actuel n'importe PAS ce fichier : son cycle reste
// draft -> active -> closed piloté par role==='admin'. Ce module décrit la
// chaîne de validation MULTI-NIVEAUX qui s'appliquera dans une itération future,
// derrière un drapeau (schools.budget_validation), SANS refactoriser Budgets :
//   • quand le drapeau est OFF (aujourd'hui) -> comportement inchangé ;
//   • quand il est ON -> l'activation d'un budget exige de parcourir la chaîne.
//
// La chaîne s'intercale entre les statuts EXISTANTS :
//   draft ──submit──► submitted ──sector──► sector_validated
//        ──finance──► finance_validated ──approve──► active (approuvé)
//        ──close──► closed   (réouverture : closed ──reopen──► active)
//
// Chaque étape référence une PERMISSION (cf. permissions.js) que le RBAC du
// kernel connaît déjà (grants fusionnés au câblage) : Budgets n'aura qu'à
// appeler rbac.can(actor, step.permission, budget).

import { GOV_PERM } from './permissions.js';
import { roleSector } from './roles.js';

// Étapes ordonnées de la chaîne de validation.
export const BUDGET_VALIDATION_STEPS = [
  { id: 'submit',   from: 'draft',             to: 'submitted',         permission: GOV_PERM.BUDGET_SUBMIT },
  { id: 'sector',   from: 'submitted',         to: 'sector_validated',  permission: GOV_PERM.BUDGET_VALIDATE_SECTOR,  sectorScoped: true },
  { id: 'finance',  from: 'sector_validated',  to: 'finance_validated', permission: GOV_PERM.BUDGET_VALIDATE_FINANCE },
  { id: 'approve',  from: 'finance_validated', to: 'active',            permission: GOV_PERM.BUDGET_APPROVE },
  { id: 'close',    from: 'active',            to: 'closed',            permission: GOV_PERM.BUDGET_CLOSE },
  { id: 'reopen',   from: 'closed',            to: 'active',            permission: GOV_PERM.BUDGET_REOPEN },
];

const _byFrom = new Map(BUDGET_VALIDATION_STEPS.map((s) => [s.from, s]));
const _byId   = new Map(BUDGET_VALIDATION_STEPS.map((s) => [s.id, s]));

// Étape applicable depuis le statut courant du budget (null si terminal/inconnu).
export function nextStep(status) { return _byFrom.get(status) || null; }
export function getStep(id) { return _byId.get(id) || null; }

// Rôle de gouvernance attendu pour valider LE SECTEUR d'un budget donné.
// Mappe budgets.sector -> titulaire du secteur ; repli sur le coordonnateur
// général pour les secteurs transverses (administration, transport…).
export function sectorValidatorRole(sector) {
  switch (sector) {
    case 'maternelle': return 'responsable_maternelle';
    case 'primaire':   return 'directrice_primaire';
    case 'college':
    case 'lycee':      return 'principal';
    default:           return 'coordonnateur_general';
  }
}

// Est-ce que l'acteur peut franchir cette étape pour ce budget ?
// `rbac` = moteur kernel (createRbac) ; `actor` = { school_id, roles:[…] }.
// Pour l'étape « sector », on exige EN PLUS que l'acteur couvre le secteur du
// budget (titulaire du secteur, ou rôle transverse complex sans secteur natif).
export function canAdvance(rbac, actor, step, budget) {
  if (!step) return false;
  if (!rbac.can(actor, step.permission, budget)) return false;
  if (step.sectorScoped) {
    const needed = sectorValidatorRole(budget?.sector);
    const roles = actor?.roles || (actor?.role ? [actor.role] : []);
    const coversSector = roles.some((r) => {
      const s = roleSector(r);
      return r === needed || s === budget?.sector || s === null; // null = autorité transverse
    });
    if (!coversSector) return false;
  }
  return true;
}

// Chaîne complète (pour affichage « où en est la validation »).
export function validationChain() { return BUDGET_VALIDATION_STEPS.slice(); }

// Le workflow est-il actif pour cette école ? Défaut : NON (comportement actuel).
// L'itération future n'aura qu'à activer le drapeau, sans changer Budgets.
export function isValidationEnabled(school) {
  return !!(school && school.budget_validation);
}
