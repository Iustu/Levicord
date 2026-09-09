import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore, Message } from '../stores/useChatStore';
import { useAuth } from './useAuth';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuth();
  const addMessage = useChatStore((state) => state.addMessage);

  useEffect(() => {
    if (!token) return;

    // Connect to Socket.io server
    socketRef.current = io('http://localhost:3000', {
      auth: { token },
      withCredentials: true,
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to socket server');
    });

    socketRef.current.on('new_message', (message: Message) => {
      // The store handles appending the message
      addMessage(message);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [token, addMessage]);

  const joinChannel = (channelId: string) => {
    socketRef.current?.emit('join_channel', channelId);
  };

  const sendMessage = (channelId: string, content: string) => {
    socketRef.current?.emit('send_message', { channelId, content });
  };

  return { joinChannel, sendMessage };
}
