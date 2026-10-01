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
    <div style={{ display: 'flex', height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e1f22', color: 'white' }}>
      <form onSubmit={handleSave} style={{ padding: '36px', backgroundColor: '#2b2d31', borderRadius: '10px', textAlign: 'center', width: '340px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px' }}>Bem-vindo ao Levicord</h2>
        <p style={{ fontSize: '13px', color: '#949ba4', marginBottom: '20px' }}>
          Defina seu nome de exibição para começar
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
          <Avatar src={avatarUrl} name={displayName || 'Incógnita'} size={72} />
          <span style={{ fontSize: '12px', color: '#949ba4', marginTop: '8px' }}>
            Foto incógnita (você pode trocá-la no app)
          </span>
        </div>

        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
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

        {error && <p role="alert" style={{ color: '#f23f43', fontSize: '13px', marginBottom: '16px' }}>{error}</p>}

        <Button type="submit" disabled={isSaving || displayName.trim().length < 2} style={{ width: '100%', padding: '12px' }}>
          {isSaving ? 'Salvando...' : 'Salvar e Continuar'}
        </Button>
      </form>
    </div>
  );
}
