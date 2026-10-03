import crypto from 'crypto';
import type { PrismaClient, ServerMemberRole, ChannelType } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import {
  canManageServerAdmin,
  canModerateMember,
  canCreateInvite,
  canManageServer,
  isRootSuperAdmin,
  type ActorContext,
  type TargetMemberContext,
  type ServerContext,
} from './permission.service';

export interface CreateServerInput {
  name: string;
  description?: string;
  iconUrl?: string;
  ownerId: string;
}

export async function createServer(input: CreateServerInput, prisma: PrismaClient = defaultPrisma) {
  const { name, description, iconUrl, ownerId } = input;

  return prisma.$transaction(async (tx) => {
    const server = await tx.server.create({
      data: {
        name,
        description,
        iconUrl,
        ownerId,
      },
    });

    // Add owner as ServerMember with OWNER role
    await tx.serverMember.create({
      data: {
        serverId: server.id,
        userId: ownerId,
        role: 'OWNER',
      },
    });

    // Create default text channel
    const defaultChannel = await tx.channel.create({
      data: {
        name: 'geral',
        description: 'Canal geral do servidor',
        type: 'TEXT',
        serverId: server.id,
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        serverId: server.id,
        actorId: ownerId,
        action: 'SERVER_CREATE',
        metadata: JSON.stringify({ serverName: name }),
      },
    });

    return { ...server, defaultChannelId: defaultChannel.id };
  });
}

export async function getServer(serverId: string, userId: string, prisma: PrismaClient = defaultPrisma) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });

  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId, userId } },
  });

  const isGlobalSuper = user?.role === 'SUPERADMIN' || isRootSuperAdmin(user?.email);

  if (!member && !isGlobalSuper) {
    throw new Error('Você não tem acesso a este servidor.');
  }

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: {
      channels: {
        orderBy: { order: 'asc' },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
              role: true,
            },
          },
        },
      },
      owner: {
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!server) {
    throw new Error('Servidor não encontrado.');
  }

  return {
    ...server,
    currentUserRole: member?.role ?? (server.ownerId === userId ? 'OWNER' : null),
  };
}

export async function getUserServers(userId: string, prisma: PrismaClient = defaultPrisma) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });

  const isSuper = user?.role === 'SUPERADMIN' || (user?.email ? isRootSuperAdmin(user.email) : false);

  return prisma.server.findMany({
    where: isSuper
      ? {}
      : {
          members: {
            some: { userId },
          },
        },
    include: {
      channels: {
        select: { id: true, name: true, type: true },
        take: 5,
      },
      _count: {
        select: { members: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateMemberRole(
  serverId: string,
  actorId: string,
  targetUserId: string,
  newRole: ServerMemberRole,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, targetMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');
  if (!targetMember) throw new Error('Membro alvo não encontrado no servidor.');

  const actorContext: ActorContext = {
    id: actorUser.id,
    email: actorUser.email,
    role: actorUser.role,
    serverRole: actorMember?.role ?? null,
  };

  const targetContext: TargetMemberContext = {
    userId: targetMember.userId,
    role: targetMember.role,
    promotedById: targetMember.promotedById,
  };

  const serverContext: ServerContext = {
    id: server.id,
    ownerId: server.ownerId,
  };

  const action = (newRole === 'ADMIN' && targetMember.role !== 'ADMIN') ? 'promote' : 'demote';
  const permission = canManageServerAdmin(actorContext, targetContext, serverContext, action);

  if (!permission.allowed) {
    throw new Error(permission.reason || 'Sem permissão para alterar este cargo.');
  }

  const updated = await prisma.serverMember.update({
    where: { serverId_userId: { serverId, userId: targetUserId } },
    data: {
      role: newRole,
      promotedById: newRole === 'ADMIN' ? actorId : targetMember.promotedById,
    },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'MEMBER_ROLE_UPDATE',
      targetId: targetUserId,
      metadata: JSON.stringify({ oldRole: targetMember.role, newRole }),
    },
  });

  return updated;
}

export async function kickMember(
  serverId: string,
  actorId: string,
  targetUserId: string,
  reason?: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, targetMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');
  if (!targetMember) throw new Error('Membro alvo não encontrado no servidor.');

  const actorContext: ActorContext = {
    id: actorUser.id,
    email: actorUser.email,
    role: actorUser.role,
    serverRole: actorMember?.role ?? null,
  };

  const targetContext: TargetMemberContext = {
    userId: targetMember.userId,
    role: targetMember.role,
    promotedById: targetMember.promotedById,
  };

  const serverContext: ServerContext = {
    id: server.id,
    ownerId: server.ownerId,
  };

  const permission = canModerateMember(actorContext, targetContext, serverContext, 'kick');
  if (!permission.allowed) {
    throw new Error(permission.reason || 'Sem permissão para expulsar este membro.');
  }

  await prisma.serverMember.delete({
    where: { serverId_userId: { serverId, userId: targetUserId } },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'MEMBER_KICK',
      targetId: targetUserId,
      reason,
    },
  });

  return { success: true };
}

export async function banMember(
  serverId: string,
  actorId: string,
  targetUserId: string,
  reason?: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, targetMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const actorContext: ActorContext = {
    id: actorUser.id,
    email: actorUser.email,
    role: actorUser.role,
    serverRole: actorMember?.role ?? null,
  };

  const targetContext: TargetMemberContext = {
    userId: targetUserId,
    role: targetMember?.role ?? 'MEMBER',
    promotedById: targetMember?.promotedById ?? null,
  };

  const serverContext: ServerContext = {
    id: server.id,
    ownerId: server.ownerId,
  };

  const permission = canModerateMember(actorContext, targetContext, serverContext, 'ban');
  if (!permission.allowed) {
    throw new Error(permission.reason || 'Sem permissão para banir este membro.');
  }

  return prisma.$transaction(async (tx) => {
    const ban = await tx.serverBan.upsert({
      where: { serverId_userId: { serverId, userId: targetUserId } },
      create: {
        serverId,
        userId: targetUserId,
        bannedById: actorId,
        reason,
      },
      update: {
        bannedById: actorId,
        reason,
      },
    });

    if (targetMember) {
      await tx.serverMember.delete({
        where: { serverId_userId: { serverId, userId: targetUserId } },
      });
    }

    await tx.auditLog.create({
      data: {
        serverId,
        actorId,
        action: 'MEMBER_BAN',
        targetId: targetUserId,
        reason,
      },
    });

    return ban;
  });
}

export async function unbanMember(
  serverId: string,
  actorId: string,
  targetUserId: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const perm = canManageServer(
    { id: actorUser.id, email: actorUser.email, role: actorUser.role, serverRole: actorMember?.role ?? null },
    { id: server.id, ownerId: server.ownerId }
  );
  if (!perm.allowed) {
    throw new Error('Sem permissão para desbanir membros deste servidor.');
  }

  await prisma.serverBan.deleteMany({
    where: { serverId, userId: targetUserId },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'MEMBER_UNBAN',
      targetId: targetUserId,
    },
  });

  return { success: true };
}

export async function getServerBans(
  serverId: string,
  actorId: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const perm = canManageServer(
    { id: actorUser.id, email: actorUser.email, role: actorUser.role, serverRole: actorMember?.role ?? null },
    { id: server.id, ownerId: server.ownerId }
  );
  if (!perm.allowed) {
    throw new Error('Sem permissão para visualizar banimentos deste servidor.');
  }

  return prisma.serverBan.findMany({
    where: { serverId },
    include: {
      user: {
        select: { id: true, displayName: true, email: true, avatarUrl: true },
      },
      bannedBy: {
        select: { id: true, displayName: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function muteMember(
  serverId: string,
  actorId: string,
  targetUserId: string,
  durationMinutes: number,
  reason?: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, targetMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');
  if (!targetMember) throw new Error('Membro alvo não encontrado no servidor.');

  const actorContext: ActorContext = {
    id: actorUser.id,
    email: actorUser.email,
    role: actorUser.role,
    serverRole: actorMember?.role ?? null,
  };

  const targetContext: TargetMemberContext = {
    userId: targetMember.userId,
    role: targetMember.role,
    promotedById: targetMember.promotedById,
  };

  const serverContext: ServerContext = {
    id: server.id,
    ownerId: server.ownerId,
  };

  const permission = canModerateMember(actorContext, targetContext, serverContext, 'mute');
  if (!permission.allowed) {
    throw new Error(permission.reason || 'Sem permissão para mutar este membro.');
  }

  const mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

  const updated = await prisma.serverMember.update({
    where: { serverId_userId: { serverId, userId: targetUserId } },
    data: { mutedUntil },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'MEMBER_MUTE',
      targetId: targetUserId,
      reason,
      metadata: JSON.stringify({ durationMinutes, mutedUntil: mutedUntil.toISOString() }),
    },
  });

  return updated;
}

export async function unmuteMember(
  serverId: string,
  actorId: string,
  targetUserId: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const perm = canManageServer(
    { id: actorUser.id, email: actorUser.email, role: actorUser.role, serverRole: actorMember?.role ?? null },
    { id: server.id, ownerId: server.ownerId }
  );
  if (!perm.allowed) {
    throw new Error('Sem permissão para desmutar membros.');
  }

  const updated = await prisma.serverMember.update({
    where: { serverId_userId: { serverId, userId: targetUserId } },
    data: { mutedUntil: null },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'MEMBER_UNMUTE',
      targetId: targetUserId,
    },
  });

  return updated;
}

export async function isUserMutedInServer(
  serverId: string,
  userId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<boolean> {
  const member = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId, userId } },
    select: { mutedUntil: true },
  });

  if (!member?.mutedUntil) return false;
  return new Date(member.mutedUntil).getTime() > Date.now();
}

export async function createInvite(
  serverId: string,
  actorId: string,
  options?: { maxUses?: number; expiresInHours?: number },
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, member, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const actorContext: ActorContext = {
    id: actorUser.id,
    email: actorUser.email,
    role: actorUser.role,
    serverRole: member?.role ?? null,
  };

  const permission = canCreateInvite(
    actorContext,
    member ? { role: member.role, canInvite: member.canInvite } : null,
    { id: server.id, ownerId: server.ownerId, allowMemberInvites: server.allowMemberInvites },
  );

  if (!permission.allowed) {
    throw new Error(permission.reason || 'Sem permissão para gerar convites para este servidor.');
  }

  const code = crypto.randomBytes(4).toString('hex');
  // Always expirable as required by platform security specifications (default 24h)
  const hours = options?.expiresInHours && options.expiresInHours > 0 ? options.expiresInHours : 24;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  return prisma.serverInvite.create({
    data: {
      code,
      serverId,
      createdById: actorId,
      maxUses: options?.maxUses ?? null,
      expiresAt,
    },
  });
}

export async function toggleServerMemberInvites(
  serverId: string,
  actorId: string,
  allow: boolean,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, member, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const perm = canManageServer(
    { id: actorUser.id, email: actorUser.email, role: actorUser.role, serverRole: member?.role ?? null },
    { id: server.id, ownerId: server.ownerId }
  );
  if (!perm.allowed) {
    throw new Error('Sem permissão para alterar configurações de convite do servidor.');
  }

  const updated = await prisma.server.update({
    where: { id: serverId },
    data: { allowMemberInvites: allow },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'SERVER_INVITE_SETTING_UPDATE',
      metadata: JSON.stringify({ allowMemberInvites: allow }),
    },
  });

  return updated;
}

export async function setMemberCanInvite(
  serverId: string,
  actorId: string,
  targetUserId: string,
  canInvite: boolean,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, member, server, targetMember] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: targetUserId } } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');
  if (!targetMember) throw new Error('Membro alvo não encontrado.');

  const perm = canManageServer(
    { id: actorUser.id, email: actorUser.email, role: actorUser.role, serverRole: member?.role ?? null },
    { id: server.id, ownerId: server.ownerId }
  );
  if (!perm.allowed) {
    throw new Error('Sem permissão para alterar permissões de convite deste membro.');
  }

  const updated = await prisma.serverMember.update({
    where: { serverId_userId: { serverId, userId: targetUserId } },
    data: { canInvite },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'MEMBER_INVITE_PERMISSION_UPDATE',
      targetId: targetUserId,
      metadata: JSON.stringify({ canInvite }),
    },
  });

  return updated;
}

export async function userHasAccessToPlatform(
  userId: string,
  prisma: PrismaClient = defaultPrisma,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });

  if (!user) return false;

  // Root SuperAdmin and SuperAdmins always have access
  if (user.role === 'SUPERADMIN' || isRootSuperAdmin(user.email)) {
    return true;
  }

  // Users who are members of at least one server have access
  const memberCount = await prisma.serverMember.count({
    where: { userId },
  });

  return memberCount > 0;
}

export async function joinServerByInvite(
  code: string,
  userId: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const invite = await prisma.serverInvite.findUnique({
    where: { code },
    include: { server: true },
  });

  if (!invite) {
    throw new Error('Convite inválido ou não encontrado.');
  }

  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    throw new Error('Este convite expirou.');
  }

  if (invite.maxUses && invite.uses >= invite.maxUses) {
    throw new Error('Este convite atingiu o número máximo de utilizações.');
  }

  // Check if user is banned
  const ban = await prisma.serverBan.findUnique({
    where: { serverId_userId: { serverId: invite.serverId, userId } },
  });

  if (ban) {
    throw new Error('Você está banido deste servidor.');
  }

  // Check if already a member
  const existingMember = await prisma.serverMember.findUnique({
    where: { serverId_userId: { serverId: invite.serverId, userId } },
  });

  if (existingMember) {
    return { server: invite.server, member: existingMember, alreadyMember: true };
  }

  return prisma.$transaction(async (tx) => {
    const member = await tx.serverMember.create({
      data: {
        serverId: invite.serverId,
        userId,
        role: 'MEMBER',
      },
    });

    await tx.serverInvite.update({
      where: { id: invite.id },
      data: { uses: { increment: 1 } },
    });

    await tx.auditLog.create({
      data: {
        serverId: invite.serverId,
        actorId: userId,
        action: 'MEMBER_JOIN_INVITE',
        metadata: JSON.stringify({ inviteCode: code }),
      },
    });

    return { server: invite.server, member, alreadyMember: false };
  });
}

export async function createServerChannel(
  serverId: string,
  actorId: string,
  data: { name: string; type: ChannelType; description?: string },
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const isServerAdmin = actorMember?.role === 'ADMIN' || actorMember?.role === 'OWNER' || actorId === server.ownerId;

  if (!isServerAdmin) {
    throw new Error('Sem permissão para criar canais neste servidor. Apenas administradores do servidor local podem criar canais.');
  }

  const channel = await prisma.channel.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      serverId,
    },
  });

  await prisma.auditLog.create({
    data: {
      serverId,
      actorId,
      action: 'CHANNEL_CREATE',
      metadata: JSON.stringify({ channelId: channel.id, name: channel.name, type: channel.type }),
    },
  });

  return channel;
}

export async function getServerAuditLogs(
  serverId: string,
  actorId: string,
  limit = 100,
  cursor?: string,
  prisma: PrismaClient = defaultPrisma,
) {
  const [actorUser, actorMember, server] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId } }),
    prisma.serverMember.findUnique({ where: { serverId_userId: { serverId, userId: actorId } } }),
    prisma.server.findUnique({ where: { id: serverId } }),
  ]);

  if (!server) throw new Error('Servidor não encontrado.');
  if (!actorUser) throw new Error('Usuário autor não encontrado.');

  const perm = canManageServer(
    { id: actorUser.id, email: actorUser.email, role: actorUser.role, serverRole: actorMember?.role ?? null },
    { id: server.id, ownerId: server.ownerId }
  );
  if (!perm.allowed) {
    throw new Error('Sem permissão para visualizar o registro de auditoria.');
  }

  const logs = await prisma.auditLog.findMany({
    where: { serverId },
    include: {
      actor: {
        select: { id: true, displayName: true, email: true, avatarUrl: true },
      },
    },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  const hasMore = logs.length > limit;
  const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  export async function deleteServer(
    serverId: string,
    userId: string,
    prisma: PrismaClient = defaultPrisma
  ) {
    const [user, server] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, email: true },
      }),
      prisma.server.findUnique({
        where: { id: serverId },
        include: {
          members: {
            where: { userId },
          },
        },
      }),
    ]);

    if (!server) {
      throw new Error('Servidor não encontrado.');
    }

    const isGlobalSuper = user?.role === 'SUPERADMIN' || (user?.email ? isRootSuperAdmin(user.email) : false);
    const isOwner = server.ownerId === userId || server.members?.[0]?.role === 'OWNER';

    if (!isOwner && !isGlobalSuper) {
      throw new Error('Apenas o criador do servidor ou um SuperAdmin podem excluir este servidor.');
    }

    return prisma.$transaction(async (tx) => {
      // 1. Delete message attachments and messages for all channels in this server
      const channels = await tx.channel.findMany({
        where: { serverId },
        select: { id: true },
      });
      const channelIds = channels.map((c) => c.id);

      if (channelIds.length > 0) {
        const messages = await tx.message.findMany({
          where: { channelId: { in: channelIds } },
          select: { id: true },
        });
        const messageIds = messages.map((m) => m.id);

        if (messageIds.length > 0) {
          await tx.attachment.deleteMany({
            where: { messageId: { in: messageIds } },
          });

          await tx.message.deleteMany({
            where: { id: { in: messageIds } },
          });
        }

        await tx.channelMember.deleteMany({
          where: { channelId: { in: channelIds } },
        });

        await tx.channel.deleteMany({
          where: { id: { in: channelIds } },
        });
      }

      // 2. Delete server invites
      await tx.serverInvite.deleteMany({
        where: { serverId },
      });

      // 3. Delete server bans
      await tx.serverBan.deleteMany({
        where: { serverId },
      });

      // 4. Delete audit logs
      await tx.auditLog.deleteMany({
        where: { serverId },
      });

      // 5. Delete server members
      await tx.serverMember.deleteMany({
        where: { serverId },
      });

      // 6. Delete server
      await tx.server.delete({
        where: { id: serverId },
      });

      return { success: true, id: serverId, name: server.name };
    });
  }

  export async function getAllServersAdmin(prisma: PrismaClient = defaultPrisma) {
    return prisma.server.findMany({
      include: {
        owner: {
          select: { id: true, displayName: true, email: true, avatarUrl: true },
        },
        _count: {
          select: {
            members: true,
            channels: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
