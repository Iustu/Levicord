import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { prisma as defaultPrisma } from '../prisma';
import type { PrismaClient } from '@prisma/client';
import { canAccessChannel as defaultCanAccessChannel } from '../services/channel.service';
import { isAdmin as defaultIsAdmin, isSuperAdmin as defaultIsSuperAdmin } from '../services/auth.service';

const channelIdSchema = z.string().cuid();

export function parseDmChannelId(channelId: string): [string, string] | null {
  if (typeof channelId !== 'string' || !channelId.startsWith('dm_')) return null;
  const parts = channelId.slice(3).split('_');
  if (parts.length !== 2) return null;
  const [u1, u2] = parts;
  if (!u1 || !u2 || u1 === u2) return null;
  return [u1, u2];
}

export function isValidVoiceChannelId(channelId: string): boolean {
  return channelIdSchema.safeParse(channelId).success || parseDmChannelId(channelId) !== null;
}

/** (BSRS Cap.10 DoS) Maximum concurrent participants per voice channel. */
const MAX_VOICE_PARTICIPANTS = 25;

export interface VoiceHandlerDeps {
  prisma: PrismaClient;
  canAccessChannel: (channelId: string, userId: string, isUserAdmin: boolean) => Promise<boolean>;
  isAdmin: (userId: string) => Promise<boolean>;
  isSuperAdmin?: (userId: string) => Promise<boolean>;
}

/**
 * Registers WebRTC P2P signaling relay handlers on a socket.
 * Supports both guild voice channels and 1-on-1 Direct Message calls.
 *
 * The server acts as an authorized relay:
 * - Validates channel existence, type (VOICE or DM call), and access permissions.
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
    isSuperAdmin: defaultIsSuperAdmin,
  }
) {
  socket.on('join_voice', async (channelId: string) => {
    const dmUsers = parseDmChannelId(channelId);
    const isChannelCuid = channelIdSchema.safeParse(channelId).success;

    if (!dmUsers && !isChannelCuid) {
      socket.emit('error', { message: 'Invalid voice channel ID' });
      return;
    }

    try {
      // ── 1-on-1 Direct Message Voice Call Handler ───────────────────────────
      if (dmUsers) {
        const [u1, u2] = dmUsers;
        if (userId !== u1 && userId !== u2) {
          log?.warn?.({ event: 'dm_voice_access_denied', userId, channelId }, 'User attempted to join DM call without permission');
          socket.emit('error', { message: 'Access denied to this DM call' });
          return;
        }

        if (deps.prisma.user?.findMany) {
          const users = await deps.prisma.user.findMany({
            where: { id: { in: [u1, u2] } },
            select: { id: true },
          });
          if (users.length !== 2) {
            socket.emit('error', { message: 'Users for DM call not found' });
            return;
          }
        }

        const previousVoiceChannelId = socket.data.voiceChannelId as string | undefined;
        if (previousVoiceChannelId && previousVoiceChannelId !== channelId) {
          socket.leave(`voice_${previousVoiceChannelId}`);
          socket.to(`voice_${previousVoiceChannelId}`).emit('user_left_voice', {
            userId,
            socketId: socket.id,
          });
        }

        // Max 2 participants in a 1-on-1 DM call
        const voiceRoom = io.sockets.adapter.rooms.get(`voice_${channelId}`);
        const currentCount = voiceRoom ? voiceRoom.size : 0;
        if (currentCount >= 2) {
          socket.emit('error', { message: 'DM call is full (max 2 participants)' });
          return;
        }

        socket.join(`voice_${channelId}`);
        socket.data.voiceChannelId = channelId;
        socket.to(`voice_${channelId}`).emit('user_joined_voice', {
          userId,
          socketId: socket.id,
        });
        return;
      }

      // ── Guild / Server Voice Channel Handler ───────────────────────────────
      const channel = await deps.prisma.channel.findUnique({
        where: { id: channelId },
        select: { id: true, type: true, isPrivate: true, serverId: true },
      });

      if (!channel || channel.type !== 'VOICE') {
        socket.emit('error', { message: 'Channel not found or is not a voice channel' });
        return;
      }

      if (channel.serverId && deps.isSuperAdmin) {
        const isSuper = await deps.isSuperAdmin(userId);
        if (isSuper) {
          log?.warn?.({ event: 'superadmin_voice_blocked', userId, channelId }, 'SuperAdmin attempted to join server voice channel');
          socket.emit('error', { message: 'SuperAdmins não têm permissão para entrar em canais de voz de servidores.' });
          return;
        }
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

      const voiceRoom = io.sockets.adapter.rooms.get(`voice_${channelId}`);
      const currentCount = voiceRoom ? voiceRoom.size : 0;
      if (currentCount >= MAX_VOICE_PARTICIPANTS) {
        socket.emit('error', { message: `Voice channel is full (max ${MAX_VOICE_PARTICIPANTS} participants)` });
        return;
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
    if (!isValidVoiceChannelId(channelId)) return;
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

  socket.on('screen_share_started', (data: { channelId: string }) => {
    if (!isValidVoiceChannelId(data?.channelId)) return;
    if (socket.data.voiceChannelId !== data.channelId) return;
    socket.to(`voice_${data.channelId}`).emit('screen_share_started', {
      fromUserId: userId,
      fromSocketId: socket.id,
    });
  });

  socket.on('screen_share_stopped', (data: { channelId: string }) => {
    if (!isValidVoiceChannelId(data?.channelId)) return;
    if (socket.data.voiceChannelId !== data.channelId) return;
    socket.to(`voice_${data.channelId}`).emit('screen_share_stopped', {
      fromUserId: userId,
      fromSocketId: socket.id,
    });
  });

  // ── 1-on-1 Direct Message Call Signaling ──────────────────────────────────
  socket.on('dm_call_start', async (data: { targetUserId: string; isVideo?: boolean }) => {
    if (!data?.targetUserId || typeof data.targetUserId !== 'string' || data.targetUserId === userId) {
      return;
    }

    try {
      let callerUser: { id: string; displayName: string; avatarUrl?: string | null } = {
        id: userId,
        displayName: 'Utilizador',
      };
      let targetUser: { id: string; displayName: string; avatarUrl?: string | null } = {
        id: data.targetUserId,
        displayName: 'Destinatário',
      };

      if (deps.prisma.user?.findUnique) {
        const [foundCaller, foundTarget] = await Promise.all([
          deps.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, displayName: true, avatarUrl: true },
          }),
          deps.prisma.user.findUnique({
            where: { id: data.targetUserId },
            select: { id: true, displayName: true, avatarUrl: true },
          }),
        ]);
        if (!foundCaller || !foundTarget) {
          socket.emit('error', { message: 'Usuário não encontrado' });
          return;
        }
        callerUser = foundCaller;
        targetUser = foundTarget;
      }

      const roomId = `dm_${[userId, data.targetUserId].sort().join('_')}`;

      // Notify caller
      socket.emit('dm_call_started', {
        roomId,
        targetUser,
        isVideo: !!data.isVideo,
      });

      // Relay incoming call to target user's personal room
      io.to(data.targetUserId).emit('dm_call_incoming', {
        caller: callerUser,
        roomId,
        isVideo: !!data.isVideo,
      });
    } catch (err) {
      log?.error?.(err);
      socket.emit('error', { message: 'Falha ao iniciar chamada de DM' });
    }
  });

  socket.on('dm_call_accept', (data: { callerId: string; roomId: string }) => {
    if (!data?.callerId || !data?.roomId) return;
    io.to(data.callerId).emit('dm_call_accepted', {
      fromUserId: userId,
      roomId: data.roomId,
    });
  });

  socket.on('dm_call_reject', (data: { callerId: string; roomId: string }) => {
    if (!data?.callerId || !data?.roomId) return;
    io.to(data.callerId).emit('dm_call_rejected', {
      fromUserId: userId,
      roomId: data.roomId,
    });
  });

  socket.on('dm_call_end', (data: { targetUserId: string; roomId: string }) => {
    if (!data?.targetUserId || !data?.roomId) return;
    io.to(data.targetUserId).emit('dm_call_ended', {
      fromUserId: userId,
      roomId: data.roomId,
    });
  });
}
