import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

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
 *  - si `allow` est fourni, vérifie que le rôle courant y figure, sinon
 *    redirige vers la page d'accueil du rôle (garde de route par rôle).
 */
export default function ProtectedRoute({ children, allow }) {
  const { session, loading, role } = useAuthStore();

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
  if (allow && role !== 'superadmin' && !allow.includes(role)) {
    return <Navigate to={homeForRole(role)} replace />;
  }

  return children;
}
