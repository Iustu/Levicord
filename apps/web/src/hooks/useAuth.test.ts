import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';
import * as useSessionModule from './useSession';
import * as reactRouterDom from 'react-router-dom';

vi.mock('./useSession', () => ({
  useSession: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

describe('useAuth', () => {
  const mockNavigate = vi.fn();
  const mockSetToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reactRouterDom.useNavigate).mockReturnValue(mockNavigate);
    vi.mocked(useSessionModule.useSession).mockReturnValue({
      token: 'test-token',
      isLoading: false,
      setToken: mockSetToken,
    });
  });

  it('redirects window.location to Google OAuth URL on loginWithGoogle', () => {
    // Delete and mock window.location
    const originalLocation = window.location;
    // @ts-ignore
    delete window.location;
    window.location = { href: '' } as any;

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.loginWithGoogle();
    });

    expect(window.location.href).toContain('/api/auth/google');

    window.location = originalLocation;
  });

  it('performs logout successfully, resets token and navigates to /', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as any);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });

    mockFetch.mockRestore();
  });

  it('handles logout failure gracefully and dispatches toast_error event without clearing token', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as any);

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'toast_error',
      })
    );

    mockFetch.mockRestore();
    dispatchEventSpy.mockRestore();
  });
});
