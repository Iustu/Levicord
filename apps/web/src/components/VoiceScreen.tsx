import { useState } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { WebRTCGrid } from './WebRTCGrid';

interface VoiceScreenProps {
  channelName: string;
  channelId: string;
  isInCall?: boolean;
  connectedChannelName?: string | null;
  onJoin: () => void;
  onDisconnect?: () => void;
  isSuperAdmin?: boolean;
  isServerChannel?: boolean;
  isNonMember?: boolean;
}

/**
 * Tela de canal de voz — apresenta o convite para entrar ou o grid WebRTC ativo.
 * Extracted from MainApp to enforce SRP.
 * (Engenharia de Software — SRP, Component extraction)
 */
export function VoiceScreen({
  channelName,
  channelId,
  isInCall,
  connectedChannelName,
  onJoin,
  onDisconnect,
  isSuperAdmin,
  isServerChannel,
  isNonMember,
}: VoiceScreenProps) {
  // (DMMT Cap.1) Show connecting state during WebRTC negotiation (getUserMedia
  // + ICE candidate exchange can take 2–5s). Without feedback the user cannot
  // tell whether their click registered.
  const [isConnecting, setIsConnecting] = useState(false);

  const isRestricted = Boolean(isServerChannel && isNonMember);

  const handleJoin = () => {
    if (isRestricted) return;
    setIsConnecting(true);
    onJoin();
    // Reset after a generous timeout in case the parent doesn't update isInCall
    setTimeout(() => setIsConnecting(false), 8000);
  };

  if (isInCall) {
    return <WebRTCGrid channelId={channelId} onDisconnect={onDisconnect || (() => {})} />;
  }

  return (
    <div className="voice-join-screen">
      <Volume2 size={64} className="voice-join-icon" aria-hidden="true" />
      <h3>{channelName}</h3>
      {isRestricted ? (
        <>
          <p style={{ color: '#94a3b8', maxWidth: '440px', margin: '0 auto 16px auto', lineHeight: '1.5', fontSize: '14px' }}>
            {isSuperAdmin
              ? 'SuperAdmins em modo de moderação não podem entrar em canais de voz deste servidor a não ser que sejam membros (criadores ou convidados).'
              : 'Você precisa ser membro deste servidor para entrar em canais de voz.'}
          </p>
          <button
            className="btn-join-voice"
            disabled={true}
            style={{ opacity: 0.5, cursor: 'not-allowed', backgroundColor: '#3f4248' }}
            title="Apenas membros podem entrar em canais de voz"
          >
            Entrada permitida apenas para membros
          </button>
        </>
      ) : (
        <>
          <p>
            {connectedChannelName
              ? `Você está atualmente conectado em "${connectedChannelName}". Deseja mudar para este canal de voz?`
              : 'Canal de Voz — clique para entrar na chamada.'}
          </p>
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
            ) : connectedChannelName ? (
              'Mudar para este Canal'
            ) : (
              'Entrar na Chamada'
            )}
          </button>
        </>
      )}
    </div>
  );
}
