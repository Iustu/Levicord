import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';

/**
 * Login page — entry point for unauthenticated users.
 * All text is in Portuguese for consistency (DMMT Cap.1 — don't make users think).
 */
export default function Login() {
  const { loginWithGoogle } = useAuth();

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#36393f', color: 'white' }}>
      <div style={{ padding: '40px', backgroundColor: '#2f3136', borderRadius: '8px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 8px' }}>Bem-vindo de volta</h1>
        <p style={{ fontSize: '13px', color: '#72767d', margin: '4px 0 0' }}>Levicord — Chat seguro para sua equipe</p>
        <p style={{ marginTop: '12px' }}>Entre para continuar</p>
        <Button onClick={loginWithGoogle} style={{ marginTop: '20px' }}>
          Entrar com Google
        </Button>
      </div>
    </div>
  );
}
