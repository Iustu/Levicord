export type UserRole = 'USER' | 'ADMIN' | 'SUPERADMIN';

export type ServerMemberRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';

export interface User {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string | null;
  role?: UserRole;
  promotedById?: string | null;
}

export interface Server {
  id: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  ownerId: string;
  allowMemberInvites?: boolean;
  createdAt: string;
}

export interface ServerMember {
  id: string;
  serverId: string;
  userId: string;
  role: ServerMemberRole;
  promotedById?: string | null;
  mutedUntil?: string | null;
  canInvite?: boolean;
  joinedAt: string;
  user?: User;
}

export interface ServerBan {
  id: string;
  serverId: string;
  userId: string;
  reason?: string | null;
  bannedById: string;
  createdAt: string;
  user?: User;
}

export interface ServerInvite {
  id: string;
  code: string;
  serverId: string;
  createdById: string;
  maxUses?: number | null;
  uses: number;
  expiresAt?: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  serverId: string;
  actorId: string;
  action: string;
  targetId?: string | null;
  reason?: string | null;
  metadata?: string | null;
  createdAt: string;
  actor?: User;
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  type: 'TEXT' | 'VOICE';
  serverId?: string | null;
  order?: number;
}

export interface Attachment {
  id: string;
  url: string;
  type: 'image' | 'video' | 'file';
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface Message {
  id: string;
  content: string | null;
  createdAt: string;
  channelId: string;
  author: User;
  attachments?: Attachment[];
  isDeleted?: boolean;
  deletedAt?: string | null;
  deletedById?: string | null;
}

export interface PaginatedMessages {
  messages: Message[];
  nextCursor: string | null;
}

export interface DirectMessage {
  id: string;
  content: string | null;
  createdAt: string;
  senderId: string;
  receiverId: string;
  sender: User;
  attachments?: Attachment[];
}
