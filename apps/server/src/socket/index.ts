import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { createMessage } from '../services/channel.service';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const messageSchema = z.object({
  channelId: z.string().cuid({ message: 'Invalid channel ID' }),
  content: z.string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message exceeds maximum length of 2000 characters')
    .trim(),
});
const channelIdSchema = z.string().cuid();
const MESSAGE_LIMIT = 30;
const MESSAGE_WINDOW_MS = 60_000;

function getCookieValue(header: string | undefined, name: string) {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

type SocketApp = FastifyInstance & { io: Server };

export function setupSockets(app: FastifyInstance) {
  const socketApp = app as SocketApp;

  socketApp.ready((err) => {
    if (err) throw err;

    socketApp.io.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth.token || getCookieValue(socket.handshake.headers.cookie, 'accessToken');
        if (!token) return next(new Error('Authentication error'));
        
        // Fastify JWT verify method can be tricky to use directly outside a request
        // Using app.jwt.verify
        const decoded = socketApp.jwt.verify<{sub: string}>(token);
        socket.data.userId = decoded.sub;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    socketApp.io.on('connection', async (socket: Socket) => {
      const userId = socket.data.userId;
      app.log.info(`Socket connected: ${socket.id} (User: ${userId})`);

      // Track presence
      const connectionCount = await redis.incr(`online_user_connections:${userId}`);
      const presenceKey = `online_user_connections:${userId}`;
      await redis.expire(presenceKey, 60);
      const presenceHeartbeat = setInterval(() => {
        void redis.expire(presenceKey, 60);
      }, 30000);
      if (connectionCount === 1) {
        socketApp.io.emit('user_status', { userId, status: 'online' });
      }

      socket.on('join_channel', (channelId: string) => {
        if (!channelIdSchema.safeParse(channelId).success) {
          socket.emit('error', { message: 'Invalid channel ID' });
          return;
        }

        const previousChannelId = socket.data.channelId as string | undefined;
        if (previousChannelId && previousChannelId !== channelId) {
          socket.leave(previousChannelId);
        }
        socket.join(channelId);
        socket.data.channelId = channelId;
        app.log.info(`User ${userId} joined channel ${channelId}`);
      });

      socket.on('send_message', async (data: unknown) => {
        const result = messageSchema.safeParse(data);
        if (!result.success) {
          socket.emit('error', { message: result.error.issues[0].message });
          return;
        }

        if (!socket.rooms.has(result.data.channelId)) {
          socket.emit('error', { message: 'Join the channel before sending messages' });
          return;
        }

        const rateLimitKey = `socket_message_rate:${userId}`;
        const messageCount = await redis.incr(rateLimitKey);
        if (messageCount === 1) {
          await redis.expire(rateLimitKey, MESSAGE_WINDOW_MS / 1000);
        }
        if (messageCount > MESSAGE_LIMIT) {
          socket.emit('error', { message: 'Message rate limit exceeded' });
          return;
        }

        try {
          const message = await createMessage(result.data.content, userId, result.data.channelId);
          socketApp.io.to(result.data.channelId).emit('new_message', message);
        } catch (error) {
          app.log.error(error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      socket.on('disconnect', async () => {
        clearInterval(presenceHeartbeat);
        app.log.info(`Socket disconnected: ${socket.id} (User: ${userId})`);
        
        const remainingConnections = await redis.decr(presenceKey);
        if (remainingConnections <= 0) {
          await redis.del(presenceKey);
          socketApp.io.emit('user_status', { userId, status: 'offline' });
        }
      });
    });
  });
}
