import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { apiFetch } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

export default function ProfileSetup() {
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { token } = useAuth();

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
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#36393f', color: 'white' }}>
      <form onSubmit={handleSave} style={{ padding: '40px', backgroundColor: '#2f3136', borderRadius: '8px', textAlign: 'center', width: '300px' }}>
        <h2>Complete your profile</h2>
        
        <div style={{ marginTop: '20px', marginBottom: '20px' }}>
          <Input 
            label="DISPLAY NAME"
            type="text" 
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={32}
            required
          />
        </div>

        {error && <p role="alert" style={{ color: '#ff8a8a', marginBottom: '16px' }}>{error}</p>}

        <Button type="submit" disabled={isSaving} style={{ width: '100%' }}>
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </form>
    </div>
  );
}
