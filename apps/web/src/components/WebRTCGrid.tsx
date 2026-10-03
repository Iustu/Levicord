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

// Singleton compartilhado de AudioContext para suporte a 8+ participantes sem estourar limite do browser
let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    try {
      sharedAudioCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }

  if (sharedAudioCtx.state === 'suspended') {
    const resume = () => {
      sharedAudioCtx?.resume().catch(() => {});
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
    sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

// OPT-08: React.memo evita re-render desnecessário de VideoPlayer quando estado alheio muda no grid
const VideoPlayer = React.memo(function VideoPlayer({
  stream,
  muted = false,
  volume = 1,
  participantVolume = 100,
  isParticipantMuted = false,
  onVolumeChange,
  onToggleMute,
  isLocal = false,
  isMicMuted = false,
  label,
  avatarUrl,
  avatarInitial,
  isSpeaking: externalIsSpeaking,
  showAvatarOverlay = false,
  streamVersion,
  className = '',
}: {
  stream: MediaStream | null;
  muted?: boolean;
  volume?: number;
  participantVolume?: number;
  isParticipantMuted?: boolean;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
  isLocal?: boolean;
  isMicMuted?: boolean;
  label: string;
  avatarUrl?: string | null;
  avatarInitial?: string;
  isSpeaking?: boolean;
  /** Tarefa 1.3 — overlay de avatar quando câmera está desligada */
  showAvatarOverlay?: boolean;
  streamVersion?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSliderPopup, setShowSliderPopup] = useState(false);
  const [internalIsSpeaking, setInternalIsSpeaking] = useState(false);
  const [trackVersion, setTrackVersion] = useState(0);

  // Escuta adição ou remoção de faixas de áudio/vídeo no MediaStream
  useEffect(() => {
    if (!stream) return;
    const handleTracks = () => setTrackVersion(v => v + 1);
    stream.addEventListener('addtrack', handleTracks);
    stream.addEventListener('removetrack', handleTracks);
    return () => {
      stream.removeEventListener('addtrack', handleTracks);
      stream.removeEventListener('removetrack', handleTracks);
    };
  }, [stream]);

  // VAD (Detecção de Atividade de Voz) em tempo real via Web Audio API
  useEffect(() => {
    const container = containerRef.current;

    // Se o microfone local estiver mutado ou sem stream
    if ((isLocal && isMicMuted) || !stream) {
      setInternalIsSpeaking(false);
      if (container) {
        container.style.setProperty('--voice-intensity', '0');
      }
      return;
    }

    const audioTracks = stream.getAudioTracks();
    const activeAudioTrack = audioTracks.find(t => t.enabled && t.readyState === 'live');
    if (!activeAudioTrack) {
      setInternalIsSpeaking(false);
      if (container) {
        container.style.setProperty('--voice-intensity', '0');
      }
      return;
    }

    const audioCtx = getSharedAudioContext();
    if (!audioCtx) return;

    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyserNode: AnalyserNode | null = null;
    let animationFrameId: number;
    let lastSpokeTime = 0;
    let currentIntensity = 0;
    let isCurrentlySpeaking = false;

    try {
      sourceNode = audioCtx.createMediaStreamSource(stream);
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 128; // 64 bins de frequência: baixo consumo de CPU (<0.01%)
      analyserNode.smoothingTimeConstant = 0.35; // Suavização dinâmica de espectro
      sourceNode.connect(analyserNode);
      // NUNCA conectar analyserNode ao audioCtx.destination (evita eco/duplicação)
    } catch (err) {
      console.warn('Erro ao inicializar analisador de áudio:', err);
      return;
    }

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkAudioActivity = () => {
      if (!analyserNode) return;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      analyserNode.getByteFrequencyData(dataArray);

      // Frequências fundamentais e formantes da voz humana (~150Hz a ~3500Hz nos bins 1 a 10)
      let voiceSum = 0;
      let binCount = 0;
      for (let i = 1; i <= 10 && i < bufferLength; i++) {
        voiceSum += dataArray[i];
        binCount++;
      }
      const voiceAvg = binCount > 0 ? voiceSum / binCount : 0;

      const SPEAKING_THRESHOLD = 14; // Limiar calibrado para filtrar ruído de fundo/fones
      const HANGOVER_MS = 280; // Suavização anti-flicker entre sílabas e palavras
      const now = performance.now();

      if (voiceAvg > SPEAKING_THRESHOLD) {
        lastSpokeTime = now;
        if (!isCurrentlySpeaking) {
          isCurrentlySpeaking = true;
          setInternalIsSpeaking(true);
        }

        // Normaliza a intensidade da fala: de 0.25 (fala mansa) até 1.0 (voz forte)
        const targetIntensity = Math.min(1, Math.max(0.25, (voiceAvg - SPEAKING_THRESHOLD) / 60));
        currentIntensity = currentIntensity * 0.7 + targetIntensity * 0.3;

        if (container) {
          container.style.setProperty('--voice-intensity', currentIntensity.toFixed(2));
        }
      } else {
        const elapsed = now - lastSpokeTime;
        if (elapsed < HANGOVER_MS) {
          // Mantém borda acesa durante pausas naturais na fala, decaindo suavemente
          currentIntensity = Math.max(0.1, currentIntensity * 0.88);
          if (container) {
            container.style.setProperty('--voice-intensity', currentIntensity.toFixed(2));
          }
        } else {
          if (isCurrentlySpeaking) {
            isCurrentlySpeaking = false;
            setInternalIsSpeaking(false);
          }
          currentIntensity = 0;
          if (container) {
            container.style.setProperty('--voice-intensity', '0');
          }
        }
      }

      animationFrameId = requestAnimationFrame(checkAudioActivity);
    };

    animationFrameId = requestAnimationFrame(checkAudioActivity);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch {}
      }
      if (analyserNode) {
        try {
          analyserNode.disconnect();
        } catch {}
      }
      if (container) {
        container.style.setProperty('--voice-intensity', '0');
      }
    };
  }, [stream, isLocal, isMicMuted, streamVersion, trackVersion]);

  const isSpeaking = externalIsSpeaking !== undefined ? externalIsSpeaking : internalIsSpeaking;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      const playPromise = videoEl.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Navegadores podem pausar até que haja interação inicial do usuário
        });
      }
    }
    return () => {
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [stream]);

  // Aplica o volume efetivo e o estado de mute no elemento de áudio/vídeo
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.volume = Math.max(0, Math.min(1, volume));
      videoEl.muted = muted;
    }
  }, [volume, muted]);

  const initial = avatarInitial || (label ? label.charAt(0).toUpperCase() : '?');

  return (
    <div
      ref={containerRef}
      className={`video-container ${isSpeaking ? 'speaking' : ''} ${className}`}
      onMouseEnter={() => setShowSliderPopup(true)}
      onMouseLeave={() => setShowSliderPopup(false)}
    >
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

      {/* Slider individual rápido sobre o tile do participante (para participantes remotos) */}
      {!isLocal && onVolumeChange && (
        <div
          className={`tile-volume-widget ${showSliderPopup ? 'visible' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={`tile-volume-trigger ${isParticipantMuted ? 'muted' : ''}`}
            onClick={onToggleMute}
            aria-label={isParticipantMuted ? `Desmutar ${label}` : `Mutar ${label}`}
            title={isParticipantMuted ? `Desmutar ${label}` : `Volume: ${participantVolume}% (Clique para mutar)`}
          >
            {isParticipantMuted || participantVolume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span className="tile-volume-number">{isParticipantMuted ? '0%' : `${participantVolume}%`}</span>
          </button>
          <div className="tile-volume-slider-box">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={isParticipantMuted ? 0 : participantVolume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="volume-slider-input mini"
              aria-label={`Volume de ${label}`}
            />
          </div>
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
    isNoiseSuppressionEnabled,
    toggleNoiseSuppression,
    isAutoGainControlEnabled,
    toggleAutoGainControl,
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

  // Estados de Volume Geral e Individual dos Participantes
  const [masterVolume, setMasterVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('levicord_master_volume');
      return saved !== null ? Number(saved) : 100;
    } catch {
      return 100;
    }
  });
  const [isMasterMuted, setIsMasterMuted] = useState(false);

  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('levicord_user_volumes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [userMuted, setUserMuted] = useState<Record<string, boolean>>({});

  const [isAudioMenuOpen, setIsAudioMenuOpen] = useState(false);
  const audioMenuRef = useRef<HTMLDivElement>(null);

  // Fecha menu de áudio ao clicar fora
  useEffect(() => {
    if (!isAudioMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setIsAudioMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAudioMenuOpen]);

  const handleMasterVolumeChange = (val: number) => {
    setMasterVolume(val);
    if (isMasterMuted) setIsMasterMuted(false);
    try {
      localStorage.setItem('levicord_master_volume', String(val));
    } catch {
      // ignore
    }
  };

  const handleUserVolumeChange = (userId: string, val: number) => {
    setUserVolumes(prev => {
      const updated = { ...prev, [userId]: val };
      try {
        localStorage.setItem('levicord_user_volumes', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    if (userMuted[userId]) {
      setUserMuted(prev => ({ ...prev, [userId]: false }));
    }
  };

  const toggleUserMute = (userId: string) => {
    setUserMuted(prev => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const getEffectiveVolume = (userId: string) => {
    if (isMasterMuted || userMuted[userId]) return 0;
    const uVol = userVolumes[userId] ?? 100;
    return (masterVolume / 100) * (uVol / 100);
  };

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
              isLocal={true}
              isMicMuted={isMuted}
              label={localLabel}
              avatarInitial={localInitial}
              avatarUrl={currentUser?.avatarUrl}
              showAvatarOverlay={!localVideoActive}
              className="strip-tile"
            />

            {Object.entries(remoteStreams).map(([socketId, data]) => {
              const user = userMap[data.userId];
              const label = user ? user.displayName : 'Usuário';
              const remoteVideoActive = !!(data.stream?.getVideoTracks?.()?.some(t => t.enabled));
              const effectiveVol = getEffectiveVolume(data.userId);
              const uVol = userVolumes[data.userId] ?? 100;
              const isMutedUser = isMasterMuted || !!userMuted[data.userId];

              return (
                <VideoPlayer
                  key={socketId}
                  stream={data.stream}
                  label={label}
                  avatarInitial={label.charAt(0).toUpperCase()}
                  avatarUrl={user?.avatarUrl}
                  showAvatarOverlay={!remoteVideoActive}
                  volume={effectiveVol}
                  participantVolume={uVol}
                  isParticipantMuted={isMutedUser}
                  onVolumeChange={(val) => handleUserVolumeChange(data.userId, val)}
                  onToggleMute={() => toggleUserMute(data.userId)}
                  isLocal={false}
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
            isLocal={true}
            isMicMuted={isMuted}
            label={localLabel}
            avatarInitial={localInitial}
            avatarUrl={currentUser?.avatarUrl}
            showAvatarOverlay={!localVideoActive}
          />
          
          {Object.entries(remoteStreams).map(([socketId, data]) => {
            const user = userMap[data.userId];
            const label = user ? user.displayName : 'Usuário';
            const remoteVideoActive = !!(data.stream?.getVideoTracks?.()?.some(t => t.enabled));
            const effectiveVol = getEffectiveVolume(data.userId);
            const uVol = userVolumes[data.userId] ?? 100;
            const isMutedUser = isMasterMuted || !!userMuted[data.userId];

            return (
              <VideoPlayer
                key={socketId}
                stream={data.stream}
                label={label}
                avatarInitial={label.charAt(0).toUpperCase()}
                avatarUrl={user?.avatarUrl}
                showAvatarOverlay={!remoteVideoActive}
                volume={effectiveVol}
                participantVolume={uVol}
                isParticipantMuted={isMutedUser}
                onVolumeChange={(val) => handleUserVolumeChange(data.userId, val)}
                onToggleMute={() => toggleUserMute(data.userId)}
                isLocal={false}
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

        {/* Botão de Controles de Áudio com Popover (Sliders e Anti-ruído) */}
        <div className="audio-menu-wrapper" ref={audioMenuRef}>
          <button
            className={`control-btn ${isAudioMenuOpen ? 'active' : ''} ${isMasterMuted ? 'danger' : ''}`}
            onClick={() => setIsAudioMenuOpen(prev => !prev)}
            aria-label="Ajustes de Áudio"
            title="Ajustes de Áudio, Sliders de Volume e Anti-ruído"
          >
            {isMasterMuted || masterVolume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          {isAudioMenuOpen && (
            <div className="audio-settings-popover" role="dialog" aria-label="Controles de Áudio">
              <div className="audio-popover-header">
                <div className="audio-popover-title">
                  <Volume2 size={16} />
                  <span>Configurações de Áudio</span>
                </div>
                <button
                  type="button"
                  className="audio-popover-close"
                  onClick={() => setIsAudioMenuOpen(false)}
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>

              {/* Volume de Saída Geral */}
              <div className="audio-popover-section">
                <div className="audio-section-header">
                  <span className="audio-section-title">Volume de Saída Geral</span>
                  <span className="audio-section-badge">{isMasterMuted ? 'Mudo' : `${masterVolume}%`}</span>
                </div>
                <div className="audio-slider-row">
                  <button
                    type="button"
                    className={`audio-icon-btn ${isMasterMuted ? 'muted' : ''}`}
                    onClick={() => setIsMasterMuted(m => !m)}
                    title={isMasterMuted ? 'Desmutar Saída' : 'Mutar Saída'}
                  >
                    {isMasterMuted || masterVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={isMasterMuted ? 0 : masterVolume}
                    onChange={(e) => handleMasterVolumeChange(Number(e.target.value))}
                    className="volume-slider-input"
                    aria-label="Volume Geral de Saída"
                  />
                </div>
              </div>

              {/* Anti-ruído (Supressão de Ruído Nativa WebRTC DSP) */}
              <div className="audio-popover-section anti-ruido-card">
                <div className="anti-ruido-left">
                  <div className="anti-ruido-title-row">
                    <span className="audio-section-title">Anti-ruído (Supressão)</span>
                    <span className="dsp-pill">DSP</span>
                  </div>
                  <p className="anti-ruido-hint">
                    Remove chiados, estática e eco do microfone em tempo real.
                  </p>
                </div>
                <label className="switch-toggle" title="Ativar ou desativar anti-ruído">
                  <input
                    type="checkbox"
                    checked={isNoiseSuppressionEnabled}
                    onChange={toggleNoiseSuppression}
                  />
                  <span className="switch-slider" />
                </label>
              </div>

              {/* Trava de Volume do Windows 11 (AGC) */}
              <div className="audio-popover-section anti-ruido-card">
                <div className="anti-ruido-left">
                  <div className="anti-ruido-title-row">
                    <span className="audio-section-title">Travar Volume Windows</span>
                    <span className={`dsp-pill ${!isAutoGainControlEnabled ? 'locked' : 'unlocked'}`}>
                      {!isAutoGainControlEnabled ? 'Protegido' : 'AGC Ativo'}
                    </span>
                  </div>
                  <p className="anti-ruido-hint">
                    {!isAutoGainControlEnabled
                      ? 'Impede o site e o navegador de mudarem o volume do microfone no Windows 11.'
                      : 'O navegador ajusta automaticamente o ganho do microfone no Windows.'}
                  </p>
                </div>
                <label className="switch-toggle" title="Ativar proteção para impedir que o site altere o volume no Windows">
                  <input
                    type="checkbox"
                    checked={!isAutoGainControlEnabled}
                    onChange={toggleAutoGainControl}
                  />
                  <span className="switch-slider" />
                </label>
              </div>

              {/* Volumes Individuais dos Participantes */}
              <div className="audio-popover-section">
                <div className="audio-section-header">
                  <span className="audio-section-title">Participantes ({Object.keys(remoteStreams).length})</span>
                </div>
                {Object.keys(remoteStreams).length === 0 ? (
                  <p className="no-participants-text">
                    Nenhum outro participante conectado na chamada.
                  </p>
                ) : (
                  <div className="participants-volume-list">
                    {Object.entries(remoteStreams).map(([socketId, data]) => {
                      const user = userMap[data.userId];
                      const name = user ? user.displayName : 'Usuário';
                      const uVol = userVolumes[data.userId] ?? 100;
                      const isUserMuted = !!userMuted[data.userId];

                      return (
                        <div key={socketId} className="participant-volume-row">
                          <div className="participant-meta">
                            <span className="participant-name-label">{name}</span>
                            <span className="participant-volume-value">
                              {isUserMuted ? 'Mudo' : `${uVol}%`}
                            </span>
                          </div>
                          <div className="audio-slider-row">
                            <button
                              type="button"
                              className={`audio-icon-btn mini ${isUserMuted ? 'muted' : ''}`}
                              onClick={() => toggleUserMute(data.userId)}
                              title={isUserMuted ? `Desmutar ${name}` : `Mutar ${name}`}
                            >
                              {isUserMuted || uVol === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={isUserMuted ? 0 : uVol}
                              onChange={(e) => handleUserVolumeChange(data.userId, Number(e.target.value))}
                              className="volume-slider-input"
                              aria-label={`Volume de ${name}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

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
