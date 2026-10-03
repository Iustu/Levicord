import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { apiFetch } from '../lib/api';
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

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let cachedIceServers: RTCIceServer[] | null = null;
let iceServersPromise: Promise<RTCIceServer[]> | null = null;

export async function getOrFetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  if (!iceServersPromise) {
    iceServersPromise = apiFetch<{ iceServers: RTCIceServer[] }>('/api/webrtc/ice-servers')
      .then((data) => {
        if (data?.iceServers && Array.isArray(data.iceServers)) {
          cachedIceServers = data.iceServers;
          return data.iceServers;
        }
        return DEFAULT_STUN_SERVERS;
      })
      .catch(() => DEFAULT_STUN_SERVERS);
  }
  return iceServersPromise;
}

function applyHardwareAcceleratedCodecPreferences(transceiver: RTCRtpTransceiver) {
  if (_cachedCodecs && typeof transceiver.setCodecPreferences === 'function') {
    try {
      transceiver.setCodecPreferences(_cachedCodecs);
    } catch {}
  }
}

/**
 * Otimiza o SDP para chamadas de voz com múltiplos participantes (8+ peers).
 * - useinbandfec=1: Ativa Forward Error Correction (recupera pacotes de áudio perdidos sem latência)
 * - usedtx=1: Discontinuous Transmission (participantes em silêncio consomem ~0 kbps, poupando a rede)
 * - maxaveragebitrate=32000: Garante voz cristalina em 32 kbps (7 peers usam apenas ~224 kbps total de upload)
 */
function optimizeSdpForVoice(sdp: string): string {
  if (!sdp) return sdp;
  const match = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000\/2/i);
  if (!match) return sdp;
  const pt = match[1];

  const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+(.*)`);
  const fmtpMatch = sdp.match(fmtpRegex);

  const desiredAdditions = ['useinbandfec=1', 'usedtx=1', 'maxaveragebitrate=32000'];

  if (fmtpMatch) {
    let params = fmtpMatch[1];
    for (const param of desiredAdditions) {
      const [key] = param.split('=');
      if (!params.includes(key)) {
        params += `;${param}`;
      }
    }
    return sdp.replace(fmtpRegex, `a=fmtp:${pt} ${params}`);
  } else {
    return sdp.replace(
      new RegExp(`(a=rtpmap:${pt}\\s+opus\/48000\/2\r?\n)`, 'i'),
      `$1a=fmtp:${pt} minptime=10;useinbandfec=1;usedtx=1;maxaveragebitrate=32000\r\n`
    );
  }
}

export function useWebRTC(channelId: string | null, enabled: boolean) {
  const { socket } = useSocket();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, { stream: MediaStream, userId: string }>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({});
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharerSocketId, setScreenSharerSocketId] = useState<string | null>(null);
  const [screenShareResolution, setScreenShareResolution] = useState<ScreenShareResolution>('720p');
  const [screenShareFps, setScreenShareFps] = useState<ScreenShareFps>(30);
  const [error, setError] = useState<string | null>(null);

  // Supressão de ruído / Anti-ruído nativo via WebRTC DSP (echoCancellation, noiseSuppression, autoGainControl)
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('levicord_noise_suppression');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Trava de volume do Windows 11: AGC (Automatic Gain Control) desativado por padrão para impedir que o Chrome/Edge altere o slider de volume do Windows
  const [isAutoGainControlEnabled, setIsAutoGainControlEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('levicord_auto_gain_control');
      return saved !== null ? saved === 'true' : false; // Padrão falso para travar volume do SO
    } catch {
      return false;
    }
  });

  const getAudioConstraints = (noiseSuppression: boolean, agc: boolean = isAutoGainControlEnabled): MediaTrackConstraints => ({
    echoCancellation: true,
    noiseSuppression: noiseSuppression,
    autoGainControl: agc,
    googAutoGainControl: agc,
    googAutoGainControl2: agc,
  } as unknown as MediaTrackConstraints);

  // OPT-06: versão do stream local para forçar re-render em mute/vídeo sem recriar o MediaStream
  const [localStreamVersion, setLocalStreamVersion] = useState(0);

  // OPT-03: Buffer de candidatos ICE por peer (previne falhas em redes de alta latência/NAT)
  const iceCandidateQueues = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const makingOfferRef = useRef<Record<string, boolean>>({});
  const isNegotiatingRef = useRef<Record<string, boolean>>({});

  // Ref para a faixa de tela activa — permite parar e remover sem stale closure
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  // OPT-04: Rastreio direto dos RTCRtpSender de tela (vídeo e áudio) por socketId
  const screenSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const screenAudioSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());

  // ────────────────────────────────────────────────────────────────────────────
  // Init: obter stream local e entrar no canal
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !channelId || !enabled) return;

    const startWebRTC = async () => {
      try {
        await getOrFetchIceServers();
        let stream: MediaStream | null = null;

        // Em canal de voz, inicia com áudio (vídeo desligado por padrão) com filtros DSP ativados
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: getAudioConstraints(isNoiseSuppressionEnabled),
            video: false,
          });
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
      if (screenAudioTrackRef.current) {
        screenAudioTrackRef.current.stop();
        screenAudioTrackRef.current = null;
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
      iceCandidateQueues.current = {};
      makingOfferRef.current = {};
      isNegotiatingRef.current = {};
      screenSendersRef.current.clear();
      screenAudioSendersRef.current.clear();
      setRemoteStreams({});
      setRemoteScreenStreams({});
      setLocalStream(null);
      setLocalScreenStream(null);
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
    const createPeer = (targetSocketId: string, targetUserId: string, isInitiator = false) => {
      // Reutiliza peer existente se ainda estiver aberto
      const existing = peersRef.current[targetSocketId];
      if (existing && existing.connectionState !== 'closed') {
        return existing;
      }

      // Dynamic STUN + TURN server configuration fetched from backend
      const peer = new RTCPeerConnection({
        iceServers: cachedIceServers || DEFAULT_STUN_SERVERS,
      });

      let primaryStreamId: string | null = null;

      // ── ORDEM ESTRITA DE M-LINES (Unified Plan) ───────────────────────────
      // m-line 0: Áudio de microfone (sempre o primeiro)
      const audioTracks = localStreamRef.current ? localStreamRef.current.getAudioTracks() : [];
      if (audioTracks.length > 0) {
        const audioSender = peer.addTrack(audioTracks[0], localStreamRef.current!);
        if (audioSender && typeof audioSender.getParameters === 'function') {
          try {
            const params = audioSender.getParameters();
            if (params.encodings && params.encodings.length > 0) {
              params.encodings[0].networkPriority = 'high';
              params.encodings[0].priority = 'high';
              params.encodings[0].maxBitrate = 40000; // 40 kbps Opus: voz cristalina com baixíssimo uso de upload
              audioSender.setParameters(params);
            }
          } catch {}
        }
      } else if (typeof peer.addTransceiver === 'function') {
        peer.addTransceiver('audio', { direction: 'recvonly' });
      }

      peer.oniceconnectionstatechange = () => {
        const state = peer.iceConnectionState;
        if (state === 'failed') {
          console.warn(`[WebRTC] ICE falhou com peer ${targetSocketId}, acionando restart ICE automático...`);
          if (typeof peer.restartIce === 'function') {
            try {
              peer.restartIce();
            } catch (err) {
              console.warn('[WebRTC] restartIce falhou:', err);
            }
          }
        }
      };

      // m-line 1: Vídeo de câmera (sempre o segundo)
      const videoTracks = localStreamRef.current ? localStreamRef.current.getVideoTracks() : [];
      if (videoTracks.length > 0) {
        const vtSender = peer.addTrack(videoTracks[0], localStreamRef.current!);
        if (typeof peer.getTransceivers === 'function') {
          const tr = peer.getTransceivers().find(t => t.sender === vtSender);
          if (tr) applyHardwareAcceleratedCodecPreferences(tr);
        }
        if (vtSender && typeof vtSender.getParameters === 'function') {
          try {
            const params = vtSender.getParameters();
            if (params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = 600000; // 600 kbps evita congestionamento em chamadas com múltiplos peers
              vtSender.setParameters(params);
            }
          } catch {}
        }
      } else if (typeof peer.addTransceiver === 'function') {
        const vt = peer.addTransceiver('video', { direction: 'recvonly' });
        applyHardwareAcceleratedCodecPreferences(vt);
      }

      // m-line 2 (+ 3 se houver áudio): Faixas de transmissão de tela (se ativas)
      if (screenTrackRef.current) {
        const screenStream = new MediaStream([screenTrackRef.current]);
        if (screenAudioTrackRef.current) {
          screenStream.addTrack(screenAudioTrackRef.current);
        }
        const sender = peer.addTrack(screenTrackRef.current, screenStream);
        screenSendersRef.current.set(targetSocketId, sender);
        if (screenAudioTrackRef.current) {
          const audioSender = peer.addTrack(screenAudioTrackRef.current, screenStream);
          screenAudioSendersRef.current.set(targetSocketId, audioSender);
        }
      }

      // OPT-02 — Previne glare e race conditions com WebRTC 1.0 Perfect Negotiation
      peer.onnegotiationneeded = async () => {
        if (peer.signalingState !== 'stable' || isNegotiatingRef.current[targetSocketId]) return;
        try {
          isNegotiatingRef.current[targetSocketId] = true;
          makingOfferRef.current[targetSocketId] = true;

          const offer = await peer.createOffer();
          if (peer.signalingState !== 'stable') return;
          const optimizedSdp = optimizeSdpForVoice(offer.sdp || '');
          await peer.setLocalDescription({ type: offer.type, sdp: optimizedSdp });

          if (peer.localDescription) {
            socket?.emit('webrtc_offer', {
              targetSocketId,
              offer: peer.localDescription,
              channelId,
            });
          }
        } catch (err) {
          console.warn('[WebRTC] Re-negociação falhou:', err);
        } finally {
          makingOfferRef.current[targetSocketId] = false;
          isNegotiatingRef.current[targetSocketId] = false;
        }
      };

      if (isInitiator) {
        // Dispara a oferta inicial de forma controlada
        (async () => {
          try {
            isNegotiatingRef.current[targetSocketId] = true;
            makingOfferRef.current[targetSocketId] = true;
            const offer = await peer.createOffer();
            const optimizedSdp = optimizeSdpForVoice(offer.sdp || '');
            await peer.setLocalDescription({ type: offer.type, sdp: optimizedSdp });
            socket?.emit('webrtc_offer', {
              targetSocketId,
              offer: peer.localDescription,
              channelId,
            });
          } catch (err) {
            console.warn('[WebRTC] Erro ao criar oferta inicial:', err);
          } finally {
            makingOfferRef.current[targetSocketId] = false;
            isNegotiatingRef.current[targetSocketId] = false;
          }
        })();
      }

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit('webrtc_ice_candidate', { targetSocketId, candidate: event.candidate, channelId });
        }
      };

      peer.ontrack = (event) => {
        if (!primaryStreamId && event.streams[0]) {
          primaryStreamId = event.streams[0].id;
        }

        const isSecondaryStream = !!(event.streams[0] && primaryStreamId && event.streams[0].id !== primaryStreamId);

        const isScreenVideo = (
          event.track.kind === 'video' &&
          (isSecondaryStream ||
           screenSharerSocketId === targetSocketId ||
           (event.track.label && (
             event.track.label.toLowerCase().includes('screen') ||
             event.track.label.toLowerCase().includes('window') ||
             event.track.label.toLowerCase().includes('display')
           )))
        );

        const isScreenAudio = (
          event.track.kind === 'audio' &&
          (isSecondaryStream ||
           (screenSharerSocketId === targetSocketId &&
            event.streams[0] && event.streams[0].getVideoTracks().length > 0))
        );

        if (isScreenVideo || isScreenAudio) {
          setRemoteScreenStreams(prev => {
            const currentScreen = prev[targetSocketId];
            if (currentScreen) {
              if (!currentScreen.getTracks().some(t => t.id === event.track.id)) {
                currentScreen.addTrack(event.track);
              }
              return { ...prev, [targetSocketId]: currentScreen };
            }
            return {
              ...prev,
              [targetSocketId]: event.streams[0] || new MediaStream([event.track]),
            };
          });

          // Áudio de transmissão de tela é reproduzido pelo player central da tela, não pelo tile do usuário
          if (isScreenAudio) {
            const onAudioEnded = () => {
              setRemoteScreenStreams(p => {
                const s = p[targetSocketId];
                if (!s) return p;
                try { s.removeTrack(event.track); } catch {}
                return { ...p, [targetSocketId]: s };
              });
            };
            event.track.addEventListener('ended', onAudioEnded, { once: true });
            return;
          }
        }

        setRemoteStreams(prev => {
          const currentEntry = prev[targetSocketId];
          let stream: MediaStream;

          if (currentEntry?.stream) {
            stream = currentEntry.stream;
            if (!stream.getTracks().some(t => t.id === event.track.id)) {
              stream.addTrack(event.track);
            }
          } else {
            stream = new MediaStream([event.track]);
            if (event.streams[0]) {
              event.streams[0].getTracks().forEach(t => {
                if (!stream.getTracks().some(existing => existing.id === t.id)) {
                  stream.addTrack(t);
                }
              });
            }
          }

          const onTrackEnded = () => {
            try {
              stream.removeTrack(event.track);
            } catch {}
            setRemoteStreams(p => {
              const entry = p[targetSocketId];
              if (!entry) return p;
              return { ...p, [targetSocketId]: { ...entry } };
            });
            setRemoteScreenStreams(p => {
              if (!(targetSocketId in p)) return p;
              const { [targetSocketId]: _, ...rest } = p;
              return rest;
            });
          };

          event.track.addEventListener('ended', onTrackEnded, { once: true });

          return {
            ...prev,
            [targetSocketId]: { stream, userId: targetUserId },
          };
        });
      };

      peersRef.current[targetSocketId] = peer;
      return peer;
    };

    const handleUserJoined = async ({ userId, socketId }: { userId: string, socketId: string }) => {
      const existing = peersRef.current[socketId];
      if (existing) {
        try { existing.close(); } catch {}
        delete peersRef.current[socketId];
      }
      createPeer(socketId, userId, true);
    };

    const handleOffer = async ({ fromSocketId, fromUserId, offer }: { fromSocketId: string; fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      isNegotiatingRef.current[fromSocketId] = true;
      let peer = peersRef.current[fromSocketId];
      if (!peer || peer.connectionState === 'closed') {
        peer = createPeer(fromSocketId, fromUserId, false);
      }

      try {
        const isPolite = socket.id ? socket.id > fromSocketId : true;
        const offerCollision =
          offer.type === 'offer' &&
          (makingOfferRef.current[fromSocketId] || peer.signalingState !== 'stable');

        if (offerCollision) {
          if (!isPolite) {
            console.warn('[WebRTC] Colisão de oferta WebRTC ignorada pelo peer impolido');
            return;
          }

          try {
            await peer.setLocalDescription({ type: 'rollback' });
          } catch (rbErr) {
            console.warn('[WebRTC] Rollback error:', rbErr);
          }
        }

        isNegotiatingRef.current[fromSocketId] = true;
        await peer.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peer.createAnswer();
        const optimizedSdp = optimizeSdpForVoice(answer.sdp || '');
        await peer.setLocalDescription({ type: answer.type, sdp: optimizedSdp });

        if (peer.localDescription) {
          socket.emit('webrtc_answer', { targetSocketId: fromSocketId, answer: peer.localDescription, channelId });
        }

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
      } catch (err) {
        console.warn('Erro ao processar oferta WebRTC:', err);
      } finally {
        isNegotiatingRef.current[fromSocketId] = false;
      }
    };

    const handleAnswer = async ({ fromSocketId, answer }: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current[fromSocketId];
      if (!peer || peer.connectionState === 'closed') return;

      if (peer.signalingState !== 'have-local-offer') {
        console.warn(`[WebRTC] Ignorando resposta SDP: estado atual é '${peer.signalingState}', esperado 'have-local-offer'.`);
        return;
      }

      try {
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
      } catch (err) {
        console.warn('Erro ao processar resposta WebRTC:', err);
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
      screenAudioSendersRef.current.delete(socketId);
      delete isNegotiatingRef.current[socketId];
      delete makingOfferRef.current[socketId];
      setRemoteStreams(prev => {
        if (!(socketId in prev)) return prev;
        const { [socketId]: _, ...rest } = prev;
        return rest;
      });
      setRemoteScreenStreams(prev => {
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
      setRemoteScreenStreams(prev => {
        if (!(fromSocketId in prev)) return prev;
        const { [fromSocketId]: _, ...rest } = prev;
        return rest;
      });
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
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(isNoiseSuppressionEnabled),
        });
        const newTrack = stream.getAudioTracks()[0];
        if (newTrack) {
          localStreamRef.current.addTrack(newTrack);
          for (const [id, peer] of Object.entries(peersRef.current)) {
            if (peer.connectionState === 'closed') continue;
            const screenAudioSender = screenAudioSendersRef.current.get(id);
            const transceivers = typeof peer.getTransceivers === 'function' ? peer.getTransceivers() : [];
            const audioTransceiver = transceivers.find(t =>
              t.receiver.track.kind === 'audio' &&
              (!screenAudioSender || t.sender !== screenAudioSender)
            );

            if (audioTransceiver) {
              audioTransceiver.direction = 'sendrecv';
              await audioTransceiver.sender.replaceTrack(newTrack);
              if (typeof audioTransceiver.sender.getParameters === 'function') {
                try {
                  const params = audioTransceiver.sender.getParameters();
                  if (params.encodings && params.encodings.length > 0) {
                    params.encodings[0].networkPriority = 'high';
                    params.encodings[0].priority = 'high';
                    params.encodings[0].maxBitrate = 40000;
                    audioTransceiver.sender.setParameters(params);
                  }
                } catch {}
              }
            } else {
              const audioSender = peer.addTrack(newTrack, localStreamRef.current!);
              if (audioSender && typeof audioSender.getParameters === 'function') {
                try {
                  const params = audioSender.getParameters();
                  if (params.encodings && params.encodings.length > 0) {
                    params.encodings[0].networkPriority = 'high';
                    params.encodings[0].priority = 'high';
                    params.encodings[0].maxBitrate = 40000;
                    audioSender.setParameters(params);
                  }
                } catch {}
              }
            }
          }
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
   * Quando não existe faixa, usa `replaceTrack` no transceiver de câmera existente (m-line 1)
   * para preservar a ordem exata de m-lines no SDP e evitar renegociações desnecessárias.
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

      for (const [id, peer] of Object.entries(peersRef.current)) {
        if (peer.connectionState === 'closed') continue;

        const screenSender = screenSendersRef.current.get(id);
        const transceivers = typeof peer.getTransceivers === 'function' ? peer.getTransceivers() : [];
        const videoTransceiver = transceivers.find(t =>
          t.receiver.track.kind === 'video' &&
          (!screenSender || t.sender !== screenSender)
        );

        if (videoTransceiver) {
          videoTransceiver.direction = 'sendrecv';
          await videoTransceiver.sender.replaceTrack(newTrack);
        } else {
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
      let screenStream: MediaStream;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
            frameRate: { ideal: chosenFps, max: chosenFps },
            width: { ideal: targetConfig.width, max: targetConfig.width },
            height: { ideal: targetConfig.height, max: targetConfig.height },
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
            frameRate: { ideal: chosenFps, max: chosenFps },
            width: { ideal: targetConfig.width, max: targetConfig.width },
            height: { ideal: targetConfig.height, max: targetConfig.height },
          },
          audio: true,
        });
      }

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;

      const screenAudioTrack = screenStream.getAudioTracks()[0] || null;

      screenTrackRef.current = screenTrack;
      screenAudioTrackRef.current = screenAudioTrack;
      setScreenShareResolution(chosenResolution);
      setScreenShareFps(chosenFps);

      // OPT-04: Rastrear RTCRtpSender no Map direto (browser-agnóstico)
      for (const [id, peer] of Object.entries(peersRef.current)) {
        if (peer.connectionState === 'closed') continue;

        const existingSender = screenSendersRef.current.get(id);
        if (existingSender) {
          await existingSender.replaceTrack(screenTrack);
        } else {
          const sender = peer.addTrack(screenTrack, screenStream);
          screenSendersRef.current.set(id, sender);
        }

        // Se houver faixa de áudio de sistema/aba na transmissão de tela:
        if (screenAudioTrack) {
          const existingAudioSender = screenAudioSendersRef.current.get(id);
          if (existingAudioSender) {
            await existingAudioSender.replaceTrack(screenAudioTrack);
          } else {
            const audioSender = peer.addTrack(screenAudioTrack, screenStream);
            screenAudioSendersRef.current.set(id, audioSender);
          }
        }
      }

      setLocalScreenStream(screenStream);
      socket?.emit('screen_share_started', { channelId });
      setIsScreenSharing(true);

      // Utilizador clicou "Parar partilha" no seletor nativo do browser
      screenTrack.onended = () => {
        stopScreenShare();
      };

      if (screenAudioTrack) {
        screenAudioTrack.onended = () => {
          screenAudioTrackRef.current = null;
          for (const [id, peer] of Object.entries(peersRef.current)) {
            if (peer.connectionState === 'closed') continue;
            const audioSender = screenAudioSendersRef.current.get(id);
            if (audioSender) {
              try { audioSender.replaceTrack(null); } catch {}
            }
          }
        };
      }
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
   * Substitui a faixa de tela por null nos senders existentes em vez de removeTrack.
   * Isso evita corrupção da ordem de m-lines no SDP e não exige renegociação pesada.
   */
  const stopScreenShare = () => {
    if (!channelId) return;

    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    if (screenAudioTrackRef.current) {
      screenAudioTrackRef.current.stop();
      screenAudioTrackRef.current = null;
    }

    setLocalScreenStream(null);

    // OPT-04: Silenciar sender de tela com replaceTrack(null) para preservar m-lines
    for (const [id, peer] of Object.entries(peersRef.current)) {
      if (peer.connectionState === 'closed') continue;
      const sender = screenSendersRef.current.get(id);
      if (sender) {
        try {
          sender.replaceTrack(null);
        } catch (err) {
          console.warn('Erro ao desativar track de vídeo de tela:', err);
        }
      }
      const audioSender = screenAudioSendersRef.current.get(id);
      if (audioSender) {
        try {
          audioSender.replaceTrack(null);
        } catch (err) {
          console.warn('Erro ao desativar track de áudio de tela:', err);
        }
      }
    }

    socket?.emit('screen_share_stopped', { channelId });
    setIsScreenSharing(false);
  };

  /**
   * Ativa / desativa a supressão de ruído no microfone em tempo real
   * usando a API nativa applyConstraints do MediaStreamTrack
   */
  const toggleNoiseSuppression = async () => {
    const nextVal = !isNoiseSuppressionEnabled;
    setIsNoiseSuppressionEnabled(nextVal);
    try {
      localStorage.setItem('levicord_noise_suppression', String(nextVal));
    } catch {
      // ignore
    }

    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack && typeof audioTrack.applyConstraints === 'function') {
        try {
          await audioTrack.applyConstraints(getAudioConstraints(nextVal, isAutoGainControlEnabled));
        } catch (err) {
          console.warn('Erro ao aplicar constraints de supressão de ruído:', err);
        }
      }
    }
  };

  /**
   * Ativa / desativa o Ajuste Automático de Ganho (AGC) no microfone.
   * Quando desligado, impede expressamente o Windows 11 de alterar o volume do microfone.
   */
  const toggleAutoGainControl = async () => {
    const nextVal = !isAutoGainControlEnabled;
    setIsAutoGainControlEnabled(nextVal);
    try {
      localStorage.setItem('levicord_auto_gain_control', String(nextVal));
    } catch {
      // ignore
    }

    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack && typeof audioTrack.applyConstraints === 'function') {
        try {
          await audioTrack.applyConstraints(getAudioConstraints(isNoiseSuppressionEnabled, nextVal));
        } catch (err) {
          console.warn('Erro ao aplicar constraints de AGC:', err);
        }
      }
    }
  };

  return {
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
  };
}
