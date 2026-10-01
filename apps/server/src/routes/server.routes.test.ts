import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';

vi.mock('../prisma', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    server: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    serverMember: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    serverBan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    serverInvite: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    channel: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
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

describe('Server Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject non-superadmin from creating a server', async () => {
    const token = app.jwt.sign({ sub: 'user-regular' });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-regular',
      email: 'regular@test.com',
      role: 'USER',
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Servidor Ilegal' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain('SuperAdmins');
  });

  it('should allow SuperAdmin to create a server', async () => {
    const token = app.jwt.sign({ sub: 'user-super' });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-super',
      email: 'joaoprf2001@gmail.com',
      role: 'SUPERADMIN',
    } as any);

    vi.mocked(prisma.server.create).mockResolvedValueOnce({
      id: 'srv-novo',
      name: 'Comunidade VIP',
      ownerId: 'user-super',
    } as any);

    vi.mocked(prisma.serverMember.create).mockResolvedValueOnce({
      id: 'sm-1',
      serverId: 'srv-novo',
      userId: 'user-super',
      role: 'OWNER',
    } as any);

    vi.mocked(prisma.channel.create).mockResolvedValueOnce({
      id: 'ch-geral',
      name: 'geral',
      type: 'TEXT',
      serverId: 'srv-novo',
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Comunidade VIP' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBe('srv-novo');
    expect(body.defaultChannelId).toBe('ch-geral');
  });

  it('should list servers where user is a member', async () => {
    const token = app.jwt.sign({ sub: 'user-1' });
    vi.mocked(prisma.server.findMany).mockResolvedValueOnce([
      {
        id: 'srv-1',
        name: 'Servidor 1',
        channels: [],
        _count: { members: 5 },
      } as any,
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/servers',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });
});
