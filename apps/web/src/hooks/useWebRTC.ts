import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import type {
  ScreenShareResolution,
  ScreenShareFps,
  ScreenShareOptions,
} from '../lib/screenShare';
import {
  SCREEN_SHARE_RESOLUTIONS,
  SCREEN_SHARE_FPS,
  SCREEN_SHARE_CONFIG,
} from '../lib/screenShare';

export type { ScreenShareResolution, ScreenShareFps, ScreenShareOptions };
export { SCREEN_SHARE_RESOLUTIONS, SCREEN_SHARE_FPS, SCREEN_SHARE_CONFIG };

/**
 * Otimização de Hardware (GPU/CPU) — OPT-01:
 * Codec capabilities cacheado globalmente a nível de módulo (estático por browser).
 * Reordena os codecs de vídeo negociados para priorizar H.264 e AV1.
 * Codecs com decodificação e codificação aceleradas diretamente por hardware
 * na GPU (NVDEC/NVENC, Intel QuickSync, Apple VideoToolbox, AMD VCN)
 * reduzem a carga de CPU do cliente em até 70%.
 */
const _cachedCodecs: Parameters<RTCRtpTransceiver['setCodecPreferences']>[0] | null = (() => {
  if (typeof RTCRtpReceiver === 'undefined' || !RTCRtpReceiver.getCapabilities) return null;
  const caps = RTCRtpReceiver.getCapabilities('video');
  if (!caps?.codecs?.length) return null;
  return [...caps.codecs].sort((a, b) => {
    const rank = (m: string) => {
      const l = m.toLowerCase();
      if (l === 'video/h264') return 1;
      if (l === 'video/av1') return 2;
      if (l === 'video/vp9') return 3;
      if (l === 'video/vp8') return 4;
      return 5;
    };
    return rank(a.mimeType) - rank(b.mimeType);
  });
})();

function applyHardwareAcceleratedCodecPreferences(transceiver: RTCRtpTransceiver) {
  if (_cachedCodecs && typeof transceiver.setCodecPreferences === 'function') {
    try {
      transceiver.setCodecPreferences(_cachedCodecs);
    } catch {}
  }
}

export function useWebRTC(channelId: string | null, enabled: boolean) {
  const { socket } = useSocket();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, { stream: MediaStream, userId: string }>>({});
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharerSocketId, setScreenSharerSocketId] = useState<string | null>(null);
  const [screenShareResolution, setScreenShareResolution] = useState<ScreenShareResolution>('720p');
  const [screenShareFps, setScreenShareFps] = useState<ScreenShareFps>(30);
  const [error, setError] = useState<string | null>(null);

  // OPT-06: versão do stream local para forçar re-render em mute/vídeo sem recriar o MediaStream
  const [localStreamVersion, setLocalStreamVersion] = useState(0);

  // OPT-03: Buffer de candidatos ICE por peer (previne falhas em redes de alta latência/NAT)
  const iceCandidateQueues = useRef<Record<string, RTCIceCandidateInit[]>>({});

  // Ref para a faixa de tela activa — permite parar e remover sem stale closure
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  // OPT-04: Rastreio direto dos RTCRtpSender de tela por socketId (evita inspeção frágil de label)
  const screenSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());

  // ────────────────────────────────────────────────────────────────────────────
  // Init: obter stream local e entrar no canal
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !channelId || !enabled) return;

    const startWebRTC = async () => {
      try {
        let stream: MediaStream | null = null;

        // Em canal de voz, inicia com áudio (vídeo desligado por padrão)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          setIsMuted(false);
          setIsVideoOff(true);
        } catch (audioErr) {
          console.warn('Microfone não detectado ou permissão negada. Entrando em modo ouvinte.', audioErr);
          // Modo ouvinte (listen-only): permite ouvir mesmo sem microfone ou câmera
          stream = new MediaStream();
          setIsMuted(true);
          setIsVideoOff(true);
        }

        setLocalStream(stream);
        localStreamRef.current = stream;
        setError(null);
        socket.emit('join_voice', channelId);
      } catch (err) {
        console.error('Falha ao inicializar WebRTC:', err);
        setError('Não foi possível conectar ao canal de voz.');
      }
    };

    startWebRTC();

    return () => {
      socket.emit('leave_voice', channelId);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
      iceCandidateQueues.current = {};
      screenSendersRef.current.clear();
      setRemoteStreams({});
      setLocalStream(null);
      setIsScreenSharing(false);
      setScreenSharerSocketId(null);
    };
  }, [socket, channelId, enabled]);

  // ────────────────────────────────────────────────────────────────────────────
  // Sinalizaçao WebRTC + screen share events
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !enabled) return;

    /**
     * Cria uma RTCPeerConnection para um peer remoto.
     *
     * Inclui onnegotiationneeded para suportar renegociação automática após
     * addTrack (webcam e screen share) sem necessidade de recarregar a página.
     * (backlog_playbook.md — Tarefa 1.1)
     */
    const createPeer = (targetSocketId: string, targetUserId: string) => {
      // OPT-13 — Configuração de STUN + TURN server para NAT simétrico
      const peer = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:levicord.uk:3478',
            username: import.meta.env.VITE_TURN_USER,
            credential: import.meta.env.VITE_TURN_PASSWORD,
          },
        ]
      });

      if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
        localStreamRef.current.getTracks().forEach(track => {
          peer.addTrack(track, localStreamRef.current!);
        });
      }

      // Se transmissão de tela estiver ativa, adiciona a track ao novo peer e guarda o sender
      if (screenTrackRef.current) {
        const screenStream = new MediaStream([screenTrackRef.current]);
        const sender = peer.addTrack(screenTrackRef.current, screenStream);
        screenSendersRef.current.set(targetSocketId, sender);
      }

      // Garante transceivers para receber áudio e vídeo mesmo em modo ouvinte (sem microfone/câmera locais)
      const existingAudio = peer.getTransceivers().find(t => t.receiver.track.kind === 'audio');
      if (!existingAudio) {
        peer.addTransceiver('audio', { direction: 'recvonly' });
      }
      let videoTransceiver = peer.getTransceivers().find(t => t.receiver.track.kind === 'video');
      if (!videoTransceiver) {
        videoTransceiver = peer.addTransceiver('video', { direction: 'recvonly' });
      }
      if (videoTransceiver) {
        applyHardwareAcceleratedCodecPreferences(videoTransceiver);
      }

      // OPT-02 — Previne glare e race conditions verificando se signalingState está 'stable'
      peer.onnegotiationneeded = async () => {
        if (peer.signalingState !== 'stable') return;
        try {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket?.emit('webrtc_offer', { targetSocketId, offer, channelId });
        } catch (err) {
          console.warn('Re-negociação falhou:', err);
        }
      };

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit('webrtc_ice_candidate', { targetSocketId, candidate: event.candidate, channelId });
        }
      };

      peer.ontrack = (event) => {
        setRemoteStreams(prev => {
          if (prev[targetSocketId]?.stream === event.streams[0]) return prev;
          return {
            ...prev,
            [targetSocketId]: { stream: event.streams[0], userId: targetUserId },
          };
        });
      };

      peersRef.current[targetSocketId] = peer;
      return peer;
    };

    const handleUserJoined = async ({ userId, socketId }: { userId: string, socketId: string }) => {
      const peer = createPeer(socketId, userId);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('webrtc_offer', { targetSocketId: socketId, offer, channelId });
    };

    const handleOffer = async ({ fromSocketId, fromUserId, offer }: { fromSocketId: string; fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      const peer = createPeer(fromSocketId, fromUserId);
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('webrtc_answer', { targetSocketId: fromSocketId, answer, channelId });

      // OPT-03: Processar candidatos ICE que chegaram antes do setRemoteDescription
      const queued = iceCandidateQueues.current[fromSocketId] ?? [];
      for (const c of queued) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(c));
        } catch (err) {
          console.warn('Falha ao descarregar candidato ICE em buffer:', err);
        }
      }
      delete iceCandidateQueues.current[fromSocketId];
    };

    const handleAnswer = async ({ fromSocketId, answer }: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current[fromSocketId];
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));

        // OPT-03: Processar candidatos ICE que chegaram antes do setRemoteDescription
        const queued = iceCandidateQueues.current[fromSocketId] ?? [];
        for (const c of queued) {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(c));
          } catch (err) {
            console.warn('Falha ao descarregar candidato ICE em buffer:', err);
          }
        }
        delete iceCandidateQueues.current[fromSocketId];
      }
    };

    // OPT-03: Buffer de candidatos ICE se remoteDescription ainda não estiver pronta
    const handleCandidate = async ({ fromSocketId, candidate }: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current[fromSocketId];
      if (!peer || peer.remoteDescription === null) {
        iceCandidateQueues.current[fromSocketId] ??= [];
        iceCandidateQueues.current[fromSocketId].push(candidate);
        return;
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Falha ao adicionar candidato ICE:', err);
      }
    };

    const handleUserLeft = ({ socketId }: { socketId: string }) => {
      const peer = peersRef.current[socketId];
      if (peer) {
        peer.close();
        delete peersRef.current[socketId];
      }
      delete iceCandidateQueues.current[socketId];
      screenSendersRef.current.delete(socketId);
      setRemoteStreams(prev => {
        if (!(socketId in prev)) return prev;
        const { [socketId]: _, ...rest } = prev;
        return rest;
      });
      // Limpar screen share se o utilizador que saiu estava a partilhar
      setScreenSharerSocketId(prev => (prev === socketId ? null : prev));
    };

    // Tarefa 2.3 — Receber notificação de screen share de outros participantes
    const handleScreenShareStarted = ({ fromSocketId }: { fromSocketId: string }) => {
      setScreenSharerSocketId(fromSocketId);
    };

    const handleScreenShareStopped = ({ fromSocketId }: { fromSocketId: string }) => {
      setScreenSharerSocketId(prev => (prev === fromSocketId ? null : prev));
    };

    socket.on('user_joined_voice', handleUserJoined);
    socket.on('webrtc_offer', handleOffer);
    socket.on('webrtc_answer', handleAnswer);
    socket.on('webrtc_ice_candidate', handleCandidate);
    socket.on('user_left_voice', handleUserLeft);
    socket.on('screen_share_started', handleScreenShareStarted);
    socket.on('screen_share_stopped', handleScreenShareStopped);

    return () => {
      socket.off('user_joined_voice', handleUserJoined);
      socket.off('webrtc_offer', handleOffer);
      socket.off('webrtc_answer', handleAnswer);
      socket.off('webrtc_ice_candidate', handleCandidate);
      socket.off('user_left_voice', handleUserLeft);
      socket.off('screen_share_started', handleScreenShareStarted);
      socket.off('screen_share_stopped', handleScreenShareStopped);
    };
  }, [socket, channelId, enabled]);

  // ────────────────────────────────────────────────────────────────────────────
  // Otimização de Hardware / Bateria: Page Visibility API
  // Quando a aba fica em segundo plano ou minimizada, suspende o decoding dos
  // tracks de vídeo remotos no pipeline do browser, poupando CPU e GPU.
  // O áudio da chamada continua 100% ativo e sem interrupções.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      const isHidden = typeof document !== 'undefined' && document.hidden;
      Object.values(peersRef.current).forEach((peer) => {
        if (typeof peer.getReceivers === 'function') {
          peer.getReceivers().forEach((receiver) => {
            if (receiver.track && receiver.track.kind === 'video') {
              receiver.track.enabled = !isHidden;
            }
          });
        }
      });
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [enabled]);

  // ────────────────────────────────────────────────────────────────────────────
  // Controlos locais
  // ────────────────────────────────────────────────────────────────────────────

  const toggleMute = async () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = stream.getAudioTracks()[0];
        if (newTrack) {
          localStreamRef.current.addTrack(newTrack);
          Object.values(peersRef.current).forEach(peer => {
            peer.addTrack(newTrack, localStreamRef.current!);
          });
          // OPT-06: Notifica o React via contador sem recriar o MediaStream (evita flash)
          setLocalStreamVersion(v => v + 1);
          setIsMuted(false);
        }
      } catch (err) {
        console.warn('Microfone não encontrado ou permissão negada:', err);
      }
    }
  };

  /**
   * Tarefa 1.2 — toggleVideo com replaceTrack.
   *
   * Quando a faixa já existe (câmera já foi ligada antes), apenas liga/desliga via
   * `enabled` — sem nova renegociação, sem duplicar faixas.
   * Quando não existe faixa, usa `replaceTrack` nos senders existentes para evitar
   * múltiplas faixas de vídeo na mesma conexão. Se não houver sender de vídeo ainda,
   * addTrack + onnegotiationneeded cuida da renegociação.
   */
  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];

    if (videoTrack) {
      // Faixa já existe — apenas ligar/desligar sem renegociar
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
      return;
    }

    // Não tem faixa de câmera — pedir permissão e integrar nos peers
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = stream.getVideoTracks()[0];
      if (!newTrack) return;

      localStreamRef.current.addTrack(newTrack);

      for (const peer of Object.values(peersRef.current)) {
        const videoSender = peer.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
          // replaceTrack não dispara renegociação — mais eficiente
          await videoSender.replaceTrack(newTrack);
        } else {
          // addTrack dispara onnegotiationneeded automaticamente
          peer.addTrack(newTrack, localStreamRef.current!);
        }
      }

      // OPT-06: Notifica o React via contador sem recriar o MediaStream (evita flash e re-init de decoding)
      setLocalStreamVersion(v => v + 1);
      setIsVideoOff(false);
    } catch (err) {
      console.warn('Câmera não encontrada ou permissão negada:', err);
    }
  };

  /**
   * Tarefa 2.2 — Iniciar partilha de tela.
   *
   * Configurado para aceitar exclusivamente as resoluções 720p, 480p e 240p
   * e as taxas de quadros 60, 45 e 30 fps.
   *
   * getDisplayMedia só pode ser chamado em resposta a gesto do utilizador
   * (política do browser) — nunca chamar em useEffect automático.
   * A faixa de tela é adicionada como segunda faixa de vídeo em cada peer;
   * onnegotiationneeded cuida da renegociação.
   */
  const startScreenShare = async (options?: ScreenShareOptions) => {
    if (!localStreamRef.current || !channelId) return;

    const chosenResolution: ScreenShareResolution = options?.resolution ?? screenShareResolution;
    const chosenFps: ScreenShareFps = options?.fps ?? screenShareFps;
    const targetConfig = SCREEN_SHARE_CONFIG[chosenResolution] ?? SCREEN_SHARE_CONFIG['720p'];

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: chosenFps, max: chosenFps },
          width: { ideal: targetConfig.width, max: targetConfig.width },
          height: { ideal: targetConfig.height, max: targetConfig.height },
        },
        audio: false, // áudio de sistema captura notificações privadas — desabilitado por segurança
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenTrackRef.current = screenTrack;
      setScreenShareResolution(chosenResolution);
      setScreenShareFps(chosenFps);

      // OPT-04: Rastrear RTCRtpSender no Map direto (browser-agnóstico)
      for (const [id, peer] of Object.entries(peersRef.current)) {
        const sender = peer.addTrack(screenTrack, screenStream);
        screenSendersRef.current.set(id, sender);
      }

      socket?.emit('screen_share_started', { channelId });
      setIsScreenSharing(true);

      // Utilizador clicou "Parar partilha" no seletor nativo do browser
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      // Utilizador cancelou o seletor de janela — não é erro crítico
      console.warn('Screen share cancelado ou permissão negada:', err);
    }
  };

  /**
   * Altera a qualidade da transmissão ativa dinamicamente sem reiniciar a chamada WebRTC.
   * Aplica constraints na faixa ativa para resolução (720p, 480p, 240p) e FPS (60, 45, 30).
   */
  const changeScreenShareQuality = async (resolution: ScreenShareResolution, fps: ScreenShareFps) => {
    setScreenShareResolution(resolution);
    setScreenShareFps(fps);

    if (screenTrackRef.current) {
      const targetConfig = SCREEN_SHARE_CONFIG[resolution];
      try {
        await screenTrackRef.current.applyConstraints({
          width: { ideal: targetConfig.width, max: targetConfig.width },
          height: { ideal: targetConfig.height, max: targetConfig.height },
          frameRate: { ideal: fps, max: fps },
        });
      } catch (err) {
        console.warn('Erro ao atualizar qualidade da transmissão:', err);
      }
    }
  };

  /**
   * Tarefa 2.2 — Parar partilha de tela.
   *
   * Para a faixa, remove dos peers (onnegotiationneeded renegocia) e
   * notifica os outros via socket.
   */
  const stopScreenShare = () => {
    if (!channelId) return;

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    // OPT-04: Remover sender de tela usando a referência direta do Map
    for (const [id, peer] of Object.entries(peersRef.current)) {
      const sender = screenSendersRef.current.get(id);
      if (sender) {
        try {
          peer.removeTrack(sender);
        } catch (err) {
          console.warn('Erro ao remover track de tela:', err);
        }
      }
    }
    screenSendersRef.current.clear();

    socket?.emit('screen_share_stopped', { channelId });
    setIsScreenSharing(false);
  };

  return {
    localStream,
    localStreamVersion,
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
  };
}
