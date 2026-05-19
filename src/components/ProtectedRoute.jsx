import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/**
 * Wrapper qui protège une route : redirige vers /login si pas de session.
 */
export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuthStore();

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

  return children;
}
