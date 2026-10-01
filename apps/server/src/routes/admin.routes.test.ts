import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';

vi.mock('../prisma', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    serverMember: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  };
  return { prisma: mockPrisma, default: mockPrisma };
});

vi.mock('../lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

describe('Admin Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject non-superadmin access to /api/admin/superadmins', async () => {
    const token = app.jwt.sign({ sub: 'regular-user' });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'regular-user',
      email: 'user@test.com',
      role: 'USER',
    } as any);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/superadmins',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should allow SuperAdmin to list superadmins', async () => {
    const token = app.jwt.sign({ sub: 'super-actor' });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'super-actor',
      email: 'joaoprf2001@gmail.com',
      role: 'SUPERADMIN',
    } as any);

    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      {
        id: 'super-actor',
        displayName: 'Root João',
        email: 'joaoprf2001@gmail.com',
        avatarUrl: null,
        role: 'SUPERADMIN',
        promotedById: null,
        promotedBy: null,
        createdAt: new Date(),
      } as any,
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/superadmins',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(1);
    expect(body[0].isRoot).toBe(true);
  });

  it('should prevent demoting Root SuperAdmin', async () => {
    const token = app.jwt.sign({ sub: 'other-super' });
    // Guard check
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'other-super',
      email: 'other@test.com',
      role: 'SUPERADMIN',
    } as any);

    // Endpoint actor and target check
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        id: 'other-super',
        email: 'other@test.com',
        role: 'SUPERADMIN',
      } as any)
      .mockResolvedValueOnce({
        id: 'root-user',
        email: 'joaoprf2001@gmail.com',
        role: 'SUPERADMIN',
        promotedById: null,
      } as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/superadmins/root-user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('irrevogável');
  });

  it('should allow Root SuperAdmin to demote an orphan SuperAdmin (no superior)', async () => {
    const token = app.jwt.sign({ sub: 'root-id' });
    // Guard check
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'root-id',
      email: 'joaoprf2001@gmail.com',
      role: 'SUPERADMIN',
    } as any);

    // Actor and target lookup
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        id: 'root-id',
        email: 'joaoprf2001@gmail.com',
        role: 'SUPERADMIN',
      } as any)
      .mockResolvedValueOnce({
        id: 'orphan-super',
        email: 'orphan@test.com',
        role: 'SUPERADMIN',
        promotedById: null,
      } as any);

    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'orphan-super',
      displayName: 'Orphan User',
      email: 'orphan@test.com',
      avatarUrl: null,
      role: 'USER',
    } as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/superadmins/orphan-super',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().role).toBe('USER');
  });

  it('should prevent non-root SuperAdmin from demoting an orphan SuperAdmin', async () => {
    const token = app.jwt.sign({ sub: 'regular-super-id' });
    // Guard check
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'regular-super-id',
      email: 'super2@test.com',
      role: 'SUPERADMIN',
    } as any);

    // Actor and target lookup
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({
        id: 'regular-super-id',
        email: 'super2@test.com',
        role: 'SUPERADMIN',
      } as any)
      .mockResolvedValueOnce({
        id: 'orphan-super',
        email: 'orphan@test.com',
        role: 'SUPERADMIN',
        promotedById: null,
      } as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/superadmins/orphan-super',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('joaoprf2001@gmail.com');
  });
});
