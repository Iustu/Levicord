import React from 'react';
import { PhoneOff } from 'lucide-react';
import { Avatar } from './Avatar';
import type { User } from '@discord-clone/shared';
import './DmCallingScreen.css';

interface DmCallingScreenProps {
  targetUser: User;
  isVideo?: boolean;
  onCancel: () => void;
}

export const DmCallingScreen: React.FC<DmCallingScreenProps> = ({
  targetUser,
  isVideo,
  onCancel,
}) => {
  return (
    <div className="dm-calling-screen" role="region" aria-label="A chamar">
      <div className="dm-calling-avatar-box">
        <div className="dm-calling-ripple" />
        <div className="dm-calling-ripple delay" />
        <Avatar
          src={targetUser.avatarUrl}
          name={targetUser.displayName}
          size={84}
          className="dm-calling-avatar"
        />
      </div>

      <div className="dm-calling-status">
        <h3>A chamar @{targetUser.displayName}...</h3>
        <p>Aguardando resposta para chamada de {isVideo ? 'vídeo' : 'voz'}</p>
      </div>

      <button
        type="button"
        className="dm-calling-cancel-btn"
        onClick={onCancel}
        aria-label="Cancelar chamada"
      >
        <PhoneOff size={18} />
        <span>Cancelar chamada</span>
      </button>
    </div>
  );
};
