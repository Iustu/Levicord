import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, AlertTriangle, Monitor, MonitorOff, Sliders } from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import type { ScreenShareResolution, ScreenShareFps } from '../lib/screenShare';
import { useChatStore } from '../stores/useChatStore';
import { ScreenShareModal } from './ScreenShareModal';
import './WebRTCGrid.css';

function VideoPlayer({
  stream,
  muted = false,
  label,
  isSpeaking = false,
  showAvatarOverlay = false,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  isSpeaking?: boolean;
  /** Tarefa 1.3 — mostrar overlay de avatar quando câmera está desligada */
  showAvatarOverlay?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-container ${isSpeaking ? 'speaking' : ''}`}>
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      {/* Tarefa 1.3 — overlay de avatar quando sem vídeo ativo */}
      {showAvatarOverlay && (
        <div className="video-avatar-overlay" aria-hidden="true">
          <div className="video-avatar-icon">
            {label.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div className="video-label">
        {isSpeaking && <span className="speaking-badge" aria-label="Falando" />}
        {label}
      </div>
    </div>
  );
}

export function WebRTCGrid({ channelId, onDisconnect }: { channelId: string, onDisconnect: () => void }) {
  const {
    localStream,
    remoteStreams,
    isMuted,
    isVideoOff,
    isScreenSharing,
    screenSharerSocketId,
    screenShareResolution,
    screenShareFps,
    toggleMute,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    changeScreenShareQuality,
    error,
  } = useWebRTC(channelId, true);

  const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
  const users = useChatStore(state => state.users);

  if (error) {
    return (
      <div className="webrtc-wrapper error-state">
        <AlertTriangle size={48} className="error-icon" />
        <h3>Falha no WebRTC</h3>
        <p>{error}</p>
        <button className="btn-retry" onClick={onDisconnect}>Voltar</button>
      </div>
    );
  }

  // Tarefa 1.3 — câmera local ativa se stream tem faixa de vídeo habilitada
  const localVideoActive = !!(
    localStream?.getVideoTracks?.()?.some(t => t.enabled)
  );

  const handleScreenShareClick = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      setIsScreenShareModalOpen(true);
    }
  };

  const handleConfirmScreenShare = (options: { resolution: ScreenShareResolution; fps: ScreenShareFps }) => {
    if (isScreenSharing) {
      changeScreenShareQuality(options.resolution, options.fps);
    } else {
      startScreenShare(options);
    }
  };

  return (
    <div className="webrtc-wrapper">
      {/* Tarefa 2.4 — Spotlight da tela partilhada (acima do grid de câmeras) */}
      {screenSharerSocketId && remoteStreams[screenSharerSocketId] && (
        <div className="screen-share-spotlight">
          <VideoPlayer
            stream={remoteStreams[screenSharerSocketId].stream}
            label={`${users.find(u => u.id === remoteStreams[screenSharerSocketId].userId)?.displayName ?? 'Usuário'} — Tela`}
          />
        </div>
      )}

      <div className="webrtc-grid">
        <VideoPlayer
          stream={localStream}
          muted={true}
          label="Você"
          isSpeaking={!isMuted && !!localStream}
          showAvatarOverlay={!localVideoActive}
        />
        
        {Object.entries(remoteStreams).map(([socketId, data]) => {
          const user = users.find(u => u.id === data.userId);
          const label = user ? user.displayName : 'Usuário';
          const remoteVideoActive = !!(data.stream?.getVideoTracks?.()?.some(t => t.enabled));
          return (
            <VideoPlayer
              key={socketId}
              stream={data.stream}
              label={label}
              showAvatarOverlay={!remoteVideoActive}
            />
          );
        })}
      </div>

      <div className="webrtc-controls">
        <button
          className={`control-btn ${isMuted ? 'danger' : ''}`}
          onClick={toggleMute}
          aria-label={isMuted ? 'Ativar Microfone' : 'Mutar Microfone'}
          title={isMuted ? 'Ativar Microfone' : 'Mutar Microfone'}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button
          className={`control-btn ${isVideoOff ? 'danger' : ''}`}
          onClick={toggleVideo}
          aria-label={isVideoOff ? 'Ligar Câmera' : 'Desligar Câmera'}
          title={isVideoOff ? 'Ligar Câmera' : 'Desligar Câmera'}
        >
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>

        {/* Tarefa 2.4 — Botão de screen share */}
        <button
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          onClick={handleScreenShareClick}
          aria-label={isScreenSharing ? 'Parar Partilha de Tela' : 'Partilhar Tela'}
          title={isScreenSharing ? 'Parar Partilha de Tela' : 'Partilhar Tela'}
        >
          {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
        </button>

        {/* Indicador / Ajuste de qualidade para transmissão ativa */}
        {isScreenSharing && (
          <button
            className="control-btn screen-quality-btn"
            onClick={() => setIsScreenShareModalOpen(true)}
            aria-label="Configurar Qualidade da Transmissão"
            title={`Qualidade: ${screenShareResolution} @ ${screenShareFps} FPS (Clique para alterar)`}
          >
            <Sliders size={16} />
            <span className="quality-pill-badge">{screenShareResolution}</span>
          </button>
        )}

        <button
          className="control-btn disconnect"
          onClick={onDisconnect}
          aria-label="Desconectar"
          title="Desconectar"
        >
          <PhoneOff size={20} />
        </button>
      </div>

      <ScreenShareModal
        isOpen={isScreenShareModalOpen}
        onClose={() => setIsScreenShareModalOpen(false)}
        onConfirm={handleConfirmScreenShare}
        initialResolution={screenShareResolution}
        initialFps={screenShareFps}
        isLive={isScreenSharing}
      />
    </div>
  );
}
