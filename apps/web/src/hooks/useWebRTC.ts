import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';

export function useWebRTC(channelId: string | null, enabled: boolean) {
  const { socket } = useSocket();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, { stream: MediaStream, userId: string }>>({});
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
      setRemoteStreams({});
      setLocalStream(null);
    };
  }, [socket, channelId, enabled]);

  useEffect(() => {
    if (!socket || !enabled) return;

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

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket?.emit('webrtc_ice_candidate', { targetSocketId, candidate: event.candidate, channelId });
        }
      };

      peer.ontrack = (event) => {
        setRemoteStreams(prev => {
          if (prev[targetSocketId]?.stream === event.streams[0]) return prev;
          const next = new Map(Object.entries(prev));
          next.set(targetSocketId, { stream: event.streams[0], userId: targetUserId });
          return Object.fromEntries(next);
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
        const next = new Map(Object.entries(prev));
        next.delete(socketId);
        return Object.fromEntries(next);
      });
    };

    socket.on('user_joined_voice', handleUserJoined);
    socket.on('webrtc_offer', handleOffer);
    socket.on('webrtc_answer', handleAnswer);
    socket.on('webrtc_ice_candidate', handleCandidate);
    socket.on('user_left_voice', handleUserLeft);

    return () => {
      socket.off('user_joined_voice', handleUserJoined);
      socket.off('webrtc_offer', handleOffer);
      socket.off('webrtc_answer', handleAnswer);
      socket.off('webrtc_ice_candidate', handleCandidate);
      socket.off('user_left_voice', handleUserLeft);
    };
  }, [socket, channelId, enabled]);

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

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newTrack = stream.getVideoTracks()[0];
        if (newTrack) {
          localStreamRef.current.addTrack(newTrack);
          Object.values(peersRef.current).forEach(peer => {
            peer.addTrack(newTrack, localStreamRef.current!);
          });
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          setIsVideoOff(false);
        }
      } catch (err) {
        console.warn('Câmera não encontrada ou permissão negada:', err);
      }
    }
  };

  return { localStream, remoteStreams, isMuted, isVideoOff, toggleMute, toggleVideo, error };
}
