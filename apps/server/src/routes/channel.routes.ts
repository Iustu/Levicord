import { FastifyInstance } from 'fastify';
import { getChannels, createChannel, updateChannel, getChannelMessages } from '../services/channel.service';
import { isAdmin } from '../services/auth.service';
import { requireAuth, getAuthUserId } from '../lib/auth';

export default async function channelRoutes(fastify: FastifyInstance) {
  // Single shared preHandler — eliminates duplicated addHook('onRequest') pattern
  // (Engenharia de Software — DRY, Extract Function)
  fastify.addHook('onRequest', requireAuth);

  fastify.get<{ Querystring: { limit?: number; offset?: number } }>('/', async (request) => {
    const limit = Math.min(Number(request.query.limit ?? 100), 200);
    const offset = Number(request.query.offset ?? 0);
    return getChannels(limit, offset);
  });

  const createChannelSchema = {
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 32, pattern: '^[a-z0-9-]+$' },
        description: { type: 'string', maxLength: 200 },
        type: { type: 'string', enum: ['TEXT', 'VOICE'] },
      },
    },
  };

  const requireAdmin = async (request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) => {
    const userId = getAuthUserId(request);
    if (!(await isAdmin(userId))) {
      return reply.code(403).send({ message: 'Administrator permissions required' });
    }
  };

  fastify.post<{ Body: { name: string; description?: string; type?: 'TEXT' | 'VOICE' } }>(
    '/',
    { schema: createChannelSchema, preHandler: requireAdmin },
    async (request, reply) => {
      const { name, description, type } = request.body;
      const channel = await createChannel(name, description, type);
      return reply.code(201).send(channel);
    },
  );

  fastify.put<{ Params: { id: string }; Body: { name: string; description?: string } }>(
    '/:id',
    { schema: createChannelSchema, preHandler: requireAdmin },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { name, description } = request.body;
        return await updateChannel(id, name, description);
      } catch (error: unknown) {
        // P2025 = Prisma "Record not found"
        if ((error as { code?: string }).code === 'P2025') {
          return reply.code(404).send({ message: 'Channel not found' });
        }
        throw error;
      }
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/:id/messages',
    async (request) => {
      const { id } = request.params;
      const { cursor } = request.query;
      const result = await getChannelMessages(id, 50, cursor);
      // Reverse because we query descending (newest first) but UI renders oldest to newest.
      return { ...result, messages: result.messages.reverse() };
    },
  );
}
