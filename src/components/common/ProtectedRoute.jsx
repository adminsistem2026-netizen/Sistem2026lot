import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 text-sm">Cargando...</div>
      </div>
    );
  }

  if (!user || !profile) return <Navigate to="/login" replace />;
  if (!profile.is_active) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(profile.role)) return <Navigate to="/login" replace />;

  return children;
}
