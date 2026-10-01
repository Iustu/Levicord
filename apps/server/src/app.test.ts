import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app';
import type { FastifyInstance } from 'fastify';

describe('Fastify Server', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should respond to the health check route (/)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('should expose a lightweight liveness check', async () => {
    const response = await app.inject({ method: 'GET', url: '/livez' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('should reject unauthenticated session and channel requests', async () => {
    const sessionResponse = await app.inject({ method: 'GET', url: '/api/auth/session' });
    const channelsResponse = await app.inject({ method: 'GET', url: '/api/channels' });

    expect(sessionResponse.statusCode).toBe(401);
    expect(channelsResponse.statusCode).toBe(401);
  });

  it('should handle POST /api/auth/logout and clear authentication cookies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    const accessCookie = response.cookies.find((c) => c.name === 'accessToken');
    const refreshCookie = response.cookies.find((c) => c.name === 'refreshToken');
    expect(accessCookie?.value).toBe('');
    expect(refreshCookie?.value).toBe('');
  });

  it('should reject unauthenticated profile updates', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      payload: { displayName: 'Hacker' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('should reject malicious avatarUrl schemes in profile update', async () => {
    const token = app.jwt.sign({ sub: 'user-123' });
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { avatarUrl: 'javascript:alert(1)' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Avatar URL must be a valid HTTPS URL or an uploaded file path (/uploads/...)',
    });
  });

  it('should reject display names that become too short after HTML sanitization', async () => {
    const token = app.jwt.sign({ sub: 'user-123' });
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { displayName: '<script>alert(1)</script>a' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Display name must contain between 2 and 32 characters',
    });
  });
});
