import sanitizeHtml from 'sanitize-html';
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import type { PrismaClient } from '@prisma/client';

export async function getChannels(userId: string, isUserAdmin: boolean, limit = 100, offset = 0, prisma: PrismaClient = defaultPrisma) {
  return prisma.channel.findMany({
    where: isUserAdmin ? undefined : {
      OR: [
        { isPrivate: false },
        { members: { some: { userId } } }
      ]
    },
    orderBy: { order: 'asc' },
    take: limit,
    skip: offset,
  });
}

export async function canAccessChannel(channelId: string, userId: string, isUserAdmin: boolean, prisma: PrismaClient = defaultPrisma) {
  if (isUserAdmin) return true;
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { members: { where: { userId } } }
  });
  if (!channel) return false;
  return !channel.isPrivate || channel.members.length > 0;
}

export async function createChannel(name: string, description?: string, type: 'TEXT' | 'VOICE' = 'TEXT', isPrivate = false, prisma: PrismaClient = defaultPrisma) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        const highestOrder = await transaction.channel.aggregate({
          _max: { order: true },
        });

        return transaction.channel.create({
          data: {
            name,
            description,
            type,
            isPrivate,
            order: (highestOrder._max.order ?? -1) + 1,
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error: unknown) {
      const prismaError = error as { code?: string };
      if (prismaError.code !== 'P2034' || attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error('Unable to create channel');
}

export async function updateChannel(id: string, name: string, description?: string, prisma: PrismaClient = defaultPrisma) {
  return prisma.channel.update({
    where: { id },
    data: { name, description },
  });
}

export async function getChannelMessages(channelId: string, limit = 50, cursor?: string, prisma: PrismaClient = defaultPrisma) {
  const messages = await prisma.message.findMany({
    where: { channelId },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true }
      },
      attachments: true
    }
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  return {
    messages: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function searchMessages(channelId: string, query: string, limit = 20, prisma: PrismaClient = defaultPrisma) {
  return prisma.message.findMany({
    where: {
      channelId,
      content: { contains: query, mode: 'insensitive' },
    },
    take: Math.min(limit, 50),
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      attachments: true,
    },
  });
}

export async function createMessage(content: string | null, authorId: string, channelId: string, attachments?: { url: string; type: 'image'|'video'|'file'; fileName: string; fileSize: number; mimeType: string }[], prisma: PrismaClient = defaultPrisma) {
  return prisma.message.create({
    data: {
      content: content ? sanitizeHtml(content) : null,
      authorId,
      channelId,
      ...(attachments && attachments.length > 0 ? {
        attachments: {
          create: attachments
        }
      } : {})
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true }
      },
      attachments: true
    }
  });
}
