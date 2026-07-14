// RBAC + hook ABAC — moteur de permissions PRÊT À BRANCHER.
//
// Aujourd'hui : vérification en mémoire à partir d'une table de grants
//   { role: [permissions] }.  '*' = toutes.
// Demain : le même `can()` pourra déléguer aux RLS Supabase / à une table
// `permissions` sans que les domaines changent d'API (ils appellent
// rbac.require(actor, permission, resource)).
//
// Le hook ABAC par défaut impose l'isolation tenant : un acteur ne peut agir
// que sur une ressource de SON école (cf. faille C1 de l'audit sécu).
//
// Durcissement (revue P0) : une ressource dont le `school_id` est `null` n'est
// PLUS considérée « globale » par défaut — c'était un contournement silencieux
// de l'isolation (une ressource forgée sans school_id passait). Le caractère
// global doit être EXPLICITE (`__global: true`). `resource === null` reste
// permis : il signifie « pas de ressource ciblée » (vérif permission seule,
// ex. lister, créer — la portée est alors contrôlée par le service).
function sameSchool(actor, resource) {
  if (!resource) return true;                     // pas de ressource ciblée
  if (resource.__global === true) return true;    // ressource globale EXPLICITE
  if (resource.school_id == null) return false;   // plus de bypass silencieux
  return actor?.school_id != null && actor.school_id === resource.school_id;
}

export function createRbac({ grants = {}, scopeCheck = sameSchool } = {}) {
  function rolesOf(actor) {
    if (Array.isArray(actor?.roles)) return actor.roles;
    if (actor?.role) return [actor.role];
    return [];
  }
  function hasPerm(role, permission) {
    const perms = grants[role];
    if (!perms) return false;
    return perms.includes('*') || perms.includes(permission);
  }

  function can(actor, permission, resource = null) {
    if (!actor) return false;
    const roles = rolesOf(actor);
    // Rôle « wildcard » (*) = pouvoir transverse (super_admin) : autorité
    // cross-tenant, le hook ABAC ne s'applique pas.
    if (roles.some((r) => grants[r]?.includes('*'))) return true;
    const granted = roles.some((r) => hasPerm(r, permission));
    if (!granted) return false;
    return scopeCheck(actor, resource); // ABAC : portée (école, unité…)
  }

  function require(actor, permission, resource = null) {
    if (!can(actor, permission, resource)) {
      const err = new Error(
        `RBAC: le rôle « ${rolesOf(actor).join(',') || '?'} » ne peut pas « ${permission} »`,
      );
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  return { can, require, _grants: grants };
}
