// Couche données de la GOUVERNANCE (Supabase direct ; LAN via localClient).
//
// Sert de pont entre la table `user_governance_roles` et le moteur RBAC : on
// charge les rôles de gouvernance d'un utilisateur puis on construit l'`actor`
// que Budgets (plus tard) passera à rbac.can(actor, 'budget.validate…').
//
// Lecture ouverte aux membres de l'école (RLS SELECT). Écriture réservée à
// l'admin via RPC SECURITY DEFINER (un membre ne peut pas s'auto-promouvoir).

import { supabase } from '../lib/supabase';
import { isGovernanceRole } from './roles.js';

// Toutes les attributions de l'école (pour un futur écran d'administration).
export async function fetchGovernanceRoles(schoolId) {
  const { data, error } = await supabase
    .from('user_governance_roles').select('*').eq('school_id', schoolId);
  if (error) { console.error('fetchGovernanceRoles', error); return null; }
  return data;
}

// Rôles de gouvernance d'UN utilisateur (liste d'ids de rôles).
export async function fetchUserGovernanceRoles(schoolId, userId) {
  const { data, error } = await supabase
    .from('user_governance_roles').select('role, sector')
    .eq('school_id', schoolId).eq('user_id', userId);
  if (error) { console.error('fetchUserGovernanceRoles', error); return []; }
  return (data || []).filter((r) => isGovernanceRole(r.role));
}

// Construit l'`actor` RBAC : rôle de base + rôles de gouvernance cumulés.
// C'est CE point qui rendra Budgets « automatiquement gouverné » sans refactor :
//   const actor = buildActor({ schoolId, baseRole: role, governance });
//   rbac.can(actor, 'budget.validate.finance', budget)
export function buildActor({ schoolId, userId, baseRole, governance = [] }) {
  const govRoles = governance.map((g) => (typeof g === 'string' ? g : g.role)).filter(isGovernanceRole);
  const roles = [baseRole, ...govRoles].filter(Boolean);
  const sectors = governance.map((g) => (typeof g === 'string' ? null : g.sector)).filter(Boolean);
  return { school_id: schoolId, user_id: userId, roles, sectors };
}

// Attribution (admin uniquement — RPC côté serveur).
export async function assignGovernanceRole(userId, role, sector = null) {
  const { data, error } = await supabase.rpc('admin_assign_governance_role', {
    p_user_id: userId, p_role: role, p_sector: sector,
  });
  if (error) { console.error('assignGovernanceRole', error); return null; }
  return data;
}

export async function revokeGovernanceRole(id) {
  const { error } = await supabase.rpc('admin_revoke_governance_role', { p_id: id });
  if (error) { console.error('revokeGovernanceRole', error); return false; }
  return true;
}
