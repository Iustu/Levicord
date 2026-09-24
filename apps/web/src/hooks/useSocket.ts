import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/useChatStore';
import type { Message } from '../stores/useChatStore';
import { useAuth } from './useAuth';
import { API_BASE } from '../lib/api';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuth();
  const addMessage = useChatStore((state) => state.addMessage);

  useEffect(() => {
    if (!token) return;

    // Connect to Socket.io server
    socketRef.current = io(API_BASE, {
      ...(token !== '__cookie__' ? { auth: { token } } : {}),
      withCredentials: true,
    });

    socketRef.current.on('new_message', (message: Message) => {
      addMessage(message);
    });

    socketRef.current.on('new_dm', (dm: any) => {
      // Determine the 'other' user to know where to put the message
      const myUserId = JSON.parse(atob(token.split('.')[1])).sub;
      const otherUserId = dm.senderId === myUserId ? dm.receiverId : dm.senderId;
      useChatStore.getState().addDm(dm, otherUserId);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [token, addMessage]);

  const joinChannel = (channelId: string) => {
    socketRef.current?.emit('join_channel', channelId);
  };

  const sendMessage = (channelId: string, content: string | null, attachments?: any[]) => {
    socketRef.current?.emit('send_message', { channelId, content, attachments });
  };

  const sendDm = (receiverId: string, content: string | null, attachments?: any[]) => {
    socketRef.current?.emit('send_dm', { receiverId, content, attachments });
  };

  return { socket: socketRef.current, joinChannel, sendMessage, sendDm };
}
