import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSocketListeners } from './useSocketListeners';

describe('useSocketListeners', () => {
  function makeMockSocket() {
    const listeners: Record<string, Function> = {};
    return {
      on: vi.fn((event: string, cb: Function) => {
        listeners[event] = cb;
      }),
      off: vi.fn((event: string) => {
        delete listeners[event];
      }),
      _trigger: (event: string, data: any) => listeners[event]?.(data),
    };
  }

  it('subscribes to new_message and new_dm events on mount', () => {
    const socket = makeMockSocket();
    renderHook(() => useSocketListeners(socket as any));

    expect(socket.on).toHaveBeenCalledWith('new_message', expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith('new_dm', expect.any(Function));
  });

  it('unsubscribes from events on unmount', () => {
    const socket = makeMockSocket();
    const { unmount } = renderHook(() => useSocketListeners(socket as any));

    unmount();
    expect(socket.off).toHaveBeenCalledWith('new_message', expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith('new_dm', expect.any(Function));
  });

  it('dispatches new_message to the injected addMessage handler', () => {
    const socket = makeMockSocket();
    const addMessage = vi.fn();

    renderHook(() =>
      useSocketListeners(socket as any, { addMessage }),
    );

    const mockMessage = { id: 'm-1', content: 'hello', channelId: 'c-1' };
    socket._trigger('new_message', mockMessage);

    expect(addMessage).toHaveBeenCalledWith(mockMessage);
  });

  it('computes other party ID and dispatches new_dm to the injected addDm handler', () => {
    const socket = makeMockSocket();
    const addDm = vi.fn();
    const getCurrentUserId = vi.fn().mockReturnValue('my-user-id');

    renderHook(() =>
      useSocketListeners(socket as any, { addDm, getCurrentUserId }),
    );

    // DM received from other user
    socket._trigger('new_dm', {
      id: 'dm-1',
      senderId: 'other-user',
      receiverId: 'my-user-id',
      content: 'hi',
    });

    expect(addDm).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dm-1' }),
      'other-user',
    );
  });
});
