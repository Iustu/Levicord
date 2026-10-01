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

  // Ref para a faixa de tela activa — permite parar e remover sem stale closure
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

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
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
        localStreamRef.current.getTracks().forEach(track => {
          peer.addTrack(track, localStreamRef.current!);
        });
      }

      // Garante transceivers para receber áudio e vídeo mesmo em modo ouvinte (sem microfone/câmera locais)
      const existingAudio = peer.getTransceivers().find(t => t.receiver.track.kind === 'audio');
      if (!existingAudio) {
        peer.addTransceiver('audio', { direction: 'recvonly' });
      }
      const existingVideo = peer.getTransceivers().find(t => t.receiver.track.kind === 'video');
      if (!existingVideo) {
        peer.addTransceiver('video', { direction: 'recvonly' });
      }

      // Tarefa 1.1 — Renegociação automática após addTrack (webcam / screen share).
      // O browser dispara este evento após qualquer addTrack/removeTrack numa conexão
      // já estabelecida. O handler reusa o mesmo canal de sinalização existente.
      peer.onnegotiationneeded = async () => {
        try {
          if (peer.signalingState === 'closed') return;
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
    };

    const handleAnswer = async ({ fromSocketId, answer }: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current[fromSocketId];
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleCandidate = async ({ fromSocketId, candidate }: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current[fromSocketId];
      if (peer) {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const handleUserLeft = ({ socketId }: { socketId: string }) => {
      const peer = peersRef.current[socketId];
      if (peer) {
        peer.close();
        delete peersRef.current[socketId];
      }
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
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
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

      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
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

      try {
        await screenTrack.applyConstraints({
          width: { ideal: targetConfig.width, max: targetConfig.width },
          height: { ideal: targetConfig.height, max: targetConfig.height },
          frameRate: { ideal: chosenFps, max: chosenFps },
        });
      } catch (constraintErr) {
        console.warn('Falha ao aplicar constraints exatas à faixa de tela:', constraintErr);
      }

      screenTrackRef.current = screenTrack;
      setScreenShareResolution(chosenResolution);
      setScreenShareFps(chosenFps);

      // Adicionar faixa de tela em cada peer — onnegotiationneeded dispara automaticamente
      for (const peer of Object.values(peersRef.current)) {
        peer.addTrack(screenTrack, screenStream);
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

    // Remover sender de tela de cada peer pelo label (getDisplayMedia devolve label com 'screen')
    for (const peer of Object.values(peersRef.current)) {
      const sender = peer.getSenders().find(
        s => s.track?.kind === 'video' && s.track?.label?.toLowerCase().includes('screen')
      );
      if (sender) {
        peer.removeTrack(sender);
        // onnegotiationneeded dispara automaticamente
      }
    }

    socket?.emit('screen_share_stopped', { channelId });
    setIsScreenSharing(false);
  };

  return {
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
  };
}
