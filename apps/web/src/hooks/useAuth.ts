import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE } from '../lib/api';

export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/auth/session`, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('Unauthenticated');
        return response.json();
      })
      .then((data) => {
        if (!cancelled && data.authenticated) setToken('authenticated');
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
  }, [location, navigate]);

  const loginWithGoogle = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const logout = () => {
    void fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setToken(null);
    navigate('/', { replace: true });
  };

  return { token, isLoading, loginWithGoogle, logout };
}
