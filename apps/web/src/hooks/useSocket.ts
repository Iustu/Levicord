import { useCallback } from 'react';
import { useSocketConnection } from './useSocketConnection';
import { useSocketListeners } from './useSocketListeners';

interface AttachmentPayload {
  url: string;
  type: 'image' | 'video' | 'file';
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export function useSocket() {
  const { socket, socketRef } = useSocketConnection();
  useSocketListeners(socket);

  const joinChannel = useCallback((channelId: string) => {
    socketRef.current?.emit('join_channel', channelId);
  }, [socketRef]);

  const sendMessage = useCallback((channelId: string, content: string | null, attachments?: AttachmentPayload[]) => {
    socketRef.current?.emit('send_message', { channelId, content, attachments });
  }, [socketRef]);

  const sendDm = useCallback((receiverId: string, content: string | null, attachments?: AttachmentPayload[]) => {
    socketRef.current?.emit('send_dm', { receiverId, content, attachments });
  }, [socketRef]);

  const sendTypingStart = useCallback((channelId: string) => {
    socketRef.current?.emit('typing_start', channelId);
  }, [socketRef]);

  const sendTypingStop = useCallback((channelId: string) => {
    socketRef.current?.emit('typing_stop', channelId);
  }, [socketRef]);

  return { socket, joinChannel, sendMessage, sendDm, sendTypingStart, sendTypingStop };
}
