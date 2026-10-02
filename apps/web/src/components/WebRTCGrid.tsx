import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  AlertTriangle,
  Monitor,
  MonitorOff,
  Sliders,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useWebRTC } from '../hooks/useWebRTC';
import type { ScreenShareResolution, ScreenShareFps } from '../lib/screenShare';
import { useChatStore } from '../stores/useChatStore';
import { ScreenShareModal } from './ScreenShareModal';
import './WebRTCGrid.css';

// OPT-08: React.memo evita re-render desnecessário de VideoPlayer quando estado alheio muda no grid
const VideoPlayer = React.memo(function VideoPlayer({
  stream,
  muted = false,
  label,
  avatarUrl,
  avatarInitial,
  isSpeaking = false,
  showAvatarOverlay = false,
  streamVersion,
  className = '',
}: {
  stream: MediaStream | null;
  muted?: boolean;
  label: string;
  avatarUrl?: string | null;
  avatarInitial?: string;
  isSpeaking?: boolean;
  /** Tarefa 1.3 — overlay de avatar quando câmera está desligada */
  showAvatarOverlay?: boolean;
  streamVersion?: number;
  className?: string;
}) {
  void streamVersion;
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
    }
    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [stream]);

  const initial = avatarInitial || (label ? label.charAt(0).toUpperCase() : '?');

  return (
    <div className={`video-container ${isSpeaking ? 'speaking' : ''} ${className}`}>
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      {/* Tarefa 1.3 — overlay de avatar quando sem vídeo ativo */}
      {showAvatarOverlay && (
        <div className="video-avatar-overlay" aria-hidden="true">
          {avatarUrl ? (
            <img src={avatarUrl} alt={label} className="video-avatar-img" />
          ) : (
            <div className="video-avatar-icon">
              {initial}
            </div>
          )}
        </div>
      )}
      <div className="video-label">
        {isSpeaking && <span className="speaking-badge" aria-label="Falando" />}
        <span>{label}</span>
      </div>
    </div>
  );
});

export function WebRTCGrid({ channelId, onDisconnect }: { channelId: string, onDisconnect: () => void }) {
  const {
    localStream,
    localStreamVersion,
    localScreenStream,
    remoteStreams,
    remoteScreenStreams,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageWrapperRef = useRef<HTMLDivElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  const users = useChatStore(state => state.users);
  const activeServer = useChatStore(state => state.activeServer);
  const currentUser = useChatStore(state => state.currentUser);

  // Mapa consolidado de usuários por ID (DMs + membros do servidor ativo + usuário logado)
  const userMap = useMemo(() => {
    const map: Record<string, { displayName: string; avatarUrl?: string | null }> = {};

    for (const u of users) {
      if (u.id) map[u.id] = { displayName: u.displayName, avatarUrl: u.avatarUrl };
    }

    if (activeServer?.members) {
      for (const m of activeServer.members) {
        if (m.userId && m.user) {
          map[m.userId] = { displayName: m.user.displayName, avatarUrl: m.user.avatarUrl };
        }
      }
    }

    if (currentUser?.id) {
      map[currentUser.id] = { displayName: currentUser.displayName, avatarUrl: currentUser.avatarUrl };
    }

    return map;
  }, [users, activeServer?.members, currentUser]);

  const localDisplayName = currentUser?.displayName || 'Você';
  const localLabel = currentUser?.displayName ? `${currentUser.displayName} (Você)` : 'Você';
  const localInitial = localDisplayName.charAt(0).toUpperCase();

  const localVideoActive = useMemo(
    () => !isVideoOff && !!(localStream?.getVideoTracks?.()?.some(t => t.enabled)),
    [localStream, isVideoOff]
  );

  // Identifica transmissão de tela ativa (seja local ou remota)
  const activeScreenStream = useMemo(() => {
    if (isScreenSharing && localScreenStream) {
      return localScreenStream;
    }
    if (screenSharerSocketId) {
      if (remoteScreenStreams?.[screenSharerSocketId]) {
        return remoteScreenStreams[screenSharerSocketId];
      }
      if (remoteStreams[screenSharerSocketId]?.stream) {
        return remoteStreams[screenSharerSocketId].stream;
      }
    }
    return null;
  }, [isScreenSharing, localScreenStream, screenSharerSocketId, remoteScreenStreams, remoteStreams]);

  const isLocalScreenShare = isScreenSharing && activeScreenStream === localScreenStream;

  const screenSharerName = useMemo(() => {
    if (isLocalScreenShare) {
      return currentUser?.displayName || 'Você';
    }
    if (screenSharerSocketId && remoteStreams[screenSharerSocketId]) {
      const u = userMap[remoteStreams[screenSharerSocketId].userId];
      return u?.displayName || 'Usuário';
    }
    return 'Usuário';
  }, [isLocalScreenShare, currentUser?.displayName, screenSharerSocketId, remoteStreams, userMap]);

  const [stageVolume, setStageVolume] = useState(1);
  const [isStageMuted, setIsStageMuted] = useState(false);

  useEffect(() => {
    const videoEl = screenVideoRef.current;
    if (videoEl && activeScreenStream) {
      if (videoEl.srcObject !== activeScreenStream) {
        videoEl.srcObject = activeScreenStream;
      }
      videoEl.volume = stageVolume;
      videoEl.muted = isLocalScreenShare || isStageMuted;
      const playPromise = videoEl.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [activeScreenStream, isLocalScreenShare, stageVolume, isStageMuted]);

  const handleToggleFullscreen = () => {
    if (!stageWrapperRef.current) return;
    if (!document.fullscreenElement) {
      stageWrapperRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

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
    <div className={`webrtc-wrapper ${activeScreenStream ? 'with-theater-mode' : ''}`}>
      {activeScreenStream ? (
        <>
          {/* Palco Central Maximizado de Transmissão de Tela (Theater Stage) */}
          <div className="screen-share-stage" ref={stageWrapperRef}>
            <div className="stage-video-container">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted={isLocalScreenShare || isStageMuted}
                className="stage-video"
              />
              <div className="stage-overlay-top">
                <div className="stage-badge">
                  <Monitor size={16} />
                  <span className="stage-username">
                    {isLocalScreenShare ? 'Sua Transmissão' : `Transmissão de ${screenSharerName}`}
                  </span>
                  <span className="stage-live-badge">AO VIVO</span>
                </div>
                <div className="stage-actions-group">
                  {!isLocalScreenShare && (
                    <div className="stage-volume-control">
                      <button
                        className="stage-action-btn"
                        onClick={() => setIsStageMuted(m => !m)}
                        aria-label={isStageMuted || stageVolume === 0 ? 'Desmutar Transmissão' : 'Mutar Transmissão'}
                        title={isStageMuted || stageVolume === 0 ? 'Desmutar Transmissão' : 'Mutar Transmissão'}
                      >
                        {isStageMuted || stageVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isStageMuted ? 0 : stageVolume}
                        onChange={(e) => {
                          setStageVolume(Number(e.target.value));
                          if (isStageMuted) setIsStageMuted(false);
                        }}
                        className="stage-volume-slider"
                        aria-label="Volume da transmissão"
                        title={`Volume: ${Math.round((isStageMuted ? 0 : stageVolume) * 100)}%`}
                      />
                    </div>
                  )}
                  <button
                    className="stage-fullscreen-btn"
                    onClick={handleToggleFullscreen}
                    aria-label={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
                    title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
                  >
                    {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Faixa compacta de participantes (Participant Strip) */}
          <div className="participant-strip">
            <VideoPlayer
              stream={localStream}
              streamVersion={localStreamVersion}
              muted={true}
              label={localLabel}
              avatarInitial={localInitial}
              avatarUrl={currentUser?.avatarUrl}
              isSpeaking={!isMuted && !!localStream}
              showAvatarOverlay={!localVideoActive}
              className="strip-tile"
            />

            {Object.entries(remoteStreams).map(([socketId, data]) => {
              const user = userMap[data.userId];
              const label = user ? user.displayName : 'Usuário';
              const remoteVideoActive = !!(data.stream?.getVideoTracks?.()?.some(t => t.enabled));
              return (
                <VideoPlayer
                  key={socketId}
                  stream={data.stream}
                  label={label}
                  avatarInitial={label.charAt(0).toUpperCase()}
                  avatarUrl={user?.avatarUrl}
                  showAvatarOverlay={!remoteVideoActive}
                  className="strip-tile"
                />
              );
            })}
          </div>
        </>
      ) : (
        <div className="webrtc-grid">
          <VideoPlayer
            stream={localStream}
            streamVersion={localStreamVersion}
            muted={true}
            label={localLabel}
            avatarInitial={localInitial}
            avatarUrl={currentUser?.avatarUrl}
            isSpeaking={!isMuted && !!localStream}
            showAvatarOverlay={!localVideoActive}
          />
          
          {Object.entries(remoteStreams).map(([socketId, data]) => {
            const user = userMap[data.userId];
            const label = user ? user.displayName : 'Usuário';
            const remoteVideoActive = !!(data.stream?.getVideoTracks?.()?.some(t => t.enabled));
            return (
              <VideoPlayer
                key={socketId}
                stream={data.stream}
                label={label}
                avatarInitial={label.charAt(0).toUpperCase()}
                avatarUrl={user?.avatarUrl}
                showAvatarOverlay={!remoteVideoActive}
              />
            );
          })}
        </div>
      )}

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
