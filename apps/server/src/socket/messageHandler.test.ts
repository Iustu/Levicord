import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerMessageHandler, type MessageHandlerDeps } from './messageHandler';
import type { Server, Socket } from 'socket.io';

describe('Message Handler (Socket.io channel messaging)', () => {
  let mockIo: Server;
  let mockSocket: Socket;
  let mockDeps: MessageHandlerDeps;
  let eventHandlers: Record<string, Function>;
  let emittedToRoom: Array<{ room: string; event: string; data: any }>;
  let emittedToSocket: Array<{ event: string; data: any }>;
  let roomsJoined: Set<string>;
  let roomsLeft: Set<string>;
  const log = { error: vi.fn() };

  const userId = 'user-msg-1';
  const validChannelId = 'c123456789012345678901234';

  beforeEach(() => {
    eventHandlers = {};
    emittedToRoom = [];
    emittedToSocket = [];
    roomsJoined = new Set();
    roomsLeft = new Set();

    mockSocket = {
      id: 'socket-msg-1',
      data: {},
      rooms: new Set(['socket-msg-1']),
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      emit: vi.fn((event: string, data: any) => {
        emittedToSocket.push({ event, data });
      }),
      join: vi.fn((room: string) => {
        roomsJoined.add(room);
        (mockSocket.rooms as Set<string>).add(room);
      }),
      leave: vi.fn((room: string) => {
        roomsLeft.add(room);
        (mockSocket.rooms as Set<string>).delete(room);
      }),
      to: vi.fn((room: string) => ({
        emit: (event: string, data: any) => {
          emittedToRoom.push({ room, event, data });
        },
      })),
    } as unknown as Socket;

    mockIo = {
      to: vi.fn((room: string) => ({
        emit: (event: string, data: any) => {
          emittedToRoom.push({ room, event, data });
        },
      })),
    } as unknown as Server;

    mockDeps = {
      createMessage: vi.fn(),
      canAccessChannel: vi.fn().mockResolvedValue(true),
      isAdmin: vi.fn().mockResolvedValue(false),
      checkRateLimit: vi.fn().mockResolvedValue(true),
    };

    registerMessageHandler(mockIo, mockSocket, userId, log, mockDeps);
  });

  describe('join_channel', () => {
    it('should reject invalid channel ID formats', async () => {
      await eventHandlers['join_channel']('invalid-id');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Invalid channel ID' });
    });

    it('should reject when user has no permission to access channel', async () => {
      (mockDeps.canAccessChannel as any).mockResolvedValue(false);
      await eventHandlers['join_channel'](validChannelId);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', { message: 'Access denied to this channel' });
      expect(roomsJoined.has(validChannelId)).toBe(false);
    });

    it('should join channel room and track channelId in socket data', async () => {
      await eventHandlers['join_channel'](validChannelId);

      expect(mockSocket.join).toHaveBeenCalledWith(validChannelId);
      expect(mockSocket.data.channelId).toBe(validChannelId);
    });

    it('should leave previous channel when switching channels', async () => {
      const prevChannel = 'c000000000000000000000001';
      mockSocket.data.channelId = prevChannel;

      await eventHandlers['join_channel'](validChannelId);

      expect(mockSocket.leave).toHaveBeenCalledWith(prevChannel);
      expect(mockSocket.join).toHaveBeenCalledWith(validChannelId);
    });
  });

  describe('typing events', () => {
    it('should broadcast user_typing to channel', () => {
      eventHandlers['typing_start'](validChannelId);
      expect(emittedToRoom).toContainEqual({
        room: validChannelId,
        event: 'user_typing',
        data: { userId, channelId: validChannelId },
      });
    });

    it('should broadcast user_stopped_typing to channel', () => {
      eventHandlers['typing_stop'](validChannelId);
      expect(emittedToRoom).toContainEqual({
        room: validChannelId,
        event: 'user_stopped_typing',
        data: { userId, channelId: validChannelId },
      });
    });
  });

  describe('send_message', () => {
    it('should reject empty message without attachments', async () => {
      await eventHandlers['send_message']({
        channelId: validChannelId,
        content: '   ',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Message must have content or attachments',
      });
    });

    it('should reject message if socket has not joined channel yet', async () => {
      await eventHandlers['send_message']({
        channelId: validChannelId,
        content: 'Olá mundo',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Join the channel before sending messages',
      });
    });

    it('should reject message when rate limit is exceeded', async () => {
      (mockSocket.rooms as Set<string>).add(validChannelId);
      (mockDeps.checkRateLimit as any).mockResolvedValue(false);

      await eventHandlers['send_message']({
        channelId: validChannelId,
        content: 'Spam message',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Message rate limit exceeded',
      });
      expect(mockDeps.createMessage).not.toHaveBeenCalled();
    });

    it('should successfully create message and broadcast to channel', async () => {
      (mockSocket.rooms as Set<string>).add(validChannelId);
      const createdMessage = {
        id: 'msg-1',
        content: 'Mensagem válida',
        channelId: validChannelId,
        userId,
      };
      (mockDeps.createMessage as any).mockResolvedValue(createdMessage);

      await eventHandlers['send_message']({
        channelId: validChannelId,
        content: 'Mensagem válida',
      });

      expect(mockDeps.createMessage).toHaveBeenCalledWith(
        'Mensagem válida',
        userId,
        validChannelId,
        undefined,
      );
      expect(emittedToRoom).toContainEqual({
        room: validChannelId,
        event: 'new_message',
        data: createdMessage,
      });
    });
  });
});
