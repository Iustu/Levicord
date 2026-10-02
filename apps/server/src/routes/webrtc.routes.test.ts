import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';

vi.mock('../prisma', () => {
  const mockPrisma = {
    user: {
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

describe('WebRTC Routes (/api/webrtc)', () => {
  let app: FastifyInstance;
  const originalEnv = { ...process.env };

  const generateToken = (userId: string) =>
    app.jwt.sign({ sub: userId });

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests to /ice-servers with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/webrtc/ice-servers',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns default STUN servers when authenticated', async () => {
    delete process.env.TURN_USER;
    delete process.env.VITE_TURN_USER;

    const token = generateToken('user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/api/webrtc/ice-servers',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.iceServers).toBeDefined();
    expect(body.iceServers.length).toBeGreaterThanOrEqual(1);
    expect(body.iceServers[0].urls).toContain('stun:stun.l.google.com:19302');
  });

  it('includes TURN server with credentials when configured in environment', async () => {
    process.env.TURN_URL = 'turn:myturn.server.com:3478';
    process.env.TURN_USER = 'turnuser';
    process.env.TURN_PASSWORD = 'turnpassword';

    const token = generateToken('user-1');
    const res = await app.inject({
      method: 'GET',
      url: '/api/webrtc/ice-servers',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const turnServer = body.iceServers.find((s: any) => s.username === 'turnuser');
    expect(turnServer).toBeDefined();
    expect(turnServer.credential).toBe('turnpassword');
    expect(turnServer.urls).toEqual(['turn:myturn.server.com:3478']);
  });
});
