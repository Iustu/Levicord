import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../prisma';
import { requireAuth, getAuthUserId } from '../lib/auth';
import { isSuperAdmin, invalidateAdminCache } from '../services/auth.service';
import {
  canManageSuperAdmin,
  isRootSuperAdmin,
  ROOT_SUPERADMIN_EMAIL,
  type ActorContext,
  type TargetUserContext,
} from '../services/permission.service';

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  const requireSuperAdminGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getAuthUserId(request);
    const superAdmin = await isSuperAdmin(userId);
    if (!superAdmin) {
      request.log.warn({ event: 'superadmin_access_denied', userId, ip: request.ip }, 'SuperAdmin access denied');
      return reply.code(403).send({ message: 'Permissões de SuperAdmin necessárias' });
    }
  };

  /**
   * List all SuperAdmins
   */
  fastify.get('/superadmins', { preHandler: requireSuperAdminGuard }, async () => {
    const superAdmins = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'SUPERADMIN' },
          { email: ROOT_SUPERADMIN_EMAIL },
        ],
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        role: true,
        promotedById: true,
        promotedBy: {
          select: { id: true, displayName: true, email: true },
        },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return superAdmins.map((user) => ({
      ...user,
      isRoot: isRootSuperAdmin(user.email),
    }));
  });

  /**
   * Search users to promote
   */
  fastify.get<{ Querystring: { q?: string } }>('/users', { preHandler: requireSuperAdminGuard }, async (request) => {
    const query = (request.query.q || '').trim();
    if (!query) {
      return prisma.user.findMany({
        take: 20,
        select: { id: true, displayName: true, email: true, avatarUrl: true, role: true },
        orderBy: { displayName: 'asc' },
      });
    }

    return prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      select: { id: true, displayName: true, email: true, avatarUrl: true, role: true },
    });
  });

  /**
   * Promote user to SuperAdmin
   */
  fastify.post<{ Body: { targetUserId: string } }>(
    '/superadmins',
    {
      preHandler: requireSuperAdminGuard,
      schema: {
        body: {
          type: 'object',
          required: ['targetUserId'],
          properties: {
            targetUserId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const actorId = getAuthUserId(request);
      const { targetUserId } = request.body;

      const [actorUser, targetUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: actorId } }),
        prisma.user.findUnique({ where: { id: targetUserId } }),
      ]);

      if (!actorUser) return reply.code(404).send({ message: 'Autor não encontrado' });
      if (!targetUser) return reply.code(404).send({ message: 'Usuário alvo não encontrado' });

      const actorContext: ActorContext = {
        id: actorUser.id,
        email: actorUser.email,
        role: actorUser.role,
      };

      const targetContext: TargetUserContext = {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        promotedById: targetUser.promotedById,
      };

      const permission = canManageSuperAdmin(actorContext, targetContext, 'promote');
      if (!permission.allowed) {
        return reply.code(403).send({ message: permission.reason });
      }

      const updated = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          role: 'SUPERADMIN',
          promotedById: actorId,
        },
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
          role: true,
          promotedById: true,
        },
      });

      await invalidateAdminCache(targetUserId);

      return reply.code(200).send(updated);
    },
  );

  /**
   * Demote SuperAdmin back to regular USER
   */
  fastify.delete<{ Params: { targetUserId: string } }>(
    '/superadmins/:targetUserId',
    { preHandler: requireSuperAdminGuard },
    async (request, reply) => {
      const actorId = getAuthUserId(request);
      const { targetUserId } = request.params;

      const [actorUser, targetUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: actorId } }),
        prisma.user.findUnique({ where: { id: targetUserId } }),
      ]);

      if (!actorUser) return reply.code(404).send({ message: 'Autor não encontrado' });
      if (!targetUser) return reply.code(404).send({ message: 'Usuário alvo não encontrado' });

      const actorContext: ActorContext = {
        id: actorUser.id,
        email: actorUser.email,
        role: actorUser.role,
      };

      const targetContext: TargetUserContext = {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        promotedById: targetUser.promotedById,
      };

      const permission = canManageSuperAdmin(actorContext, targetContext, 'demote');
      if (!permission.allowed) {
        return reply.code(403).send({ message: permission.reason });
      }

      const updated = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          role: 'USER',
          promotedById: null,
        },
        select: {
          id: true,
          displayName: true,
          email: true,
          avatarUrl: true,
          role: true,
        },
      });

      await invalidateAdminCache(targetUserId);

      return reply.code(200).send(updated);
    },
  );
}
