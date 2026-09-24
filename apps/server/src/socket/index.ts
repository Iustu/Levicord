import { FastifyInstance } from 'fastify';
import type { Server, Socket } from 'socket.io';
import { registerMessageHandler } from './messageHandler';
import { registerDmHandler } from './dmHandler';
import { registerVoiceHandler } from './voiceHandler';
import { registerPresenceHandler } from './presenceHandler';

type SocketApp = FastifyInstance & { io: Server };

function getCookieValue(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Sets up the Socket.io server — authentication middleware + handler registration.
 *
 * This file is intentionally thin: it only wires together the domain-specific
 * handlers defined in sibling files (SRP, low coupling).
 * (Engenharia de Software — SRP, Façade pattern)
 */
export function setupSockets(app: FastifyInstance) {
  const socketApp = app as SocketApp;

  socketApp.ready((err) => {
    if (err) throw err;

    // ── Authentication middleware ──────────────────────────────────────────────
    socketApp.io.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth.token ||
          getCookieValue(socket.handshake.headers.cookie, 'accessToken');
        if (!token) return next(new Error('Authentication error'));

        const decoded = socketApp.jwt.verify<{ sub: string }>(token);
        socket.data.userId = decoded.sub;
        next();
      } catch {
        next(new Error('Authentication error'));
      }
    });

    // ── Connection: delegate to domain handlers ────────────────────────────────
    socketApp.io.on('connection', (socket: Socket) => {
      const userId = socket.data.userId as string;
      app.log.info(`Socket connected: ${socket.id} (User: ${userId})`);

      registerPresenceHandler(socketApp.io, socket, userId);
      registerMessageHandler(socketApp.io, socket, userId, app.log);
      registerDmHandler(socketApp.io, socket, userId, app.log);
      registerVoiceHandler(socketApp.io, socket, userId);
    });
  });
}

// Re-export redis for backward compatibility with any other files that import from here
export { redis } from '../lib/redis';
