// Tests du socle de GOUVERNANCE (rôles + permissions + workflow de validation).
// 100% pur — aucune dépendance réseau / Vite / React.
//   node src/governance/_governance.test.mjs
import { createRbac } from '../kernel/rbac.js';
import { GRANTS } from '../kernel/permissions.js';
import {
  GOVERNANCE_ROLES, GOVERNANCE_ROLE_IDS, topRole, roleRank, roleSector, isSectorRole,
} from './roles.js';
import { GOVERNANCE_GRANTS, GOV_PERM } from './permissions.js';
import {
  BUDGET_VALIDATION_STEPS, nextStep, sectorValidatorRole, canAdvance, isValidationEnabled,
} from './budgetWorkflow.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Organigramme : 10 rôles attendus (H4 : + contrôleur) -------------------
const EXPECTED = [
  'fondatrice', 'coordonnateur_general', 'responsable_maternelle',
  'directrice_primaire', 'directrice_adjointe_primaire', 'principal',
  'vice_principal', 'raf', 'caissier', 'controleur',
];
ok(GOVERNANCE_ROLES.length === 10, '10 rôles de gouvernance définis (contrôleur ajouté en H4)');
ok(EXPECTED.every((r) => GOVERNANCE_ROLE_IDS.includes(r)), 'les 10 rôles demandés sont présents');
ok(roleRank('fondatrice') > roleRank('coordonnateur_general')
  && roleRank('coordonnateur_general') > roleRank('caissier'), 'hiérarchie des rangs cohérente');
ok(topRole(['caissier', 'raf', 'fondatrice']) === 'fondatrice', 'topRole = rôle de plus haut rang');
ok(isSectorRole('directrice_primaire') && roleSector('directrice_primaire') === 'primaire', 'rôle de secteur porte son secteur');
ok(!isSectorRole('raf') && roleSector('raf') === null, 'RAF = rôle transverse (sans secteur)');

// --- Chaque rôle a un grant déclaré -----------------------------------------
ok(GOVERNANCE_ROLE_IDS.every((r) => Array.isArray(GOVERNANCE_GRANTS[r])), 'chaque rôle possède un grant de permissions');

// --- Intégration RBAC réelle (grants fusionnés, comme au câblage kernel) -----
const rbac = createRbac({ grants: { ...GRANTS, ...GOVERNANCE_GRANTS } });
const S = 'sch1';
const budgetMat = { school_id: S, sector: 'maternelle', status: 'submitted' };
const budgetPrim = { school_id: S, sector: 'primaire', status: 'submitted' };

ok(rbac.can({ school_id: S, roles: ['raf'] }, GOV_PERM.BUDGET_VALIDATE_FINANCE, budgetMat),
  'RAF peut valider financièrement');
ok(!rbac.can({ school_id: S, roles: ['caissier'] }, GOV_PERM.BUDGET_APPROVE, budgetMat),
  'Caissier ne peut PAS approuver');
ok(rbac.can({ school_id: S, roles: ['fondatrice'] }, GOV_PERM.BUDGET_APPROVE, budgetMat),
  'Fondatrice peut approuver');
ok(!rbac.can({ school_id: S, roles: ['directrice_primaire'] }, GOV_PERM.BUDGET_VALIDATE_SECTOR, { school_id: 'AUTRE', sector: 'primaire' }),
  'ABAC : isolation école respectée (autre école refusée)');

// --- Workflow de validation --------------------------------------------------
ok(BUDGET_VALIDATION_STEPS.length === 6, '6 étapes de workflow');
ok(nextStep('draft')?.id === 'submit', 'depuis draft -> étape submit');
ok(nextStep('finance_validated')?.id === 'approve', 'depuis finance_validated -> étape approve (=> active)');
ok(nextStep('active')?.id === 'close', 'depuis active -> étape close');
ok(sectorValidatorRole('maternelle') === 'responsable_maternelle', 'validateur secteur maternelle');
ok(sectorValidatorRole('college') === 'principal', 'validateur secteur collège = principal');
ok(sectorValidatorRole('transport') === 'coordonnateur_general', 'secteur transverse -> coordonnateur général');

// --- canAdvance : aval de secteur scopé -------------------------------------
const sectorStep = nextStep('submitted'); // { id:'sector', sectorScoped:true }
ok(canAdvance(rbac, { school_id: S, roles: ['responsable_maternelle'] }, sectorStep, budgetMat),
  'la responsable maternelle valide le secteur maternelle');
ok(!canAdvance(rbac, { school_id: S, roles: ['responsable_maternelle'] }, sectorStep, budgetPrim),
  'la responsable maternelle NE valide PAS le secteur primaire');
ok(canAdvance(rbac, { school_id: S, roles: ['fondatrice'] }, sectorStep, budgetPrim),
  'la fondatrice (transverse) peut valider tout secteur');

// --- Drapeau d'activation : inerte par défaut -------------------------------
ok(isValidationEnabled({ budget_validation: false }) === false, 'workflow désactivé par défaut (comportement Budgets inchangé)');
ok(isValidationEnabled({ budget_validation: true }) === true, 'workflow activable par drapeau école');

console.log(failed ? '\n❌ Gouvernance KO' : '\n✅ Gouvernance OK');
process.exit(failed ? 1 : 0);
