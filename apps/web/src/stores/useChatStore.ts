import { create } from 'zustand';
import type { Channel, Message } from '@discord-clone/shared';

export type { Channel, Message, User } from '@discord-clone/shared';

interface ChatState {
  channels: Channel[];
  activeChannelId: string | null;
  messages: Message[];
  setChannels: (channels: Channel[]) => void;
  setActiveChannelId: (id: string) => void;
  setMessages: (messages: Message[]) => void;
  prependMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  activeChannelId: null,
  messages: [],
  setChannels: (channels) => set({ channels }),
  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setMessages: (messages) => set({ messages }),
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
}));
