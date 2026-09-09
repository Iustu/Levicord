import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
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

      socket.on('send_message', async (data: { channelId: string, content: string }) => {
        try {
          const message = await createMessage(data.content, userId, data.channelId);
          // Broadcast to everyone in the room
          app.io.to(data.channelId).emit('new_message', message);
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
