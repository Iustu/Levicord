import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useChatStore } from '../stores/useChatStore';
import type { Message, DirectMessage } from '@discord-clone/shared';

export interface SocketListenerActions {
  addMessage?: (message: Message) => void;
  addDm?: (dm: DirectMessage, otherUserId: string) => void;
  getCurrentUserId?: () => string | null;
  setUserStatus?: (userId: string, status: 'online' | 'offline') => void;
}

/**
 * Attaches real-time Socket.io listeners for channel messages, direct messages, and presence.
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
  const setUserStatus = actions?.setUserStatus ?? ((userId, status) => useChatStore.getState().setUserStatus(userId, status));

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

    const handleUserStatus = (data: { userId: string; status: 'online' | 'offline' }) => {
      setUserStatus(data.userId, data.status);
    };

    const handleMessageDeleted = (data: { channelId: string; messageId: string }) => {
      useChatStore.getState().markMessageDeleted(data.messageId);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('new_dm', handleNewDm);
    socket.on('user_status', handleUserStatus);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('new_dm', handleNewDm);
      socket.off('user_status', handleUserStatus);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [socket, addMessage, addDm, getUserId, setUserStatus, currentUserId]);
}
