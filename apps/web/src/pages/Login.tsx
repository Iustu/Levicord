import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Compass, ShieldCheck, Zap, MessageSquare } from 'lucide-react';
import './Auth.css';

/**
 * Login page — entry point for unauthenticated users.
 * Clean, left-aligned, ergonomic layout tailored for 1080p desktop displays.
 */
export default function Login() {
  const { loginWithGoogle } = useAuth();
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite') || params.get('code');
    if (invite) {
      const clean = invite.trim();
      sessionStorage.setItem('pending_invite_code', clean);
      setInviteCode(clean);
    } else {
      const stored = sessionStorage.getItem('pending_invite_code');
      if (stored) setInviteCode(stored);
    }
  }, []);

  return (
    <div className="auth-container">
      <div className="auth-ambient-glow" aria-hidden="true" />
      <div className="auth-ambient-glow-secondary" aria-hidden="true" />

      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-badge">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
              <circle cx="8" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="16" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="auth-title">
              Bem-vindo ao Levicord
            </h1>
            <p className="auth-subtitle">
              Chat seguro e moderno para sua equipe
            </p>
          </div>
        </div>

        <p className="auth-description">
          Faça login com a sua conta Google para continuar para os seus canais e servidores.
        </p>

        <div className="auth-feature-tags" aria-hidden="true">
          <span className="auth-tag">
            <MessageSquare size={13} color="#5865f2" /> Canais & DMs
          </span>
          <span className="auth-tag">
            <Zap size={13} color="#23a55a" /> Voz & Vídeo HD
          </span>
          <span className="auth-tag">
            <ShieldCheck size={13} color="#f0b232" /> Acesso Seguro
          </span>
        </div>

        {inviteCode && (
          <div className="auth-invite-banner">
            <Compass size={18} color="#5865f2" style={{ flexShrink: 0 }} />
            <div>
              <strong>Convite detectado:</strong> Você entrará no servidor automaticamente após autenticar com o Google.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={loginWithGoogle}
          className="auth-google-btn"
          aria-label="Entrar com Google"
        >
          <svg className="google-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Entrar com Google</span>
        </button>
      </div>
    </div>
  );
}

