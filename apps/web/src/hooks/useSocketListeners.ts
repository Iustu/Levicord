import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useChatStore } from '../stores/useChatStore';
import type { Message, DirectMessage } from '@discord-clone/shared';

export interface SocketListenerActions {
  addMessage?: (message: Message) => void;
  addDm?: (dm: DirectMessage, otherUserId: string) => void;
  getCurrentUserId?: () => string | null;
}

/**
 * Attaches real-time Socket.io listeners for channel messages and direct messages.
 *
 * Supports Dependency Injection (DI) for testability and loose coupling (ESM Cap. 5).
 * If actions are not provided, it defaults to the global Zustand store.
 */
export function useSocketListeners(socket: Socket | null, actions?: SocketListenerActions) {
  const storeAddMessage = useChatStore((state) => state.addMessage);
  const currentUserId = useChatStore((state) => state.currentUserId);

  const addMessage = actions?.addMessage ?? storeAddMessage;
  const addDm = actions?.addDm ?? ((dm, otherId) => useChatStore.getState().addDm(dm, otherId));
  const getUserId = actions?.getCurrentUserId ?? (() => useChatStore.getState().currentUserId);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: Message) => {
      if (actions?.addMessage) {
        actions.addMessage(message);
        return;
      }
      const activeChannelId = useChatStore.getState().activeChannelId;
      if (!message.channelId || !activeChannelId || message.channelId === activeChannelId) {
        addMessage(message);
      }
    };

    const handleNewDm = (dm: DirectMessage) => {
      const myId = getUserId();
      if (!myId) return;
      const otherUserId = dm.senderId === myId ? dm.receiverId : dm.senderId;
      addDm(dm, otherUserId);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('new_dm', handleNewDm);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('new_dm', handleNewDm);
    };
  }, [socket, addMessage, addDm, getUserId, currentUserId]);
}
