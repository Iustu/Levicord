import Redis from 'ioredis';

/**
 * Shared Redis client — single instance exported to avoid multiple connections.
 * (Engenharia de Software — DRY, Singleton pattern)
 */
const isTest = process.env.NODE_ENV === 'test';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: isTest,
  enableOfflineQueue: !isTest,
  retryStrategy: isTest ? () => null : (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: isTest ? 1 : 20,
});

redis.on('error', (err) => {
  if (!isTest) {
    console.error('[redis] connection error:', err);
  }
});

/**
 * Checks a sliding-window rate limit for a given key.
 * Returns true if the request is ALLOWED, false if it should be rejected.
 *
 * (Engenharia de Software — Extract Function, DRY — previously duplicated in
 * send_message and send_dm handlers inside socket/index.ts)
 */
export async function checkRateLimit(
  key: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= maxCount;
}
