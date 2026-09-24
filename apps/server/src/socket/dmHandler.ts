import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { createDirectMessage } from '../services/dm.service';
import { checkRateLimit } from '../lib/redis';

const attachmentSchema = z.object({
  url: z.string().regex(/^\/uploads\//, 'Must be a relative upload path'),
  type: z.enum(['image', 'video', 'file']),
  fileName: z.string().max(255),
  fileSize: z.number().positive(),
  mimeType: z.string().max(100),
});

const dmSchema = z.object({
  receiverId: z.string().cuid({ message: 'Invalid receiver ID' }),
  content: z.string().max(2000).optional().nullable(),
  attachments: z.array(attachmentSchema).max(5).optional(),
}).refine(
  (data) => (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0),
  { message: 'Message must have content or attachments' },
);

const DM_LIMIT = 30;
const DM_WINDOW_SECONDS = 60;

/**
 * Registers the direct message event handler on a socket.
 * (Engenharia de Software — SRP: each handler file owns one domain)
 */
export function registerDmHandler(io: Server, socket: Socket, userId: string, log: { error: (...args: unknown[]) => void }) {
  socket.on('send_dm', async (data: unknown) => {
    const result = dmSchema.safeParse(data);
    if (!result.success) {
      socket.emit('error', { message: result.error.issues[0].message });
      return;
    }

    const allowed = await checkRateLimit(
      `socket_dm_rate:${userId}`,
      DM_LIMIT,
      DM_WINDOW_SECONDS,
    );
    if (!allowed) {
      socket.emit('error', { message: 'Message rate limit exceeded' });
      return;
    }

    try {
      const dm = await createDirectMessage(
        result.data.content || null,
        userId,
        result.data.receiverId,
        result.data.attachments,
      );
      // Emit to receiver's personal room
      io.to(result.data.receiverId).emit('new_dm', dm);
      // Emit back to sender so their own UI updates
      if (userId !== result.data.receiverId) {
        io.to(userId).emit('new_dm', dm);
      }
    } catch (error) {
      log.error(error);
      socket.emit('error', { message: 'Failed to send direct message' });
    }
  });
}
