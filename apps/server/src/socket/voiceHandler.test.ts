import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerVoiceHandler, type VoiceHandlerDeps } from './voiceHandler';
import type { Server, Socket } from 'socket.io';
import type { PrismaClient } from '@prisma/client';

describe('Voice Handler (WebRTC signaling & access control)', () => {
  let mockIo: Server;
  let mockSocket: Socket;
  let mockPrisma: PrismaClient;
  let mockCanAccessChannel: any;
  let mockIsAdmin: any;
  let eventHandlers: Record<string, Function>;
  let emittedToRoom: Array<{ room: string; event: string; data: any }>;
  let emittedToSocket: Array<{ event: string; data: any }>;
  let roomsJoined: Set<string>;
  let roomsLeft: Set<string>;

  const userId = 'user-voice-1';
  const validVoiceChannelId = 'c123456789012345678901234';

  beforeEach(() => {
    eventHandlers = {};
    emittedToRoom = [];
    emittedToSocket = [];
    roomsJoined = new Set();
    roomsLeft = new Set();

    mockSocket = {
      id: 'socket-voice-1',
      data: {},
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      emit: vi.fn((event: string, data: any) => {
        emittedToSocket.push({ event, data });
      }),
      join: vi.fn((room: string) => {
        roomsJoined.add(room);
      }),
      leave: vi.fn((room: string) => {
        roomsLeft.add(room);
      }),
      to: vi.fn((room: string) => ({
        emit: (event: string, data: any) => {
          emittedToRoom.push({ room, event, data });
        },
      })),
    } as unknown as Socket;

    mockIo = {
      sockets: {
        adapter: {
          rooms: new Map([
            [`voice_${validVoiceChannelId}`, new Set(['socket-voice-1', 'socket-voice-2'])],
          ]),
        },
      },
    } as unknown as Server;

    mockPrisma = {
      channel: {
        findUnique: vi.fn(),
      },
    } as unknown as PrismaClient;

    mockCanAccessChannel = vi.fn();
    mockIsAdmin = vi.fn().mockResolvedValue(false);

    const deps: VoiceHandlerDeps = {
      prisma: mockPrisma,
      canAccessChannel: mockCanAccessChannel,
      isAdmin: mockIsAdmin,
    };

    registerVoiceHandler(mockIo, mockSocket, userId, undefined, deps);
  });

  describe('join_voice', () => {
    it('should reject invalid channel ID formats', async () => {
      await eventHandlers['join_voice']('invalid-cuid');
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid voice channel ID',
      });
      expect(roomsJoined.size).toBe(0);
    });

    it('should reject if channel is not found', async () => {
      (mockPrisma.channel.findUnique as any).mockResolvedValue(null);

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Channel not found or is not a voice channel',
      });
      expect(roomsJoined.size).toBe(0);
    });

    it('should reject if channel is a TEXT channel', async () => {
      (mockPrisma.channel.findUnique as any).mockResolvedValue({
        id: validVoiceChannelId,
        type: 'TEXT',
        isPrivate: false,
      });

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Channel not found or is not a voice channel',
      });
      expect(roomsJoined.size).toBe(0);
    });

    it('should reject if user does not have permission to access channel', async () => {
      (mockPrisma.channel.findUnique as any).mockResolvedValue({
        id: validVoiceChannelId,
        type: 'VOICE',
        isPrivate: true,
      });
      mockCanAccessChannel.mockResolvedValue(false);

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Access denied to this voice channel',
      });
      expect(roomsJoined.size).toBe(0);
    });

    it('should join voice room and broadcast user_joined_voice on success', async () => {
      (mockPrisma.channel.findUnique as any).mockResolvedValue({
        id: validVoiceChannelId,
        type: 'VOICE',
        isPrivate: false,
      });
      mockCanAccessChannel.mockResolvedValue(true);

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.join).toHaveBeenCalledWith(`voice_${validVoiceChannelId}`);
      expect(mockSocket.data.voiceChannelId).toBe(validVoiceChannelId);
      expect(emittedToRoom).toContainEqual({
        room: `voice_${validVoiceChannelId}`,
        event: 'user_joined_voice',
        data: { userId, socketId: 'socket-voice-1' },
      });
    });

    it('should leave previous voice room when switching channels', async () => {
      const prevChannelId = 'c000000000000000000000001';
      mockSocket.data.voiceChannelId = prevChannelId;

      (mockPrisma.channel.findUnique as any).mockResolvedValue({
        id: validVoiceChannelId,
        type: 'VOICE',
        isPrivate: false,
      });
      mockCanAccessChannel.mockResolvedValue(true);

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.leave).toHaveBeenCalledWith(`voice_${prevChannelId}`);
      expect(emittedToRoom).toContainEqual({
        room: `voice_${prevChannelId}`,
        event: 'user_left_voice',
        data: { userId, socketId: 'socket-voice-1' },
      });
      expect(mockSocket.join).toHaveBeenCalledWith(`voice_${validVoiceChannelId}`);
    });
  });

  describe('leave_voice', () => {
    it('should leave room and broadcast user_left_voice', () => {
      mockSocket.data.voiceChannelId = validVoiceChannelId;

      eventHandlers['leave_voice'](validVoiceChannelId);

      expect(mockSocket.leave).toHaveBeenCalledWith(`voice_${validVoiceChannelId}`);
      expect(mockSocket.data.voiceChannelId).toBeUndefined();
      expect(emittedToRoom).toContainEqual({
        room: `voice_${validVoiceChannelId}`,
        event: 'user_left_voice',
        data: { userId, socketId: 'socket-voice-1' },
      });
    });
  });

  describe('disconnect cleanup', () => {
    it('should automatically broadcast user_left_voice and leave room if active in voice', () => {
      mockSocket.data.voiceChannelId = validVoiceChannelId;

      eventHandlers['disconnect']();

      expect(mockSocket.leave).toHaveBeenCalledWith(`voice_${validVoiceChannelId}`);
      expect(mockSocket.data.voiceChannelId).toBeUndefined();
      expect(emittedToRoom).toContainEqual({
        room: `voice_${validVoiceChannelId}`,
        event: 'user_left_voice',
        data: { userId, socketId: 'socket-voice-1' },
      });
    });

    it('should do nothing on disconnect if not connected to voice', () => {
      mockSocket.data.voiceChannelId = undefined;

      eventHandlers['disconnect']();

      expect(mockSocket.leave).not.toHaveBeenCalled();
      expect(emittedToRoom.length).toBe(0);
    });
  });
});
