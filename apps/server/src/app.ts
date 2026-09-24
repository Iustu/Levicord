import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyOauth2 from '@fastify/oauth2';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import authRoutes from './routes/auth.routes';
import channelRoutes from './routes/channel.routes';
import uploadRoutes from './routes/upload.routes';
import { prisma } from './prisma';
import { redis } from './socket';

// Load environment variables
import 'dotenv/config';

export function buildApp(): FastifyInstance {
  const isProduction = process.env.NODE_ENV === 'production';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const callbackUrl = process.env.OAUTH_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

  // Fail fast: never start with a weak JWT secret (DevSecOps — Secure by Default)
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  }
  if (isProduction && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
    throw new Error('FATAL: Google OAuth credentials are required in production.');
  }
  const parsedFrontendUrl = new URL(frontendUrl);
  if (isProduction && parsedFrontendUrl.protocol !== 'https:') {
    throw new Error('FATAL: FRONTEND_URL must use HTTPS in production.');
  }
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty', // You might want to install pino-pretty for dev logs, or omit for prod JSON logs
        options: {
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Security Headers (Building Secure & Reliable Systems — Defense in Depth)
  app.register(fastifyHelmet, {
    // Allow inline scripts needed by Vite in development
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // Plugins
  app.register(fastifyCors, {
    origin: parsedFrontendUrl.origin,
    credentials: true,
  });

  app.register(fastifyCookie);
  app.register(fastifyMultipart);
  
  app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });

  app.register(fastifyRateLimit, {
    max: 100, // max 100 requests per time window
    timeWindow: '1 minute'
  });

  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!, // guaranteed non-null by the guard above
    cookie: {
      cookieName: 'accessToken',
      signed: false
    }
  });

  app.register(fastifyOauth2, {
    name: 'googleOAuth2',
    credentials: {
      client: {
        id: process.env.GOOGLE_CLIENT_ID || 'development-client-id',
        secret: process.env.GOOGLE_CLIENT_SECRET || 'development-client-secret'
      },
      auth: fastifyOauth2.GOOGLE_CONFIGURATION
    },
    startRedirectPath: '/api/auth/google',
    callbackUri: callbackUrl,
    scope: ['profile', 'email']
  });

  // Socket.io
  app.register(require('fastify-socket.io'), {
    cors: {
      origin: parsedFrontendUrl.origin,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Routes
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(channelRoutes, { prefix: '/api/channels' });
  app.register(require('./routes/user.routes').default, { prefix: '/api/users' });
  app.register(uploadRoutes, { prefix: '/api/upload' });

  app.get('/livez', async () => {
    return { status: 'ok' };
  });

  app.get('/readyz', async (_request, reply) => {
    try {
      await Promise.all([
        prisma.$queryRaw`SELECT 1`,
        redis.ping(),
      ]);
      return { status: 'ready' };
    } catch (error) {
      app.log.error(error, 'Readiness check failed');
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  app.get('/', async () => ({ status: 'ok' }));

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('accessToken', { path: '/' });
    reply.clearCookie('refreshToken', { path: '/' });
    return { status: 'ok' };
  });

  return app;
}
