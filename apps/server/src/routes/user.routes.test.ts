import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';
import * as userService from '../services/user.service';
import * as dmService from '../services/dm.service';

vi.mock('../prisma', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    directMessage: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  };
  return { prisma: mockPrisma, default: mockPrisma };
});

vi.mock('../lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

vi.mock('../services/user.service', () => ({
  getUsers: vi.fn(),
}));

vi.mock('../services/dm.service', () => ({
  getDirectMessages: vi.fn(),
}));

describe('User Routes (/api/users)', () => {
  let app: FastifyInstance;

  const generateToken = (userId: string) =>
    app.jwt.sign({ sub: userId });

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for GET /api/users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns users list for authenticated request', async () => {
    const mockUsers = {
      users: [{ id: 'u-2', displayName: 'Bob', avatarUrl: null }],
      nextCursor: null,
    };
    vi.mocked(userService.getUsers).mockResolvedValue(mockUsers);

    const token = generateToken('u-1');
    const res = await app.inject({
      method: 'GET',
      url: '/api/users?limit=50',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users).toHaveLength(1);
    expect(userService.getUsers).toHaveBeenCalledWith('u-1', 50, undefined);
  });

  it('returns direct messages scoped to authenticated user and reverses them for chronology', async () => {
    const mockDms = [
      { id: 'dm-2', content: 'recent', createdAt: '2026-10-02T10:00:00Z' },
      { id: 'dm-1', content: 'older', createdAt: '2026-10-02T09:00:00Z' },
    ];
    vi.mocked(dmService.getDirectMessages).mockResolvedValue(mockDms as any);

    const token = generateToken('u-1');
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/u-2/dms',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe('dm-1');
    expect(body[1].id).toBe('dm-2');
    expect(dmService.getDirectMessages).toHaveBeenCalledWith('u-1', 'u-2', 50, undefined);
  });
});
