import { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/auth';
import { minioClient, MINIO_BUCKET } from '../lib/minio';

export default async function downloadRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  fastify.get<{ Params: { filename: string } }>('/:filename', async (request, reply) => {
    const { filename } = request.params;

    if (!/^[a-zA-Z0-9.\-_]+$/.test(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    // Verify object exists before issuing presigned URL
    try {
      await minioClient.statObject(MINIO_BUCKET, filename);
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }

    // Presigned URL valid for 1 hour — auth already verified above
    const url = await minioClient.presignedGetObject(MINIO_BUCKET, filename, 3600);
    return reply.redirect(302, url);
  });
}
