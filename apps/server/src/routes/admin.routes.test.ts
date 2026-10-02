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
    del: vi.fn().mockResolvedValue(1),
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

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('should allow searching users when actor is SuperAdmin', async () => {
    const token = app.jwt.sign({ sub: 'super-actor' });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'super-actor',
      email: 'joaoprf2001@gmail.com',
      role: 'SUPERADMIN',
    } as any);

    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'u1', displayName: 'Ana Silva', email: 'ana@test.com', role: 'USER' } as any,
    ]);

    const resWithQuery = await app.inject({
      method: 'GET',
      url: '/api/admin/users?q=ana',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resWithQuery.statusCode).toBe(200);
    expect(resWithQuery.json()).toHaveLength(1);

    // Search without query
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'super-actor',
      email: 'joaoprf2001@gmail.com',
      role: 'SUPERADMIN',
    } as any);
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: 'u1', displayName: 'Ana Silva', email: 'ana@test.com', role: 'USER' } as any,
      { id: 'u2', displayName: 'Bruno Costa', email: 'bruno@test.com', role: 'USER' } as any,
    ]);

    const resNoQuery = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(resNoQuery.statusCode).toBe(200);
    expect(resNoQuery.json()).toHaveLength(2);
  });

  it('should return 400 when promoting without targetUserId', async () => {
    const token = app.jwt.sign({ sub: 'super-actor' });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'super-actor',
      email: 'joaoprf2001@gmail.com',
      role: 'SUPERADMIN',
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/superadmins',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('should return 404 when target user to promote does not exist', async () => {
    const token = app.jwt.sign({ sub: 'super-actor' });
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where?.id === 'super-actor') {
        return {
          id: 'super-actor',
          email: 'joaoprf2001@gmail.com',
          role: 'SUPERADMIN',
        } as any;
      }
      return null;
    }) as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/superadmins',
      headers: { authorization: `Bearer ${token}` },
      payload: { targetUserId: 'non-existent' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('não encontrado');
  });

  it('should allow Root SuperAdmin to promote an eligible user to SuperAdmin', async () => {
    const token = app.jwt.sign({ sub: 'root-id' });
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where?.id === 'root-id') {
        return {
          id: 'root-id',
          email: 'joaoprf2001@gmail.com',
          role: 'SUPERADMIN',
        } as any;
      }
      if (where?.id === 'target-user') {
        return {
          id: 'target-user',
          email: 'target@test.com',
          role: 'USER',
          promotedById: null,
        } as any;
      }
      return null;
    }) as any);

    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'target-user',
      displayName: 'Target User',
      email: 'target@test.com',
      avatarUrl: null,
      role: 'SUPERADMIN',
      promotedById: 'root-id',
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/superadmins',
      headers: { authorization: `Bearer ${token}` },
      payload: { targetUserId: 'target-user' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().role).toBe('SUPERADMIN');
    expect(response.json().promotedById).toBe('root-id');
  });

  it('should return 404 when target user to demote does not exist', async () => {
    const token = app.jwt.sign({ sub: 'root-id' });
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: any) => {
      if (where?.id === 'root-id') {
        return {
          id: 'root-id',
          email: 'joaoprf2001@gmail.com',
          role: 'SUPERADMIN',
        } as any;
      }
      return null;
    }) as any);

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/admin/superadmins/non-existent-user',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toContain('não encontrado');
  });
});
