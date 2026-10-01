import type { UserRole, ServerMemberRole } from '@prisma/client';

export const ROOT_SUPERADMIN_EMAIL = 'joaoprf2001@gmail.com';

export interface ActorContext {
  id: string;
  email: string;
  role: UserRole;
  serverRole?: ServerMemberRole | null;
}

export interface TargetUserContext {
  id: string;
  email: string;
  role: UserRole;
  promotedById: string | null;
}

export interface TargetMemberContext {
  userId: string;
  role: ServerMemberRole;
  promotedById: string | null;
}

export interface ServerContext {
  id: string;
  ownerId: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks if an email belongs to the irrevocable root superadmin.
 */
export function isRootSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().trim() === ROOT_SUPERADMIN_EMAIL.toLowerCase();
}

/**
 * Evaluates whether an actor can promote or demote a SuperAdmin.
 *
 * Rules:
 * 1. Root SuperAdmin (joaoprf2001@gmail.com) is irrevocable — can NEVER be demoted.
 * 2. Only SuperAdmins can promote someone to SuperAdmin.
 * 3. To demote a SuperAdmin:
 *    - Root SuperAdmin can demote any SuperAdmin (except themselves).
 *    - Regular SuperAdmin can only demote SuperAdmins who were promoted by THEM (promotedById === actor.id).
 *    - If target has no superior (promotedById === null), only Root SuperAdmin can demote.
 */
export function canManageSuperAdmin(
  actor: ActorContext,
  target: TargetUserContext,
  action: 'promote' | 'demote',
): PermissionResult {
  if (actor.role !== 'SUPERADMIN' && !isRootSuperAdmin(actor.email)) {
    return { allowed: false, reason: 'Apenas Superadmins podem gerenciar o cargo de Superadmin.' };
  }

  if (action === 'promote') {
    return { allowed: true };
  }

  // Demotion rules
  if (isRootSuperAdmin(target.email)) {
    return { allowed: false, reason: 'A conta root joaoprf2001@gmail.com possui Superadmin irrevogável.' };
  }

  if (target.id === actor.id) {
    return { allowed: false, reason: 'Você não pode revogar o seu próprio cargo de Superadmin por esta rota.' };
  }

  // Root SuperAdmin has supreme court authority over all superadmins
  if (isRootSuperAdmin(actor.email)) {
    return { allowed: true };
  }

  // If target has no recorded superior, user specified: "A remoção de superadmin sem 'superior' fica por minha conta."
  if (!target.promotedById) {
    return {
      allowed: false,
      reason: 'Superadmins sem superior só podem ser removidos pelo Superadmin Root (joaoprf2001@gmail.com).',
    };
  }

  // Lineage check: Superadmin can only demote who they personally promoted
  if (target.promotedById !== actor.id) {
    return {
      allowed: false,
      reason: 'Você só pode remover o cargo de Superadmin de usuários que você próprio promoveu.',
    };
  }

  return { allowed: true };
}

/**
 * Evaluates whether an actor can promote or demote a Server Admin.
 *
 * Rules:
 * 1. Global SuperAdmins can remove or assign ANY admin in ANY server without restriction.
 * 2. Server Owners can remove or assign any admin in their server.
 * 3. Server Admins can grant Admin to members in that server, but can ONLY remove Admin from
 *    members that they personally promoted (promotedById === actor.id).
 */
export function canManageServerAdmin(
  actor: ActorContext,
  target: TargetMemberContext,
  server: ServerContext,
  action: 'promote' | 'demote',
): PermissionResult {
  // Global Superadmins have universal local administration powers
  if (actor.role === 'SUPERADMIN' || isRootSuperAdmin(actor.email)) {
    return { allowed: true };
  }

  // Server Owner has total sovereignty over the server
  if (actor.id === server.ownerId) {
    return { allowed: true };
  }

  // Actor must at least be an Admin in this server
  if (actor.serverRole !== 'ADMIN' && actor.serverRole !== 'OWNER') {
    return { allowed: false, reason: 'Permissões de administrador de servidor necessárias.' };
  }

  // Cannot modify server owner's role
  if (target.userId === server.ownerId) {
    return { allowed: false, reason: 'O dono do servidor não pode ser alterado por esta via.' };
  }

  if (action === 'promote') {
    return { allowed: true };
  }

  // Demote: Lineage rule for regular server admins
  if (target.role === 'ADMIN' && target.promotedById !== actor.id) {
    return {
      allowed: false,
      reason: 'Admins só podem remover o cargo de administradores que eles próprios concederam.',
    };
  }

  return { allowed: true };
}

/**
 * Evaluates whether an actor can moderate (kick, ban, mute) a member in a server.
 *
 * Rules:
 * 1. Server Owner cannot be moderated.
 * 2. Global Superadmins can moderate anyone (except server owner).
 * 3. Server Owner can moderate anyone in their server.
 * 4. Server Admins can moderate regular Members and Moderators, but cannot moderate other Admins or Owner.
 */
export function canModerateMember(
  actor: ActorContext,
  target: TargetMemberContext,
  server: ServerContext,
  action: 'kick' | 'ban' | 'mute',
): PermissionResult {
  if (target.userId === server.ownerId) {
    return { allowed: false, reason: 'O dono do servidor não pode sofrer moderação.' };
  }

  if (target.userId === actor.id) {
    return { allowed: false, reason: `Você não pode executar ${action} em si mesmo.` };
  }

  if (actor.role === 'SUPERADMIN' || isRootSuperAdmin(actor.email)) {
    return { allowed: true };
  }

  if (actor.id === server.ownerId) {
    return { allowed: true };
  }

  if (actor.serverRole === 'ADMIN') {
    if (target.role === 'ADMIN' || target.role === 'OWNER') {
      return { allowed: false, reason: 'Administradores não podem moderar outros administradores.' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'Você não tem permissão para moderar este membro.' };
}

/**
 * Evaluates whether an actor can delete a message (soft delete).
 *
 * Rules:
 * 1. Author can always delete their own message.
 * 2. Global Superadmins can delete any message.
 * 3. Server Owners and Server Admins can delete any message in their server.
 */
export function canDeleteMessage(
  actor: ActorContext,
  message: { authorId: string },
  server?: ServerContext | null,
): PermissionResult {
  if (actor.id === message.authorId) {
    return { allowed: true };
  }

  if (actor.role === 'SUPERADMIN' || isRootSuperAdmin(actor.email)) {
    return { allowed: true };
  }

  if (server) {
    if (actor.id === server.ownerId || actor.serverRole === 'ADMIN') {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: 'Você só pode excluir as suas próprias mensagens.' };
}

/**
 * Evaluates whether an actor can create an invite for a server.
 *
 * Rules:
 * 1. Global Superadmins can create invites for any server.
 * 2. Server Owners and Server Admins can always create invites.
 * 3. Regular Members can create invites UNLESS:
 *    - The server disabled member invites (server.allowMemberInvites === false)
 *    - The specific member is prohibited (member.canInvite === false)
 */
export function canCreateInvite(
  actor: ActorContext,
  member: { role: ServerMemberRole; canInvite: boolean } | null,
  server: { id: string; ownerId: string; allowMemberInvites: boolean },
): PermissionResult {
  if (actor.role === 'SUPERADMIN' || isRootSuperAdmin(actor.email)) {
    return { allowed: true };
  }

  if (actor.id === server.ownerId || actor.serverRole === 'ADMIN') {
    return { allowed: true };
  }

  if (!member) {
    return { allowed: false, reason: 'Você precisa ser membro do servidor para gerar convites.' };
  }

  if (!member.canInvite) {
    return { allowed: false, reason: 'Você foi proibido de gerar convites para este servidor.' };
  }

  if (!server.allowMemberInvites) {
    return { allowed: false, reason: 'Apenas administradores podem gerar convites neste servidor.' };
  }

  return { allowed: true };
}
