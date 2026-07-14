// Tests du moteur générique de validation par seuils (pur).
//   node src/governance/_validationEngine.test.mjs
import {
  DEFAULT_VALIDATION_RULES, parseRules, normalizeTiers, getTiers, resolveTier,
  resolveValidatorRole, canRoleValidate, actorCanValidate, describeTiers,
} from './validationEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Barème par défaut : RAF / Coordonnateur / Fondatrice --------------------
const V = (amount) => resolveValidatorRole(null, 'expense', amount); // null -> défaut
ok(V(0) === 'raf', '0 -> RAF');
ok(V(24999) === 'raf', '24 999 -> RAF (moins de 25 000)');
ok(V(25000) === 'coordonnateur_general', '25 000 -> Coordonnateur Général');
ok(V(150000) === 'coordonnateur_general', '150 000 -> Coordonnateur Général');
ok(V(249999) === 'coordonnateur_general', '249 999 -> Coordonnateur Général');
ok(V(250000) === 'fondatrice', '250 000 -> Fondatrice (escalade à la borne)');
ok(V(5000000) === 'fondatrice', '5 000 000 -> Fondatrice');

// --- Aucun montant codé en dur : seuils lus depuis la config -----------------
ok(DEFAULT_VALIDATION_RULES.expense.some((t) => t.under === 25000), 'seuils dans la DATA, pas la logique');

// --- Configuration PAR ÉTABLISSEMENT (surcharge) ----------------------------
const custom = { expense: [
  { under: 100000, role: 'raf' },
  { under: null,   role: 'fondatrice' },
] };
ok(resolveValidatorRole(custom, 'expense', 50000) === 'raf', 'barème custom : 50 000 -> RAF');
ok(resolveValidatorRole(custom, 'expense', 100000) === 'fondatrice', 'barème custom : 100 000 -> Fondatrice');
// Config passée en CHAÎNE JSON (comme stockée dans schools.validation_rules).
ok(resolveValidatorRole(JSON.stringify(custom), 'expense', 50000) === 'raf', 'config JSON string supportée');

// --- Flux inconnu -> repli sur `default` puis DEFAULT ------------------------
const withDefault = { default: [{ under: null, role: 'raf' }] };
ok(resolveValidatorRole(withDefault, 'purchase_order', 999) === 'raf', 'repli sur clé `default`');
ok(resolveValidatorRole(null, 'purchase_order', 999) === 'raf', 'flux inconnu -> DEFAULT.expense (999 -> RAF)');

// --- Normalisation : paliers non triés / invalides --------------------------
const messy = normalizeTiers([
  { under: null, role: 'fondatrice' },
  { under: 250000, role: 'coordonnateur_general' },
  { under: 25000, role: 'raf' },
  { under: 'x', role: 'ignore' },   // invalide
  { role: 'no_under' },             // invalide (ni under ni null)
]);
ok(messy.length === 3 && messy[0].under === 25000 && messy[2].under === null, 'tri croissant + éviction des invalides');

// --- Autorité : un rang supérieur peut valider en dessous -------------------
ok(canRoleValidate(null, 'expense', 10000, 'fondatrice'), 'la Fondatrice peut valider un petit montant (rang supérieur)');
ok(!canRoleValidate(null, 'expense', 300000, 'raf'), 'le RAF ne peut PAS valider un gros montant');
ok(canRoleValidate(null, 'expense', 10000, 'raf'), 'le RAF valide le montant de son palier');
ok(!canRoleValidate(null, 'expense', 10000, 'caissier'), 'le Caissier (hors barème) ne valide pas');
ok(actorCanValidate(null, 'expense', 150000, ['caissier', 'coordonnateur_general']), 'acteur multi-rôles : un rôle habilité suffit (150 000 -> Coordonnateur)');
ok(!actorCanValidate(null, 'expense', 300000, ['caissier', 'coordonnateur_general']), 'acteur sans le rang requis : refusé (300 000 exige la Fondatrice)');

// --- Description pour l'UI ---------------------------------------------------
const desc = describeTiers(null, 'expense');
ok(desc[0].role === 'raf' && desc[0].min === 0 && desc[0].maxExclusive === 25000, 'plage RAF [0, 25 000)');
ok(desc[1].min === 25000 && desc[1].maxExclusive === 250000, 'plage Coordonnateur [25 000, 250 000)');
ok(desc[2].min === 250000 && desc[2].maxExclusive === null, 'plage Fondatrice [250 000, ∞)');

console.log(failed ? '\n❌ Validation engine KO' : '\n✅ Validation engine OK');
process.exit(failed ? 1 : 0);
