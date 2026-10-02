import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';
import { minioClient } from '../lib/minio';
import { Readable } from 'stream';

vi.mock('../prisma', () => {
  const mockPrisma = {
    user: { findUnique: vi.fn() },
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

vi.mock('../lib/minio', () => ({
  minioClient: {
    statObject: vi.fn(),
    getObject: vi.fn(),
  },
  MINIO_BUCKET: 'levicord-test-bucket',
}));

describe('Download Routes (/uploads/:filename)', () => {
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

  it('rejects filenames with invalid characters with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/uploads/invalid$name.png',
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'Invalid filename' });
  });

  it('returns 404 when file is not found in MinIO storage', async () => {
    vi.mocked(minioClient.statObject).mockRejectedValue(new Error('NotFound'));

    const res = await app.inject({
      method: 'GET',
      url: '/uploads/missing-file.png',
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'File not found' });
  });

  it('streams file with correct headers when found', async () => {
    vi.mocked(minioClient.statObject).mockResolvedValue({
      size: 1234,
      metaData: { 'content-type': 'image/png' },
    } as any);

    const stream = Readable.from([Buffer.from('fake-image-bytes')]);
    vi.mocked(minioClient.getObject).mockResolvedValue(stream as any);

    const res = await app.inject({
      method: 'GET',
      url: '/uploads/valid-file.png',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe('1234');
    expect(res.headers['cache-control']).toContain('immutable');
  });
});
