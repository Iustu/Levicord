import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Wraps a route so only authenticated users can access it.
 * Redirects to /login if the user is not authenticated.
 *
 * Usage:
 *   <Route path="/setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
 *
 * (DMMT Cap.6 — Navigation should be predictable; unauthenticated users
 * should never reach internal pages. Failing silently causes confusion.)
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();

  // While auth state is resolving, render nothing to avoid a flash of the
  // protected page before the redirect fires.
  if (isLoading) return null;

  if (!token) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
