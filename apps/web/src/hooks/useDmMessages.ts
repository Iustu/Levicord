import { useEffect, useRef, useState, useCallback } from 'react';
import type { DirectMessage } from '@discord-clone/shared';
import { apiFetch } from '../lib/api';
import { useChatStore } from '../stores/useChatStore';

interface UseDmMessagesOptions {
  token: string | null;
  dmUserId: string | null;
}

interface UseDmMessagesReturn {
  messages: DirectMessage[];
  isLoading: boolean;
  fetchError: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesListRef: React.RefObject<HTMLDivElement | null>;
  retry: () => void;
}

const EMPTY_DM_MESSAGES: DirectMessage[] = [];

/**
 * Fetches and manages DM message state for a conversation.
 *
 * Results are stored in the Zustand LRU cache (`useChatStore.dms`) so
 * switching between conversations doesn't re-fetch if already loaded.
 *
 * Extracted from MainApp to enforce SRP.
 * (ESM Cap.5 — hooks should own a single cohesive concern)
 */
export function useDmMessages({ token, dmUserId }: UseDmMessagesOptions): UseDmMessagesReturn {
  const messages = useChatStore((state) => (dmUserId ? state.dms[dmUserId] ?? EMPTY_DM_MESSAGES : EMPTY_DM_MESSAGES));
  const setDms = useChatStore((state) => state.setDms);

  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesListRef = useRef<HTMLDivElement | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !dmUserId) return;

    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    apiFetch<DirectMessage[]>(`/api/users/${dmUserId}/dms`, token)
      .then((data) => { if (!cancelled) setDms(dmUserId, data); })
      .catch(() => {
        if (!cancelled) setFetchError('Não foi possível carregar as mensagens. Verifique a sua ligação e tente novamente.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [token, dmUserId, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll on new messages ───────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  return { messages, isLoading, fetchError, messagesEndRef, messagesListRef, retry };
}
