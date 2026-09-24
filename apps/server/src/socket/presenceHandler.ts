import type { Server, Socket } from 'socket.io';
import { redis } from '../lib/redis';

const PRESENCE_TTL_SECONDS = 60;
const PRESENCE_HEARTBEAT_MS = 30_000;

/**
 * Manages user online/offline presence using Redis counters.
 * Supports multiple tabs/connections per user.
 * (Engenharia de Software — SRP)
 */
export function registerPresenceHandler(io: Server, socket: Socket, userId: string) {
  const presenceKey = `online_user_connections:${userId}`;

  const initPresence = async () => {
    const count = await redis.incr(presenceKey);
    await redis.expire(presenceKey, PRESENCE_TTL_SECONDS);
    if (count === 1) {
      io.emit('user_status', { userId, status: 'online' });
    }
  };

  // Heartbeat keeps the key alive while the user is connected
  const heartbeat = setInterval(() => {
    void redis.expire(presenceKey, PRESENCE_TTL_SECONDS);
  }, PRESENCE_HEARTBEAT_MS);

  // Join personal room for DM delivery
  socket.join(userId);

  void initPresence();

  socket.on('disconnect', async () => {
    clearInterval(heartbeat);
    const remaining = await redis.decr(presenceKey);
    if (remaining <= 0) {
      await redis.del(presenceKey);
      io.emit('user_status', { userId, status: 'offline' });
    }
  });
}
