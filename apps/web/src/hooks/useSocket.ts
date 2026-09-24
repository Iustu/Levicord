import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/useChatStore';
import type { Message } from '../stores/useChatStore';
import { useAuth } from './useAuth';
import { API_BASE } from '../lib/api';

interface AttachmentPayload {
  url: string;
  type: 'image' | 'video' | 'file';
  fileName: string;
  fileSize: number;
  mimeType: string;
}

interface DmPayload {
  id: string;
  senderId: string;
  receiverId: string;
  [key: string]: unknown;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuth();
  const addMessage = useChatStore((state) => state.addMessage);

  useEffect(() => {
    if (!token) return;

    socketRef.current = io(API_BASE, {
      ...(token !== '__cookie__' ? { auth: { token } } : {}),
      withCredentials: true,
    });

    socketRef.current.on('new_message', (message: Message) => {
      addMessage(message);
    });

    socketRef.current.on('new_dm', (dm: DmPayload) => {
      const myUserId = JSON.parse(atob(token.split('.')[1])).sub as string;
      const otherUserId = dm.senderId === myUserId ? dm.receiverId : dm.senderId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useChatStore.getState().addDm(dm as any, otherUserId);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [token, addMessage]);

  const joinChannel = useCallback((channelId: string) => {
    socketRef.current?.emit('join_channel', channelId);
  }, []);

  const sendMessage = useCallback((channelId: string, content: string | null, attachments?: AttachmentPayload[]) => {
    socketRef.current?.emit('send_message', { channelId, content, attachments });
  }, []);

  const sendDm = useCallback((receiverId: string, content: string | null, attachments?: AttachmentPayload[]) => {
    socketRef.current?.emit('send_dm', { receiverId, content, attachments });
  }, []);

  const sendTypingStart = useCallback((channelId: string) => {
    socketRef.current?.emit('typing_start', channelId);
  }, []);

  const sendTypingStop = useCallback((channelId: string) => {
    socketRef.current?.emit('typing_stop', channelId);
  }, []);

  return { socket: socketRef.current, joinChannel, sendMessage, sendDm, sendTypingStart, sendTypingStop };
}
