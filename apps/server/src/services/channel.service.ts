import { prisma } from '../prisma';

export async function getChannels() {
  return prisma.channel.findMany({
    orderBy: { order: 'asc' },
  });
}

export async function createChannel(name: string, description?: string) {
  // Simple logic to set order (could be improved in a real app)
  const count = await prisma.channel.count();
  
  return prisma.channel.create({
    data: {
      name,
      description,
      order: count,
    },
  });
}

export async function getChannelMessages(channelId: string, limit = 50, cursor?: string) {
  return prisma.message.findMany({
    where: { channelId },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' }, // Get newest first
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true }
      }
    }
  });
}

export async function createMessage(content: string, authorId: string, channelId: string) {
  return prisma.message.create({
    data: {
      content,
      authorId,
      channelId,
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true }
      }
    }
  });
}
