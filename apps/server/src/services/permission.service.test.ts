import { describe, it, expect } from 'vitest';
import {
  isRootSuperAdmin,
  canManageSuperAdmin,
  canManageServerAdmin,
  canModerateMember,
  canDeleteMessage,
  canCreateInvite,
  canManageServer,
  ROOT_SUPERADMIN_EMAIL,
} from './permission.service';

describe('Permission Service', () => {
  const rootActor = {
    id: 'root-id',
    email: ROOT_SUPERADMIN_EMAIL,
    role: 'SUPERADMIN' as const,
  };

  const superAdminA = {
    id: 'super-a-id',
    email: 'supera@example.com',
    role: 'SUPERADMIN' as const,
  };

  const superAdminB = {
    id: 'super-b-id',
    email: 'superb@example.com',
    role: 'SUPERADMIN' as const,
  };

  const regularUser = {
    id: 'user-id',
    email: 'user@example.com',
    role: 'USER' as const,
  };

  const server = {
    id: 'server-1',
    ownerId: 'owner-id',
  };

  describe('isRootSuperAdmin', () => {
    it('returns true for root superadmin email regardless of casing', () => {
      expect(isRootSuperAdmin('joaoprf2001@gmail.com')).toBe(true);
      expect(isRootSuperAdmin('JOAOPRF2001@GMAIL.COM ')).toBe(true);
    });

    it('returns false for other emails', () => {
      expect(isRootSuperAdmin('other@gmail.com')).toBe(false);
      expect(isRootSuperAdmin(null)).toBe(false);
    });
  });

  describe('canManageSuperAdmin', () => {
    it('rejects management if actor is not superadmin', () => {
      const result = canManageSuperAdmin(regularUser, { ...superAdminA, promotedById: null }, 'promote');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Apenas Superadmins');
    });

    it('allows superadmin to promote another user', () => {
      const result = canManageSuperAdmin(superAdminA, { ...regularUser, promotedById: null }, 'promote');
      expect(result.allowed).toBe(true);
    });

    it('strictly forbids demoting root superadmin', () => {
      const result = canManageSuperAdmin(superAdminA, { ...rootActor, promotedById: null }, 'demote');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('irrevogável');
    });

    it('allows root superadmin to demote any other superadmin', () => {
      const result = canManageSuperAdmin(rootActor, { ...superAdminA, promotedById: null }, 'demote');
      expect(result.allowed).toBe(true);
    });

    it('allows regular superadmin to demote only who they promoted', () => {
      const targetPromotedByA = {
        id: 'target-id',
        email: 'target@example.com',
        role: 'SUPERADMIN' as const,
        promotedById: superAdminA.id,
      };

      const resultA = canManageSuperAdmin(superAdminA, targetPromotedByA, 'demote');
      expect(resultA.allowed).toBe(true);

      const resultB = canManageSuperAdmin(superAdminB, targetPromotedByA, 'demote');
      expect(resultB.allowed).toBe(false);
      expect(resultB.reason).toContain('você próprio promoveu');
    });

    it('forbids regular superadmin from demoting superadmin without superior, requiring root', () => {
      const orphanedSuperAdmin = {
        id: 'orphan-id',
        email: 'orphan@example.com',
        role: 'SUPERADMIN' as const,
        promotedById: null,
      };

      const result = canManageSuperAdmin(superAdminA, orphanedSuperAdmin, 'demote');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Superadmin Root');

      const rootResult = canManageSuperAdmin(rootActor, orphanedSuperAdmin, 'demote');
      expect(rootResult.allowed).toBe(true);
    });
  });

  describe('canManageServerAdmin', () => {
    it('allows global superadmin to remove any server admin without restriction', () => {
      const targetAdmin = {
        userId: 'admin-target',
        role: 'ADMIN' as const,
        promotedById: 'someone-else',
      };

      const result = canManageServerAdmin(superAdminA, targetAdmin, server, 'demote');
      expect(result.allowed).toBe(true);
    });

    it('allows server owner to remove any server admin', () => {
      const ownerActor = {
        id: server.ownerId,
        email: 'owner@example.com',
        role: 'USER' as const,
        serverRole: 'OWNER' as const,
      };

      const targetAdmin = {
        userId: 'admin-target',
        role: 'ADMIN' as const,
        promotedById: 'another-admin',
      };

      const result = canManageServerAdmin(ownerActor, targetAdmin, server, 'demote');
      expect(result.allowed).toBe(true);
    });

    it('allows server admin to demote only admins they personally promoted', () => {
      const adminActor = {
        id: 'admin-1',
        email: 'admin1@example.com',
        role: 'USER' as const,
        serverRole: 'ADMIN' as const,
      };

      const targetPromotedByAdmin1 = {
        userId: 'admin-2',
        role: 'ADMIN' as const,
        promotedById: 'admin-1',
      };

      const targetPromotedByOther = {
        userId: 'admin-3',
        role: 'ADMIN' as const,
        promotedById: 'other-id',
      };

      expect(canManageServerAdmin(adminActor, targetPromotedByAdmin1, server, 'demote').allowed).toBe(true);

      const rejected = canManageServerAdmin(adminActor, targetPromotedByOther, server, 'demote');
      expect(rejected.allowed).toBe(false);
      expect(rejected.reason).toContain('eles próprios concederam');
    });
  });

  describe('canModerateMember', () => {
    const serverOwner = {
      id: server.ownerId,
      email: 'owner@example.com',
      role: 'USER' as const,
      serverRole: 'OWNER' as const,
    };

    const serverAdmin = {
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'USER' as const,
      serverRole: 'ADMIN' as const,
    };

    const targetMember = {
      userId: 'member-id',
      role: 'MEMBER' as const,
      promotedById: null,
    };

    const targetAdmin = {
      userId: 'other-admin-id',
      role: 'ADMIN' as const,
      promotedById: null,
    };

    it('forbids moderating the server owner', () => {
      const targetOwner = { userId: server.ownerId, role: 'OWNER' as const, promotedById: null };
      const result = canModerateMember(superAdminA, targetOwner, server, 'ban');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('dono do servidor não pode sofrer moderação');
    });

    it('allows server admin to kick, ban, or mute regular members', () => {
      expect(canModerateMember(serverAdmin, targetMember, server, 'kick').allowed).toBe(true);
      expect(canModerateMember(serverAdmin, targetMember, server, 'ban').allowed).toBe(true);
      expect(canModerateMember(serverAdmin, targetMember, server, 'mute').allowed).toBe(true);
    });

    it('forbids server admin from moderating other admins', () => {
      const result = canModerateMember(serverAdmin, targetAdmin, server, 'kick');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('não podem moderar outros administradores');
    });

    it('allows server owner to moderate anyone in the server', () => {
      expect(canModerateMember(serverOwner, targetAdmin, server, 'kick').allowed).toBe(true);
    });
  });

  describe('canDeleteMessage', () => {
    const authorActor = {
      id: 'author-id',
      email: 'author@example.com',
      role: 'USER' as const,
    };

    const otherActor = {
      id: 'other-id',
      email: 'other@example.com',
      role: 'USER' as const,
    };

    const serverAdmin = {
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'USER' as const,
      serverRole: 'ADMIN' as const,
    };

    const message = { authorId: 'author-id' };

    it('allows author to delete their own message', () => {
      expect(canDeleteMessage(authorActor, message).allowed).toBe(true);
    });

    it('allows global superadmin to delete any message', () => {
      expect(canDeleteMessage(superAdminA, message).allowed).toBe(true);
    });

    it('allows server admin to delete message within their server', () => {
      expect(canDeleteMessage(serverAdmin, message, server).allowed).toBe(true);
    });

    it('forbids regular users from deleting others messages', () => {
      const result = canDeleteMessage(otherActor, message, server);
      expect(result.allowed).toBe(false);
    });
  });

  describe('canCreateInvite', () => {
    const regularMemberActor = {
      id: 'member-1',
      email: 'member@test.com',
      role: 'USER' as const,
      serverRole: 'MEMBER' as const,
    };

    const serverAllowed = {
      id: 'srv-1',
      ownerId: 'owner-1',
      allowMemberInvites: true,
    };

    const serverRestricted = {
      id: 'srv-1',
      ownerId: 'owner-1',
      allowMemberInvites: false,
    };

    it('allows global superadmin to create invite anywhere even if server restricted', () => {
      const result = canCreateInvite(rootActor, null, serverRestricted);
      expect(result.allowed).toBe(true);
    });

    it('allows regular member to create invite if allowed by server and not restricted individually', () => {
      const member = { role: 'MEMBER' as const, canInvite: true };
      const result = canCreateInvite(regularMemberActor, member, serverAllowed);
      expect(result.allowed).toBe(true);
    });

    it('forbids regular member if server disables member invites', () => {
      const member = { role: 'MEMBER' as const, canInvite: true };
      const result = canCreateInvite(regularMemberActor, member, serverRestricted);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Apenas administradores');
    });

    it('forbids specific member if member.canInvite is false', () => {
      const member = { role: 'MEMBER' as const, canInvite: false };
      const result = canCreateInvite(regularMemberActor, member, serverAllowed);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('proibido de gerar convites');
    });

    it('always allows server admin to create invite even if server restricted', () => {
      const adminActor = {
        id: 'admin-1',
        email: 'adm@test.com',
        role: 'USER' as const,
        serverRole: 'ADMIN' as const,
      };
      const member = { role: 'ADMIN' as const, canInvite: true };
      const result = canCreateInvite(adminActor, member, serverRestricted);
      expect(result.allowed).toBe(true);
    });
  });

  describe('canManageServer', () => {
    it('allows root superadmin', () => {
      const result = canManageServer(rootActor, server);
      expect(result.allowed).toBe(true);
    });

    it('allows global superadmin', () => {
      const result = canManageServer(superAdminA, server);
      expect(result.allowed).toBe(true);
    });

    it('allows server owner even if regular USER globally', () => {
      const ownerActor = {
        id: 'owner-id',
        email: 'owner@example.com',
        role: 'USER' as const,
      };
      const result = canManageServer(ownerActor, server);
      expect(result.allowed).toBe(true);
    });

    it('allows server admin member', () => {
      const adminActor = {
        id: 'mod-1',
        email: 'mod@example.com',
        role: 'USER' as const,
        serverRole: 'ADMIN' as const,
      };
      const result = canManageServer(adminActor, server);
      expect(result.allowed).toBe(true);
    });

    it('forbids regular member without admin privileges', () => {
      const regularMember = {
        id: 'member-1',
        email: 'member@example.com',
        role: 'USER' as const,
        serverRole: 'MEMBER' as const,
      };
      const result = canManageServer(regularMember, server);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Sem permissão para administrar este servidor');
    });
  });
});

