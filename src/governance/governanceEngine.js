// MOTEUR de gouvernance (PUR, testable en Node). Calcule les droits effectifs
// d'un utilisateur À PARTIR DU CATALOGUE de rôles (table governance_roles) et de
// ses AFFECTATIONS (user_governance_roles), sans AUCUN nom de rôle codé en dur.
//
// C'est le cœur de la refonte « rôles configurables » : ajouter un rôle en base
// (Phase 2) modifie automatiquement permissions / menus / routes / dashboards /
// validations, sans toucher au code. Les constantes JS (roles.js, permissions.js)
// ne servent plus qu'à AMORCER le catalogue (seed SQL) et de repli hors-ligne.
//
// Formes de données attendues (JSON déjà parsé) :
//   catalogRow      = { code, name, description, rank, scope:'complex'|'sector',
//                       sector, permissions:[], pages:[], dashboards:[],
//                       workflows:[], active:bool }
//   assignmentRow   = { role /* = code */, sector, start_date, end_date, status }
//
// `baseRole` = rôle de base school_users.role (admin/censeur/surveillant/teacher).
// `admin` conserve l'accès COMPLET historique (aucune régression).

import { GOV_PERM } from './permissions.js';
import { resolveValidatorRole } from './validationEngine.js';

const ALL_PERMS = Object.values(GOV_PERM);

// ── Normalisation ────────────────────────────────────────────────────────────
// Les champs JSON peuvent arriver en tableau (déjà parsé) ou en texte (PostgREST
// jsonb → tableau ; SQLite → texte). On tolère les deux.
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

function normRole(row) {
  if (!row || !row.code) return null;
  return {
    code: row.code,
    name: row.name ?? row.code,
    description: row.description ?? '',
    rank: Number(row.rank) || 0,
    scope: row.scope === 'sector' ? 'sector' : 'complex',
    sector: row.sector ?? null,
    permissions: asArray(row.permissions),
    pages: asArray(row.pages),
    dashboards: asArray(row.dashboards),
    workflows: asArray(row.workflows),
    active: row.active === false || row.active === 0 ? false : true,
  };
}

// Index du catalogue par code (rôles ACTIFS uniquement — un rôle désactivé ne
// confère plus aucun droit, même s'il reste attribué).
export function indexCatalog(catalog = []) {
  const map = new Map();
  for (const row of catalog || []) {
    const r = normRole(row);
    if (r && r.active) map.set(r.code, r);
  }
  return map;
}

// ── Affectations actives ─────────────────────────────────────────────────────
// Une affectation confère des droits si : statut actif ET fenêtre de dates
// courante (début ≤ aujourd'hui ≤ fin, bornes facultatives). Dates au format
// ISO 'YYYY-MM-DD' → comparaison lexicale sûre.
function todayISO(now) {
  const d = now instanceof Date ? now : new Date();
  return d.toISOString().slice(0, 10);
}

export function isAssignmentActive(row, now = new Date()) {
  if (!row || !row.role) return false;
  const status = row.status ?? 'active';
  if (status !== 'active') return false;
  const day = todayISO(now);
  if (row.start_date && String(row.start_date).slice(0, 10) > day) return false;
  if (row.end_date && String(row.end_date).slice(0, 10) < day) return false;
  return true;
}

export function activeAssignments(assignments = [], now = new Date()) {
  return (assignments || []).filter((r) => isAssignmentActive(r, now));
}

// Rôles (défs de catalogue) effectivement détenus MAINTENANT par l'utilisateur.
function heldRoles(catalogIndex, assignments, now = new Date()) {
  const out = [];
  for (const a of activeAssignments(assignments, now)) {
    const def = catalogIndex.get(a.role);
    if (def) out.push({ def, assignment: a });
  }
  return out;
}

// ── Droits effectifs ─────────────────────────────────────────────────────────
// Permissions d'action (budget/dépense/déblocage). admin → toutes.
export function effectivePermissions(baseRole, catalog, assignments, now = new Date()) {
  if (baseRole === 'admin') return new Set(ALL_PERMS);
  const idx = indexCatalog(catalog);
  const set = new Set();
  for (const { def } of heldRoles(idx, assignments, now)) {
    for (const p of def.permissions) set.add(p);
    for (const w of def.workflows) set.add(w); // workflows de validation = permissions d'action
  }
  return set;
}

export function hasPermission(baseRole, catalog, assignments, perm, now = new Date()) {
  if (baseRole === 'admin') return true;
  return effectivePermissions(baseRole, catalog, assignments, now).has(perm);
}

// Accès QUELCONQUE au module Budgets (au moins une permission gouvernance).
export function canAccessBudgetModule(baseRole, catalog, assignments, now = new Date()) {
  if (baseRole === 'admin') return true;
  return effectivePermissions(baseRole, catalog, assignments, now).size > 0;
}

// Pages/menus/routes autorisés par les rôles de gouvernance (union). Ne REMPLACE
// pas l'accès par rôle de base ni les capacités déléguées : l'appelant fait l'union.
export function effectivePages(baseRole, catalog, assignments, now = new Date()) {
  const set = new Set();
  if (baseRole === 'admin') return set; // admin déjà tout par ailleurs
  const idx = indexCatalog(catalog);
  for (const { def } of heldRoles(idx, assignments, now)) for (const p of def.pages) set.add(p);
  return set;
}

// Dashboards associés (ids logiques, ex. 'group', 'budget-global').
export function effectiveDashboards(baseRole, catalog, assignments, now = new Date()) {
  const set = new Set();
  const idx = indexCatalog(catalog);
  for (const { def } of heldRoles(idx, assignments, now)) for (const d of def.dashboards) set.add(d);
  return set;
}

export function canSeeDashboard(baseRole, catalog, assignments, dashId, now = new Date()) {
  if (baseRole === 'admin') return true;
  return effectiveDashboards(baseRole, catalog, assignments, now).has(dashId);
}

// ── Périmètre secteur ────────────────────────────────────────────────────────
// null = aucune restriction (admin OU un rôle transverse 'complex'). Sinon liste
// des secteurs couverts (surcharge d'affectation, sinon secteur natif du rôle).
export function coveredSectors(baseRole, catalog, assignments, now = new Date()) {
  if (baseRole === 'admin') return null;
  const idx = indexCatalog(catalog);
  const held = heldRoles(idx, assignments, now);
  const sectors = new Set();
  for (const { def, assignment } of held) {
    if (def.scope === 'complex') return null; // autorité transverse → tous secteurs
    const s = assignment.sector || def.sector;
    if (s == null) return null; // secteur indéterminé → prudence : pas de blocage
    sectors.add(s);
  }
  return [...sectors];
}

// Rang maximal parmi les rôles TRANSVERSES ('complex') du catalogue = l'autorité
// suprême (ex. Fondatrice). Sert de « dernier recours » sans coder aucun nom.
function topComplexRank(catalogIndex) {
  let max = -Infinity;
  for (const def of catalogIndex.values()) if (def.scope === 'complex' && def.rank > max) max = def.rank;
  return max;
}

// ── Validation par montant ───────────────────────────────────────────────────
// Le barème (validation_rules) résout le rôle REQUIS pour un montant. Sémantique
// (décision établissement) : validation au PALIER EXACT, l'autorité suprême
// (rôle transverse de rang maximal) conservant le droit de DERNIER RECOURS sur
// tout palier. Entièrement data-driven (aucun nom de rôle en dur).
export function canValidateAmount(baseRole, catalog, assignments, validationRules, amount, now = new Date()) {
  if (baseRole === 'admin') return true;
  const requiredCode = resolveValidatorRole(validationRules, 'expense', amount);
  if (!requiredCode) return false;
  const idx = indexCatalog(catalog);
  const topRank = topComplexRank(idx);
  for (const { def } of heldRoles(idx, assignments, now)) {
    if (def.code === requiredCode) return true;                       // palier exact
    if (def.scope === 'complex' && def.rank === topRank) return true; // dernier recours (autorité suprême)
  }
  return false;
}
