// Moteur de POLITIQUE DE DÉPLOIEMENT par module (PUR, testable en Node).
//
// H1 — fondation INERTE de l'architecture hybride sélective. Décrit, pour un
// établissement, COMMENT chaque module (finance, notes, bulletins…) se déploie :
//   • où s'exécute/vit la donnée (LAN / Cloud / Hybride) ;
//   • quelles tables se répliquent, dans quel sens (push local→cloud / pull cloud→local) ;
//   • si un canal de COMMANDES de gouvernance est ouvert (rempli en H3/H3b).
//
// INVARIANT D'INERTIE : une politique ABSENTE ou VIDE (cas de TOUS les
// établissements aujourd'hui) rend chaque module « hybride » → push ET pull à
// vrai pour toutes les tables → comportement STRICTEMENT identique à l'actuel.
// Aucune valeur codée en dur autre que ce défaut sûr : la logique lit toujours
// la configuration `schools.deployment_policy` (JSON), jamais un nom d'école.
//
// Forme attendue (JSON déjà parsé OU chaîne), tous champs facultatifs :
//   {
//     finance:   { execution: 'lan',   governance: 'cloud' },
//     notes:     { execution: 'hybrid' },
//     bulletins: { execution: 'lan' },
//     default:   { execution: 'hybrid' }
//   }

// ── Modes d'exécution ─────────────────────────────────────────────────────────
export const EXECUTION = Object.freeze({ LAN: 'lan', CLOUD: 'cloud', HYBRID: 'hybrid' });

// Défaut sûr = comportement actuel (réplication bidirectionnelle intégrale).
export const DEFAULT_MODE = EXECUTION.HYBRID;

// ── Classification table → module (DONNÉES, pas de la logique) ─────────────────
// Seules les tables citées ici sont rattachées à un module explicite ; toute
// autre relève de 'default'. Le rattachement ne prend effet que si une politique
// est DÉFINIE pour ce module — sinon (défaut) tout est hybride, donc inerte.
export const MODULE = Object.freeze({
  FINANCE: 'finance',   // budget V3 + dépenses + gouvernance budgétaire
  FEES: 'fees',         // frais de scolarité (opérationnel, distinct du budget)
  NOTES: 'notes',       // saisie des notes / absences / présences
  DEFAULT: 'default',
});

const TABLE_MODULE = new Map([
  // Finance (budget V3 + dépenses + opérations tracées + gouvernance)
  ['budgets', MODULE.FINANCE], ['budget_chapters', MODULE.FINANCE],
  ['budget_expenses', MODULE.FINANCE], ['budget_unlock_requests', MODULE.FINANCE],
  ['budget_reallocations', MODULE.FINANCE], ['budget_revisions', MODULE.FINANCE],
  ['budget_periods', MODULE.FINANCE], ['budget_line_periods', MODULE.FINANCE],
  ['budget_line_sectors', MODULE.FINANCE], ['budget_line_reallocations', MODULE.FINANCE],
  // Frais de scolarité (opérationnel)
  ['student_fees', MODULE.FEES], ['fee_payments', MODULE.FEES],
  ['fee_catalog', MODULE.FEES], ['student_fee_items', MODULE.FEES],
  // Notes / évaluation — TOUTE la surface « notes » suit la politique `notes`, y
  // compris les notes du MOTEUR OFFICIEL (compétences/observations). Sinon, sous une
  // politique { default: lan, notes: hybrid }, ces notes-là seraient classées `default`
  // et bloquées à tort (H6 : « notes Cloud→LAN sous politique module », surface complète).
  ['grades', MODULE.NOTES], ['student_absences', MODULE.NOTES],
  ['attendance', MODULE.NOTES], ['sequence_dates', MODULE.NOTES],
  ['apc_notes', MODULE.NOTES], ['mat_observations', MODULE.NOTES], ['prim_notes', MODULE.NOTES],
]);

export function moduleOfTable(table) {
  return TABLE_MODULE.get(table) || MODULE.DEFAULT;
}

// ── Parsing / normalisation ───────────────────────────────────────────────────
// Accepte objet (déjà parsé) ou chaîne JSON. Renvoie null si absent/illisible/vide
// → l'appelant retombe alors sur le défaut inerte.
export function parsePolicy(raw) {
  if (raw == null || raw === '') return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return null;
  return Object.keys(obj).length ? obj : null;
}

// Politique par défaut (aucune règle) → true. Sert à garantir/attester l'inertie.
export function isDefaultPolicy(raw) {
  return parsePolicy(raw) == null;
}

// Config effective d'un module : sa règle, sinon la règle 'default', sinon le
// défaut sûr (hybride). Toujours un objet { execution, governance? }.
export function moduleConfig(policy, moduleKey) {
  const p = parsePolicy(policy);
  const fallback = { execution: DEFAULT_MODE };
  if (!p) return fallback;
  const cfg = p[moduleKey] || p[MODULE.DEFAULT] || fallback;
  const execution = [EXECUTION.LAN, EXECUTION.CLOUD, EXECUTION.HYBRID].includes(cfg.execution)
    ? cfg.execution : DEFAULT_MODE;
  return { execution, governance: cfg.governance ?? null };
}

export function executionMode(policy, moduleKey) {
  return moduleConfig(policy, moduleKey).execution;
}

// ── Décisions de réplication (par table) ──────────────────────────────────────
// Table de vérité par mode :
//   hybrid → push ✔  pull ✔   (défaut = comportement actuel)
//   lan    → push ✘  pull ✘   (opérationnel LAN-only ; gouvernance = canal dédié)
//   cloud  → push ✘  pull ✔   (Cloud fait autorité, le LAN reçoit)
// NB (extension H4) : le mode 'lan' + governance 'cloud' ouvrira EN PLUS une
// projection LECTURE SEULE de la STRUCTURE (allowlist), gérée à part — hors H1.
function repl(mode) {
  switch (mode) {
    case EXECUTION.LAN:   return { push: false, pull: false };
    case EXECUTION.CLOUD: return { push: false, pull: true };
    case EXECUTION.HYBRID:
    default:              return { push: true,  pull: true };
  }
}

// STRUCTURE budgétaire (enveloppe/lignes/périodes/allocations) — projetable en
// LECTURE vers le Cloud pour la gouvernance distante (H4). L'OPÉRATIONNEL (dépenses,
// déblocages, réallocations, paiements, frais) reste LAN-only (minimisation §7).
export const FINANCE_STRUCTURE_TABLES = new Set([
  'budgets', 'budget_chapters', 'budget_periods', 'budget_line_periods', 'budget_line_sectors',
]);

// La structure financière est-elle projetée vers le Cloud ? (finance LAN-first mais
// gouvernance déléguée au Cloud). Sert à la projection LECTURE SEULE de H4.
export function financeStructureProjected(policy) {
  const cfg = moduleConfig(policy, MODULE.FINANCE);
  return cfg.execution === EXECUTION.LAN && cfg.governance === EXECUTION.CLOUD;
}

export function shouldPush(policy, table) {
  const mod = moduleOfTable(table);
  const cfg = moduleConfig(policy, mod);
  if (repl(cfg.execution).push) return true;
  // H4 : projection LECTURE de la STRUCTURE financière vers le Cloud quand la finance
  // est LAN-first + gouvernance distante. L'opérationnel n'est jamais poussé ici.
  if (mod === MODULE.FINANCE && cfg.execution === EXECUTION.LAN && cfg.governance === EXECUTION.CLOUD
      && FINANCE_STRUCTURE_TABLES.has(table)) return true;
  return false;
}

// Le Cloud ne fait JAMAIS autorité sur la finance : aucun pull cloud→LAN de la
// finance en mode LAN (la projection est à sens unique, lecture seule côté Cloud).
export function shouldPull(policy, table) {
  return repl(executionMode(policy, moduleOfTable(table))).pull;
}

// ── Canal de commandes de gouvernance (rempli en H3/H3b) ──────────────────────
// Renvoie la cible du canal ('cloud') si le module délègue sa gouvernance à
// distance, sinon null. INERTE en H1 : aucun consommateur ne le lit encore.
export function governanceChannel(policy, moduleKey) {
  const cfg = moduleConfig(policy, moduleKey);
  return cfg.governance === EXECUTION.CLOUD ? EXECUTION.CLOUD : null;
}
