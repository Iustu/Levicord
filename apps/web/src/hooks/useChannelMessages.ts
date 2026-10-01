import { useEffect, useRef, useState, useCallback } from 'react';
import type { Message } from '@discord-clone/shared';
import { apiFetch } from '../lib/api';
import { useChatStore } from '../stores/useChatStore';

interface UseChannelMessagesOptions {
  token: string | null;
  channelId: string | null;
  /** Called once when the channel first loads to join the Socket.io room. */
  onJoinChannel: (channelId: string) => void;
}

interface UseChannelMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingOlder: boolean;
  fetchError: string | null;
  nextCursor: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesListRef: React.RefObject<HTMLDivElement | null>;
  loadOlderMessages: () => Promise<void>;
  /** Set to trigger a re-fetch of the current channel messages. */
  retry: () => void;
}

/**
 * Fetches and manages channel message state (initial load + pagination).
 *
 * Synchronized with global Zustand store for real-time WebSocket updates.
 * (ESM Cap.5 — single source of truth for chat domain)
 *
 * Invariants:
 * - Auto-scrolls to the bottom on new messages unless the user has scrolled up.
 * - Preserves scroll position when prepending older messages.
 * - Aborts in-flight requests when channelId changes or the hook unmounts.
 */
export function useChannelMessages({
  token,
  channelId,
  onJoinChannel,
}: UseChannelMessagesOptions): UseChannelMessagesReturn {
  const messages = useChatStore((state) => state.messages);
  const setStoreMessages = useChatStore((state) => state.setMessages);
  const prependStoreMessages = useChatStore((state) => state.prependMessages);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const preserveScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const olderAbortControllerRef = useRef<AbortController | null>(null);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !channelId) {
      setStoreMessages([]);
      return;
    }

    let cancelled = false;
    onJoinChannel(channelId);
    setStoreMessages([]);
    setIsLoading(true);
    setFetchError(null);
    setNextCursor(null);
    shouldAutoScrollRef.current = true;

    apiFetch<{ messages: Message[]; nextCursor: string | null }>(
      `/api/channels/${channelId}/messages`,
      token,
    )
      .then((data) => {
        if (cancelled) return;
        setStoreMessages(data.messages);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setFetchError('Não foi possível carregar as mensagens. Verifique a sua ligação e tente novamente.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      olderAbortControllerRef.current?.abort();
      olderAbortControllerRef.current = null;
    };
  }, [token, channelId, retryKey, setStoreMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (preserveScrollRef.current) { preserveScrollRef.current = false; return; }
    if (shouldAutoScrollRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load older messages (pagination) ─────────────────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (!token || !channelId || !nextCursor || isLoadingOlder) return;

    const list = messagesListRef.current;
    const previousHeight = list?.scrollHeight ?? 0;
    const requested = channelId;

    const controller = new AbortController();
    olderAbortControllerRef.current?.abort();
    olderAbortControllerRef.current = controller;
    setIsLoadingOlder(true);

    try {
      const data = await apiFetch<{ messages: Message[]; nextCursor: string | null }>(
        `/api/channels/${channelId}/messages?cursor=${encodeURIComponent(nextCursor)}`,
        token,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || requested !== channelId) return;
      preserveScrollRef.current = true;
      prependStoreMessages(data.messages);
      setNextCursor(data.nextCursor);
      requestAnimationFrame(() => {
        if (list) list.scrollTop += list.scrollHeight - previousHeight;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFetchError('Não foi possível carregar mensagens anteriores.');
    } finally {
      if (olderAbortControllerRef.current === controller) {
        olderAbortControllerRef.current = null;
        setIsLoadingOlder(false);
      }
    }
  }, [token, channelId, nextCursor, isLoadingOlder]);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  return {
    messages,
    isLoading,
    isLoadingOlder,
    fetchError,
    nextCursor,
    messagesEndRef,
    messagesListRef,
    loadOlderMessages,
    retry,
  };
}
