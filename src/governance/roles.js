// Gouvernance du COMPLEXE SCOLAIRE — rôles de direction (PUR, testable en Node).
//
// Ces rôles sont ADDITIFS : ils se cumulent au rôle de base de l'app
// (admin/censeur/surveillant/teacher, table school_users.role — INCHANGÉ). Un
// utilisateur porte donc `roles = [role_base, ...roles_gouvernance]`, ce que le
// moteur RBAC du kernel gère déjà nativement (rbac.js : actor.roles[]).
//
// Objectif de cette tranche : DÉFINIR l'organigramme + les permissions + le
// socle des workflows de validation. Aucun câblage dans le module Budgets actuel
// (son comportement reste identique). Budgets s'y branchera plus tard via
// rbac.can(actor, 'budget.validate…') sans refactorisation.

// `scope` : 'complex' = autorité sur tout le groupe ; 'sector' = périmètre d'un
// secteur pédagogique (aligné sur budgets.sector / school_units.section_key).
// `rank` : hiérarchie décroissante (sert de précédence pour les validations et
// l'escalade — plus grand = plus haut placé).
export const GOVERNANCE_ROLES = [
  { id: 'fondatrice',                    rank: 100, scope: 'complex',
    label: ['Fondatrice', 'Founder', 'Fundadora'] },
  { id: 'coordonnateur_general',         rank: 90,  scope: 'complex',
    label: ['Coordonnateur Général', 'General Coordinator', 'Coordinador General'] },
  { id: 'raf',                           rank: 80,  scope: 'complex',
    label: ['Responsable Administratif et Financier (RAF)', 'Administrative & Financial Manager', 'Responsable Administrativo y Financiero'] },
  { id: 'principal',                     rank: 60,  scope: 'sector', sector: 'college',
    label: ['Principal', 'Principal', 'Director'] },
  { id: 'directrice_primaire',           rank: 60,  scope: 'sector', sector: 'primaire',
    label: ['Directrice du primaire', 'Primary Head', 'Directora de primaria'] },
  { id: 'responsable_maternelle',        rank: 60,  scope: 'sector', sector: 'maternelle',
    label: ['Responsable de la maternelle', 'Kindergarten Head', 'Responsable de preescolar'] },
  { id: 'vice_principal',                rank: 50,  scope: 'sector', sector: 'college',
    label: ['Vice-principal', 'Vice-principal', 'Subdirector'] },
  { id: 'directrice_adjointe_primaire',  rank: 50,  scope: 'sector', sector: 'primaire',
    label: ['Directrice adjointe du primaire', 'Deputy Primary Head', 'Subdirectora de primaria'] },
  { id: 'caissier',                      rank: 30,  scope: 'complex',
    label: ['Caissier', 'Cashier', 'Cajero'] },
];

export const GOVERNANCE_ROLE_IDS = GOVERNANCE_ROLES.map((r) => r.id);

const _byId = new Map(GOVERNANCE_ROLES.map((r) => [r.id, r]));

export function getGovernanceRole(id) { return _byId.get(id) || null; }
export function isGovernanceRole(id) { return _byId.has(id); }
export function roleRank(id) { return _byId.get(id)?.rank ?? 0; }
export function isSectorRole(id) { return _byId.get(id)?.scope === 'sector'; }

// Secteur « natif » d'un rôle (null pour les rôles transverses au complexe).
export function roleSector(id) { return _byId.get(id)?.sector ?? null; }

// Le rôle de plus haut rang parmi une liste (départage d'autorité / escalade).
export function topRole(roleIds = []) {
  return roleIds
    .filter(isGovernanceRole)
    .sort((a, b) => roleRank(b) - roleRank(a))[0] || null;
}
