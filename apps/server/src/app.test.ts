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
});
