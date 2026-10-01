import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';

import MainApp from './pages/MainApp';

/** Maps route paths to human-readable page titles for the browser tab. */
const PAGE_TITLES: Record<string, string> = {
  '/login': 'Entrar — Levicord',
  '/setup': 'Configurar Perfil — Levicord',
  '/app': 'Levicord',
  '/auth/callback': 'Entrando — Levicord',
};

/**
 * Updates document.title on every route change.
 * (DMMT Cap.6 \u2014 page names should be clear; screen readers announce the title
 * when focus moves to the page. Improves keyboard nav and tab context.)
 */
function DynamicTitle() {
  const location = useLocation();
  useEffect(() => {
    document.title = PAGE_TITLES[location.pathname] ?? 'Levicord';
  }, [location.pathname]);
  return null;
}

const AuthCallback = () => {
  useAuth(); // The hook handles extracting token and redirecting
  return <div style={{ color: 'white', padding: '20px' }}>Entrando...</div>;
};

function App() {
  return (
    <Router>
      {/*
        Skip link \u2014 (DMMT Cap.12 / WCAG 2.4.1)
        Keyboard users tab directly into content, bypassing the full sidebar.
        Visually hidden until focused, then appears at the top of the viewport.
      */}
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <DynamicTitle />
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/setup" element={<ProfileSetup />} />
          <Route path="/app" element={<MainApp />} />
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
