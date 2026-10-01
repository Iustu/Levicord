import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { User } from '@discord-clone/shared';

interface UseTypingIndicatorOptions {
  socket: Socket | null;
  activeChannelId: string | null;
  users: User[];
}

/**
 * Manages the typing indicator state for a channel.
 *
 * Listens to `user_typing` and `user_stopped_typing` socket events and
 * returns a list of display names currently typing. Each entry auto-expires
 * after 3 s of no activity (mirrors the server-side debounce window).
 *
 * Extracted from MainApp to enforce SRP.
 * (ESM Cap.5 — hooks should do one thing and do it well)
 */
export function useTypingIndicator({ socket, activeChannelId, users }: UseTypingIndicatorOptions) {
  const [typingUserNames, setTypingUserNames] = useState<string[]>([]);

  useEffect(() => {
    if (!socket) return;

    // Map userId → timer handle so we can reset the timer on new events
    const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

    const onTyping = (data: { userId: string; channelId: string }) => {
      if (data.channelId !== activeChannelId) return;
      const user = users.find((u) => u.id === data.userId);
      const name = user?.displayName ?? 'Alguém';
      setTypingUserNames((prev) => (prev.includes(name) ? prev : [...prev, name]));

      if (typingTimers[data.userId]) clearTimeout(typingTimers[data.userId]);
      typingTimers[data.userId] = setTimeout(() => {
        setTypingUserNames((prev) => prev.filter((n) => n !== name));
        delete typingTimers[data.userId];
      }, 3000);
    };

    const onStopTyping = (data: { userId: string }) => {
      const user = users.find((u) => u.id === data.userId);
      const name = user?.displayName ?? 'Alguém';
      if (typingTimers[data.userId]) {
        clearTimeout(typingTimers[data.userId]);
        delete typingTimers[data.userId];
      }
      setTypingUserNames((prev) => prev.filter((n) => n !== name));
    };

    socket.on('user_typing', onTyping);
    socket.on('user_stopped_typing', onStopTyping);

    return () => {
      socket.off('user_typing', onTyping);
      socket.off('user_stopped_typing', onStopTyping);
      Object.values(typingTimers).forEach(clearTimeout);
    };
  }, [socket, activeChannelId, users]);

  return typingUserNames;
}
