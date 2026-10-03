import { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from './redis';

/**
 * Typed helper to extract the authenticated user's ID from a verified JWT.
 * Avoids the repeated `(request.user as any).sub` pattern across routes.
 * (Engenharia de Software — DRY + Strong Typing)
 */
export function getAuthUserId(request: FastifyRequest): string {
  return (request.user as { sub: string }).sub;
}

/**
 * Reusable preHandler hook that verifies the JWT.
 * If the accessToken cookie is missing or expired, it seamlessly verifies the
 * refreshToken cookie (sliding session) and re-issues an accessToken without
 * rejecting the user with a 401 error.
 * (Engenharia de Software — SRP + DRY + Seamless UX)
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err: any) {
    const isTokenMissingOrExpired =
      err?.code === 'FST_JWT_NO_AUTHORIZATION_IN_COOKIE' ||
      err?.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED';

    const refreshToken = request.cookies?.refreshToken;

    if (isTokenMissingOrExpired && refreshToken) {
      try {
        const fastify = request.server as any;
        const decoded = fastify.jwt.verify(refreshToken) as { sub: string; exp?: number };

        const blocklistKey = `rt_blocklist:${refreshToken}`;
        const isRevoked = typeof redis.exists === 'function' ? await redis.exists(blocklistKey) : 0;

        if (!isRevoked && decoded?.sub) {
          const isProduction = process.env.NODE_ENV === 'production';
          const newAccessToken = fastify.jwt.sign({ sub: decoded.sub }, { expiresIn: '2h' });

          reply.setCookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            path: '/',
            maxAge: 2 * 60 * 60, // 2 hours
          });

          request.user = { sub: decoded.sub };
          return;
        }
      } catch {
        // Refresh token invalid or expired — proceed to standard 401
      }
    }

    request.log.warn({ event: 'auth_failure', ip: request.ip, error: err }, 'Authentication failed');
    reply.send(err);
  }
}
