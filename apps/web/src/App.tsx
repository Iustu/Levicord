import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';

const Login = lazy(() => import('./pages/Login'));
const ProfileSetup = lazy(() => import('./pages/ProfileSetup'));
const MainApp = lazy(() => import('./pages/MainApp'));
const JoinInvite = lazy(() => import('./pages/JoinInvite'));

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
        <Suspense
          fallback={
            <div
              role="status"
              aria-live="polite"
              style={{
                display: 'flex',
                height: '100vh',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#1e1f22',
                color: '#f2f3f5',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid rgba(255, 255, 255, 0.1)',
                  borderTopColor: '#5865F2',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
          }
        >
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/join/:code" element={<JoinInvite />} />
            <Route path="/invite/:code" element={<JoinInvite />} />
            <Route path="/setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
            <Route path="/app" element={<ProtectedRoute><MainApp /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
