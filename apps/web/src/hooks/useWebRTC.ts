import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';

export function useWebRTC(channelId: string | null, enabled: boolean) {
  const { socket } = useSocket();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, { stream: MediaStream, userId: string }>>({});
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    if (!socket || !channelId || !enabled) return;

    const startWebRTC = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
        socket.emit('join_voice', channelId);
      } catch (err) {
        console.error('Failed to get local stream. Check permissions.', err);
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

  const createPeer = (targetSocketId: string, targetUserId: string) => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, localStreamRef.current!);
      });
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('webrtc_ice_candidate', { targetSocketId, candidate: event.candidate, channelId });
      }
    };

    peer.ontrack = (event) => {
      setRemoteStreams(prev => ({ 
        ...prev, 
        [targetSocketId]: { stream: event.streams[0], userId: targetUserId } 
      }));
    };

    peersRef.current[targetSocketId] = peer;
    return peer;
  };

  useEffect(() => {
    if (!socket || !enabled) return;

    const handleUserJoined = async ({ userId, socketId }: { userId: string, socketId: string }) => {
      const peer = createPeer(socketId, userId);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('webrtc_offer', { targetSocketId: socketId, offer, channelId });
    };

    const handleOffer = async ({ fromSocketId, fromUserId, offer }: any) => {
      const peer = createPeer(fromSocketId, fromUserId);
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('webrtc_answer', { targetSocketId: fromSocketId, answer, channelId });
    };

    const handleAnswer = async ({ fromSocketId, answer }: any) => {
      const peer = peersRef.current[fromSocketId];
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleCandidate = async ({ fromSocketId, candidate }: any) => {
      const peer = peersRef.current[fromSocketId];
      if (peer) {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const handleUserLeft = ({ socketId }: any) => {
      const peer = peersRef.current[socketId];
      if (peer) {
        peer.close();
        delete peersRef.current[socketId];
      }
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[socketId];
        return next;
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

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!localStreamRef.current.getAudioTracks()[0]?.enabled);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsVideoOff(!localStreamRef.current.getVideoTracks()[0]?.enabled);
    }
  };

  return { localStream, remoteStreams, isMuted, isVideoOff, toggleMute, toggleVideo };
}
