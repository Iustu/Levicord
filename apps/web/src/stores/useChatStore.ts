import { create } from 'zustand';

export interface User {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Message {
  id: string;
  content: string;
  createdAt: string;
  channelId: string;
  author: User;
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
}

interface ChatState {
  channels: Channel[];
  activeChannelId: string | null;
  messages: Message[];
  setChannels: (channels: Channel[]) => void;
  setActiveChannelId: (id: string) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  activeChannelId: null,
  messages: [],
  setChannels: (channels) => set({ channels }),
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ 
    messages: state.messages.find(m => m.id === message.id) ? state.messages : [...state.messages, message] 
  })),
}));
