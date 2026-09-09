import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';

export default function Login() {
  const { loginWithGoogle } = useAuth();

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#36393f', color: 'white' }}>
      <div style={{ padding: '40px', backgroundColor: '#2f3136', borderRadius: '8px', textAlign: 'center' }}>
        <h2>Welcome Back</h2>
        <p>Login to continue</p>
        <Button onClick={loginWithGoogle} style={{ marginTop: '20px' }}>
          Login with Google
        </Button>
      </div>
    </div>
  );
}
