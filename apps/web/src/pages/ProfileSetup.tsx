import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProfileSetup() {
  const [displayName, setDisplayName] = useState('');
  const navigate = useNavigate();

  const handleSave = () => {
    // Save to API
    navigate('/app');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#36393f', color: 'white' }}>
      <div style={{ padding: '40px', backgroundColor: '#2f3136', borderRadius: '8px', textAlign: 'center', width: '300px' }}>
        <h2>Complete your profile</h2>
        
        <div style={{ marginTop: '20px', marginBottom: '20px' }}>
          <label style={{ display: 'block', textAlign: 'left', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#b9bbbe' }}>DISPLAY NAME</label>
          <input 
            type="text" 
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: '100%', padding: '10px', backgroundColor: '#202225', color: 'white', border: 'none', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>

        <button 
          onClick={handleSave}
          style={{ width: '100%', padding: '10px', fontSize: '16px', backgroundColor: '#5865F2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Save & Continue
        </button>
      </div>
    </div>
  );
}
