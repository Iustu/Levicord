import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

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
          <Input 
            label="DISPLAY NAME"
            type="text" 
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <Button onClick={handleSave} style={{ width: '100%' }}>
          Save & Continue
        </Button>
      </div>
    </div>
  );
}
