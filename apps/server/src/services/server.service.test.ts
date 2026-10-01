import { describe, it, expect, vi } from 'vitest';
import {
  createServer,
  getServer,
  updateMemberRole,
  kickMember,
  banMember,
  unbanMember,
  muteMember,
  unmuteMember,
  isUserMutedInServer,
  createInvite,
  joinServerByInvite,
  userHasAccessToPlatform,
} from './server.service';
import type { PrismaClient } from '@prisma/client';

describe('Server Service', () => {
  describe('createServer', () => {
    it('should create server, owner member, default general channel and audit log', async () => {
      const mockTx = {
        server: {
          create: vi.fn().mockResolvedValue({ id: 'srv-1', name: 'Test Server', ownerId: 'user-1' }),
        },
        serverMember: {
          create: vi.fn().mockResolvedValue({ id: 'sm-1', serverId: 'srv-1', userId: 'user-1', role: 'OWNER' }),
        },
        channel: {
          create: vi.fn().mockResolvedValue({ id: 'ch-1', name: 'geral', serverId: 'srv-1' }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'log-1' }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
      } as unknown as PrismaClient;

      const result = await createServer(
        { name: 'Test Server', ownerId: 'user-1' },
        mockPrisma,
      );

      expect(result.id).toBe('srv-1');
      expect(result.defaultChannelId).toBe('ch-1');
      expect(mockTx.server.create).toHaveBeenCalled();
      expect(mockTx.serverMember.create).toHaveBeenCalledWith({
        data: { serverId: 'srv-1', userId: 'user-1', role: 'OWNER' },
      });
      expect(mockTx.channel.create).toHaveBeenCalledWith({
        data: { name: 'geral', description: 'Canal geral do servidor', type: 'TEXT', serverId: 'srv-1' },
      });
      expect(mockTx.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('getServer', () => {
    it('should throw if user is not a member and not superadmin', async () => {
      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'u-1', email: 'user@test.com', role: 'USER' }) },
        serverMember: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      await expect(getServer('srv-1', 'u-1', mockPrisma)).rejects.toThrow(
        'Você não tem acesso a este servidor.'
      );
    });

    it('should allow access to server if user is global superadmin even if not member', async () => {
      const mockServer = {
        id: 'srv-1',
        name: 'Secret Server',
        channels: [],
        members: [],
        owner: { id: 'u-other' },
      };

      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'u-super', email: 'joaoprf2001@gmail.com', role: 'SUPERADMIN' }) },
        serverMember: { findUnique: vi.fn().mockResolvedValue(null) },
        server: { findUnique: vi.fn().mockResolvedValue(mockServer) },
      } as unknown as PrismaClient;

      const result = await getServer('srv-1', 'u-super', mockPrisma);
      expect(result.id).toBe('srv-1');
      expect(result.currentUserRole).toBe('OWNER'); // Superadmin has total authority
    });
  });

  describe('updateMemberRole', () => {
    it('should allow Global SuperAdmin to demote any server admin', async () => {
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'super-1', email: 'any@test.com', role: 'SUPERADMIN' }),
        },
        serverMember: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.serverId_userId?.userId === 'super-1') return Promise.resolve(null);
            if (where.serverId_userId?.userId === 'target-admin') {
              return Promise.resolve({ userId: 'target-admin', role: 'ADMIN', promotedById: 'other-user' });
            }
            return Promise.resolve(null);
          }),
          update: vi.fn().mockResolvedValue({ userId: 'target-admin', role: 'MEMBER' }),
        },
        server: {
          findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1' }),
        },
        auditLog: { create: vi.fn() },
      } as unknown as PrismaClient;

      const updated = await updateMemberRole('srv-1', 'super-1', 'target-admin', 'MEMBER', mockPrisma);
      expect(updated.role).toBe('MEMBER');
      expect(mockPrisma.serverMember.update).toHaveBeenCalled();
    });

    it('should deny regular Server Admin from demoting an admin they did not promote', async () => {
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@test.com', role: 'USER' }),
        },
        serverMember: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.serverId_userId?.userId === 'admin-1') {
              return Promise.resolve({ userId: 'admin-1', role: 'ADMIN', promotedById: 'owner-1' });
            }
            if (where.serverId_userId?.userId === 'peer-admin') {
              return Promise.resolve({ userId: 'peer-admin', role: 'ADMIN', promotedById: 'other-person' });
            }
            return Promise.resolve(null);
          }),
        },
        server: {
          findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1' }),
        },
      } as unknown as PrismaClient;

      await expect(
        updateMemberRole('srv-1', 'admin-1', 'peer-admin', 'MEMBER', mockPrisma)
      ).rejects.toThrow('Admins só podem remover o cargo de administradores que eles próprios concederam.');
    });
  });

  describe('kickMember and banMember', () => {
    it('should not allow Server Admin to kick another Admin', async () => {
      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'adm-1', email: 'a@t.com', role: 'USER' }) },
        serverMember: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.serverId_userId?.userId === 'adm-1') return Promise.resolve({ userId: 'adm-1', role: 'ADMIN' });
            if (where.serverId_userId?.userId === 'target-adm') return Promise.resolve({ userId: 'target-adm', role: 'ADMIN' });
            return null;
          }),
        },
        server: { findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1' }) },
      } as unknown as PrismaClient;

      await expect(kickMember('srv-1', 'adm-1', 'target-adm', 'test', mockPrisma)).rejects.toThrow(
        'Administradores não podem moderar outros administradores.'
      );
    });

    it('should allow SuperAdmin to ban a member', async () => {
      const mockTx = {
        serverBan: { upsert: vi.fn().mockResolvedValue({ id: 'ban-1' }) },
        serverMember: { delete: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      };

      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'super-1', email: 's@t.com', role: 'SUPERADMIN' }) },
        serverMember: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.serverId_userId?.userId === 'super-1') return Promise.resolve(null);
            if (where.serverId_userId?.userId === 'bad-user') return Promise.resolve({ userId: 'bad-user', role: 'MEMBER' });
            return null;
          }),
        },
        server: { findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1' }) },
        $transaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
      } as unknown as PrismaClient;

      const ban = await banMember('srv-1', 'super-1', 'bad-user', 'Spam', mockPrisma);
      expect(ban.id).toBe('ban-1');
      expect(mockTx.serverBan.upsert).toHaveBeenCalled();
      expect(mockTx.serverMember.delete).toHaveBeenCalled();
    });
  });

  describe('muteMember and isUserMutedInServer', () => {
    it('should mute member and recognize mute expiration', async () => {
      const futureDate = new Date(Date.now() + 600000);
      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'adm-1', email: 'a@t.com', role: 'USER' }) },
        serverMember: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.serverId_userId?.userId === 'adm-1') return Promise.resolve({ userId: 'adm-1', role: 'ADMIN' });
            if (where.serverId_userId?.userId === 'spammer') return Promise.resolve({ userId: 'spammer', role: 'MEMBER' });
            return null;
          }),
          update: vi.fn().mockResolvedValue({ userId: 'spammer', mutedUntil: futureDate }),
        },
        server: { findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1' }) },
        auditLog: { create: vi.fn() },
      } as unknown as PrismaClient;

      const updated = await muteMember('srv-1', 'adm-1', 'spammer', 10, 'Flood', mockPrisma);
      expect(updated.mutedUntil).toBe(futureDate);

      // Check isUserMutedInServer
      const isMutedPrisma = {
        serverMember: {
          findUnique: vi.fn().mockResolvedValue({ mutedUntil: futureDate }),
        },
      } as unknown as PrismaClient;

      const isMuted = await isUserMutedInServer('srv-1', 'spammer', isMutedPrisma);
      expect(isMuted).toBe(true);

      const isNotMutedPrisma = {
        serverMember: {
          findUnique: vi.fn().mockResolvedValue({ mutedUntil: new Date(Date.now() - 5000) }),
        },
      } as unknown as PrismaClient;

      const isMutedExpired = await isUserMutedInServer('srv-1', 'spammer', isNotMutedPrisma);
      expect(isMutedExpired).toBe(false);
    });
  });

  describe('createInvite and joinServerByInvite', () => {
    it('should create an expirable invite and allow user to join', async () => {
      const mockPrisma = {
        serverMember: {
          findUnique: vi.fn().mockResolvedValue({ userId: 'u-1', role: 'MEMBER', canInvite: true }),
        },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'u-1', email: 'u1@t.com', role: 'USER' }) },
        server: { findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1', allowMemberInvites: true }) },
        serverInvite: {
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'inv-1' })),
        },
      } as unknown as PrismaClient;

      const invite = await createInvite('srv-1', 'u-1', { expiresInHours: 24 }, mockPrisma);
      expect(invite.code).toBeDefined();
      expect(invite.expiresAt).toBeInstanceOf(Date);
      expect(mockPrisma.serverInvite.create).toHaveBeenCalled();
    });

    it('should forbid member from creating invite if server disabled member invites', async () => {
      const mockPrisma = {
        serverMember: {
          findUnique: vi.fn().mockResolvedValue({ userId: 'u-1', role: 'MEMBER', canInvite: true }),
        },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'u-1', email: 'u1@t.com', role: 'USER' }) },
        server: { findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1', allowMemberInvites: false }) },
      } as unknown as PrismaClient;

      await expect(createInvite('srv-1', 'u-1', undefined, mockPrisma)).rejects.toThrow(
        'Apenas administradores podem gerar convites neste servidor.'
      );
    });

    it('should forbid member from creating invite if member.canInvite is false', async () => {
      const mockPrisma = {
        serverMember: {
          findUnique: vi.fn().mockResolvedValue({ userId: 'u-1', role: 'MEMBER', canInvite: false }),
        },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'u-1', email: 'u1@t.com', role: 'USER' }) },
        server: { findUnique: vi.fn().mockResolvedValue({ id: 'srv-1', ownerId: 'owner-1', allowMemberInvites: true }) },
      } as unknown as PrismaClient;

      await expect(createInvite('srv-1', 'u-1', undefined, mockPrisma)).rejects.toThrow(
        'Você foi proibido de gerar convites para este servidor.'
      );
    });

    it('should reject joining if user is banned', async () => {
      const mockPrisma = {
        serverInvite: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'inv-1',
            code: 'valid-code',
            serverId: 'srv-1',
            uses: 0,
            maxUses: null,
            expiresAt: null,
          }),
        },
        serverBan: {
          findUnique: vi.fn().mockResolvedValue({ id: 'ban-1' }),
        },
      } as unknown as PrismaClient;

      await expect(joinServerByInvite('valid-code', 'banned-user', mockPrisma)).rejects.toThrow(
        'Você está banido deste servidor.'
      );
    });
  });

  describe('userHasAccessToPlatform', () => {
    it('should return true for SuperAdmin regardless of server memberships', async () => {
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ email: 'joaoprf2001@gmail.com', role: 'SUPERADMIN' }),
        },
      } as unknown as PrismaClient;

      const hasAccess = await userHasAccessToPlatform('root-id', mockPrisma);
      expect(hasAccess).toBe(true);
    });

    it('should return true for regular user if they belong to at least 1 server', async () => {
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ email: 'user@test.com', role: 'USER' }),
        },
        serverMember: {
          count: vi.fn().mockResolvedValue(1),
        },
      } as unknown as PrismaClient;

      const hasAccess = await userHasAccessToPlatform('member-id', mockPrisma);
      expect(hasAccess).toBe(true);
    });

    it('should return false for regular user who is not member of any server', async () => {
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ email: 'outsider@test.com', role: 'USER' }),
        },
        serverMember: {
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient;

      const hasAccess = await userHasAccessToPlatform('outsider-id', mockPrisma);
      expect(hasAccess).toBe(false);
    });
  });
});
