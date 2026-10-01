import { create } from 'zustand';
// Import types for internal use only — do NOT re-export shared types from this
// store module. Consumers should import directly from '@discord-clone/shared'.
// Re-exporting creates a misleading coupling: the store appears to own types
// it doesn't. (ESM Cap.5 — modules should have cohesive, minimal interfaces)
import type { Channel, Message, User, DirectMessage, Server, ServerMember, ServerMemberRole } from '@discord-clone/shared';

const DMS_LRU_LIMIT = 20;

function evictLru(
  dms: Record<string, DirectMessage[]>,
  order: string[],
  activeKey: string,
): { dms: Record<string, DirectMessage[]>; order: string[] } {
  const newOrder = [activeKey, ...order.filter((k) => k !== activeKey)];
  if (newOrder.length <= DMS_LRU_LIMIT) return { dms, order: newOrder };

  const evict = newOrder.splice(DMS_LRU_LIMIT);
  const newDms = { ...dms };
  for (const key of evict) delete newDms[key];
  return { dms: newDms, order: newOrder };
}

export type ViewMode = 'channels' | 'dms';

export type ServerWithDetails = Server & {
  channels?: Channel[];
  members?: ServerMember[];
  currentUserRole?: ServerMemberRole | null;
};

interface ChatState {
  viewMode: ViewMode;
  servers: Server[];
  activeServerId: string | null;
  activeServer: ServerWithDetails | null;
  channels: Channel[];
  users: User[]; // Users available for DM
  activeChannelId: string | null;
  activeDmUserId: string | null;
  currentUserId: string | null; // ID of the authenticated user
  currentUser: User | null; // Authenticated user profile
  messages: Message[];
  dms: Record<string, DirectMessage[]>; // Key is the other user's ID
  dmsOrder: string[]; // LRU order — most recently accessed first
  onlineUserIds: string[];

  setViewMode: (mode: ViewMode) => void;
  setServers: (servers: Server[]) => void;
  setActiveServerId: (id: string | null) => void;
  setActiveServer: (server: ServerWithDetails | null) => void;
  setChannels: (channels: Channel[]) => void;
  setUsers: (users: User[]) => void;
  setActiveChannelId: (id: string) => void;
  setActiveDmUserId: (id: string) => void;
  setCurrentUserId: (id: string) => void;
  setCurrentUser: (user: User | null) => void;
  updateCurrentUser: (data: Partial<User>) => void;
  setMessages: (messages: Message[]) => void;
  setDms: (userId: string, messages: DirectMessage[]) => void;
  prependMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  markMessageDeleted: (messageId: string) => void;
  addDm: (dm: DirectMessage, otherUserId: string) => void;
  setOnlineUserIds: (ids: string[]) => void;
  setUserStatus: (userId: string, status: 'online' | 'offline') => void;
}

export const useChatStore = create<ChatState>((set) => ({
  viewMode: 'channels',
  servers: [],
  activeServerId: null,
  activeServer: null,
  channels: [],
  users: [],
  activeChannelId: null,
  activeDmUserId: null,
  currentUserId: null,
  currentUser: null,
  messages: [],
  dms: {},
  dmsOrder: [],
  onlineUserIds: [],
  setViewMode: (mode) => set({ viewMode: mode }),
  setServers: (servers) => set({ servers }),
  setActiveServerId: (id) => set({ activeServerId: id }),
  setActiveServer: (server) => set({ activeServer: server }),
  setChannels: (channels) => set({ channels }),
  setUsers: (users) => set({ users }),
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setActiveDmUserId: (id) => set({ activeDmUserId: id }),
  setCurrentUserId: (id) => set({ currentUserId: id }),
  setCurrentUser: (user) => set((state) => ({
    currentUser: user,
    onlineUserIds: user && !state.onlineUserIds.includes(user.id)
      ? [...state.onlineUserIds, user.id]
      : state.onlineUserIds,
  })),
  updateCurrentUser: (data) => set((state) => {
    const updated = state.currentUser ? { ...state.currentUser, ...data } : null;
    const updatedUsers = state.users.map((u) => (u.id === state.currentUserId ? { ...u, ...data } : u));
    return { currentUser: updated, users: updatedUsers };
  }),
  setOnlineUserIds: (ids) => set({ onlineUserIds: ids }),
  setUserStatus: (userId, status) => set((state) => {
    if (status === 'online') {
      return state.onlineUserIds.includes(userId)
        ? state
        : { onlineUserIds: [...state.onlineUserIds, userId] };
    }
    return { onlineUserIds: state.onlineUserIds.filter((id) => id !== userId) };
  }),
  setMessages: (messages) => set({ messages }),
  setDms: (userId, messages) => set((state) => {
    const updated = { ...state.dms, [userId]: messages };
    const { dms, order } = evictLru(updated, state.dmsOrder, userId);
    return { dms, dmsOrder: order };
  }),
  prependMessages: (messages) => set((state) => {
    const existingIds = new Set(state.messages.map((message) => message.id));
    const newMessages = messages.filter((message) => !existingIds.has(message.id));
    return { messages: [...newMessages, ...state.messages] };
  }),
  addMessage: (message) => set((state) => ({
    messages: state.messages.some((currentMessage) => currentMessage.id === message.id)
      ? state.messages
      : [...state.messages, message]
  })),
  markMessageDeleted: (messageId) => set((state) => ({
    messages: state.messages.map((m) =>
      m.id === messageId
        ? { ...m, isDeleted: true, content: '[Mensagem excluída por um moderador]' }
        : m
    ),
  })),
  addDm: (dm, otherUserId) => set((state) => {
    const existingDms = state.dms[otherUserId] || [];
    if (existingDms.some((currentDm) => currentDm.id === dm.id)) return state;
    const updated = { ...state.dms, [otherUserId]: [...existingDms, dm] };
    const { dms, order } = evictLru(updated, state.dmsOrder, otherUserId);
    return { dms, dmsOrder: order };
  }),
}));
