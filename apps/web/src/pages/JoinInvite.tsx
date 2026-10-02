import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import './Auth.css';

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
    <div className="auth-container">
      <div className="auth-ambient-glow" />
      <div className="auth-ambient-glow-secondary" />

      <div className="auth-card" style={{ maxWidth: '400px' }}>
        <div className="auth-redirect-box">
          <div className="auth-spinner" />
          <h2 className="auth-title" style={{ textAlign: 'center', marginBottom: '8px' }}>
            Entrando no servidor...
          </h2>
          <p className="auth-subtitle" style={{ textAlign: 'center' }}>
            Você será redirecionado em instantes.
          </p>
        </div>
      </div>
    </div>
  );
}

