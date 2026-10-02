import { useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { User } from '@discord-clone/shared';
import { useChatStore, type ActiveDmCall, type IncomingCall } from '../stores/useChatStore';
import { playIncomingRing, playOutgoingRing, stopAllRings } from '../lib/callSounds';

export interface UseDmCallReturn {
  activeDmCall: ActiveDmCall | null;
  incomingCall: IncomingCall | null;
  startCall: (targetUser: User, isVideo?: boolean) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
}

export function useDmCall(socket: Socket | null): UseDmCallReturn {
  const activeDmCall = useChatStore((s) => s.activeDmCall);
  const incomingCall = useChatStore((s) => s.incomingCall);
  const setActiveDmCall = useChatStore((s) => s.setActiveDmCall);
  const setIncomingCall = useChatStore((s) => s.setIncomingCall);
  const setActiveServerId = useChatStore((s) => s.setActiveServerId);
  const setViewMode = useChatStore((s) => s.setViewMode);
  const setActiveDmUserId = useChatStore((s) => s.setActiveDmUserId);

  // ── Actions ───────────────────────────────────────────────────────────────
  const startCall = useCallback(
    (targetUser: User, isVideo = false) => {
      if (!socket || !targetUser?.id) return;
      const currentUserId = useChatStore.getState().currentUserId;
      if (!currentUserId || currentUserId === targetUser.id) return;

      const roomId = `dm_${[currentUserId, targetUser.id].sort().join('_')}`;
      setActiveDmCall({
        roomId,
        targetUser,
        status: 'calling',
        isVideo,
      });

      playOutgoingRing();
      socket.emit('dm_call_start', {
        targetUserId: targetUser.id,
        isVideo,
      });
    },
    [socket, setActiveDmCall]
  );

  const acceptCall = useCallback(() => {
    stopAllRings();
    if (!socket || !incomingCall) return;

    socket.emit('dm_call_accept', {
      callerId: incomingCall.caller.id,
      roomId: incomingCall.roomId,
    });

    // Navigate to caller DM view and activate call
    setActiveServerId(null);
    setViewMode('dms');
    setActiveDmUserId(incomingCall.caller.id);
    setActiveDmCall({
      roomId: incomingCall.roomId,
      targetUser: incomingCall.caller,
      status: 'connected',
      isVideo: incomingCall.isVideo,
    });
    setIncomingCall(null);
  }, [socket, incomingCall, setActiveServerId, setViewMode, setActiveDmUserId, setActiveDmCall, setIncomingCall]);

  const rejectCall = useCallback(() => {
    stopAllRings();
    if (!socket || !incomingCall) return;

    socket.emit('dm_call_reject', {
      callerId: incomingCall.caller.id,
      roomId: incomingCall.roomId,
    });
    setIncomingCall(null);
  }, [socket, incomingCall, setIncomingCall]);

  const endCall = useCallback(() => {
    stopAllRings();
    if (activeDmCall) {
      if (socket) {
        socket.emit('dm_call_end', {
          targetUserId: activeDmCall.targetUser.id,
          roomId: activeDmCall.roomId,
        });
        socket.emit('leave_voice', activeDmCall.roomId);
      }
      setActiveDmCall(null);
    }
    if (incomingCall) {
      setIncomingCall(null);
    }
  }, [socket, activeDmCall, incomingCall, setActiveDmCall, setIncomingCall]);

  // ── Socket Listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: { caller: User; roomId: string; isVideo?: boolean }) => {
      // Don't disturb if already in a call
      if (useChatStore.getState().activeDmCall) {
        socket.emit('dm_call_reject', { callerId: data.caller.id, roomId: data.roomId });
        return;
      }

      playIncomingRing();
      setIncomingCall({
        caller: data.caller,
        roomId: data.roomId,
        isVideo: !!data.isVideo,
      });
    };

    const handleCallStarted = (data: { roomId: string; targetUser: User; isVideo?: boolean }) => {
      setActiveDmCall({
        roomId: data.roomId,
        targetUser: data.targetUser,
        status: 'calling',
        isVideo: !!data.isVideo,
      });
    };

    const handleCallAccepted = (data: { fromUserId: string; roomId: string }) => {
      stopAllRings();
      const currentCall = useChatStore.getState().activeDmCall;
      if (currentCall && currentCall.roomId === data.roomId) {
        setActiveDmCall({
          ...currentCall,
          status: 'connected',
        });
      }
    };

    const handleCallRejected = (data: { fromUserId: string; roomId: string }) => {
      stopAllRings();
      const currentCall = useChatStore.getState().activeDmCall;
      if (currentCall && currentCall.roomId === data.roomId) {
        setActiveDmCall(null);
      }
    };

    const handleCallEnded = (data: { fromUserId: string; roomId: string }) => {
      stopAllRings();
      const currentIncoming = useChatStore.getState().incomingCall;
      if (currentIncoming && currentIncoming.roomId === data.roomId) {
        setIncomingCall(null);
      }

      const currentCall = useChatStore.getState().activeDmCall;
      if (currentCall && currentCall.roomId === data.roomId) {
        socket.emit('leave_voice', data.roomId);
        setActiveDmCall(null);
      }
    };

    socket.on('dm_call_incoming', handleIncomingCall);
    socket.on('dm_call_started', handleCallStarted);
    socket.on('dm_call_accepted', handleCallAccepted);
    socket.on('dm_call_rejected', handleCallRejected);
    socket.on('dm_call_ended', handleCallEnded);

    return () => {
      socket.off('dm_call_incoming', handleIncomingCall);
      socket.off('dm_call_started', handleCallStarted);
      socket.off('dm_call_accepted', handleCallAccepted);
      socket.off('dm_call_rejected', handleCallRejected);
      socket.off('dm_call_ended', handleCallEnded);
      stopAllRings();
    };
  }, [socket, setActiveDmCall, setIncomingCall]);

  return {
    activeDmCall,
    incomingCall,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
