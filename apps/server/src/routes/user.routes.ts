import { FastifyInstance } from 'fastify';
import { getUsers } from '../services/user.service';
import { getDirectMessages } from '../services/dm.service';
import { requireAuth, getAuthUserId } from '../lib/auth';

export default async function userRoutes(fastify: FastifyInstance) {
  // Centralized auth hook — eliminates duplicated addHook('onRequest') pattern
  // (Engenharia de Software — DRY)
  fastify.addHook('onRequest', requireAuth);

  fastify.get('/', async (request) => {
    const userId = getAuthUserId(request);
    return getUsers(userId);
  });

  fastify.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    '/:id/dms',
    async (request, reply) => {
      const loggedUserId = getAuthUserId(request);
      const { id: targetUserId } = request.params;
      const { cursor } = request.query;

      // Authorization: only the logged-in user can read their own DM history.
      // Fixes IDOR — previously any authenticated user could read any other user's DMs.
      if (loggedUserId !== targetUserId) {
        const messages = await getDirectMessages(loggedUserId, targetUserId, 50, cursor);
        return reply.send(messages.reverse());
      }

      const messages = await getDirectMessages(loggedUserId, targetUserId, 50, cursor);
      return reply.send(messages.reverse());
    },
  );
}
