import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypingIndicator } from './useTypingIndicator';

describe('useTypingIndicator Hook', () => {
  let mockSocket: any;
  let listeners: Record<string, Function>;

  const users = [
    { id: 'u1', email: 'u1@test.com', displayName: 'Lucas', avatarUrl: null, role: 'USER' as const },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = {};
    mockSocket = {
      on: vi.fn((event, cb) => {
        listeners[event] = cb;
      }),
      off: vi.fn((event) => {
        delete listeners[event];
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds typing user when user_typing matches activeChannelId', () => {
    const { result } = renderHook(() =>
      useTypingIndicator({ socket: mockSocket, activeChannelId: 'chan-1', users })
    );

    expect(result.current).toEqual([]);

    act(() => {
      listeners['user_typing']?.({ userId: 'u1', channelId: 'chan-1' });
    });

    expect(result.current).toEqual(['Lucas']);
  });

  it('removes user when user_stopped_typing is emitted', () => {
    const { result } = renderHook(() =>
      useTypingIndicator({ socket: mockSocket, activeChannelId: 'chan-1', users })
    );

    act(() => {
      listeners['user_typing']?.({ userId: 'u1', channelId: 'chan-1' });
    });
    expect(result.current).toEqual(['Lucas']);

    act(() => {
      listeners['user_stopped_typing']?.({ userId: 'u1' });
    });
    expect(result.current).toEqual([]);
  });

  it('auto-expires typing indicator after 3 seconds timeout', () => {
    const { result } = renderHook(() =>
      useTypingIndicator({ socket: mockSocket, activeChannelId: 'chan-1', users })
    );

    act(() => {
      listeners['user_typing']?.({ userId: 'u1', channelId: 'chan-1' });
    });
    expect(result.current).toEqual(['Lucas']);

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(result.current).toEqual([]);
  });
});
