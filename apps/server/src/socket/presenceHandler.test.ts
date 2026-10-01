import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { registerPresenceHandler } from './presenceHandler';

// ── Redis mock ────────────────────────────────────────────────────────────────
// We mock the entire redis module so tests are fully in-memory and never touch
// an actual Redis instance.
vi.mock('../lib/redis', () => ({
  redis: {
    incr: vi.fn(),
    decr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  },
}));

import { redis } from '../lib/redis';

// ── Socket / IO helpers ───────────────────────────────────────────────────────
function makeSocket(userId = 'user-1') {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  return {
    data: { userId },
    join: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb;
    }),
    emit: vi.fn(),
    _listeners: listeners,
    _trigger: (event: string, ...args: unknown[]) => listeners[event]?.(...args),
  };
}

function makeIo() {
  return { emit: vi.fn() };
}

/** Settle all pending microtasks / async promise chains */
async function flushPromises() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('registerPresenceHandler', () => {
  const userId = 'user-42';
  let io: ReturnType<typeof makeIo>;
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    vi.useFakeTimers();
    io = makeIo();
    socket = makeSocket(userId);

    // Default: first connection (incr returns 1)
    (redis.incr as Mock).mockResolvedValue(1);
    (redis.expire as Mock).mockResolvedValue(1);
    (redis.decr as Mock).mockResolvedValue(0);
    (redis.del as Mock).mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('joins the personal room on registration', () => {
    registerPresenceHandler(io as never, socket as never, userId);
    expect(socket.join).toHaveBeenCalledWith(userId);
  });

  it('increments the Redis counter and sets TTL on registration', async () => {
    registerPresenceHandler(io as never, socket as never, userId);
    await flushPromises();
    const key = `online_user_connections:${userId}`;
    expect(redis.incr).toHaveBeenCalledWith(key);
    expect(redis.expire).toHaveBeenCalledWith(key, expect.any(Number));
  });

  it('broadcasts user_status online when first connection (count === 1)', async () => {
    (redis.incr as Mock).mockResolvedValue(1);
    registerPresenceHandler(io as never, socket as never, userId);
    await flushPromises();
    expect(io.emit).toHaveBeenCalledWith('user_status', { userId, status: 'online' });
  });

  it('does NOT broadcast user_status online for subsequent connections (count > 1)', async () => {
    (redis.incr as Mock).mockResolvedValue(2); // second tab
    registerPresenceHandler(io as never, socket as never, userId);
    await flushPromises();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('keeps the Redis key alive via heartbeat every 30 s', async () => {
    registerPresenceHandler(io as never, socket as never, userId);
    await flushPromises(); // settle initPresence

    const callsBefore = (redis.expire as Mock).mock.calls.length;
    // Advance exactly one heartbeat interval (30_000 ms)
    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect((redis.expire as Mock).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('decrements counter and broadcasts offline when last connection disconnects', async () => {
    (redis.decr as Mock).mockResolvedValue(0); // last tab
    registerPresenceHandler(io as never, socket as never, userId);
    await flushPromises();

    // Trigger disconnect
    socket._trigger('disconnect');
    await flushPromises();

    const key = `online_user_connections:${userId}`;
    expect(redis.decr).toHaveBeenCalledWith(key);
    expect(redis.del).toHaveBeenCalledWith(key);
    expect(io.emit).toHaveBeenCalledWith('user_status', { userId, status: 'offline' });
  });

  it('decrements counter but does NOT broadcast offline when other tabs remain', async () => {
    (redis.incr as Mock).mockResolvedValue(1);
    (redis.decr as Mock).mockResolvedValue(1); // still 1 connection left
    registerPresenceHandler(io as never, socket as never, userId);
    await flushPromises();

    // Clear the online broadcast from init
    io.emit.mockClear();

    socket._trigger('disconnect');
    await flushPromises();

    expect(redis.del).not.toHaveBeenCalled();
    // No offline broadcast
    const offlineCalls = (io.emit as Mock).mock.calls.filter(
      ([event, payload]) => event === 'user_status' && payload.status === 'offline',
    );
    expect(offlineCalls).toHaveLength(0);
  });

  it('stops the heartbeat interval on disconnect', async () => {
    registerPresenceHandler(io as never, socket as never, userId);
    await flushPromises();

    const expireCallsAfterConnect = (redis.expire as Mock).mock.calls.length;
    socket._trigger('disconnect');
    await flushPromises();

    // Advance another 30s — heartbeat should NOT fire again
    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect((redis.expire as Mock).mock.calls.length).toBe(expireCallsAfterConnect);
  });
});
