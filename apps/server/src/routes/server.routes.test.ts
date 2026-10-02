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

  it('should accept POST /api/servers/:serverId/invites with empty body when content-type is application/json', async () => {
    const token = app.jwt.sign({ sub: 'user-owner' });
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'user-owner',
      email: 'owner@test.com',
      role: 'USER',
    } as any);

    vi.mocked(prisma.server.findUnique).mockResolvedValueOnce({
      id: 'srv-1',
      ownerId: 'user-owner',
      allowMemberInvites: true,
    } as any);

    vi.mocked(prisma.serverMember.findUnique).mockResolvedValueOnce({
      id: 'sm-owner',
      serverId: 'srv-1',
      userId: 'user-owner',
      role: 'OWNER',
    } as any);

    vi.mocked(prisma.serverInvite.create).mockResolvedValueOnce({
      id: 'inv-1',
      code: 'abc12345',
      serverId: 'srv-1',
      createdById: 'user-owner',
      maxUses: null,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      createdAt: new Date(),
    } as any);

    const response = await app.inject({
      method: 'POST',
      url: '/api/servers/srv-1/invites',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: '',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().code).toBe('abc12345');
  });

  it('should allow updating member role via both PUT and POST', async () => {
    const token = app.jwt.sign({ sub: 'user-owner' });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-owner',
      email: 'owner@test.com',
      role: 'USER',
    } as any);

    vi.mocked(prisma.server.findUnique).mockResolvedValue({
      id: 'srv-1',
      ownerId: 'user-owner',
    } as any);

    vi.mocked(prisma.serverMember.findUnique).mockImplementation((async ({ where }: any) => {
      if (where?.serverId_userId?.userId === 'user-owner') {
        return { id: 'sm-owner', serverId: 'srv-1', userId: 'user-owner', role: 'OWNER' } as any;
      }
      return { id: 'sm-target', serverId: 'srv-1', userId: 'user-target', role: 'MEMBER' } as any;
    }) as any);

    vi.mocked(prisma.serverMember.update).mockResolvedValue({
      id: 'sm-target',
      serverId: 'srv-1',
      userId: 'user-target',
      role: 'ADMIN',
    } as any);

    // Test PUT
    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/servers/srv-1/members/user-target/role',
      headers: { authorization: `Bearer ${token}` },
      payload: { role: 'ADMIN' },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().role).toBe('ADMIN');

    // Test POST
    const postRes = await app.inject({
      method: 'POST',
      url: '/api/servers/srv-1/members/user-target/role',
      headers: { authorization: `Bearer ${token}` },
      payload: { role: 'ADMIN' },
    });
    expect(postRes.statusCode).toBe(200);
    expect(postRes.json().role).toBe('ADMIN');
  });
});
