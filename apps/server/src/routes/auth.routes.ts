import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { processGoogleUser, updateUserProfile } from '../services/auth.service';
import { requireAuth, getAuthUserId } from '../lib/auth';
import { prisma } from '../prisma';
import { redis } from '../lib/redis';

const googleUserInfoSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  verified_email: z.boolean().optional(),
  name: z.string().min(1),
  picture: z.string().url().optional(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/session', {
    preHandler: requireAuth,
  }, async (request) => {
    const userId = getAuthUserId(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, avatarUrl: true, role: true },
    });
    return {
      authenticated: true,
      user: user ? { ...user, sub: user.id } : request.user,
    };
  });

  fastify.get('/me', {
    preHandler: requireAuth,
  }, async (request, reply) => {
    const userId = getAuthUserId(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, avatarUrl: true, role: true },
    });
    if (!user) return reply.code(404).send({ message: 'User not found' });
    return user;
  });

  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      return reply.code(401).send({ message: 'No refresh token' });
    }
    try {
      const decoded = fastify.jwt.verify<{sub: string; exp?: number}>(refreshToken);

      const isProduction = process.env.NODE_ENV === 'production';
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax' as const,
        path: '/',
      };

      // Check if this token was already rotated recently (concurrency grace period for parallel requests)
      const rotatedKey = `rt_rotated:${refreshToken}`;
      if (typeof redis.get === 'function') {
        const rotatedData = await redis.get(rotatedKey);
        if (rotatedData) {
          try {
            const { accessToken, refreshToken: newRt } = JSON.parse(rotatedData);
            reply.setCookie('accessToken', accessToken, {
              ...cookieOptions,
              maxAge: 2 * 60 * 60, // 2 hours
            });
            reply.setCookie('refreshToken', newRt, {
              ...cookieOptions,
              maxAge: 7 * 24 * 60 * 60,
            });
            return { status: 'ok' };
          } catch {
            // ignore parsing error and proceed
          }
        }
      }

      // (BSRS Cap.5 & Cap.7) Check if this token has already been revoked (single-use enforcement)
      const blocklistKey = `rt_blocklist:${refreshToken}`;
      const isRevoked = await redis.exists(blocklistKey);
      if (isRevoked) {
        return reply.code(401).send({ message: 'Refresh token has already been used or revoked' });
      }

      // Revoke the current refresh token before issuing a new one.
      // TTL is set to the token's remaining lifetime so Redis auto-evicts it.
      const remainingTtl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 7 * 24 * 60 * 60;
      if (remainingTtl > 0) {
        await redis.set(blocklistKey, '1', 'EX', remainingTtl);
      }

      const newAccessToken = fastify.jwt.sign({ sub: decoded.sub }, { expiresIn: '2h' });
      const newRefreshToken = fastify.jwt.sign({ sub: decoded.sub }, { expiresIn: '7d' });

      // Store in rotatedKey for 30s grace window so in-flight concurrent requests don't fail
      if (typeof redis.set === 'function') {
        await redis.set(
          rotatedKey,
          JSON.stringify({ accessToken: newAccessToken, refreshToken: newRefreshToken }),
          'EX',
          30
        );
      }

      reply.setCookie('accessToken', newAccessToken, {
        ...cookieOptions,
        maxAge: 2 * 60 * 60, // 2 hours
      });
      reply.setCookie('refreshToken', newRefreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60,
      });

      return { status: 'ok' };
    } catch (err) {
      return reply.code(401).send({ message: 'Invalid refresh token' });
    }
  });

  fastify.post('/logout', async (request, reply) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      path: '/',
    };

    // (BSRS Cap.5) Revoke the refresh token on logout so it cannot be reused
    const refreshToken = request.cookies.refreshToken;
    if (refreshToken) {
      try {
        const decoded = fastify.jwt.verify<{exp?: number}>(refreshToken);
        const remainingTtl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 7 * 24 * 60 * 60;
        if (remainingTtl > 0) {
          await redis.set(`rt_blocklist:${refreshToken}`, '1', 'EX', remainingTtl);
        }
      } catch {
        // Token already invalid — nothing to revoke
      }
    }

    reply.clearCookie('accessToken', cookieOptions);
    reply.clearCookie('refreshToken', cookieOptions);
    request.log.info({ event: 'auth_logout', ip: request.ip }, 'User logged out');
    return reply.send({ status: 'ok' });
  });

  fastify.patch<{ Body: { displayName?: string; avatarUrl?: string | null } }>('/profile', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          displayName: { type: 'string', minLength: 2, maxLength: 32 },
          avatarUrl: { type: ['string', 'null'], maxLength: 500 },
        },
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const userId = getAuthUserId(request);
    const { displayName, avatarUrl } = request.body;

    const dataToUpdate: { displayName?: string; avatarUrl?: string | null } = {};

    if (displayName !== undefined) {
      const sanitized = sanitizeHtml(displayName.trim(), {
        allowedTags: [],
        allowedAttributes: {},
      });
      if (sanitized.length < 2 || sanitized.length > 32) {
        return reply.code(400).send({ message: 'Display name must contain between 2 and 32 characters' });
      }
      dataToUpdate.displayName = sanitized;
    }

    if (avatarUrl !== undefined) {
      if (avatarUrl === null || avatarUrl.trim() === '') {
        dataToUpdate.avatarUrl = null;
      } else {
        const trimmedUrl = avatarUrl.trim();
        const isUploadPath = trimmedUrl.startsWith('/uploads/');
        let isValidHttps = false;
        try {
          const parsed = new URL(trimmedUrl);
          isValidHttps = parsed.protocol === 'https:';
        } catch {
          isValidHttps = false;
        }

        if (!isUploadPath && !isValidHttps) {
          return reply.code(400).send({
            message: 'Avatar URL must be a valid HTTPS URL or an uploaded file path (/uploads/...)',
          });
        }
        dataToUpdate.avatarUrl = trimmedUrl;
      }
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return reply.code(400).send({ message: 'No fields to update' });
    }

    const user = await updateUserProfile(userId, dataToUpdate);
    return reply.send(user);
  });

  fastify.get('/google/callback', async function (request, reply) {
    try {
      const { token } = await (this as typeof this & { googleOAuth2: any }).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!userInfoResponse.ok) {
        throw new Error(`Google userinfo request failed with status ${userInfoResponse.status}`);
      }

      const userInfoResult = googleUserInfoSchema.safeParse(await userInfoResponse.json());
      if (!userInfoResult.success || userInfoResult.data.verified_email === false) {
        throw new Error('Google returned an invalid or unverified user profile');
      }

      const userInfo = {
        ...userInfoResult.data,
        picture: userInfoResult.data.picture || '',
      };

      const existingUser = await prisma.user.findUnique({
        where: { googleId: userInfo.id },
      });
      const isNewUser = !existingUser;

      const user = await processGoogleUser(userInfo);
      request.log.info({ event: 'auth_success', userId: user.id, provider: 'google', isNewUser }, 'User logged in successfully');

      const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: '2h' });
      const refreshToken = await reply.jwtSign({ sub: user.id }, { expiresIn: '7d' });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
      };

      reply.setCookie('accessToken', accessToken, {
        ...cookieOptions,
        maxAge: 2 * 60 * 60, // 2 hours
      });
      reply.setCookie('refreshToken', refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      // New users are guided to choose their display name in /setup
      // Returning users with saved profiles go directly to /app
      if (isNewUser) {
        reply.redirect(`${frontendUrl}/setup`);
      } else {
        reply.redirect(`${frontendUrl}/app`);
      }

    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Authentication failed' });
    }
  });
}
