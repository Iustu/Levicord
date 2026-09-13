export interface User {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
}

export interface Message {
  id: string;
  content: string;
  createdAt: string;
  channelId: string;
  author: User;
}

export interface PaginatedMessages {
  messages: Message[];
  nextCursor: string | null;
}
