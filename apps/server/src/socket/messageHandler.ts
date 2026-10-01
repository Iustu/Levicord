import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { createMessage, canAccessChannel } from '../services/channel.service';
import { isAdmin } from '../services/auth.service';
import { checkRateLimit, redis } from '../lib/redis';

import { messageSchema, RATE_LIMITS } from '../lib/socketSchemas';

export interface MessageHandlerDeps {
  createMessage: typeof createMessage;
  canAccessChannel: typeof canAccessChannel;
  isAdmin: typeof isAdmin;
  checkRateLimit: typeof checkRateLimit;
}

/**
 * Registers the channel message event handler on a socket.
 * (Engenharia de Software — SRP: each handler file owns one domain)
 */
export function registerMessageHandler(
  io: Server,
  socket: Socket,
  userId: string,
  log: { error: (...args: unknown[]) => void },
  deps: MessageHandlerDeps = {
    createMessage,
    canAccessChannel,
    isAdmin,
    checkRateLimit,
  }
) {
  socket.on('join_channel', async (channelId: string) => {
    if (!z.string().cuid().safeParse(channelId).success) {
      socket.emit('error', { message: 'Invalid channel ID' });
      return;
    }

    if (!(await deps.canAccessChannel(channelId, userId, await deps.isAdmin(userId)))) {
      log.error({ event: 'socket_access_denied', userId, channelId }, 'User attempted to join private channel without access');
      socket.emit('error', { message: 'Access denied to this channel' });
      return;
    }

    const previousChannelId = socket.data.channelId as string | undefined;
    if (previousChannelId && previousChannelId !== channelId) {
      socket.leave(previousChannelId);
    }
    socket.join(channelId);
    socket.data.channelId = channelId;
  });

  socket.on('typing_start', (channelId: string) => {
    if (!z.string().cuid().safeParse(channelId).success) return;
    socket.to(channelId).emit('user_typing', { userId, channelId });
  });

  socket.on('typing_stop', (channelId: string) => {
    if (!z.string().cuid().safeParse(channelId).success) return;
    socket.to(channelId).emit('user_stopped_typing', { userId, channelId });
  });

  socket.on('send_message', async (data: unknown) => {
    const result = messageSchema.safeParse(data);
    if (!result.success) {
      socket.emit('error', { message: result.error.issues[0].message });
      return;
    }

    if (!socket.rooms.has(result.data.channelId)) {
      socket.emit('error', { message: 'Join the channel before sending messages' });
      return;
    }

    const allowed = await deps.checkRateLimit(
      `socket_message_rate:${userId}`,
      RATE_LIMITS.MESSAGE_LIMIT,
      RATE_LIMITS.MESSAGE_WINDOW_SECONDS,
    );
    if (!allowed) {
      socket.emit('error', { message: 'Message rate limit exceeded' });
      return;
    }

    try {
      const message = await deps.createMessage(
        result.data.content || null,
        userId,
        result.data.channelId,
        result.data.attachments,
      );
      io.to(result.data.channelId).emit('new_message', message);
    } catch (error) {
      log.error(error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}
