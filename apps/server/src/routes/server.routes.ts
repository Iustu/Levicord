import { FastifyInstance } from 'fastify';
import { requireAuth, getAuthUserId } from '../lib/auth';
import { isSuperAdmin } from '../services/auth.service';
import { deleteChannel, updateChannel } from '../services/channel.service';
import {
  createServer,
  getServer,
  getUserServers,
  createServerChannel,
  updateMemberRole,
  kickMember,
  banMember,
  unbanMember,
  getServerBans,
  muteMember,
  unmuteMember,
  createInvite,
  joinServerByInvite,
  getServerAuditLogs,
  toggleServerMemberInvites,
  setMemberCanInvite,
  userHasAccessToPlatform,
} from '../services/server.service';
import type { ServerMemberRole, ChannelType } from '@prisma/client';

export default async function serverRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth);

  /**
   * List user's servers
   */
  fastify.get('/', async (request) => {
    const userId = getAuthUserId(request);
    return getUserServers(userId);
  });

  /**
   * Create a new server (Guild) - restricted to SuperAdmins
   */
  fastify.post<{
    Body: { name: string; description?: string; iconUrl?: string };
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 50 },
            description: { type: 'string', maxLength: 255 },
            iconUrl: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = getAuthUserId(request);
      const superAdmin = await isSuperAdmin(userId);
      if (!superAdmin) {
        return reply.code(403).send({ message: 'Apenas SuperAdmins podem criar novos servidores.' });
      }

      const { name, description, iconUrl } = request.body;
      const server = await createServer({
        name,
        description,
        iconUrl,
        ownerId: userId,
      });

      return reply.code(201).send(server);
    },
  );

  /**
   * Get server details (channels, members, roles)
   */
  fastify.get<{ Params: { serverId: string } }>('/:serverId', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId } = request.params;
      return await getServer(serverId, userId);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Acesso negado' });
    }
  });

  /**
   * Create channel inside server (Server Admins / SuperAdmins / Owner)
   */
  fastify.post<{
    Params: { serverId: string };
    Body: { name: string; type: ChannelType; description?: string };
  }>(
    '/:serverId/channels',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'type'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 32 },
            type: { type: 'string', enum: ['TEXT', 'VOICE'] },
            description: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getAuthUserId(request);
        const { serverId } = request.params;
        const channel = await createServerChannel(serverId, userId, request.body);
        return reply.code(201).send(channel);
      } catch (err: any) {
        return reply.code(403).send({ message: err.message || 'Erro ao criar canal' });
      }
    },
  );

  /**
   * Delete channel inside server (Server Admins / SuperAdmins / Owner)
   */
  fastify.delete<{
    Params: { serverId: string; channelId: string };
  }>(
    '/:serverId/channels/:channelId',
    async (request, reply) => {
      try {
        const userId = getAuthUserId(request);
        const { channelId } = request.params;
        const result = await deleteChannel(channelId, userId);
        return reply.code(200).send(result);
      } catch (err: any) {
        const msg = err.message || 'Erro ao excluir canal';
        if (msg.includes('não encontrado')) {
          return reply.code(404).send({ message: msg });
        }
        return reply.code(403).send({ message: msg });
      }
    },
  );

  /**
   * Update channel inside server (Server Admins / SuperAdmins / Owner)
   */
  fastify.put<{
    Params: { serverId: string; channelId: string };
    Body: { name?: string; description?: string };
  }>(
    '/:serverId/channels/:channelId',
    async (request, reply) => {
      try {
        const userId = getAuthUserId(request);
        const { channelId } = request.params;
        const { name, description } = request.body;
        const result = await updateChannel(channelId, userId, { name, description });
        return reply.code(200).send(result);
      } catch (err: any) {
        const msg = err.message || 'Erro ao atualizar canal';
        if (msg.includes('não encontrado')) {
          return reply.code(404).send({ message: msg });
        }
        return reply.code(403).send({ message: msg });
      }
    },
  );

  /**
   * Update member role (e.g. promote to Server Admin or demote)
   * Supports both PUT and POST for client flexibility
   */
  const updateRoleSchema = {
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['ADMIN', 'MODERATOR', 'MEMBER'] },
        },
      },
    },
  };

  const handleUpdateRole = async (
    request: any,
    reply: any,
  ) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId, targetUserId } = request.params as { serverId: string; targetUserId: string };
      const { role } = request.body as { role: ServerMemberRole };
      const updated = await updateMemberRole(serverId, userId, targetUserId, role);
      return reply.code(200).send(updated);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Sem permissão para alterar cargo' });
    }
  };

  fastify.put<{
    Params: { serverId: string; targetUserId: string };
    Body: { role: ServerMemberRole };
  }>(
    '/:serverId/members/:targetUserId/role',
    updateRoleSchema,
    handleUpdateRole,
  );

  fastify.post<{
    Params: { serverId: string; targetUserId: string };
    Body: { role: ServerMemberRole };
  }>(
    '/:serverId/members/:targetUserId/role',
    updateRoleSchema,
    handleUpdateRole,
  );


  /**
   * Kick member from server
   */
  fastify.post<{
    Params: { serverId: string; targetUserId: string };
    Body: { reason?: string };
  }>('/:serverId/members/:targetUserId/kick', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId, targetUserId } = request.params;
      const result = await kickMember(serverId, userId, targetUserId, request.body?.reason);
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Sem permissão para expulsar membro' });
    }
  });

  /**
   * Ban member from server
   */
  fastify.post<{
    Params: { serverId: string; targetUserId: string };
    Body: { reason?: string };
  }>('/:serverId/members/:targetUserId/ban', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId, targetUserId } = request.params;
      const result = await banMember(serverId, userId, targetUserId, request.body?.reason);
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Sem permissão para banir membro' });
    }
  });

  /**
   * Unban member from server
   */
  fastify.delete<{ Params: { serverId: string; targetUserId: string } }>(
    '/:serverId/bans/:targetUserId',
    async (request, reply) => {
      try {
        const userId = getAuthUserId(request);
        const { serverId, targetUserId } = request.params;
        const result = await unbanMember(serverId, userId, targetUserId);
        return reply.code(200).send(result);
      } catch (err: any) {
        return reply.code(403).send({ message: err.message || 'Sem permissão para revogar banimento' });
      }
    },
  );

  /**
   * List banned users in server
   */
  fastify.get<{ Params: { serverId: string } }>('/:serverId/bans', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId } = request.params;
      return await getServerBans(serverId, userId);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Sem permissão' });
    }
  });

  /**
   * Mute / timeout member in server
   */
  fastify.post<{
    Params: { serverId: string; targetUserId: string };
    Body: { durationMinutes: number; reason?: string };
  }>(
    '/:serverId/members/:targetUserId/mute',
    {
      schema: {
        body: {
          type: 'object',
          required: ['durationMinutes'],
          properties: {
            durationMinutes: { type: 'number', minimum: 1, maximum: 43200 }, // max 30 days
            reason: { type: 'string', maxLength: 255 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getAuthUserId(request);
        const { serverId, targetUserId } = request.params;
        const { durationMinutes, reason } = request.body;
        const updated = await muteMember(serverId, userId, targetUserId, durationMinutes, reason);
        return reply.code(200).send(updated);
      } catch (err: any) {
        return reply.code(403).send({ message: err.message || 'Sem permissão para mutar membro' });
      }
    },
  );

  /**
   * Unmute member in server
   */
  fastify.delete<{ Params: { serverId: string; targetUserId: string } }>(
    '/:serverId/members/:targetUserId/mute',
    async (request, reply) => {
      try {
        const userId = getAuthUserId(request);
        const { serverId, targetUserId } = request.params;
        const updated = await unmuteMember(serverId, userId, targetUserId);
        return reply.code(200).send(updated);
      } catch (err: any) {
        return reply.code(403).send({ message: err.message || 'Sem permissão para desmutar' });
      }
    },
  );

  /**
   * Create invite to server
   */
  fastify.post<{
    Params: { serverId: string };
    Body?: { maxUses?: number; expiresInHours?: number };
  }>('/:serverId/invites', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId } = request.params;
      const invite = await createInvite(serverId, userId, request.body);
      return reply.code(201).send(invite);
    } catch (err: any) {
      return reply.code(400).send({ message: err.message || 'Erro ao criar convite' });
    }
  });

  /**
   * Join server via invite code (param or body)
   */
  fastify.post<{ Params: { code: string } }>('/join/:code', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { code } = request.params;
      const result = await joinServerByInvite(code, userId);
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(400).send({ message: err.message || 'Erro ao entrar no servidor' });
    }
  });

  fastify.post<{ Body: { code: string } }>('/join', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const code = request.body?.code;
      if (!code) {
        return reply.code(400).send({ message: 'Código de convite obrigatório' });
      }
      const result = await joinServerByInvite(code, userId);
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(400).send({ message: err.message || 'Erro ao entrar no servidor' });
    }
  });

  /**
   * View audit logs of server
   */
  fastify.get<{ Params: { serverId: string } }>('/:serverId/audit-logs', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId } = request.params;
      return await getServerAuditLogs(serverId, userId);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Sem permissão para registros de auditoria' });
    }
  });

  /**
   * Check if authenticated user has access to the platform (member of a server or SuperAdmin)
   */
  fastify.get('/access-status', async (request) => {
    const userId = getAuthUserId(request);
    const hasAccess = await userHasAccessToPlatform(userId);
    return { hasAccess };
  });

  /**
   * Toggle server-wide member invite permission (Admin / SuperAdmin)
   */
  fastify.put<{
    Params: { serverId: string };
    Body: { allowMemberInvites: boolean };
  }>('/:serverId/invite-settings', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId } = request.params;
      const { allowMemberInvites } = request.body;
      const updated = await toggleServerMemberInvites(serverId, userId, allowMemberInvites);
      return reply.code(200).send(updated);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Sem permissão' });
    }
  });

  /**
   * Prohibit or allow a specific member to create invites for this server
   */
  fastify.put<{
    Params: { serverId: string; targetUserId: string };
    Body: { canInvite: boolean };
  }>('/:serverId/members/:targetUserId/invite-permission', async (request, reply) => {
    try {
      const userId = getAuthUserId(request);
      const { serverId, targetUserId } = request.params;
      const { canInvite } = request.body;
      const updated = await setMemberCanInvite(serverId, userId, targetUserId, canInvite);
      return reply.code(200).send(updated);
    } catch (err: any) {
      return reply.code(403).send({ message: err.message || 'Sem permissão' });
    }
  });
}
