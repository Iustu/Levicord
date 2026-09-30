import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useChatStore } from '../stores/useChatStore';
import type { Message, DirectMessage } from '../stores/useChatStore';

export function useSocketListeners(socket: Socket | null) {
  const addMessage = useChatStore((state) => state.addMessage);
  const currentUserId = useChatStore((state) => state.currentUserId);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: Message) => addMessage(message);

    const handleNewDm = (dm: DirectMessage) => {
      // Determine the "other" party in the conversation from the store's currentUserId.
      // This replaces the previous fragile atob(token.split('.')[1]) JWT decode.
      const myId = useChatStore.getState().currentUserId;
      if (!myId) return;
      const otherUserId = dm.senderId === myId ? dm.receiverId : dm.senderId;
      useChatStore.getState().addDm(dm, otherUserId);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('new_dm', handleNewDm);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('new_dm', handleNewDm);
    };
  }, [socket, addMessage, currentUserId]);
}
