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

  fastify.post<{ Body: { name: string; description?: string } }>('/', async (request, reply) => {
    const { name, description } = request.body;
    if (!name) {
      return reply.code(400).send({ error: 'Channel name is required' });
    }
    const channel = await createChannel(name, description);
    return channel;
  });

  fastify.get<{ Params: { id: string }, Querystring: { cursor?: string } }>('/:id/messages', async (request, reply) => {
    const { id } = request.params;
    const { cursor } = request.query;
    
    const messages = await getChannelMessages(id, 50, cursor);
    // Reverse because we queried descending to get latest, but UI usually wants oldest to newest top-down
    return messages.reverse(); 
  });
}
