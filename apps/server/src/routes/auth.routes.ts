import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { processGoogleUser, updateUserProfile } from '../services/auth.service';

const googleUserInfoSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  verified_email: z.boolean().optional(),
  name: z.string().min(1),
  picture: z.string().url().optional(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/session', {
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (error) {
        return reply.code(401).send({ message: 'Unauthenticated' });
      }
    },
  }, async (request) => {
    // Return actual user object instead of just { authenticated: true }
    return { authenticated: true, user: request.user };
  });

  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      return reply.code(401).send({ message: 'No refresh token' });
    }
    try {
      const decoded = fastify.jwt.verify<{sub: string}>(refreshToken);
      const newAccessToken = fastify.jwt.sign({ sub: decoded.sub }, { expiresIn: '15m' });
      
      reply.setCookie('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      });
      return { status: 'ok' };
    } catch (err) {
      return reply.code(401).send({ message: 'Invalid refresh token' });
    }
  });

  fastify.patch<{ Body: { displayName: string } }>('/profile', {
    schema: {
      body: {
        type: 'object',
        required: ['displayName'],
        additionalProperties: false,
        properties: {
          displayName: { type: 'string', minLength: 2, maxLength: 32 },
        },
      },
    },
    onRequest: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    },
  }, async (request, reply) => {
    const displayName = request.body.displayName.trim();

    if (displayName.length < 2) {
      return reply.code(400).send({ message: 'Display name must contain at least 2 characters' });
    }

    const user = await updateUserProfile((request.user as { sub: string }).sub, displayName);
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

      const user = await processGoogleUser(userInfo);

      const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: '15m' });
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
        maxAge: 15 * 60, // 15 minutes
      });
      reply.setCookie('refreshToken', refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      reply.redirect(`${frontendUrl}/setup`);

    } catch (err) {
      request.log.error(err);
      reply.code(500).send({ error: 'Authentication failed' });
    }
  });
}
