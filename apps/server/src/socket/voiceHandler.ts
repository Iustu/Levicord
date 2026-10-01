import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma as defaultPrisma } from '../prisma';
import type { PrismaClient } from '@prisma/client';
import { canAccessChannel as defaultCanAccessChannel } from '../services/channel.service';
import { isAdmin as defaultIsAdmin } from '../services/auth.service';

const channelIdSchema = z.string().cuid();

export interface VoiceHandlerDeps {
  prisma: PrismaClient;
  canAccessChannel: (channelId: string, userId: string, isUserAdmin: boolean) => Promise<boolean>;
  isAdmin: (userId: string) => Promise<boolean>;
}

/**
 * Registers WebRTC P2P signaling relay handlers on a socket.
 *
 * The server acts as an authorized relay:
 * - Validates channel existence, type (VOICE), and access permissions.
 * - Forwards offer/answer/candidate only between authenticated peers in the same voice room.
 * - Automatically emits `user_left_voice` on socket disconnect to prevent orphaned connections.
 * (DevSecOps — Least Privilege & Building Secure and Reliable Systems)
 */
export function registerVoiceHandler(
  io: Server,
  socket: Socket,
  userId: string,
  log?: { error: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void },
  deps: VoiceHandlerDeps = {
    prisma: defaultPrisma,
    canAccessChannel: defaultCanAccessChannel,
    isAdmin: defaultIsAdmin,
  }
) {
  socket.on('join_voice', async (channelId: string) => {
    if (!channelIdSchema.safeParse(channelId).success) {
      socket.emit('error', { message: 'Invalid voice channel ID' });
      return;
    }

    try {
      const channel = await deps.prisma.channel.findUnique({
        where: { id: channelId },
        select: { id: true, type: true, isPrivate: true },
      });

      if (!channel || channel.type !== 'VOICE') {
        socket.emit('error', { message: 'Channel not found or is not a voice channel' });
        return;
      }

      const admin = await deps.isAdmin(userId);
      const hasAccess = await deps.canAccessChannel(channelId, userId, admin);
      if (!hasAccess) {
        log?.warn?.({ event: 'voice_access_denied', userId, channelId }, 'User attempted to join voice channel without permission');
        socket.emit('error', { message: 'Access denied to this voice channel' });
        return;
      }

      const previousVoiceChannelId = socket.data.voiceChannelId as string | undefined;
      if (previousVoiceChannelId && previousVoiceChannelId !== channelId) {
        socket.leave(`voice_${previousVoiceChannelId}`);
        socket.to(`voice_${previousVoiceChannelId}`).emit('user_left_voice', {
          userId,
          socketId: socket.id,
        });
      }

      socket.join(`voice_${channelId}`);
      socket.data.voiceChannelId = channelId;
      socket.to(`voice_${channelId}`).emit('user_joined_voice', {
        userId,
        socketId: socket.id,
      });
    } catch (err) {
      log?.error?.(err);
      socket.emit('error', { message: 'Failed to join voice channel' });
    }
  });

  socket.on('leave_voice', (channelId: string) => {
    if (!channelIdSchema.safeParse(channelId).success) return;
    socket.leave(`voice_${channelId}`);
    if (socket.data.voiceChannelId === channelId) {
      delete socket.data.voiceChannelId;
    }
    socket.to(`voice_${channelId}`).emit('user_left_voice', {
      userId,
      socketId: socket.id,
    });
  });

  socket.on('disconnect', () => {
    const activeVoiceChannelId = socket.data.voiceChannelId as string | undefined;
    if (activeVoiceChannelId) {
      socket.to(`voice_${activeVoiceChannelId}`).emit('user_left_voice', {
        userId,
        socketId: socket.id,
      });
      socket.leave(`voice_${activeVoiceChannelId}`);
      delete socket.data.voiceChannelId;
    }
  });

  const verifySocketsInSameRoom = (channelId: string, targetSocketId: string) => {
    if (socket.data.voiceChannelId !== channelId) return false;
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
