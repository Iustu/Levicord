import sanitizeHtml from 'sanitize-html';
import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import type { PrismaClient } from '@prisma/client';
import { canDeleteMessage, isRootSuperAdmin, type ActorContext, type ServerContext } from './permission.service';
import { isUserMutedInServer } from './server.service';
import { encryptForServer, decryptForServer } from '../lib/crypto';

export async function getChannels(
  userId: string,
  isUserAdmin: boolean,
  limit = 100,
  offset = 0,
  serverIdOrPrisma?: string | null | PrismaClient,
  prismaClient?: PrismaClient
) {
  let serverId: string | null | undefined = null;
  let prisma: PrismaClient = defaultPrisma;

  if (serverIdOrPrisma === 'all') {
    serverId = undefined;
    prisma = prismaClient || defaultPrisma;
  } else if (typeof serverIdOrPrisma === 'string' || serverIdOrPrisma === null) {
    serverId = serverIdOrPrisma;
    prisma = prismaClient || defaultPrisma;
  } else if (serverIdOrPrisma && typeof serverIdOrPrisma === 'object') {
    prisma = serverIdOrPrisma as PrismaClient;
    serverId = undefined;
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
  if (channel.serverId && prisma.serverMember?.findUnique) {
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId: channel.serverId, userId } }
    });
    if (!member) return false;
  }
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

export async function updateChannel(
  id: string,
  userId: string,
  data: { name?: string; description?: string },
  prisma: PrismaClient = defaultPrisma,
) {
  const channel = await prisma.channel.findUnique({
    where: { id },
    select: { id: true, name: true, serverId: true },
  });

  if (!channel) {
    throw new Error('Canal não encontrado');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });

  const isGlobalSuper = user?.role === 'SUPERADMIN' || (user?.email ? isRootSuperAdmin(user.email) : false);

  if (channel.serverId) {
    const [member, server] = await Promise.all([
      prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId: channel.serverId, userId } },
      }),
      prisma.server.findUnique({
        where: { id: channel.serverId },
        select: { ownerId: true },
      }),
    ]);

    const isServerAdmin = member?.role === 'ADMIN' || member?.role === 'OWNER' || server?.ownerId === userId;
    if (!isServerAdmin) {
      throw new Error('Sem permissão para alterar canal neste servidor. Apenas administradores do servidor local podem gerenciar canais.');
    }
  } else {
    if (!isGlobalSuper) {
      throw new Error('Apenas SuperAdmins podem alterar canais globais.');
    }
  }

  return prisma.channel.update({
    where: { id },
    data,
  });
}

export async function deleteChannel(
  channelId: string,
  userId: string,
  prisma: PrismaClient = defaultPrisma
) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, serverId: true },
  });

  if (!channel) {
    throw new Error('Canal não encontrado');
  }

  // Permission check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });

  const isGlobalSuper = user?.role === 'SUPERADMIN' || (user?.email ? isRootSuperAdmin(user.email) : false);

  if (channel.serverId) {
    // Channel belongs to a server
    const [member, server] = await Promise.all([
      prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId: channel.serverId, userId } },
      }),
      prisma.server.findUnique({
        where: { id: channel.serverId },
        select: { ownerId: true },
      }),
    ]);

    const isServerAdmin = member?.role === 'ADMIN' || member?.role === 'OWNER' || server?.ownerId === userId;

    if (!isServerAdmin) {
      throw new Error('Sem permissão para excluir canal neste servidor. Apenas administradores do servidor local podem gerenciar canais.');
    }

    await prisma.channel.delete({
      where: { id: channelId },
    });

    if (prisma.auditLog?.create) {
      await prisma.auditLog.create({
        data: {
          serverId: channel.serverId,
          actorId: userId,
          action: 'CHANNEL_DELETE',
          metadata: JSON.stringify({ channelId: channel.id, name: channel.name }),
        },
      });
    }
  } else {
    // Global channel
    if (!isGlobalSuper) {
      throw new Error('Apenas SuperAdmins podem excluir canais globais.');
    }

    await prisma.channel.delete({
      where: { id: channelId },
    });
  }

  return { success: true, id: channelId };
}

export async function getChannelMessages(channelId: string, limit = 50, cursor?: string, prisma: PrismaClient = defaultPrisma) {
  let serverId: string | null | undefined = undefined;
  if (prisma.channel?.findUnique) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    serverId = channel?.serverId;
  }

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
    messages: page.map((msg) => ({
      ...msg,
      content: decryptForServer(msg.content, serverId),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function searchMessages(channelId: string, query: string, limit = 20, prisma: PrismaClient = defaultPrisma) {
  let serverId: string | null | undefined = undefined;
  if (prisma.channel?.findUnique) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    serverId = channel?.serverId;
  }

  const messages = await prisma.message.findMany({
    where: { channelId },
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      attachments: true,
    },
  });

  const normalizedQuery = query.toLowerCase();

  const decryptedMessages = messages.map((msg) => ({
    ...msg,
    content: decryptForServer(msg.content, serverId),
  }));

  return decryptedMessages
    .filter((msg) => msg.content && msg.content.toLowerCase().includes(normalizedQuery))
    .slice(0, Math.min(limit, 50));
}

export async function createMessage(
  content: string | null,
  authorId: string,
  channelId: string,
  attachments?: { url: string; type: 'image' | 'video' | 'file' | 'IMAGE' | 'VIDEO' | 'FILE'; fileName: string; fileSize: number; mimeType: string }[],
  prisma: PrismaClient = defaultPrisma
) {
  let serverId: string | null | undefined = undefined;

  if (prisma.channel?.findUnique) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });

    if (channel) {
      serverId = channel.serverId;
      if (channel.serverId) {
        if (prisma.serverMember?.findUnique) {
          const member = await prisma.serverMember.findUnique({
            where: { serverId_userId: { serverId: channel.serverId, userId: authorId } },
          });

          if (!member) {
            throw new Error('Você precisa ser membro deste servidor para enviar mensagens.');
          }
        }

        const isMuted = await isUserMutedInServer(channel.serverId, authorId, prisma);
        if (isMuted) {
          throw new Error('Você está mutado neste servidor.');
        }
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

  const sanitized = content ? sanitizeHtml(content) : null;
  const encrypted = encryptForServer(sanitized, serverId);

  const created = await prisma.message.create({
    data: {
      content: encrypted,
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

  // Return decrypted content so caller and real-time socket emit receive plain text
  return {
    ...created,
    content: sanitized,
  };
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

