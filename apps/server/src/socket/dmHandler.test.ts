import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDmHandler, type DmHandlerDeps } from './dmHandler';
import type { Server, Socket } from 'socket.io';

describe('DM Handler (Socket.io direct messaging)', () => {
  let mockIo: Server;
  let mockSocket: Socket;
  let mockDeps: DmHandlerDeps;
  let eventHandlers: Record<string, Function>;
  let emittedToRoom: Array<{ room: string; event: string; data: any }>;
  let emittedToSocket: Array<{ event: string; data: any }>;
  const log = { error: vi.fn() };

  const senderId = 'user-sender-1';
  const receiverId = 'c123456789012345678901234';

  beforeEach(() => {
    eventHandlers = {};
    emittedToRoom = [];
    emittedToSocket = [];

    mockSocket = {
      id: 'socket-dm-1',
      data: {},
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      emit: vi.fn((event: string, data: any) => {
        emittedToSocket.push({ event, data });
      }),
    } as unknown as Socket;

    mockIo = {
      to: vi.fn((room: string) => ({
        emit: (event: string, data: any) => {
          emittedToRoom.push({ room, event, data });
        },
      })),
    } as unknown as Server;

    mockDeps = {
      createDirectMessage: vi.fn(),
      checkRateLimit: vi.fn().mockResolvedValue(true),
    };

    registerDmHandler(mockIo, mockSocket, senderId, log, mockDeps);
  });

  describe('send_dm', () => {
    it('should reject invalid receiver ID format', async () => {
      await eventHandlers['send_dm']({
        receiverId: 'not-a-cuid',
        content: 'Olá',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid receiver ID',
      });
    });

    it('should reject DM without content and without attachments', async () => {
      await eventHandlers['send_dm']({
        receiverId,
        content: '   ',
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Message must have content or attachments',
      });
    });

    it('should reject DM when rate limit is exceeded', async () => {
      (mockDeps.checkRateLimit as any).mockResolvedValue(false);

      await eventHandlers['send_dm']({
        receiverId,
        content: 'Oi!',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Message rate limit exceeded',
      });
      expect(mockDeps.createDirectMessage).not.toHaveBeenCalled();
    });

    it('should create DM and emit new_dm to both receiver and sender rooms', async () => {
      const createdDm = {
        id: 'dm-1',
        content: 'Conversa privada',
        senderId,
        receiverId,
      };
      (mockDeps.createDirectMessage as any).mockResolvedValue(createdDm);

      await eventHandlers['send_dm']({
        receiverId,
        content: 'Conversa privada',
      });

      expect(mockDeps.createDirectMessage).toHaveBeenCalledWith(
        'Conversa privada',
        senderId,
        receiverId,
        undefined,
      );
      expect(emittedToRoom).toContainEqual({
        room: receiverId,
        event: 'new_dm',
        data: createdDm,
      });
      expect(emittedToRoom).toContainEqual({
        room: senderId,
        event: 'new_dm',
        data: createdDm,
      });
    });

    it('should emit error when createDirectMessage fails', async () => {
      (mockDeps.createDirectMessage as any).mockRejectedValue(new Error('DB connection failed'));

      await eventHandlers['send_dm']({
        receiverId,
        content: 'Mensagem com falha',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to send direct message',
      });
    });
  });
});
