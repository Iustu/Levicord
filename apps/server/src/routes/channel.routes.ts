import { FastifyInstance } from 'fastify';
import { getChannels, createChannel, getChannelMessages } from '../services/channel.service';

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

  fastify.post<{ Body: { name: string; description?: string } }>('/', { schema: createChannelSchema }, async (request, reply) => {
    const { name, description } = request.body;
    const channel = await createChannel(name, description);
    return reply.code(201).send(channel);
  });

  fastify.get<{ Params: { id: string }, Querystring: { cursor?: string } }>('/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const { cursor } = request.query;
    
    const messages = await getChannelMessages(id, 50, cursor);
    // Reverse because we queried descending to get latest, but UI usually wants oldest to newest top-down
    return messages.reverse(); 
  });
}
