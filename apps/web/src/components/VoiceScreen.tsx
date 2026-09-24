import { Volume2 } from 'lucide-react';
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
  if (isInCall) {
    return <WebRTCGrid channelId={channelId} onDisconnect={onDisconnect} />;
  }

  return (
    <div className="voice-join-screen">
      <Volume2 size={64} className="voice-join-icon" aria-hidden="true" />
      <h3>{channelName}</h3>
      <p>Canal de Voz — clique para entrar na chamada.</p>
      <button className="btn-join-voice" onClick={onJoin}>
        Entrar na Chamada
      </button>
    </div>
  );
}
