import { useState } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { WebRTCGrid } from './WebRTCGrid';

interface VoiceScreenProps {
  channelName: string;
  channelId: string;
  isInCall: boolean;
  onJoin: () => void;
  onDisconnect: () => void;
  isSuperAdmin?: boolean;
  isServerChannel?: boolean;
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
  onJoin,
  onDisconnect,
  isSuperAdmin,
  isServerChannel,
}: VoiceScreenProps) {
  // (DMMT Cap.1) Show connecting state during WebRTC negotiation (getUserMedia
  // + ICE candidate exchange can take 2–5s). Without feedback the user cannot
  // tell whether their click registered.
  const [isConnecting, setIsConnecting] = useState(false);

  const isRestrictedForSuperAdmin = Boolean(isSuperAdmin && isServerChannel);

  const handleJoin = () => {
    if (isRestrictedForSuperAdmin) return;
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
      {isRestrictedForSuperAdmin ? (
        <>
          <p style={{ color: '#94a3b8', maxWidth: '440px', margin: '0 auto 16px auto', lineHeight: '1.5', fontSize: '14px' }}>
            SuperAdmins possuem acesso de moderação (visualizar/excluir mensagens e gerenciar membros), mas <strong>não têm permissão para entrar em canais de voz</strong> de servidores.
          </p>
          <button
            className="btn-join-voice"
            disabled={true}
            style={{ opacity: 0.5, cursor: 'not-allowed', backgroundColor: '#3f4248' }}
            title="SuperAdmins não podem entrar em canais de voz"
          >
            Entrada não permitida para SuperAdmin
          </button>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
