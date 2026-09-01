import { useEffect } from 'react';

export default function Login() {
  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:3000/api/auth/google';
  };

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#36393f', color: 'white' }}>
      <div style={{ padding: '40px', backgroundColor: '#2f3136', borderRadius: '8px', textAlign: 'center' }}>
        <h2>Welcome Back</h2>
        <p>Login to continue</p>
        <button 
          onClick={handleGoogleLogin}
          style={{ padding: '10px 20px', fontSize: '16px', backgroundColor: '#5865F2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '20px' }}
        >
          Login with Google
        </button>
      </div>
    </div>
  );
}
