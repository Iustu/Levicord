import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app';
import type { FastifyInstance } from 'fastify';
import { minioClient } from '../lib/minio';

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
    putObject: vi.fn().mockResolvedValue({ etag: '123' }),
    statObject: vi.fn().mockResolvedValue({ size: 1024 }),
    removeObject: vi.fn().mockResolvedValue(undefined),
  },
  MINIO_BUCKET: 'levicord-test-bucket',
}));

function buildMultipart(
  boundary: string,
  fields: Array<{ name: string; filename?: string; contentType?: string; value: Buffer | string }>
) {
  const chunks: Buffer[] = [];
  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (field.filename) {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n`));
      chunks.push(Buffer.from(`Content-Type: ${field.contentType || 'application/octet-stream'}\r\n\r\n`));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n`));
    }
    chunks.push(Buffer.isBuffer(field.value) ? field.value : Buffer.from(field.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe('Upload Routes (/api/upload)', () => {
  let app: FastifyInstance;
  const boundary = '---------------------------974767299852498929531610575';

  const generateToken = (userId: string) =>
    app.jwt.sign({ sub: userId });

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

  it('rejects unauthenticated upload requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects requests with no file with 400', async () => {
    const token = generateToken('u-1');
    const payload = buildMultipart(boundary, [{ name: 'dummyField', value: 'hello' }]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'No file uploaded' });
  });

  it('rejects forbidden MIME types with 415', async () => {
    const token = generateToken('u-1');
    const payload = buildMultipart(boundary, [
      {
        name: 'file',
        filename: 'exploit.exe',
        contentType: 'application/x-msdownload',
        value: Buffer.from('malicious binary data'),
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(415);
    expect(JSON.parse(res.body)).toEqual({ error: 'File type not allowed' });
  });

  it('successfully uploads valid image file and stores in MinIO', async () => {
    vi.mocked(minioClient.statObject).mockResolvedValue({ size: 512 } as any);

    const token = generateToken('u-1');
    const payload = buildMultipart(boundary, [
      {
        name: 'file',
        filename: 'photo.png',
        contentType: 'image/png',
        value: Buffer.from('fake image data'),
      },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toMatch(/^\/uploads\/[a-f0-9-]+.png$/);
    expect(body.type).toBe('image');
    expect(body.fileName).toBe('photo.png');
    expect(body.mimeType).toBe('image/png');
    expect(minioClient.putObject).toHaveBeenCalled();
  });
});
