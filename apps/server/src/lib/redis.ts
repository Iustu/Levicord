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
 * Uses an atomic Lua script to avoid the race between INCR and EXPIRE:
 * if the process dies between the two commands, the key never expires and
 * the user is permanently banned. The script sets the TTL on first increment
 * within a single Redis round-trip.
 *
 * (BSRS Cap.10 DoS Mitigation — Engenharia de Software — Extract Function, DRY)
 */
export async function checkRateLimit(
  key: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  // Atomic Lua script: INCR the counter; if it's the first increment, set the
  // TTL in the same transaction. This prevents permanent keys on crash.
  const count = await redis.eval(
    `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `,
    1,         // numkeys
    key,       // KEYS[1]
    String(windowSeconds) // ARGV[1]
  ) as number;
  return count <= maxCount;
}
