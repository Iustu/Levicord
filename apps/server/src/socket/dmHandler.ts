import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { createDirectMessage } from '../services/dm.service';
import { checkRateLimit } from '../lib/redis';

import { dmSchema, RATE_LIMITS } from '../lib/socketSchemas';

export interface DmHandlerDeps {
  createDirectMessage: typeof createDirectMessage;
  checkRateLimit: typeof checkRateLimit;
}

/**
 * Registers the direct message event handler on a socket.
 * (Engenharia de Software — SRP: each handler file owns one domain)
 */
export function registerDmHandler(
  io: Server,
  socket: Socket,
  userId: string,
  log: { error: (...args: unknown[]) => void },
  deps: DmHandlerDeps = {
    createDirectMessage,
    checkRateLimit,
  }
) {
  socket.on('send_dm', async (data: unknown) => {
    const result = dmSchema.safeParse(data);
    if (!result.success) {
      socket.emit('error', { message: result.error.issues[0].message });
      return;
    }

    const allowed = await deps.checkRateLimit(
      `socket_dm_rate:${userId}`,
      RATE_LIMITS.DM_LIMIT,
      RATE_LIMITS.DM_WINDOW_SECONDS,
    );
    if (!allowed) {
      socket.emit('error', { message: 'Message rate limit exceeded' });
      return;
    }

    try {
      const dm = await deps.createDirectMessage(
        result.data.content || null,
        userId,
        result.data.receiverId,
        result.data.attachments,
      );
      // Emit to receiver's personal room
      io.to(result.data.receiverId).emit('new_dm', dm);
      // Emit back to sender so their own UI updates
      if (userId !== result.data.receiverId) {
        io.to(userId).emit('new_dm', dm);
      }
    } catch (error) {
      log.error(error);
      socket.emit('error', { message: 'Failed to send direct message' });
    }
  });
}
