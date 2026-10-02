import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChannelMessages } from './useChannelMessages';
import { useChatStore } from '../stores/useChatStore';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

describe('useChannelMessages Hook', () => {
  const onJoinChannel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ messages: [] });
  });

  it('fetches messages and joins channel when token and channelId are provided', async () => {
    const mockMessages = [
      { id: 'msg-1', content: 'Olá mundo', channelId: 'chan-1', senderId: 'u-1', createdAt: '2026-10-02T10:00:00Z' },
    ];
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce({
      messages: mockMessages,
      nextCursor: null,
    });

    renderHook(() =>
      useChannelMessages({
        token: 'test-token',
        channelId: 'chan-1',
        onJoinChannel,
      })
    );

    await waitFor(() => {
      expect(onJoinChannel).toHaveBeenCalledWith('chan-1');
      expect(useChatStore.getState().messages).toEqual(mockMessages);
    });
  });
});
