import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useChatStore } from '../stores/useChatStore';
import type { Message } from '../stores/useChatStore';
import { useAuth } from './useAuth';

interface DmPayload {
  id: string;
  senderId: string;
  receiverId: string;
  [key: string]: unknown;
}

export function useSocketListeners(socket: Socket | null) {
  const { token } = useAuth();
  const addMessage = useChatStore((state) => state.addMessage);

  useEffect(() => {
    if (!socket || !token) return;

    const handleNewMessage = (message: Message) => addMessage(message);

    const handleNewDm = (dm: DmPayload) => {
      const myUserId = JSON.parse(atob(token.split('.')[1])).sub as string;
      const otherUserId = dm.senderId === myUserId ? dm.receiverId : dm.senderId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useChatStore.getState().addDm(dm as any, otherUserId);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('new_dm', handleNewDm);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('new_dm', handleNewDm);
    };
  }, [socket, token, addMessage]);
}
