import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSocket } from './useSocket';
import * as connModule from './useSocketConnection';
import * as listenersModule from './useSocketListeners';

vi.mock('./useSocketConnection', () => ({
  useSocketConnection: vi.fn(),
}));

vi.mock('./useSocketListeners', () => ({
  useSocketListeners: vi.fn(),
}));

describe('useSocket Hook', () => {
  it('delegates action calls to socketRef.current.emit', () => {
    const mockEmit = vi.fn();
    const mockSocket = { emit: mockEmit } as any;
    const socketRef = { current: mockSocket };

    vi.mocked(connModule.useSocketConnection).mockReturnValue({
      socket: mockSocket,
      socketRef,
    });

    const { result } = renderHook(() => useSocket());

    expect(listenersModule.useSocketListeners).toHaveBeenCalledWith(mockSocket);

    act(() => {
      result.current.joinChannel('chan-1');
    });
    expect(mockEmit).toHaveBeenCalledWith('join_channel', 'chan-1');

    act(() => {
      result.current.sendMessage('chan-1', 'Olá');
    });
    expect(mockEmit).toHaveBeenCalledWith('send_message', {
      channelId: 'chan-1',
      content: 'Olá',
      attachments: undefined,
    });

    act(() => {
      result.current.sendDm('u-2', 'Mensagem direta');
    });
    expect(mockEmit).toHaveBeenCalledWith('send_dm', {
      receiverId: 'u-2',
      content: 'Mensagem direta',
      attachments: undefined,
    });

    act(() => {
      result.current.sendTypingStart('chan-1');
      result.current.sendTypingStop('chan-1');
    });
    expect(mockEmit).toHaveBeenCalledWith('typing_start', 'chan-1');
    expect(mockEmit).toHaveBeenCalledWith('typing_stop', 'chan-1');
  });
});
