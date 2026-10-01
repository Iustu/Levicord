import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../lib/api';
import { useSession } from './useSession';

/**
 * Hook responsible for authentication navigation and user actions (login / logout).
 *
 * Delegates stateful session lifecycle to `useSession` (SRP — ESM Cap. 5).
 */
export function useAuth() {
  const navigate = useNavigate();
  const { token, setToken, isLoading } = useSession();

  const loginWithGoogle = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const logout = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Logout failed');
    } catch {
      window.dispatchEvent(new CustomEvent('toast_error', { detail: 'Falha ao encerrar sessão. Tente novamente.' }));
      return; // abort — keep user logged in since server cookie was not cleared
    }
    setToken(null);
    navigate('/', { replace: true });
  };

  return { token, isLoading, loginWithGoogle, logout };
}
