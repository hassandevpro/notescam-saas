import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { isPathPermitted, firstPermitted } from '../config/capabilities';
import { effectivePages } from '../governance/governanceEngine';
import { catalogOrDefault } from '../governance/defaultCatalog';
import { useStrictMatrix } from '../lib/useStrictMatrix';

// Page d'accueil par défaut selon le rôle — cible des redirections quand un
// rôle tente d'accéder à une route qui ne lui est pas autorisée.
export function homeForRole(role) {
  if (role === 'superadmin') return '/superadmin';
  if (role === 'teacher')    return '/app/grades';
  return '/app';
}

/**
 * Protège une route :
 *  - redirige vers /login si pas de session ;
 *  - COMPTE DÉLÉGUÉ (permissions non vides) : accès autorisé UNIQUEMENT aux pages
 *    de sa liste de capacités (les permissions font autorité, quel que soit le
 *    rôle de base) ;
 *  - sinon : garde de route par rôle (`allow`) — comportement historique inchangé.
 */
export default function ProtectedRoute({ children, allow }) {
  const { session, loading, role } = useAuthStore();
  const permissions = useAuthStore((s) => s.permissions);
  const governanceCatalog = useAuthStore((s) => s.governanceCatalog);
  const governanceAssignments = useAuthStore((s) => s.governanceAssignments);
  const { pathname } = useLocation();
  const strict = useStrictMatrix();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Chargement...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Le superadmin (propriétaire de la plateforme) n'est jamais restreint.
  if (role === 'superadmin') return children;

  // MATRICE STRICTE — évaluée AVANT tout le reste, et donc au-dessus des pages de
  // gouvernance comme des capacités déléguées. Retirer une entrée de menu ne
  // protège rien tant que l'adresse reste ouverte : c'est ICI que le menu caché
  // devient une page réellement fermée. Hors école durcie, `allowsPage` rend true
  // sans rien examiner — les autres établissements gardent leurs routes intactes.
  if (!strict.allowsPage(pathname)) {
    return <Navigate to={homeForRole(role)} replace />;
  }

  // Accès via un rôle de GOUVERNANCE (additif, dérivé du catalogue) : un porteur
  // de rôle habilité accède aux pages ouvertes par ce rôle (budgets, dépenses,
  // tableau du groupe…) même si son rôle de base n'est pas dans `allow`. Le
  // filtrage FIN (secteur, actions) reste dans les pages + RLS.
  const govPages = effectivePages(role, catalogOrDefault(governanceCatalog), governanceAssignments);
  if (govPages.has(pathname) || [...govPages].some((p) => pathname.startsWith(p + '/'))) return children;

  // Compte délégué : les permissions granulaires font autorité.
  if (permissions && permissions.length) {
    if (!isPathPermitted(pathname, permissions)) {
      return <Navigate to={firstPermitted(permissions)} replace />;
    }
    return children;
  }

  // Garde historique par rôle.
  if (allow && !allow.includes(role)) {
    return <Navigate to={homeForRole(role)} replace />;
  }

  return children;
}
