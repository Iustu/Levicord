import { create } from 'zustand';
import type { Channel, Message, User, DirectMessage } from '@discord-clone/shared';

export type { Channel, Message, User, DirectMessage } from '@discord-clone/shared';

export type ViewMode = 'channels' | 'dms';

interface ChatState {
  viewMode: ViewMode;
  channels: Channel[];
  users: User[]; // Users available for DM
  activeChannelId: string | null;
  activeDmUserId: string | null;
  messages: Message[];
  dms: Record<string, DirectMessage[]>; // Key is the other user's ID
  
  setViewMode: (mode: ViewMode) => void;
  setChannels: (channels: Channel[]) => void;
  setUsers: (users: User[]) => void;
  setActiveChannelId: (id: string) => void;
  setActiveDmUserId: (id: string) => void;
  setMessages: (messages: Message[]) => void;
  setDms: (userId: string, messages: DirectMessage[]) => void;
  prependMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  addDm: (dm: DirectMessage, otherUserId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  viewMode: 'channels',
  channels: [],
  users: [],
  activeChannelId: null,
  activeDmUserId: null,
  messages: [],
  dms: {},
  setViewMode: (mode) => set({ viewMode: mode }),
  setChannels: (channels) => set({ channels }),
  setUsers: (users) => set({ users }),
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setActiveDmUserId: (id) => set({ activeDmUserId: id }),
  setMessages: (messages) => set({ messages }),
  setDms: (userId, messages) => set((state) => ({ 
    dms: { ...state.dms, [userId]: messages } 
  })),
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
  addDm: (dm, otherUserId) => set((state) => {
    const existingDms = state.dms[otherUserId] || [];
    if (existingDms.some((currentDm) => currentDm.id === dm.id)) return state;
    return { dms: { ...state.dms, [otherUserId]: [...existingDms, dm] } };
  }),
}));
