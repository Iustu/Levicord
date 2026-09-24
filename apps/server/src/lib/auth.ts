import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Typed helper to extract the authenticated user's ID from a verified JWT.
 * Avoids the repeated `(request.user as any).sub` pattern across routes.
 * (Engenharia de Software — DRY + Strong Typing)
 */
export function getAuthUserId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub;
}

/**
 * Reusable preHandler hook that verifies the JWT and sends 401 on failure.
 * Use as `preHandler: requireAuth` instead of duplicating `addHook('onRequest')`.
 * (Engenharia de Software — SRP + DRY)
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
}
