import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import crypto from 'crypto';
import { requireAuth } from '../lib/auth';

// Allowed MIME types — server-side allowlist (client-declared mimetype is not trusted)
// (Building Secure and Reliable Systems — Defense in Depth)
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

/**
 * Sanitizes a filename to prevent path traversal attacks.
 * Keeps only the basename and alphanumeric + safe chars.
 * (Building Secure and Reliable Systems — Input Sanitization)
 */
function sanitizeFilename(raw: string): string {
  const basename = path.basename(raw);
  // Replace any character that isn't alphanumeric, dash, dot, or underscore
  return basename.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 100);
}

export default async function uploadRoutes(fastify: FastifyInstance) {
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Centralized auth hook — no longer duplicated from other routes
  // (Engenharia de Software — DRY)
  fastify.addHook('onRequest', requireAuth);

  fastify.post('/', async (request, reply) => {
    const data = await request.file({
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    });

    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    // Validate MIME type against server-side allowlist
    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      return reply.code(415).send({ error: 'File type not allowed' });
    }

    // Use a random UUID for the stored filename to prevent path traversal
    // and avoid exposing original filenames in disk paths
    const safeOriginalName = sanitizeFilename(data.filename);
    const ext = path.extname(safeOriginalName);
    const storedName = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, storedName);

    try {
      await pipeline(data.file, fs.createWriteStream(filePath));
    } catch (err) {
      // Clean up partial file on write failure
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw err;
    }

    const stats = fs.statSync(filePath);

    // Guard: reject if file exceeds size limit (double-check after write)
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      fs.unlinkSync(filePath);
      return reply.code(413).send({ error: 'File too large' });
    }

    return reply.send({
      url: `/uploads/${storedName}`,
      type: getAttachmentType(data.mimetype),
      fileName: safeOriginalName,
      fileSize: stats.size,
      mimeType: data.mimetype,
    });
  });
}
