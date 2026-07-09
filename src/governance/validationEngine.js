// Moteur GÉNÉRIQUE de validation par SEUILS DE MONTANT (PUR, testable en Node).
//
// Objectif : pour un montant donné (dépense, bon de commande, budget…), résoudre
// le RÔLE DE GOUVERNANCE habilité à valider. Générique : il ne connaît ni les
// dépenses ni les budgets — juste un barème `{ kind: tiers[] }` par établissement.
//
// AUCUN montant n'est codé en dur dans la LOGIQUE : les seuils vivent uniquement
// dans une configuration (DEFAULT_VALIDATION_RULES par défaut, surchargée par
// schools.validation_rules). La logique lit toujours ces données.
//
// Sémantique d'un palier : `{ under, role }` = « ce rôle valide tant que le
// montant est STRICTEMENT INFÉRIEUR à `under` » ; le dernier palier a `under:null`
// (= au-delà, sans limite). Un montant qui ATTEINT un seuil relève donc du niveau
// SUPÉRIEUR (escalade prudente à la borne).
import { roleRank, isGovernanceRole } from './roles.js';

// Barème par défaut (données, pas de la logique). Surchargé par établissement.
//   < 25 000        -> RAF
//   25 000..250 000 -> Coordonnateur Général
//   > 250 000       -> Fondatrice
export const DEFAULT_VALIDATION_RULES = {
  expense: [
    { under: 25000,  role: 'raf' },
    { under: 250000, role: 'coordonnateur_general' },
    { under: null,   role: 'fondatrice' },
  ],
};

// Type de flux par défaut si un barème n'en précise pas.
export const DEFAULT_KIND = 'expense';

// Parse une configuration (objet OU chaîne JSON venant de schools.validation_rules).
export function parseRules(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// Trie les paliers par borne croissante (null = dernier) et écarte les invalides.
export function normalizeTiers(tiers = []) {
  return tiers
    // `under` DOIT être présent : null explicite (palier sans limite) ou un nombre.
    // Un palier sans `under` (undefined) est invalide et écarté.
    .filter((t) => t && t.role && (t.under === null || Number.isFinite(Number(t.under))))
    .map((t) => ({ under: t.under === null ? null : Number(t.under), role: t.role }))
    .sort((a, b) => {
      if (a.under == null) return 1;
      if (b.under == null) return -1;
      return a.under - b.under;
    });
}

// Récupère le barème d'un flux : config[kind] -> config.default -> DEFAULT.
export function getTiers(config, kind = DEFAULT_KIND) {
  const cfg = parseRules(config) || {};
  const tiers = cfg[kind] || cfg.default || DEFAULT_VALIDATION_RULES[kind] || DEFAULT_VALIDATION_RULES[DEFAULT_KIND];
  return normalizeTiers(tiers);
}

// Palier applicable à un montant : premier palier dont `under` est null ou > montant.
export function resolveTier(tiers, amount) {
  const a = Number(amount) || 0;
  const norm = normalizeTiers(tiers);
  return norm.find((t) => t.under == null || a < t.under) || null;
}

// Rôle validateur requis pour ce montant (dans ce flux).
export function resolveValidatorRole(config, kind, amount) {
  const tier = resolveTier(getTiers(config, kind), amount);
  return tier?.role || null;
}

// Un rôle peut-il valider ce montant ? Le validateur requis OU tout rôle de rang
// SUPÉRIEUR ou égal (une autorité plus haute peut toujours valider en dessous).
export function canRoleValidate(config, kind, amount, roleId) {
  if (!isGovernanceRole(roleId)) return false;
  const required = resolveValidatorRole(config, kind, amount);
  if (!required) return false;
  return roleRank(roleId) >= roleRank(required);
}

// Peut-on valider avec l'un des rôles de l'acteur ? (pour brancher le RBAC futur)
export function actorCanValidate(config, kind, amount, actorRoles = []) {
  return actorRoles.some((r) => canRoleValidate(config, kind, amount, r));
}

// Décrit le barème sous forme de plages lisibles (pour l'UI de configuration) :
// [{ role, min, maxExclusive }] où le montant m appartient au palier si
// min <= m < maxExclusive (maxExclusive null = sans limite).
export function describeTiers(config, kind = DEFAULT_KIND) {
  const tiers = getTiers(config, kind);
  let min = 0;
  return tiers.map((t) => {
    const row = { role: t.role, min, maxExclusive: t.under };
    min = t.under == null ? min : t.under;
    return row;
  });
}
