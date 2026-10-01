import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyOauth2 from '@fastify/oauth2';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyMetrics from 'fastify-metrics';
import path from 'path';
import authRoutes from './routes/auth.routes';
import channelRoutes from './routes/channel.routes';
import uploadRoutes from './routes/upload.routes';
import downloadRoutes from './routes/download.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import serverRoutes from './routes/server.routes';
import { prisma } from './prisma';
import { redis } from './lib/redis';
import { checkMinioHealth } from './lib/minio';
import { openApiSpec } from './lib/openapi';

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
  // Fail fast: DATABASE_ENCRYPTION_KEY required; without it, DMs would be
  // encrypted with a public hardcoded fallback. (BSRS Cap.5 Least Privilege)
  if (!process.env.DATABASE_ENCRYPTION_KEY && !process.env.JWT_SECRET) {
    throw new Error('FATAL: DATABASE_ENCRYPTION_KEY environment variable is not set. Refusing to start.');
  }
  if (isProduction && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
    throw new Error('FATAL: Google OAuth credentials are required in production.');
  }
  const parsedFrontendUrl = new URL(frontendUrl);
  if (isProduction && parsedFrontendUrl.protocol !== 'https:') {
    throw new Error('FATAL: FRONTEND_URL must use HTTPS in production.');
  }
  const app = Fastify({
    logger: isProduction
      ? {
          // (BSRS Cap.15) Structured JSON logs in production for SIEM ingestibility.
          // pino-pretty is human-readable but cannot be parsed by log analysis tools.
          level: 'info',
        }
      : {
          transport: {
            target: 'pino-pretty',
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

  // APM metrics (Prometheus-compatible /metrics endpoint)
  if (process.env.NODE_ENV !== 'test') {
    app.register(fastifyMetrics, { endpoint: '/metrics' });
  }

  // Socket.io
  app.register(require('fastify-socket.io'), {
    cors: {
      origin: parsedFrontendUrl.origin,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // OpenAPI Documentation (DMMT Cap. 1 & BSRS)
  app.get('/api/openapi.json', async () => openApiSpec);
  app.get('/api/docs', async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html>
<head>
  <title>Levicord API Docs</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
    });
  </script>
</body>
</html>`);
  });

  // Routes — Versioned (/api/v1) and legacy aliases (/api) for zero-downtime backwards compatibility
  const registerApiRoutes = (prefix: string) => {
    app.register(authRoutes, { prefix: `${prefix}/auth` });
    app.register(channelRoutes, { prefix: `${prefix}/channels` });
    app.register(userRoutes, { prefix: `${prefix}/users` });
    app.register(uploadRoutes, { prefix: `${prefix}/upload` });
    app.register(adminRoutes, { prefix: `${prefix}/admin` });
    app.register(serverRoutes, { prefix: `${prefix}/servers` });
  };

  registerApiRoutes('/api/v1');
  registerApiRoutes('/api');
  app.register(downloadRoutes, { prefix: '/uploads' });

  app.get('/livez', async () => {
    return { status: 'ok' };
  });

  app.get('/readyz', async (_request, reply) => {
    const results = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
      checkMinioHealth(),
    ]);

    const [dbResult, redisResult, minioResult] = results;
    const degraded: string[] = [];

    if (dbResult.status === 'rejected') degraded.push('postgres');
    if (redisResult.status === 'rejected') degraded.push('redis');
    if (minioResult.status === 'fulfilled' && minioResult.value === false) degraded.push('minio');
    if (minioResult.status === 'rejected') degraded.push('minio');

    if (degraded.length > 0) {
      app.log.error({ degraded }, 'Readiness check failed');
      return reply.code(503).send({ status: 'not_ready', degraded });
    }

    return { status: 'ready' };
  });

  app.get('/', async () => ({ status: 'ok' }));

  return app;
}
