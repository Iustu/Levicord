import { prisma } from '../prisma';

export async function getDirectMessages(userId1: string, userId2: string, limit = 50, cursor?: string) {
  return prisma.directMessage.findMany({
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
}

export async function createDirectMessage(content: string | null, senderId: string, receiverId: string, attachments?: { url: string; type: 'image'|'video'|'file'; fileName: string; fileSize: number; mimeType: string }[]) {
  return prisma.directMessage.create({
    data: {
      content,
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
}
