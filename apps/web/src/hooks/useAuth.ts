import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  useEffect(() => {
    // If returning from Google OAuth, the token might be in the URL
    const searchParams = new URLSearchParams(location.search);
    const urlToken = searchParams.get('token');

    if (urlToken) {
      localStorage.setItem('token', urlToken);
      setToken(urlToken);
      
      // Clean up the URL so the token doesn't stay there
      navigate('/profile-setup', { replace: true });
    }
  }, [location, navigate]);

  const loginWithGoogle = () => {
    window.location.href = 'http://localhost:3000/api/auth/google';
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    navigate('/', { replace: true });
  };

  return { token, loginWithGoogle, logout };
}
