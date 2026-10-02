import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDmMessages } from './useDmMessages';
import { useChatStore } from '../stores/useChatStore';
import * as apiModule from '../lib/api';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE: 'http://localhost:3000',
}));

describe('useDmMessages Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ dms: {}, dmsOrder: [] });
  });

  it('fetches direct messages and stores them in useChatStore', async () => {
    const mockDms = [
      { id: 'dm-1', content: 'Oi amigo', senderId: 'u-target', receiverId: 'u-me', createdAt: '2026-10-02T10:00:00Z' },
    ];
    vi.mocked(apiModule.apiFetch).mockResolvedValueOnce(mockDms);

    renderHook(() => useDmMessages({ token: 'test-token', dmUserId: 'u-target' }));

    await waitFor(() => {
      expect(apiModule.apiFetch).toHaveBeenCalledWith('/api/users/u-target/dms', 'test-token');
      expect(useChatStore.getState().dms['u-target']).toEqual(mockDms);
    });
  });

  it('sets fetchError when API fetch fails', async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useDmMessages({ token: 'test-token', dmUserId: 'u-target' })
    );

    await waitFor(() => {
      expect(result.current.fetchError).toBe(
        'Não foi possível carregar as mensagens. Verifique a sua ligação e tente novamente.'
      );
    });
  });
});
