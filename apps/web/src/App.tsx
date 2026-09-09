import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';
import { useAuth } from './hooks/useAuth';

const MainApp = () => (
  <div style={{ color: 'white', padding: '20px' }}>
    Main Application View
  </div>
);

const AuthCallback = () => {
  useAuth(); // The hook handles extracting token and redirecting
  return <div style={{ color: 'white', padding: '20px' }}>Logging in...</div>;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/setup" element={<ProfileSetup />} />
        <Route path="/app" element={<MainApp />} />
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
