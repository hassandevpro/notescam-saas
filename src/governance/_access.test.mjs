// Test pur de la couche d'accès gouvernance (Phase F). Aucune dépendance.
// Lancer : node src/governance/_access.test.mjs
import { hasPerm, effectivePerms, canAccessBudgetModule, coveredSectors, sectorVisible } from './access.js';
import { GOV_PERM } from './permissions.js';

let failed = false;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed = true; };

// ── hasPerm ─────────────────────────────────────────────────────────────────
ok(hasPerm('admin', [], GOV_PERM.EXPENSE_APPROVE) === true, 'admin a toute permission (accès complet préservé)');
ok(hasPerm('teacher', [], GOV_PERM.EXPENSE_APPROVE) === false, 'teacher sans rôle gouvernance → aucune permission budget');
ok(hasPerm('censeur', [], GOV_PERM.EXPENSE_VIEW) === false, 'censeur → aucun accès Budgets (décision)');
ok(hasPerm('teacher', ['raf'], GOV_PERM.EXPENSE_APPROVE) === true, 'RAF valide une dépense (EXPENSE_APPROVE)');
ok(hasPerm('teacher', ['coordonnateur_general'], GOV_PERM.EXPENSE_APPROVE) === true, 'Coordonnateur valide (EXPENSE_APPROVE)');
// Principal / Vice-principal : préparer + soumettre, JAMAIS approuver (décision).
ok(hasPerm('teacher', ['principal'], GOV_PERM.EXPENSE_SUBMIT) === true, 'Principal soumet une demande de dépense');
ok(hasPerm('teacher', ['principal'], GOV_PERM.EXPENSE_APPROVE) === false, 'Principal ne valide JAMAIS');
ok(hasPerm('teacher', ['vice_principal'], GOV_PERM.EXPENSE_SUBMIT) === true, 'Vice-principal soumet');
ok(hasPerm('teacher', ['vice_principal'], GOV_PERM.EXPENSE_APPROVE) === false, 'Vice-principal ne valide pas');
// Caissier : paie, ne valide pas.
ok(hasPerm('teacher', ['caissier'], GOV_PERM.EXPENSE_PAY) === true, 'Caissier exécute le paiement');
ok(hasPerm('teacher', ['caissier'], GOV_PERM.EXPENSE_APPROVE) === false, 'Caissier ne valide pas');
// F4 : Caissier ne crée/modifie NI dépense NI budget (brief F1/F3/F4).
ok(hasPerm('teacher', ['caissier'], GOV_PERM.EXPENSE_PREPARE) === false, 'Caissier ne crée PAS de dépense');
ok(hasPerm('teacher', ['caissier'], GOV_PERM.BUDGET_PREPARE) === false, 'Caissier ne prépare PAS de budget');

// ── effectivePerms ──────────────────────────────────────────────────────────
ok(effectivePerms('admin', []).has(GOV_PERM.BUDGET_CLOSE), 'admin → toutes permissions');
ok(effectivePerms('teacher', ['raf']).has(GOV_PERM.EXPENSE_PAY), 'RAF → EXPENSE_PAY dans ses permissions');
ok(!effectivePerms('teacher', ['principal']).has(GOV_PERM.EXPENSE_APPROVE), 'Principal → pas EXPENSE_APPROVE');

// ── canAccessBudgetModule ───────────────────────────────────────────────────
ok(canAccessBudgetModule('admin', []) === true, 'admin accède au module');
ok(canAccessBudgetModule('teacher', []) === false, 'teacher seul → pas d\'accès');
ok(canAccessBudgetModule('surveillant', []) === false, 'surveillant → pas d\'accès');
ok(canAccessBudgetModule('teacher', ['caissier']) === true, 'caissier → accès (limité)');
ok(canAccessBudgetModule('teacher', ['principal']) === true, 'principal → accès (secteur)');

// ── coveredSectors ──────────────────────────────────────────────────────────
ok(coveredSectors('admin', []) === null, 'admin → tous secteurs (null)');
ok(coveredSectors('teacher', [{ role: 'fondatrice' }]) === null, 'fondatrice (complex) → tous secteurs');
ok(coveredSectors('teacher', [{ role: 'coordonnateur_general' }]) === null, 'coordonnateur (complex) → tous secteurs');
const cp = coveredSectors('teacher', [{ role: 'principal' }]);
ok(Array.isArray(cp) && cp.length === 1 && cp[0] === 'college', 'principal → secteur college (natif)');
const cpo = coveredSectors('teacher', [{ role: 'principal', sector: 'lycee' }]);
ok(cpo[0] === 'lycee', 'principal avec surcharge → secteur lycee');
const multi = coveredSectors('teacher', [{ role: 'principal' }, { role: 'directrice_primaire' }]);
ok(multi.includes('college') && multi.includes('primaire') && multi.length === 2, 'cumul de secteurs');
ok(JSON.stringify(coveredSectors('teacher', [])) === '[]', 'aucun rôle → aucun secteur');

// ── sectorVisible ───────────────────────────────────────────────────────────
ok(sectorVisible(null, 'primaire') === true, 'null (tout) → visible');
ok(sectorVisible(['college'], 'college') === true, 'secteur couvert → visible');
ok(sectorVisible(['college'], 'primaire') === false, 'secteur non couvert → invisible');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
