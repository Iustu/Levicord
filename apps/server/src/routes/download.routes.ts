import { FastifyInstance } from 'fastify';
import { minioClient, MINIO_BUCKET } from '../lib/minio';

export default async function downloadRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { filename: string } }>('/:filename', async (request, reply) => {
    const { filename } = request.params;

    if (!/^[a-zA-Z0-9.\-_]+$/.test(filename)) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    let stat;
    try {
      stat = await minioClient.statObject(MINIO_BUCKET, filename);
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }

    const mimeType = (stat.metaData && (stat.metaData['content-type'] || stat.metaData['Content-Type'])) || 'application/octet-stream';

    reply.header('Content-Type', mimeType);
    reply.header('Content-Length', stat.size);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');

    const stream = await minioClient.getObject(MINIO_BUCKET, filename);
    return reply.send(stream);
  });
}
