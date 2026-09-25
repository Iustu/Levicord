import { buildApp } from './app';
import { setupSockets } from './socket';
import { redis } from './lib/redis';
import { prisma } from './prisma';
import { ensureBucket } from './lib/minio';
import type { FastifyInstance } from 'fastify';
import type { Server as SocketServer } from 'socket.io';

type SocketApp = FastifyInstance & { io: SocketServer };

const start = async () => {
  const app = buildApp();
  setupSockets(app);

  try {
    await ensureBucket();
    await app.listen({ port: 3000, host: '0.0.0.0' });
    app.log.info('Server listening on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal} — starting graceful shutdown`);

    // Stop accepting new HTTP requests
    await app.close();

    // Close all Socket.io connections gracefully
    const socketApp = app as SocketApp;
    await new Promise<void>((resolve) => {
      socketApp.io.close(() => resolve());
    });

    // Close DB and cache connections
    await prisma.$disconnect();
    await redis.quit();

    app.log.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
};

start();
