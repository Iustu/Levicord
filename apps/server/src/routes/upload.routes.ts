import { FastifyInstance } from 'fastify';
import path from 'path';
import crypto from 'crypto';
import { requireAuth, getAuthUserId } from '../lib/auth';
import { minioClient, MINIO_BUCKET } from '../lib/minio';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/ogg',
  'application/pdf', 'text/plain',
  'application/zip', 'application/x-zip-compressed',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getAttachmentType(mimeType: string): 'image' | 'video' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function sanitizeFilename(raw: string): string {
  const basename = path.basename(raw);
  return basename.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 100);
}

export default async function uploadRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.post('/', async (request, reply) => {
    const data = await request.file({
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    });

    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      request.log.warn({ event: 'upload_rejected_mime', userId: getAuthUserId(request), ip: request.ip, mimeType: data.mimetype }, 'File upload rejected due to invalid MIME type');
      return reply.code(415).send({ error: 'File type not allowed' });
    }

    const safeOriginalName = sanitizeFilename(data.filename);
    const ext = path.extname(safeOriginalName);
    const objectName = `${crypto.randomUUID()}${ext}`;

    let fileSize = 0;
    try {
      const uploadInfo = await minioClient.putObject(
        MINIO_BUCKET,
        objectName,
        data.file,
        undefined,
        { 'Content-Type': data.mimetype },
      );
      const stat = await minioClient.statObject(MINIO_BUCKET, objectName);
      fileSize = stat.size;
      void uploadInfo;
    } catch (err) {
      minioClient.removeObject(MINIO_BUCKET, objectName).catch(() => {});
      request.log.error({ event: 'upload_storage_error', userId: getAuthUserId(request), ip: request.ip, err }, 'MinIO unavailable during upload');
      return reply.code(503).send({ error: 'Storage service unavailable. Try again later.' });
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      request.log.warn({ event: 'upload_rejected_size', userId: getAuthUserId(request), ip: request.ip, fileSize }, 'File upload rejected due to size limit');
      minioClient.removeObject(MINIO_BUCKET, objectName).catch(() => {});
      return reply.code(413).send({ error: 'File too large' });
    }

    request.log.info({ event: 'upload_success', userId: getAuthUserId(request), fileName: safeOriginalName, fileSize, mimeType: data.mimetype }, 'File uploaded successfully');

    return reply.send({
      url: `/uploads/${objectName}`,
      type: getAttachmentType(data.mimetype),
      fileName: safeOriginalName,
      fileSize,
      mimeType: data.mimetype,
    });
  });
}
