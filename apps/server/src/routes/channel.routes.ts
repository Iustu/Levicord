import { FastifyInstance } from 'fastify';
import { getChannels, createChannel, updateChannel, getChannelMessages } from '../services/channel.service';
import { isAdmin } from '../services/auth.service';

export default async function channelRoutes(fastify: FastifyInstance) {
  // Middleware to ensure user is authenticated for all channel routes
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.get('/', async (request, reply) => {
    const channels = await getChannels();
    return channels;
  });

  const createChannelSchema = {
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 32, pattern: '^[a-z0-9-]+$' },
        description: { type: 'string', maxLength: 200 },
      },
    },
  };

  const requireAdmin = async (request: { user: unknown }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    const userId = (request.user as { sub: string }).sub;
    if (!(await isAdmin(userId))) {
      return reply.code(403).send({ message: 'Administrator permissions required' });
    }
  };

  fastify.post<{ Body: { name: string; description?: string } }>('/', { schema: createChannelSchema, preHandler: requireAdmin }, async (request, reply) => {
    const { name, description } = request.body;
    const channel = await createChannel(name, description);
    return reply.code(201).send(channel);
  });

  fastify.put<{ Params: { id: string }; Body: { name: string; description?: string } }>(
    '/:id',
    { schema: createChannelSchema, preHandler: requireAdmin },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { name, description } = request.body;
        return await updateChannel(id, name, description);
      } catch (error: any) {
        if (error.code === 'P2025') {
          return reply.code(404).send({ message: 'Channel not found' });
        }
        throw error;
      }
    },
  );

  fastify.get<{ Params: { id: string }, Querystring: { cursor?: string } }>('/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const { cursor } = request.query;
    
    const result = await getChannelMessages(id, 50, cursor);
    // Reverse because we queried descending, but the UI renders oldest to newest.
    return { ...result, messages: result.messages.reverse() };
  });
}
