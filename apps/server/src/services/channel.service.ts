import sanitizeHtml from 'sanitize-html';
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import type { PrismaClient } from '@prisma/client';
import { canDeleteMessage, type ActorContext, type ServerContext } from './permission.service';
import { isUserMutedInServer } from './server.service';

export async function getChannels(
  userId: string,
  isUserAdmin: boolean,
  limit = 100,
  offset = 0,
  serverIdOrPrisma?: string | null | PrismaClient,
  prismaClient?: PrismaClient
) {
  let serverId: string | null | undefined = undefined;
  let prisma: PrismaClient = defaultPrisma;

  if (typeof serverIdOrPrisma === 'string' || serverIdOrPrisma === null) {
    serverId = serverIdOrPrisma;
    prisma = prismaClient || defaultPrisma;
  } else if (serverIdOrPrisma && typeof serverIdOrPrisma === 'object') {
    prisma = serverIdOrPrisma as PrismaClient;
  }

  let where: Prisma.ChannelWhereInput | undefined = undefined;
  if (serverId !== undefined) {
    where = {
      serverId,
      ...(isUserAdmin ? {} : {
        OR: [
          { isPrivate: false },
          { members: { some: { userId } } }
        ]
      })
    };
  } else if (!isUserAdmin) {
    where = {
      OR: [
        { isPrivate: false },
        { members: { some: { userId } } }
      ]
    };
  }

  return prisma.channel.findMany({
    where,
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
  const highestOrder = await prisma.channel.aggregate({
    _max: { order: true },
  });

  return prisma.channel.create({
    data: {
      name,
      description,
      type,
      isPrivate,
      order: (highestOrder._max.order ?? -1) + 1,
    },
  });
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

export async function createMessage(
  content: string | null,
  authorId: string,
  channelId: string,
  attachments?: { url: string; type: 'image' | 'video' | 'file' | 'IMAGE' | 'VIDEO' | 'FILE'; fileName: string; fileSize: number; mimeType: string }[],
  prisma: PrismaClient = defaultPrisma
) {
  if (prisma.channel?.findUnique) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });

    if (channel?.serverId) {
      const isMuted = await isUserMutedInServer(channel.serverId, authorId, prisma);
      if (isMuted) {
        throw new Error('Você está mutado neste servidor.');
      }
    }
  }

  const formattedAttachments = attachments && attachments.length > 0
    ? attachments.map(a => ({
        url: a.url,
        type: a.type.toUpperCase() as 'IMAGE' | 'VIDEO' | 'FILE',
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
      }))
    : undefined;

  return prisma.message.create({
    data: {
      content: content ? sanitizeHtml(content) : null,
      authorId,
      channelId,
      ...(formattedAttachments ? {
        attachments: {
          create: formattedAttachments,
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

export async function deleteMessage(
  messageId: string,
  actorId: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      channel: {
        include: {
          server: true,
        },
      },
    },
  });

  if (!message) {
    throw new Error('Mensagem não encontrada.');
  }

  const [actorUser, actorMember] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    message.channel.serverId
      ? prisma.serverMember.findUnique({
          where: { serverId_userId: { serverId: message.channel.serverId, userId: actorId } },
        })
      : null,
  ]);

  if (!actorUser) {
    throw new Error('Usuário não encontrado.');
  }

  const actorContext: ActorContext = {
    id: actorUser.id,
    email: actorUser.email,
    role: actorUser.role,
    serverRole: actorMember?.role ?? null,
  };

  const serverContext: ServerContext | null = message.channel.server
    ? {
        id: message.channel.server.id,
        ownerId: message.channel.server.ownerId,
      }
    : null;

  const permission = canDeleteMessage(actorContext, { authorId: message.authorId }, serverContext);

  if (!permission.allowed) {
    throw new Error(permission.reason || 'Sem permissão para excluir esta mensagem.');
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: actorId,
      content: '[Mensagem excluída por um moderador]',
    },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      attachments: true,
    },
  });

  return updated;
}

