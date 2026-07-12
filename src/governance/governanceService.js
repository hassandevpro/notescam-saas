// Couche données de la GOUVERNANCE (Supabase direct ; LAN via localClient).
//
// Sert de pont entre la table `user_governance_roles` et le moteur RBAC : on
// charge les rôles de gouvernance d'un utilisateur puis on construit l'`actor`
// que Budgets (plus tard) passera à rbac.can(actor, 'budget.validate…').
//
// Lecture ouverte aux membres de l'école (RLS SELECT). Écriture réservée à
// l'admin via RPC SECURITY DEFINER (un membre ne peut pas s'auto-promouvoir).

import { supabase } from '../lib/supabase';

// CATALOGUE de rôles de l'école (source des permissions/menus/dashboards). Trié
// par rang décroissant. Vide si migration absente / hors-ligne (repli JS côté moteur).
export async function fetchGovernanceCatalog(schoolId) {
  const { data, error } = await supabase
    .from('governance_roles').select('*').eq('school_id', schoolId).order('rank', { ascending: false });
  if (error) { console.error('fetchGovernanceCatalog', error); return []; }
  return data || [];
}

// Historique des changements de rôle (écran d'administration).
export async function fetchGovernanceHistory(schoolId, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('governance_role_history').select('*')
    .eq('school_id', schoolId).order('at', { ascending: false }).limit(limit);
  if (error) { console.error('fetchGovernanceHistory', error); return []; }
  return data || [];
}

// Toutes les attributions de l'école (écran d'attribution).
export async function fetchGovernanceRoles(schoolId) {
  const { data, error } = await supabase
    .from('user_governance_roles').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchGovernanceRoles', error); return null; }
  return data;
}

// Attributions d'UN utilisateur (lignes complètes : rôle + secteur + dates + statut).
export async function fetchUserGovernanceRoles(schoolId, userId) {
  const { data, error } = await supabase
    .from('user_governance_roles').select('role, sector, start_date, end_date, status')
    .eq('school_id', schoolId).eq('user_id', userId);
  if (error) { console.error('fetchUserGovernanceRoles', error); return []; }
  return data || [];
}

// Construit l'`actor` RBAC : rôle de base + rôles de gouvernance cumulés.
//   const actor = buildActor({ schoolId, baseRole: role, governance });
//   rbac.can(actor, 'budget.validate.finance', budget)
export function buildActor({ schoolId, userId, baseRole, governance = [] }) {
  const govRoles = governance.map((g) => (typeof g === 'string' ? g : g.role)).filter(Boolean);
  const roles = [baseRole, ...govRoles].filter(Boolean);
  const sectors = governance.map((g) => (typeof g === 'string' ? null : g.sector)).filter(Boolean);
  return { school_id: schoolId, user_id: userId, roles, sectors };
}

// Attribution / mise à jour (admin uniquement — RPC côté serveur). Le rôle doit
// exister dans le catalogue de l'école. Renvoie l'id de la ligne, ou null en échec.
export async function assignGovernanceRole(userId, role, { sector = null, startDate = null, endDate = null, status = 'active' } = {}) {
  const { data, error } = await supabase.rpc('admin_assign_governance_role', {
    p_user_id: userId, p_role: role, p_sector: sector,
    p_start_date: startDate, p_end_date: endDate, p_status: status,
  });
  if (error) { console.error('assignGovernanceRole', error); return { error }; }
  return { id: data };
}

export async function revokeGovernanceRole(id) {
  const { error } = await supabase.rpc('admin_revoke_governance_role', { p_id: id });
  if (error) { console.error('revokeGovernanceRole', error); return false; }
  return true;
}
