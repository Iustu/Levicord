import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { z } from 'zod';
import { createMessage } from '../services/channel.service';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export function setupSockets(app: FastifyInstance) {
  app.ready((err) => {
    if (err) throw err;

    app.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error'));
        
        // Fastify JWT verify method can be tricky to use directly outside a request
        // Using app.jwt.verify
        const decoded = app.jwt.verify<{sub: string}>(token);
        socket.data.userId = decoded.sub;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    app.io.on('connection', async (socket) => {
      const userId = socket.data.userId;
      app.log.info(`Socket connected: ${socket.id} (User: ${userId})`);

      // Track presence
      await redis.sadd('online_users', userId);
      app.io.emit('user_status', { userId, status: 'online' });

      socket.on('join_channel', (channelId: string) => {
        // Leave previous channels if necessary, or just join multiple
        // For simplicity, we just join. In a real app we might leave others.
        socket.join(channelId);
        app.log.info(`User ${userId} joined channel ${channelId}`);
      });

      socket.on('send_message', async (data: unknown) => {
        // Validate incoming data with Zod (Building Secure Systems — Defense in Depth)
        const messageSchema = z.object({
          channelId: z.string().cuid({ message: 'Invalid channel ID' }),
          content: z.string()
            .min(1, 'Message cannot be empty')
            .max(2000, 'Message exceeds maximum length of 2000 characters')
            .trim(),
        });

        const result = messageSchema.safeParse(data);
        if (!result.success) {
          socket.emit('error', { message: result.error.issues[0].message });
          return;
        }

        try {
          const message = await createMessage(result.data.content, userId, result.data.channelId);
          app.io.to(result.data.channelId).emit('new_message', message);
        } catch (error) {
          app.log.error(error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      socket.on('disconnect', async () => {
        app.log.info(`Socket disconnected: ${socket.id} (User: ${userId})`);
        
        // Very basic presence: wait a bit before marking offline in case of reconnect
        // In a real app, you count connections per user.
        await redis.srem('online_users', userId);
        app.io.emit('user_status', { userId, status: 'offline' });
      });
    });
  });
}
