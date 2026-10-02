import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UserRole } from '@discord-clone/shared';
import { API_BASE } from '../lib/api';
import { useChatStore } from '../stores/useChatStore';

export interface SessionUser {
  id: string;
  sub?: string;
  email?: string;
  displayName: string;
  avatarUrl?: string | null;
  role?: UserRole;
}

/**
 * Hook responsible solely for managing the current authenticated session state.
 *
 * Separates session fetching, storage synchronization, and unauthorized event handling
 * from routing and OAuth redirect logic (SRP — Engenharia de Software Moderna Cap. 5).
 */
export function useSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const setCurrentUserId = useChatStore((state) => state.setCurrentUserId);
  const setCurrentUser = useChatStore((state) => state.setCurrentUser);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/auth/session`, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('Unauthenticated');
        return response.json() as Promise<{
          authenticated: boolean;
          user?: SessionUser;
        }>;
      })
      .then((data) => {
        if (!cancelled && data.authenticated && data.user) {
          setToken('authenticated');
          const uid = data.user.sub || data.user.id;
          setCurrentUserId(uid);
          setCurrentUser({
            id: uid,
            email: data.user.email,
            displayName: data.user.displayName,
            avatarUrl: data.user.avatarUrl,
            role: data.user.role,
          });
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
  }, [location.pathname, navigate, setCurrentUserId, setCurrentUser]);

  return { token, setToken, isLoading };
}
