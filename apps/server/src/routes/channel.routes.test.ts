import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';
import * as channelService from '../services/channel.service';
import * as authService from '../services/auth.service';

vi.mock('../prisma', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
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
    exists: vi.fn().mockResolvedValue(0),
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

vi.mock('../services/channel.service', () => ({
  getChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  getChannelMessages: vi.fn(),
  canAccessChannel: vi.fn(),
  searchMessages: vi.fn(),
  deleteMessage: vi.fn(),
}));

vi.mock('../services/auth.service', () => ({
  isAdmin: vi.fn(),
  isSuperAdmin: vi.fn(),
  processGoogleUser: vi.fn(),
  updateUserProfile: vi.fn(),
}));

describe('Channel Routes', () => {
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

  describe('GET /api/channels', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/channels',
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return channels for authenticated user with limit/offset and serverId', async () => {
      const token = app.jwt.sign({ sub: 'user-1' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(false);
      vi.mocked(channelService.getChannels).mockResolvedValueOnce([
        { id: 'c1', name: 'geral', type: 'TEXT', isPrivate: false } as any,
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/channels?limit=50&offset=10&serverId=srv-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(channelService.getChannels).toHaveBeenCalledWith('user-1', false, 50, 10, 'srv-1');
      expect(response.json()).toHaveLength(1);
    });
  });

  describe('POST /api/channels', () => {
    it('should return 403 when non-admin attempts to create a channel', async () => {
      const token = app.jwt.sign({ sub: 'user-regular' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'novo-canal' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Administrator permissions required');
    });

    it('should return 400 when channel name violates validation schema', async () => {
      const token = app.jwt.sign({ sub: 'admin-1' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(true);

      // Name with invalid characters (uppercase and spaces not matching ^[a-z0-9-]+$)
      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'CANAL INVALIDO' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should allow admin to create channel with 201 response', async () => {
      const token = app.jwt.sign({ sub: 'admin-1' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(true);
      vi.mocked(channelService.createChannel).mockResolvedValueOnce({
        id: 'chan-created',
        name: 'novo-canal',
        type: 'TEXT',
        isPrivate: false,
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'novo-canal', description: 'Canal de testes', type: 'TEXT', isPrivate: false },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().id).toBe('chan-created');
      expect(channelService.createChannel).toHaveBeenCalledWith('novo-canal', 'Canal de testes', 'TEXT', false);
    });
  });

  describe('PUT /api/channels/:id', () => {
    it('should update channel when user has permission', async () => {
      const token = app.jwt.sign({ sub: 'user-admin' });
      vi.mocked(channelService.updateChannel).mockResolvedValueOnce({
        id: 'chan-1',
        name: 'canal-renomeado',
        description: 'Nova descrição',
      } as any);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/channels/chan-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'canal-renomeado', description: 'Nova descrição' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('canal-renomeado');
    });

    it('should return 404 when channel is not found', async () => {
      const token = app.jwt.sign({ sub: 'user-admin' });
      vi.mocked(channelService.updateChannel).mockRejectedValueOnce(new Error('Canal não encontrado'));

      const response = await app.inject({
        method: 'PUT',
        url: '/api/channels/missing-id',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'canal-valido' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toBe('Channel not found');
    });

    it('should return 403 when user lacks permission to update', async () => {
      const token = app.jwt.sign({ sub: 'user-unauthorized' });
      vi.mocked(channelService.updateChannel).mockRejectedValueOnce(new Error('Apenas administradores podem editar canais'));

      const response = await app.inject({
        method: 'PUT',
        url: '/api/channels/chan-1',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'canal-valido' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Apenas administradores');
    });
  });

  describe('DELETE /api/channels/:id', () => {
    it('should return 404 if channel does not exist', async () => {
      const token = app.jwt.sign({ sub: 'user-admin' });
      vi.mocked(channelService.deleteChannel).mockRejectedValueOnce(new Error('Canal não encontrado'));

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/channels/missing-chan',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toContain('não encontrado');
    });

    it('should delete channel when user has permission', async () => {
      const token = app.jwt.sign({ sub: 'user-admin' });
      vi.mocked(channelService.deleteChannel).mockResolvedValueOnce({ id: 'chan-1' } as any);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/channels/chan-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe('chan-1');
    });
  });

  describe('GET /api/channels/:id/messages/search', () => {
    it('should return 400 if search query is missing or shorter than 2 characters', async () => {
      const token = app.jwt.sign({ sub: 'user-1' });

      let res = await app.inject({
        method: 'GET',
        url: '/api/channels/c1/messages/search?q=a',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);

      res = await app.inject({
        method: 'GET',
        url: '/api/channels/c1/messages/search?q=   ',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 403 when user cannot access the channel', async () => {
      const token = app.jwt.sign({ sub: 'user-1' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(false);
      vi.mocked(channelService.canAccessChannel).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/channels/c1/messages/search?q=test',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toBe('Access denied');
    });

    it('should return search results when query is valid and user has access', async () => {
      const token = app.jwt.sign({ sub: 'user-1' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(false);
      vi.mocked(channelService.canAccessChannel).mockResolvedValueOnce(true);
      vi.mocked(channelService.searchMessages).mockResolvedValueOnce([
        { id: 'm1', content: 'test message' } as any,
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/channels/c1/messages/search?q=test',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(1);
    });
  });

  describe('GET /api/channels/:id/messages', () => {
    it('should return 403 if user cannot access channel messages', async () => {
      const token = app.jwt.sign({ sub: 'user-1' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(false);
      vi.mocked(channelService.canAccessChannel).mockResolvedValueOnce(false);

      const response = await app.inject({
        method: 'GET',
        url: '/api/channels/c1/messages',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toBe('Access denied');
    });

    it('should return reversed messages and nextCursor when user has access', async () => {
      const token = app.jwt.sign({ sub: 'user-1' });
      vi.mocked(authService.isAdmin).mockResolvedValueOnce(false);
      vi.mocked(channelService.canAccessChannel).mockResolvedValueOnce(true);
      vi.mocked(channelService.getChannelMessages).mockResolvedValueOnce({
        messages: [{ id: 'm2' }, { id: 'm1' }] as any,
        nextCursor: 'next-123',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/channels/c1/messages?cursor=start-cursor',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.messages[0].id).toBe('m1');
      expect(body.messages[1].id).toBe('m2');
      expect(body.nextCursor).toBe('next-123');
    });
  });

  describe('DELETE /api/channels/:id/messages/:messageId', () => {
    it('should delete message and return 200', async () => {
      const token = app.jwt.sign({ sub: 'user-1' });
      vi.mocked(channelService.deleteMessage).mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'chan-1',
      } as any);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/channels/chan-1/messages/msg-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe('msg-1');
    });

    it('should return 403 when deleteMessage throws error', async () => {
      const token = app.jwt.sign({ sub: 'user-2' });
      vi.mocked(channelService.deleteMessage).mockRejectedValueOnce(
        new Error('Sem permissão para excluir esta mensagem')
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/channels/chan-1/messages/msg-1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().message).toContain('Sem permissão');
    });
  });
});
