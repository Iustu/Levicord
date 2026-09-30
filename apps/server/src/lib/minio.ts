import { Client } from 'minio';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = Number(process.env.MINIO_PORT ?? 9000);
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'admin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'password';

export const MINIO_BUCKET = process.env.MINIO_BUCKET || 'discord-uploads';

export const minioClient = new Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 200): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

export async function ensureBucket(): Promise<void> {
  try {
    await withRetry(async () => {
      const exists = await minioClient.bucketExists(MINIO_BUCKET);
      if (!exists) {
        await minioClient.makeBucket(MINIO_BUCKET);
      }
    });
  } catch (err) {
    // MinIO unavailable — non-fatal at startup; uploads will fail with 503 until recovered
    console.error('[minio] ensureBucket failed after retries:', err);
  }
}

export async function checkMinioHealth(): Promise<boolean> {
  try {
    await withRetry(() => minioClient.bucketExists(MINIO_BUCKET), 2, 100);
    return true;
  } catch {
    return false;
  }
}
