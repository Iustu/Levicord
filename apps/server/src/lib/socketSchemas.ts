import { z } from 'zod';

export const attachmentSchema = z.object({
  url: z.string().regex(/^\/uploads\//, 'Must be a relative upload path'),
  type: z.enum(['image', 'video', 'file', 'IMAGE', 'VIDEO', 'FILE']),
  fileName: z.string().max(255),
  fileSize: z.number().positive(),
  mimeType: z.string().max(100),
  isOneTime: z.boolean().optional(),
});

export const messageSchema = z.object({
  channelId: z.string().cuid({ message: 'Invalid channel ID' }),
  content: z.string().max(2000).optional().nullable(),
  attachments: z.array(attachmentSchema).max(5).optional(),
}).refine(
  (data) => (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0),
  { message: 'Message must have content or attachments' },
);

export const dmSchema = z.object({
  receiverId: z.string().cuid({ message: 'Invalid receiver ID' }),
  content: z.string().max(2000).optional().nullable(),
  attachments: z.array(attachmentSchema).max(5).optional(),
}).refine(
  (data) => (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0),
  { message: 'Message must have content or attachments' },
);

export const RATE_LIMITS = {
  MESSAGE_LIMIT: 30,
  MESSAGE_WINDOW_SECONDS: 60,
  DM_LIMIT: 30,
  DM_WINDOW_SECONDS: 60,
} as const;
