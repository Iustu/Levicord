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
  type: 'TEXT' | 'VOICE';
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
