import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSession } from './useSession';
import { useChatStore } from '../stores/useChatStore';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/app' }),
}));

describe('useSession Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets unauthenticated state when /api/auth/session returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
    } as any);

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.token).toBeNull();
  });

  it('synchronizes user and sets token when session is authenticated', async () => {
    const mockUser = {
      id: 'usr-1',
      email: 'user@test.com',
      displayName: 'Alice',
      avatarUrl: null,
      role: 'USER' as const,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        authenticated: true,
        user: mockUser,
      }),
    } as any);

    const { result } = renderHook(() => useSession());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.token).toBe('authenticated');
    expect(useChatStore.getState().currentUser?.id).toBe('usr-1');
    expect(useChatStore.getState().currentUser?.displayName).toBe('Alice');
  });
});
