import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { Compass } from 'lucide-react';

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
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1e1f22',
        color: '#f2f3f5',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          padding: '40px',
          backgroundColor: '#2b2d31',
          borderRadius: '12px',
          width: '420px',
          maxWidth: '92%',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(88, 101, 242, 0.35)',
              flexShrink: 0,
            }}
          >
            <svg
              width="24"
              height="24"
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
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#f2f3f5', textAlign: 'left' }}>
              Bem-vindo ao Levicord
            </h1>
            <p style={{ fontSize: '13px', color: '#949ba4', margin: '3px 0 0', textAlign: 'left' }}>
              Chat seguro e moderno para sua equipe
            </p>
          </div>
        </div>

        <p style={{ fontSize: '14px', color: '#dbdee1', lineHeight: '1.5', marginBottom: '24px', textAlign: 'left' }}>
          Faça login com a sua conta Google para continuar para os seus canais e servidores.
        </p>

        {inviteCode && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'rgba(88, 101, 242, 0.12)',
              border: '1px solid rgba(88, 101, 242, 0.4)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
              color: '#f2f3f5',
              fontSize: '13px',
              textAlign: 'left',
            }}
          >
            <Compass size={18} color="#5865f2" style={{ flexShrink: 0 }} />
            <div>
              <strong>Convite detectado:</strong> Você entrará no servidor automaticamente após autenticar com o Google.
            </div>
          </div>
        )}

        <Button
          onClick={loginWithGoogle}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '15px',
            borderRadius: '8px',
            fontWeight: 600,
          }}
        >
          Entrar com Google
        </Button>
      </div>
    </div>
  );
}
