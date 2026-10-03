import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  createDirectMessage,
  sendDmRequest,
  acceptDmRequest,
  rejectDmRequest,
} from '../services/dm.service';
import { checkRateLimit } from '../lib/redis';

import { dmSchema, RATE_LIMITS } from '../lib/socketSchemas';

export interface DmHandlerDeps {
  createDirectMessage: typeof createDirectMessage;
  sendDmRequest: typeof sendDmRequest;
  acceptDmRequest: typeof acceptDmRequest;
  rejectDmRequest: typeof rejectDmRequest;
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
    sendDmRequest,
    acceptDmRequest,
    rejectDmRequest,
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
    } catch (error: any) {
      log.error(error);
      socket.emit('error', { message: error?.message || 'Failed to send direct message' });
    }
  });

  socket.on('send_dm_request', async (data: { receiverId: string }) => {
    if (!data?.receiverId || typeof data.receiverId !== 'string') return;
    try {
      const request = await deps.sendDmRequest(userId, data.receiverId);
      io.to(data.receiverId).emit('dm_request_received', request);
      socket.emit('dm_request_sent', request);
    } catch (err: any) {
      log.error(err);
      socket.emit('error', { message: err?.message || 'Erro ao enviar solicitação de conversa' });
    }
  });

  socket.on('accept_dm_request', async (data: { requestId: string }) => {
    if (!data?.requestId || typeof data.requestId !== 'string') return;
    try {
      const request = await deps.acceptDmRequest(data.requestId, userId);
      io.to(request.senderId).emit('dm_request_accepted', request);
      io.to(request.receiverId).emit('dm_request_accepted', request);
    } catch (err: any) {
      log.error(err);
      socket.emit('error', { message: err?.message || 'Erro ao aceitar solicitação' });
    }
  });

  socket.on('reject_dm_request', async (data: { requestId: string }) => {
    if (!data?.requestId || typeof data.requestId !== 'string') return;
    try {
      const result = await deps.rejectDmRequest(data.requestId, userId);
      io.to(result.senderId).emit('dm_request_rejected', { id: result.id });
      io.to(result.receiverId).emit('dm_request_rejected', { id: result.id });
    } catch (err: any) {
      log.error(err);
      socket.emit('error', { message: err?.message || 'Erro ao rejeitar solicitação' });
    }
  });
}

