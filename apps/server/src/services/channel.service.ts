import { prisma } from '../prisma';

export async function getChannels() {
  return prisma.channel.findMany({
    orderBy: { order: 'asc' },
  });
}

export async function createChannel(name: string, description?: string, type: 'TEXT' | 'VOICE' = 'TEXT') {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction: any) => {
        const highestOrder = await transaction.channel.aggregate({
          _max: { order: true },
        });

        return transaction.channel.create({
          data: {
            name,
            description,
            type,
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

export async function updateChannel(id: string, name: string, description?: string) {
  return prisma.channel.update({
    where: { id },
    data: { name, description },
  });
}

export async function getChannelMessages(channelId: string, limit = 50, cursor?: string) {
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

export async function createMessage(content: string | null, authorId: string, channelId: string, attachments?: { url: string; type: 'image'|'video'|'file'; fileName: string; fileSize: number; mimeType: string }[]) {
  return prisma.message.create({
    data: {
      content,
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
