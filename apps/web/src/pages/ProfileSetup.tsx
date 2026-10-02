import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Avatar } from '../components/Avatar';
import { apiFetch, API_BASE } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export default function ProfileSetup() {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/session`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.displayName) {
          setDisplayName(data.user.displayName);
        }
        if (data?.user?.avatarUrl) {
          setAvatarUrl(data.user.avatarUrl);
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || displayName.trim().length < 2) {
      setError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await apiFetch('/api/auth/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      navigate('/app');
    } catch {
      setError('Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-ambient-glow" aria-hidden="true" />
      <div className="auth-ambient-glow-secondary" aria-hidden="true" />

      <form onSubmit={handleSave} className="auth-card">
        <h2 className="auth-title" style={{ marginBottom: '6px' }}>
          Configurar Perfil
        </h2>
        <p className="auth-subtitle" style={{ marginBottom: '24px' }}>
          Defina seu nome de exibição para começar no Levicord.
        </p>

        <div className="profile-avatar-row">
          <Avatar src={avatarUrl} name={displayName || 'Incógnita'} size={64} />
          <div>
            <span className="profile-avatar-label">
              Foto de perfil
            </span>
            <span className="profile-avatar-hint">
              Você pode personalizá-la depois nas configurações.
            </span>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Input
            label="NOME DE EXIBIÇÃO"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={32}
            placeholder="Como quer ser chamado?"
            required
          />
        </div>

        {error && (
          <p role="alert" style={{ color: '#f23f43', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isSaving || displayName.trim().length < 2}
          style={{ width: '100%', padding: '14px', fontSize: '15px', borderRadius: '8px', fontWeight: 600 }}
        >
          {isSaving ? 'Salvando...' : 'Salvar e Continuar'}
        </Button>
      </form>
    </div>
  );
}

