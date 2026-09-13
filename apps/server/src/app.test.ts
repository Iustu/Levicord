import { describe, it, expect } from 'vitest';
import { buildApp } from './app';

describe('Fastify Server', () => {
  it('should respond to the health check route (/)', async () => {
    const app = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('should expose a lightweight liveness check', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/livez' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('should reject unauthenticated session and channel requests', async () => {
    const app = buildApp();

    const sessionResponse = await app.inject({ method: 'GET', url: '/api/auth/session' });
    const channelsResponse = await app.inject({ method: 'GET', url: '/api/channels' });

    expect(sessionResponse.statusCode).toBe(401);
    expect(channelsResponse.statusCode).toBe(401);
  });
});
