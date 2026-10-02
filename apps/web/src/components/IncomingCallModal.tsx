import React from 'react';
import { PhoneCall, PhoneOff, Video, Phone } from 'lucide-react';
import { Avatar } from './Avatar';
import type { IncomingCall } from '../stores/useChatStore';
import './IncomingCallModal.css';

interface IncomingCallModalProps {
  incomingCall: IncomingCall;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  incomingCall,
  onAccept,
  onReject,
}) => {
  const { caller, isVideo } = incomingCall;

  return (
    <div className="incoming-call-overlay" role="dialog" aria-modal="true" aria-label="Chamada recebida">
      <div className="incoming-call-card">
        <div className="incoming-call-avatar-wrapper">
          <div className="incoming-call-avatar-pulse" />
          <Avatar
            src={caller.avatarUrl}
            name={caller.displayName}
            size={68}
            className="incoming-call-avatar"
          />
        </div>

        <div className="incoming-call-info">
          <h4>{caller.displayName}</h4>
          <div className="incoming-call-subtitle">
            {isVideo ? <Video size={14} /> : <Phone size={14} />}
            <span>Chamada de {isVideo ? 'vídeo' : 'voz'} a receber...</span>
          </div>
        </div>

        <div className="incoming-call-actions">
          <button
            type="button"
            className="incoming-call-btn reject"
            onClick={onReject}
            aria-label="Recusar chamada"
          >
            <PhoneOff size={18} />
            <span>Recusar</span>
          </button>

          <button
            type="button"
            className="incoming-call-btn accept"
            onClick={onAccept}
            aria-label="Atender chamada"
          >
            <PhoneCall size={18} />
            <span>Atender</span>
          </button>
        </div>
      </div>
    </div>
  );
};
