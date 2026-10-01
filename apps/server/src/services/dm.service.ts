import sanitizeHtml from 'sanitize-html';
import { prisma as defaultPrisma } from '../prisma';
import { encrypt, decrypt } from '../lib/crypto';
import type { PrismaClient } from '@prisma/client';

export async function getDirectMessages(
  userId1: string,
  userId2: string,
  limit = 50,
  cursor?: string,
  prisma: PrismaClient = defaultPrisma
) {
  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
    },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      sender: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      attachments: true
    },
  });

  // Decrypt content transparently at application layer (BSRS Cap. 14 / Zero Trust)
  return messages.map((msg) => ({
    ...msg,
    content: decrypt(msg.content),
  }));
}

export async function createDirectMessage(
  content: string | null,
  senderId: string,
  receiverId: string,
  attachments?: { url: string; type: 'image'|'video'|'file'; fileName: string; fileSize: number; mimeType: string }[],
  prisma: PrismaClient = defaultPrisma
) {
  const sanitized = content ? sanitizeHtml(content) : null;
  const encrypted = encrypt(sanitized);

  const created = await prisma.directMessage.create({
    data: {
      content: encrypted,
      senderId,
      receiverId,
      ...(attachments && attachments.length > 0 ? {
        attachments: {
          create: attachments
        }
      } : {})
    },
    include: {
      sender: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      attachments: true
    },
  });

  // Return with decrypted content for immediate socket emission and UI presentation
  return {
    ...created,
    content: sanitized,
  };
}

