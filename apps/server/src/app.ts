import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyOauth2 from '@fastify/oauth2';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHelmet from '@fastify/helmet';
import authRoutes from './routes/auth.routes';

// Load environment variables
import 'dotenv/config';

export function buildApp(): FastifyInstance {
  // Fail fast: never start with a weak JWT secret (DevSecOps — Secure by Default)
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
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
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  app.register(fastifyRateLimit, {
    max: 100, // max 100 requests per time window
    timeWindow: '1 minute'
  });

  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!, // guaranteed non-null by the guard above
    cookie: {
      cookieName: 'refreshToken',
      signed: false
    }
  });

  app.register(fastifyOauth2, {
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

  // Socket.io
  app.register(require('fastify-socket.io'), {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Routes
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(require('./routes/channel.routes').default, { prefix: '/api/channels' });

  app.get('/', async () => {
    return { status: 'ok' };
  });

  return app;
}
