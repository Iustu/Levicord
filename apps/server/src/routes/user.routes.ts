import { FastifyInstance } from 'fastify';
import { getUsers } from '../services/user.service';
import { getDirectMessages } from '../services/dm.service';
import { z } from 'zod';

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.get('/', async (request, reply) => {
    const userId = (request.user as any).sub;
    const users = await getUsers(userId);
    return users;
  });

  fastify.get<{ Params: { id: string }, Querystring: { cursor?: string } }>('/:id/dms', async (request, reply) => {
    const loggedUserId = (request.user as any).sub;
    const { id: targetUserId } = request.params;
    const { cursor } = request.query;

    const messages = await getDirectMessages(loggedUserId, targetUserId, 50, cursor);
    return messages.reverse();
  });
}
