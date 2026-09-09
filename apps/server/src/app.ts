import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyOauth2 from '@fastify/oauth2';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import authRoutes from './routes/auth.routes';

// Load environment variables
import 'dotenv/config';

export function buildApp(): FastifyInstance {
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
    secret: process.env.JWT_SECRET || 'supersecret',
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

  // Routes
  app.register(authRoutes, { prefix: '/api/auth' });

  app.get('/', async () => {
    return { status: 'ok' };
  });

  return app;
}
