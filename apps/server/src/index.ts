import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyOauth2 from '@fastify/oauth2';
import fastifyJwt from '@fastify/jwt';
import { prisma } from './prisma';

const fastify = Fastify({ logger: true });

// Load environment variables (ensure dotenv is loaded if running directly without it)
import 'dotenv/config';

fastify.register(fastifyCors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'supersecret',
  cookie: {
    cookieName: 'refreshToken',
    signed: false
  }
});

fastify.register(fastifyOauth2, {
  name: 'googleOAuth2',
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID || '',
      secret: process.env.GOOGLE_CLIENT_SECRET || ''
    },
    auth: fastifyOauth2.GOOGLE_CONFIGURATION
  },
  startRedirectPath: '/api/auth/google',
  callbackUri: 'http://localhost:3000/api/auth/google/callback',
  scope: ['profile', 'email']
});

fastify.get('/api/auth/google/callback', async function (request, reply) {
  try {
    const { token } = await this.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    
    // Fetch user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    const userInfo = await userInfoResponse.json();

    if (!userInfo.email) {
      return reply.code(400).send({ error: 'Failed to get user email from Google' });
    }

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { googleId: userInfo.id },
      update: {
        email: userInfo.email,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture,
      },
      create: {
        googleId: userInfo.id,
        email: userInfo.email,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture,
      }
    });

    // Generate tokens
    const accessToken = await reply.jwtSign({ sub: user.id }, { expiresIn: '1h' });
    const refreshToken = await reply.jwtSign({ sub: user.id }, { expiresIn: '7d' });

    // Set refresh token in httpOnly cookie (requires @fastify/cookie which we need to install)
    // For now we'll just redirect with accessToken in URL hash or query, 
    // or send it as JSON if this was a popup. Let's redirect to frontend with token.
    // A better approach is setting the cookie and redirecting.
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    reply.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);

  } catch (err) {
    request.log.error(err);
    reply.code(500).send({ error: 'Authentication failed' });
  }
});

fastify.get('/', async (request, reply) => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server listening on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
