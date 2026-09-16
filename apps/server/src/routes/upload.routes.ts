import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { pipeline } from 'stream';

const pump = util.promisify(pipeline);

export default async function uploadRoutes(fastify: FastifyInstance) {
  // Ensure uploads directory exists
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Middleware to ensure user is authenticated
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.post('/', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }

    const fileName = `${Date.now()}-${data.filename}`;
    const filePath = path.join(uploadDir, fileName);

    await pump(data.file, fs.createWriteStream(filePath));

    // Determine type based on mimetype
    let type = 'file';
    if (data.mimetype.startsWith('image/')) type = 'image';
    else if (data.mimetype.startsWith('video/')) type = 'video';

    // Get file size
    const stats = fs.statSync(filePath);

    return reply.send({
      url: `/uploads/${fileName}`,
      type,
      fileName: data.filename,
      fileSize: stats.size,
      mimeType: data.mimetype
    });
  });
}
