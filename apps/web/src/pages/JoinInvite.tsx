import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

/**
 * Direct invite link handler (/join/:code or /invite/:code).
 * Stores the invite code in sessionStorage and routes the user:
 * - If authenticated: redirects to /app, where MainApp joins the server and activates it.
 * - If unauthenticated: redirects to /login with the invite code for post-login joining.
 */
export default function JoinInvite() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { token, isLoading } = useSession();

  useEffect(() => {
    if (isLoading) return;

    if (!code) {
      navigate('/login', { replace: true });
      return;
    }

    const clean = code.trim();
    sessionStorage.setItem('pending_invite_code', clean);

    if (token) {
      navigate('/app', { replace: true });
    } else {
      navigate(`/login?invite=${encodeURIComponent(clean)}`, { replace: true });
    }
  }, [code, token, isLoading, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e1f22',
        color: '#f2f3f5',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Entrando no servidor...
        </p>
        <p style={{ fontSize: '14px', color: '#949ba4' }}>
          Você será redirecionado em instantes.
        </p>
      </div>
    </div>
  );
}
