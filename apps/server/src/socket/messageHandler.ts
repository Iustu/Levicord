import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { createMessage } from '../services/channel.service';
import { checkRateLimit, redis } from '../lib/redis';

const attachmentSchema = z.object({
  url: z.string().regex(/^\/uploads\//, 'Must be a relative upload path'), // Only allow server-hosted URLs
  type: z.enum(['image', 'video', 'file']),
  fileName: z.string().max(255),
  fileSize: z.number().positive(),
  mimeType: z.string().max(100),
});

const messageSchema = z.object({
  channelId: z.string().cuid({ message: 'Invalid channel ID' }),
  content: z.string().max(2000).optional().nullable(),
  attachments: z.array(attachmentSchema).max(5).optional(),
}).refine(
  (data) => (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0),
  { message: 'Message must have content or attachments' },
);

const MESSAGE_LIMIT = 30;
const MESSAGE_WINDOW_SECONDS = 60;

/**
 * Registers the channel message event handler on a socket.
 * (Engenharia de Software — SRP: each handler file owns one domain)
 */
export function registerMessageHandler(io: Server, socket: Socket, userId: string, log: { error: (...args: unknown[]) => void }) {
  socket.on('join_channel', (channelId: string) => {
    if (!z.string().cuid().safeParse(channelId).success) {
      socket.emit('error', { message: 'Invalid channel ID' });
      return;
    }
    const previousChannelId = socket.data.channelId as string | undefined;
    if (previousChannelId && previousChannelId !== channelId) {
      socket.leave(previousChannelId);
    }
    socket.join(channelId);
    socket.data.channelId = channelId;
  });

  socket.on('send_message', async (data: unknown) => {
    const result = messageSchema.safeParse(data);
    if (!result.success) {
      socket.emit('error', { message: result.error.issues[0].message });
      return;
    }

    if (!socket.rooms.has(result.data.channelId)) {
      socket.emit('error', { message: 'Join the channel before sending messages' });
      return;
    }

    const allowed = await checkRateLimit(
      `socket_message_rate:${userId}`,
      MESSAGE_LIMIT,
      MESSAGE_WINDOW_SECONDS,
    );
    if (!allowed) {
      socket.emit('error', { message: 'Message rate limit exceeded' });
      return;
    }

    try {
      const message = await createMessage(
        result.data.content || null,
        userId,
        result.data.channelId,
        result.data.attachments,
      );
      io.to(result.data.channelId).emit('new_message', message);
    } catch (error) {
      log.error(error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
}
