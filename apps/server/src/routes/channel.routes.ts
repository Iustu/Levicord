import { FastifyInstance } from 'fastify';
import { getChannels, createChannel, updateChannel, deleteChannel, getChannelMessages, canAccessChannel, searchMessages, deleteMessage } from '../services/channel.service';
import { isAdmin } from '../services/auth.service';
import { requireAuth, getAuthUserId } from '../lib/auth';

export default async function channelRoutes(fastify: FastifyInstance) {
  // Single shared preHandler — eliminates duplicated addHook('onRequest') pattern
  // (Engenharia de Software — DRY, Extract Function)
  fastify.addHook('onRequest', requireAuth);

  fastify.get<{ Querystring: { limit?: number; offset?: number; serverId?: string } }>('/', async (request) => {
    const limit = Math.min(Number(request.query.limit ?? 100), 200);
    const offset = Number(request.query.offset ?? 0);
    const serverId = request.query.serverId ?? null;
    const userId = getAuthUserId(request);
    const userIsAdmin = await isAdmin(userId);
    return getChannels(userId, userIsAdmin, limit, offset, serverId);
  });

  const createChannelSchema = {
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 32, pattern: '^[a-z0-9-]+$' },
        description: { type: 'string', maxLength: 200 },
        type: { type: 'string', enum: ['TEXT', 'VOICE'] },
        isPrivate: { type: 'boolean' },
      },
    },
  };

  const requireAdmin = async (request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) => {
    const userId = getAuthUserId(request);
    if (!(await isAdmin(userId))) {
      request.log.warn({ event: 'admin_access_denied', userId, ip: request.ip }, 'Administrator access denied');
      return reply.code(403).send({ message: 'Administrator permissions required' });
    }
  };

  fastify.post<{ Body: { name: string; description?: string; type?: 'TEXT' | 'VOICE'; isPrivate?: boolean } }>(
    '/',
    { schema: createChannelSchema, preHandler: requireAdmin },
    async (request, reply) => {
      const { name, description, type, isPrivate } = request.body;
      const channel = await createChannel(name, description, type, isPrivate);
      return reply.code(201).send(channel);
    },
  );

  fastify.put<{ Params: { id: string }; Body: { name: string; description?: string } }>(
    '/:id',
    { schema: createChannelSchema },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const userId = getAuthUserId(request);
        const { name, description } = request.body;
        return await updateChannel(id, userId, { name, description });
      } catch (error: any) {
        const msg = error.message || 'Erro ao atualizar canal';
        if (msg.includes('não encontrado') || (error as { code?: string }).code === 'P2025') {
          return reply.code(404).send({ message: 'Channel not found' });
        }
        return reply.code(403).send({ message: msg });
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const userId = getAuthUserId(request);
      const result = await deleteChannel(id, userId);
      return reply.code(200).send(result);
    } catch (error: any) {
      const msg = error.message || 'Erro ao excluir canal';
      if (msg.includes('não encontrado')) {
        return reply.code(404).send({ message: msg });
      }
      return reply.code(403).send({ message: msg });
    }
  });

  fastify.get<{ Params: { id: string }; Querystring: { q: string } }>(
    '/:id/messages/search',
    async (request, reply) => {
      const { id } = request.params;
      const { q } = request.query;
      if (!q || q.trim().length < 2) {
        return reply.code(400).send({ message: 'Query must be at least 2 characters' });
      }
      const userId = getAuthUserId(request);
      if (!(await canAccessChannel(id, userId, await isAdmin(userId)))) {
        return reply.code(403).send({ message: 'Access denied' });
      }
      return searchMessages(id, q.trim());
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/:id/messages',
    async (request, reply) => {
      const { id } = request.params;
      const { cursor } = request.query;
      const userId = getAuthUserId(request);

      if (!(await canAccessChannel(id, userId, await isAdmin(userId)))) {
        request.log.warn({ event: 'channel_access_denied', userId, channelId: id, ip: request.ip }, 'Access denied to private channel messages');
        return reply.code(403).send({ message: 'Access denied' });
      }

      const result = await getChannelMessages(id, 50, cursor);
      // Reverse because we query descending (newest first) but UI renders oldest to newest.
      return { ...result, messages: result.messages.reverse() };
    },
  );

  fastify.delete<{ Params: { id: string; messageId: string } }>(
    '/:id/messages/:messageId',
    async (request, reply) => {
      try {
        const userId = getAuthUserId(request);
        const { id, messageId } = request.params;
        const deleted = await deleteMessage(messageId, userId);

        const io = (fastify as any).io;
        if (io) {
          io.to(id).emit('message_deleted', {
            channelId: id,
            messageId,
          });
        }

        return reply.code(200).send(deleted);
      } catch (err: any) {
        return reply.code(403).send({ message: err.message || 'Sem permissão para excluir mensagem' });
      }
    },
  );
}
