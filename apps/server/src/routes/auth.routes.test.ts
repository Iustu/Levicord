import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';
import { redis } from '../lib/redis';

vi.mock('../prisma', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
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

describe('Auth Routes', () => {
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

  describe('GET /api/auth/session', () => {
    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return session and user profile when authenticated', async () => {
      const token = app.jwt.sign({ sub: 'user-123' });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        role: 'USER',
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.authenticated).toBe(true);
      expect(body.user.displayName).toBe('Test User');
      expect(body.user.sub).toBe('user-123');
    });

    it('should fallback to JWT payload if user is not in database', async () => {
      const token = app.jwt.sign({ sub: 'ghost-user' });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.authenticated).toBe(true);
      expect(body.user.sub).toBe('ghost-user');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 for unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return user profile if found', async () => {
      const token = app.jwt.sign({ sub: 'user-456' });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: 'user-456',
        email: 'user456@example.com',
        displayName: 'User 456',
        avatarUrl: null,
        role: 'USER',
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe('user-456');
      expect(body.email).toBe('user456@example.com');
    });

    it('should return 404 if user not found in database', async () => {
      const token = app.jwt.sign({ sub: 'user-missing' });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toBe('User not found');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return 401 when no refreshToken cookie is present', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('No refresh token');
    });

    it('should return 401 if refresh token is invalid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: 'invalid.token.here' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().message).toBe('Invalid refresh token');
    });

    it('should return 401 if refresh token has already been revoked in Redis', async () => {
      const validToken = app.jwt.sign({ sub: 'user-123' }, { expiresIn: '7d' });
      vi.mocked(redis.exists).mockResolvedValueOnce(1); // token in blocklist

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: validToken },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().message).toContain('already been used or revoked');
    });

    it('should rotate token: add old token to blocklist and return 200 with new accessToken cookie', async () => {
      const validToken = app.jwt.sign({ sub: 'user-123' }, { expiresIn: '7d' });
      vi.mocked(redis.exists).mockResolvedValueOnce(0); // not revoked

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: validToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
      expect(redis.set).toHaveBeenCalledWith(
        `rt_blocklist:${validToken}`,
        '1',
        'EX',
        expect.any(Number)
      );

      const cookies = response.cookies;
      const accessTokenCookie = cookies.find((c) => c.name === 'accessToken');
      expect(accessTokenCookie).toBeDefined();
      expect(accessTokenCookie?.httpOnly).toBe(true);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should revoke refreshToken in Redis if present and clear cookies', async () => {
      const token = app.jwt.sign({ sub: 'user-123' }, { expiresIn: '7d' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { refreshToken: token },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
      expect(redis.set).toHaveBeenCalledWith(
        `rt_blocklist:${token}`,
        '1',
        'EX',
        expect.any(Number)
      );

      // Verify clearCookie was invoked (empty or max-age 0 / expired)
      const clearedCookies = response.cookies;
      expect(clearedCookies.some((c) => c.name === 'accessToken')).toBe(true);
      expect(clearedCookies.some((c) => c.name === 'refreshToken')).toBe(true);
    });

    it('should return 200 and clear cookies even if no refreshToken cookie was provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('PATCH /api/auth/profile', () => {
    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        payload: { displayName: 'Novo Nome' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 400 when no fields are provided in payload', async () => {
      const token = app.jwt.sign({ sub: 'user-123' });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe('No fields to update');
    });

    it('should return 400 if displayName is too short or too long after sanitization', async () => {
      const token = app.jwt.sign({ sub: 'user-123' });

      // Too short (< 2)
      let res = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { displayName: 'a' },
      });
      expect(res.statusCode).toBe(400);

      // Only HTML tags stripped to empty (< 2)
      res = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { displayName: '<b></b>' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid avatar URLs (not HTTPS and not /uploads/)', async () => {
      const token = app.jwt.sign({ sub: 'user-123' });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { avatarUrl: 'http://insecure.com/pic.jpg' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain('HTTPS URL or an uploaded file path');
    });

    it('should allow valid HTTPS avatar URL or /uploads/ path and sanitize displayName', async () => {
      const token = app.jwt.sign({ sub: 'user-123' });

      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Clean Name',
        avatarUrl: 'https://cdn.example.com/avatar.png',
        role: 'USER',
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          displayName: '  <b>Clean Name</b>  ',
          avatarUrl: 'https://cdn.example.com/avatar.png',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
          data: {
            displayName: 'Clean Name',
            avatarUrl: 'https://cdn.example.com/avatar.png',
          },
        })
      );
    });

    it('should allow resetting avatarUrl to null', async () => {
      const token = app.jwt.sign({ sub: 'user-123' });

      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Clean Name',
        avatarUrl: null,
        role: 'USER',
      } as any);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/auth/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { avatarUrl: null },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { avatarUrl: null },
        })
      );
    });
  });

  describe('GET /api/auth/google/callback', () => {
    it('should return 500 when oauth code exchange fails', async () => {
      // Mock failure on googleOAuth2
      const origMethod = (app as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow;
      (app as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow = vi.fn().mockRejectedValueOnce(
        new Error('OAuth failed')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: 'Authentication failed' });

      (app as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow = origMethod;
    });

    it('should redirect new user to /setup and set cookies', async () => {
      (app as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow = vi.fn().mockResolvedValueOnce({
        token: { access_token: 'fake-access-token' },
      });

      // Mock global fetch for Google userinfo
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'google-new-id',
          email: 'newuser@gmail.com',
          verified_email: true,
          name: 'New Google User',
          picture: 'https://lh3.googleusercontent.com/photo.jpg',
        }),
      } as any);

      // User does not exist yet
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce({
        id: 'user-created-id',
        email: 'newuser@gmail.com',
        displayName: 'New Google User',
        avatarUrl: null,
        role: 'USER',
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('/setup');
      const cookies = response.cookies;
      expect(cookies.find((c) => c.name === 'accessToken')).toBeDefined();
      expect(cookies.find((c) => c.name === 'refreshToken')).toBeDefined();

      mockFetch.mockRestore();
    });

    it('should redirect existing user to /app and set cookies', async () => {
      (app as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow = vi.fn().mockResolvedValueOnce({
        token: { access_token: 'fake-access-token' },
      });

      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'google-existing-id',
          email: 'existing@gmail.com',
          verified_email: true,
          name: 'Existing User',
        }),
      } as any);

      // Existing user found in findUnique
      const existingUserRecord = {
        id: 'user-existing-id',
        googleId: 'google-existing-id',
        email: 'existing@gmail.com',
        displayName: 'Existing User',
        avatarUrl: null,
        role: 'USER',
      };
      // findUnique in auth.routes.ts line 193
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUserRecord as any);
      // findUnique inside processGoogleUser line 27
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUserRecord as any);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(existingUserRecord as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('/app');

      mockFetch.mockRestore();
    });
  });
});
