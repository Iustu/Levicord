import type { Server, Socket } from 'socket.io';
import { z } from 'zod';

const channelIdSchema = z.string().cuid();

/**
 * Registers WebRTC P2P signaling relay handlers on a socket.
 *
 * The server acts as a pure relay — it does NOT inspect offer/answer/candidate
 * content, only forwards them to the intended peer.
 *
 * Security note: validates that channelId is a CUID before allowing room joins.
 * (Engenharia de Software — SRP)
 */
export function registerVoiceHandler(io: Server, socket: Socket, userId: string) {
  socket.on('join_voice', (channelId: string) => {
    if (!channelIdSchema.safeParse(channelId).success) {
      socket.emit('error', { message: 'Invalid voice channel ID' });
      return;
    }
    socket.join(`voice_${channelId}`);
    socket.to(`voice_${channelId}`).emit('user_joined_voice', {
      userId,
      socketId: socket.id,
    });
  });

  socket.on('leave_voice', (channelId: string) => {
    if (!channelIdSchema.safeParse(channelId).success) return;
    socket.leave(`voice_${channelId}`);
    socket.to(`voice_${channelId}`).emit('user_left_voice', {
      userId,
      socketId: socket.id,
    });
  });

  const verifySocketsInSameRoom = (channelId: string, targetSocketId: string) => {
    const room = io.sockets.adapter.rooms.get(`voice_${channelId}`);
    if (!room) return false;
    return room.has(socket.id) && room.has(targetSocketId);
  };

  socket.on('webrtc_offer', (data: { targetSocketId: string; offer: RTCSessionDescriptionInit; channelId: string }) => {
    if (!verifySocketsInSameRoom(data.channelId, data.targetSocketId)) return;
    
    // Relay only to the exact target socket — no broadcast
    socket.to(data.targetSocketId).emit('webrtc_offer', {
      fromSocketId: socket.id,
      fromUserId: userId,
      offer: data.offer,
    });
  });

  socket.on('webrtc_answer', (data: { targetSocketId: string; answer: RTCSessionDescriptionInit; channelId: string }) => {
    if (!verifySocketsInSameRoom(data.channelId, data.targetSocketId)) return;
    
    socket.to(data.targetSocketId).emit('webrtc_answer', {
      fromSocketId: socket.id,
      fromUserId: userId,
      answer: data.answer,
    });
  });

  socket.on('webrtc_ice_candidate', (data: { targetSocketId: string; candidate: RTCIceCandidateInit; channelId: string }) => {
    if (!verifySocketsInSameRoom(data.channelId, data.targetSocketId)) return;
    
    socket.to(data.targetSocketId).emit('webrtc_ice_candidate', {
      fromSocketId: socket.id,
      fromUserId: userId,
      candidate: data.candidate,
    });
  });
}
