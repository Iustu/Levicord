import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDmCall } from './useDmCall';
import { useChatStore } from '../stores/useChatStore';

describe('useDmCall', () => {
  function makeMockSocket() {
    const listeners: Record<string, Function> = {};
    return {
      on: vi.fn((event: string, cb: Function) => {
        listeners[event] = cb;
      }),
      off: vi.fn((event: string) => {
        delete listeners[event];
      }),
      emit: vi.fn(),
      _trigger: (event: string, data: any) => listeners[event]?.(data),
    };
  }

  beforeEach(() => {
    useChatStore.setState({
      currentUserId: 'me-123',
      activeDmCall: null,
      incomingCall: null,
    });
  });

  it('initiates a call and emits dm_call_start', () => {
    const socket = makeMockSocket();
    const { result } = renderHook(() => useDmCall(socket as any));

    act(() => {
      result.current.startCall({ id: 'target-456', displayName: 'Maria' }, false);
    });

    expect(socket.emit).toHaveBeenCalledWith('dm_call_start', {
      targetUserId: 'target-456',
      isVideo: false,
    });
    expect(useChatStore.getState().activeDmCall).toEqual(
      expect.objectContaining({
        targetUser: { id: 'target-456', displayName: 'Maria' },
        status: 'calling',
        isVideo: false,
      })
    );
  });

  it('handles incoming call event and sets incomingCall state', () => {
    const socket = makeMockSocket();
    renderHook(() => useDmCall(socket as any));

    act(() => {
      socket._trigger('dm_call_incoming', {
        caller: { id: 'caller-789', displayName: 'Carlos' },
        roomId: 'dm_caller-789_me-123',
        isVideo: true,
      });
    });

    expect(useChatStore.getState().incomingCall).toEqual({
      caller: { id: 'caller-789', displayName: 'Carlos' },
      roomId: 'dm_caller-789_me-123',
      isVideo: true,
    });
  });

  it('accepts incoming call and emits dm_call_accept', () => {
    const socket = makeMockSocket();
    useChatStore.setState({
      incomingCall: {
        caller: { id: 'caller-789', displayName: 'Carlos' },
        roomId: 'dm_caller-789_me-123',
        isVideo: true,
      },
    });

    const { result } = renderHook(() => useDmCall(socket as any));

    act(() => {
      result.current.acceptCall();
    });

    expect(socket.emit).toHaveBeenCalledWith('dm_call_accept', {
      callerId: 'caller-789',
      roomId: 'dm_caller-789_me-123',
    });
    expect(useChatStore.getState().incomingCall).toBeNull();
    expect(useChatStore.getState().activeDmCall).toEqual(
      expect.objectContaining({
        roomId: 'dm_caller-789_me-123',
        status: 'connected',
        isVideo: true,
      })
    );
  });

  it('ends an active call and emits dm_call_end and leave_voice', () => {
    const socket = makeMockSocket();
    useChatStore.setState({
      activeDmCall: {
        roomId: 'dm_target-456_me-123',
        targetUser: { id: 'target-456', displayName: 'Maria' },
        status: 'connected',
      },
    });

    const { result } = renderHook(() => useDmCall(socket as any));

    act(() => {
      result.current.endCall();
    });

    expect(socket.emit).toHaveBeenCalledWith('dm_call_end', {
      targetUserId: 'target-456',
      roomId: 'dm_target-456_me-123',
    });
    expect(socket.emit).toHaveBeenCalledWith('leave_voice', 'dm_target-456_me-123');
    expect(useChatStore.getState().activeDmCall).toBeNull();
  });
});
