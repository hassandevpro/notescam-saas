// Hook d'accès à la MATRICE DE RÔLES STRICTE depuis les composants.
//
// Un seul endroit assemble le contexte d'autorité (école, rôle de base, capacités
// déléguées, permissions de gouvernance effectives) pour que la navigation, les
// gardes de route et les boutons d'action ne puissent pas répondre différemment
// à la même question. La logique elle-même est dans `core/strictMatrix.js`
// (pure, testable sans React).
//
// Rappel §15 : ceci ne SÉCURISE rien. La sécurité est dans les policies RLS
// (cloud) et dans server/scopeGuard.js (LAN). Ce hook évite seulement de
// proposer une action que la base refusera.

import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { effectivePermissions } from '../governance/governanceEngine';
import { catalogOrDefault } from '../governance/defaultCatalog';
import {
  strictContext, strictAllowsPage, canCollectFees, isFinanceOfficer, isFinanceReader,
  hasStaffAuthority, canManageStaffSector, allowsStaffSector, userSectors,
} from '../core/strictMatrix';

export function useStrictMatrix() {
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const permissions = useAuthStore((s) => s.permissions);
  const catalog = useAuthStore((s) => s.governanceCatalog);
  const assignments = useAuthStore((s) => s.governanceAssignments);
  const scope = useAuthStore((s) => s.scope);

  return useMemo(() => {
    // Permissions de gouvernance EFFECTIVES : union permissions ∪ workflows des
    // rôles actifs aujourd'hui (dates + statut). Même sémantique que
    // `public.user_gov_perms` (cloud) et `govPerms()` (LAN).
    const perms = effectivePermissions(role, catalogOrDefault(catalog), assignments || []);
    const ctx = strictContext({ school, role, permissions, perms });
    return {
      ctx,
      strict: ctx.strict,
      allowsPage: (path) => strictAllowsPage(path, ctx),
      canCollectFees: canCollectFees(ctx),
      isFinanceOfficer: isFinanceOfficer(ctx),
      isFinanceReader: isFinanceReader(ctx),
      hasStaffAuthority: hasStaffAuthority(ctx),
      // Secteurs du compte : DÉRIVÉS des classes que son périmètre laisse passer.
      sectorsOf: (classes) => userSectors(scope, classes),
      canManageStaff: (sector, sectors) => canManageStaffSector(ctx, sector, sectors),
      allowsStaff: (sector, sectors) => allowsStaffSector(ctx, sector, sectors),
    };
  }, [school, role, permissions, catalog, assignments, scope]);
}
