import { FastifyInstance } from 'fastify';
import { requireAuth, getAuthUserId } from '../lib/auth';
import {
  getDmContacts,
  getDmRequestStatus,
  sendDmRequest,
  acceptDmRequest,
  rejectDmRequest,
} from '../services/dm.service';

export default async function dmRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  // List all DM contacts (accepted and pending) for the authenticated user
  fastify.get('/contacts', async (request) => {
    const userId = getAuthUserId(request);
    const contacts = await getDmContacts(userId);
    return contacts;
  });

  // Check relationship status with a specific user
  fastify.get<{ Params: { targetUserId: string } }>(
    '/requests/status/:targetUserId',
    async (request) => {
      const userId = getAuthUserId(request);
      return getDmRequestStatus(userId, request.params.targetUserId);
    }
  );

  // Send a new DM request to a target user
  fastify.post<{ Body: { receiverId?: string; targetUserId?: string } }>('/requests', async (request, reply) => {
    const userId = getAuthUserId(request);
    const { receiverId, targetUserId } = request.body || {};
    const targetId = receiverId || targetUserId;
    if (!targetId || typeof targetId !== 'string') {
      return reply.code(400).send({ message: 'receiverId é obrigatório.' });
    }

    try {
      const result = await sendDmRequest(userId, targetId);
      const io = (fastify as any).io;
      if (io) {
        io.to(receiverId).emit('dm_request_received', result);
        io.to(userId).emit('dm_request_sent', result);
      }
      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ message: err.message || 'Erro ao enviar solicitação.' });
    }
  });

  // Accept a DM request
  fastify.put<{ Params: { id: string } }>('/requests/:id/accept', async (request, reply) => {
    const userId = getAuthUserId(request);
    try {
      const result = await acceptDmRequest(request.params.id, userId);
      const io = (fastify as any).io;
      if (io) {
        io.to(result.senderId).emit('dm_request_accepted', result);
        io.to(result.receiverId).emit('dm_request_accepted', result);
      }
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ message: err.message || 'Erro ao aceitar solicitação.' });
    }
  });

  fastify.post<{ Params: { id: string } }>('/requests/:id/accept', async (request, reply) => {
    const userId = getAuthUserId(request);
    try {
      const result = await acceptDmRequest(request.params.id, userId);
      const io = (fastify as any).io;
      if (io) {
        io.to(result.senderId).emit('dm_request_accepted', result);
        io.to(result.receiverId).emit('dm_request_accepted', result);
      }
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ message: err.message || 'Erro ao aceitar solicitação.' });
    }
  });

  // Reject / Cancel a DM request
  fastify.delete<{ Params: { id: string } }>('/requests/:id', async (request, reply) => {
    const userId = getAuthUserId(request);
    try {
      const result = await rejectDmRequest(request.params.id, userId);
      const io = (fastify as any).io;
      if (io) {
        io.to(result.senderId).emit('dm_request_rejected', { id: result.id });
        io.to(result.receiverId).emit('dm_request_rejected', { id: result.id });
      }
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ message: err.message || 'Erro ao rejeitar solicitação.' });
    }
  });
}
