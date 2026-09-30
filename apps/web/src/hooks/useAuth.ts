import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE } from '../lib/api';
import { useChatStore } from '../stores/useChatStore';

export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const setCurrentUserId = useChatStore((state) => state.setCurrentUserId);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/auth/session`, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('Unauthenticated');
        return response.json() as Promise<{ authenticated: boolean; user?: { sub: string } }>;
      })
      .then((data) => {
        if (!cancelled && data.authenticated) {
          setToken('authenticated');
          // Populate the store with the authenticated user's ID so
          // other hooks (e.g. useSocketListeners) can resolve "who am I?"
          // without fragile JWT decode.
          if (data.user?.sub) setCurrentUserId(data.user.sub);
        }
      })
      .catch(() => {
        if (!cancelled) setToken(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const handleUnauthorized = () => {
      setToken(null);
      navigate('/login', { replace: true });
    };

    window.addEventListener('auth_unauthorized', handleUnauthorized);

    return () => {
      cancelled = true;
      window.removeEventListener('auth_unauthorized', handleUnauthorized);
    };
  }, [location, navigate, setCurrentUserId]);

  const loginWithGoogle = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  // (Item 3.1) logout now awaits the request and shows a toast on network failure.
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
