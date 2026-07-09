import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { isPathPermitted, firstPermitted } from '../config/capabilities';

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
  const { pathname } = useLocation();

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
