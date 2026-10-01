import { useState } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { WebRTCGrid } from './WebRTCGrid';

interface VoiceScreenProps {
  channelName: string;
  channelId: string;
  isInCall: boolean;
  onJoin: () => void;
  onDisconnect: () => void;
}

/**
 * Tela de canal de voz — apresenta o convite para entrar ou o grid WebRTC ativo.
 * Extracted from MainApp to enforce SRP.
 * (Engenharia de Software — SRP, Component extraction)
 */
export function VoiceScreen({ channelName, channelId, isInCall, onJoin, onDisconnect }: VoiceScreenProps) {
  // (DMMT Cap.1) Show connecting state during WebRTC negotiation (getUserMedia
  // + ICE candidate exchange can take 2–5s). Without feedback the user cannot
  // tell whether their click registered.
  const [isConnecting, setIsConnecting] = useState(false);

  const handleJoin = () => {
    setIsConnecting(true);
    onJoin();
    // Reset after a generous timeout in case the parent doesn't update isInCall
    setTimeout(() => setIsConnecting(false), 8000);
  };

  if (isInCall) {
    return <WebRTCGrid channelId={channelId} onDisconnect={onDisconnect} />;
  }

  return (
    <div className="voice-join-screen">
      <Volume2 size={64} className="voice-join-icon" aria-hidden="true" />
      <h3>{channelName}</h3>
      <p>Canal de Voz — clique para entrar na chamada.</p>
      <button
        className="btn-join-voice"
        onClick={handleJoin}
        disabled={isConnecting}
        aria-busy={isConnecting}
      >
        {isConnecting ? (
          <>
            <Loader2 size={16} className="spin" aria-hidden="true" />
            &nbsp;Conectando...
          </>
        ) : (
          'Entrar na Chamada'
        )}
      </button>
    </div>
  );
}
