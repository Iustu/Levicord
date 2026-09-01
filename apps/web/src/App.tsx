import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ProfileSetup from './pages/ProfileSetup';

// Temporary placeholder for the main app
const MainApp = () => (
  <div style={{ color: 'white', padding: '20px' }}>
    Main Application View
  </div>
);

// Auth callback handler
const AuthCallback = () => {
  // Here we would extract the token from URL, save to Zustand/localStorage, and redirect
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    localStorage.setItem('token', token);
    return <Navigate to="/setup" />;
  }
  return <Navigate to="/login" />;
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
