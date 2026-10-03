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
  let mockIsSuperAdmin: any;
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
      to: vi.fn((room: string) => ({
        emit: (event: string, data: any) => {
          emittedToRoom.push({ room, event, data });
        },
      })),
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
      serverMember: {
        findUnique: vi.fn(),
      },
      server: {
        findUnique: vi.fn(),
      },
    } as unknown as PrismaClient;

    mockCanAccessChannel = vi.fn();
    mockIsAdmin = vi.fn().mockResolvedValue(false);
    mockIsSuperAdmin = vi.fn().mockResolvedValue(false);

    const deps: VoiceHandlerDeps = {
      prisma: mockPrisma,
      canAccessChannel: mockCanAccessChannel,
      isAdmin: mockIsAdmin,
      isSuperAdmin: mockIsSuperAdmin,
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

    it('should reject if user is not a member of the server when joining a server voice channel', async () => {
      mockIsSuperAdmin.mockResolvedValue(true);
      (mockPrisma.channel.findUnique as any).mockResolvedValue({
        id: validVoiceChannelId,
        type: 'VOICE',
        isPrivate: false,
        serverId: 'srv-1',
      });
      (mockPrisma.serverMember.findUnique as any).mockResolvedValue(null);
      (mockPrisma.server.findUnique as any).mockResolvedValue({ ownerId: 'other-user' });

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Você precisa ser membro deste servidor para entrar em canais de voz.',
      });
      expect(roomsJoined.size).toBe(0);
    });

    it('should allow SuperAdmin to join server voice channel if they are a server member', async () => {
      mockIsSuperAdmin.mockResolvedValue(true);
      mockIsAdmin.mockResolvedValue(true);
      mockCanAccessChannel.mockResolvedValue(true);
      (mockPrisma.channel.findUnique as any).mockResolvedValue({
        id: validVoiceChannelId,
        type: 'VOICE',
        isPrivate: false,
        serverId: 'srv-1',
      });
      (mockPrisma.serverMember.findUnique as any).mockResolvedValue({
        id: 'sm-1',
        serverId: 'srv-1',
        userId,
        role: 'MEMBER',
      });

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.join).toHaveBeenCalledWith(`voice_${validVoiceChannelId}`);
      expect(mockSocket.data.voiceChannelId).toBe(validVoiceChannelId);
      expect(roomsJoined.has(`voice_${validVoiceChannelId}`)).toBe(true);
    });

    it('should allow SuperAdmin to join server voice channel if they are the server creator', async () => {
      mockIsSuperAdmin.mockResolvedValue(true);
      mockIsAdmin.mockResolvedValue(true);
      mockCanAccessChannel.mockResolvedValue(true);
      (mockPrisma.channel.findUnique as any).mockResolvedValue({
        id: validVoiceChannelId,
        type: 'VOICE',
        isPrivate: false,
        serverId: 'srv-1',
      });
      (mockPrisma.serverMember.findUnique as any).mockResolvedValue(null);
      (mockPrisma.server.findUnique as any).mockResolvedValue({ ownerId: userId });

      await eventHandlers['join_voice'](validVoiceChannelId);

      expect(mockSocket.join).toHaveBeenCalledWith(`voice_${validVoiceChannelId}`);
      expect(mockSocket.data.voiceChannelId).toBe(validVoiceChannelId);
      expect(roomsJoined.has(`voice_${validVoiceChannelId}`)).toBe(true);
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

  describe('1-on-1 DM calls', () => {
    const userA = 'user-voice-1';
    const userB = 'user-voice-2';
    const dmRoomId = `dm_${userA}_${userB}`;

    it('should allow participants of the DM to join voice', async () => {
      await eventHandlers['join_voice'](dmRoomId);

      expect(mockSocket.join).toHaveBeenCalledWith(`voice_${dmRoomId}`);
      expect(mockSocket.data.voiceChannelId).toBe(dmRoomId);
      expect(emittedToRoom).toContainEqual({
        room: `voice_${dmRoomId}`,
        event: 'user_joined_voice',
        data: { userId: userA, socketId: 'socket-voice-1' },
      });
    });

    it('should reject third-party users from joining someone else DM call', async () => {
      const intruderSocket: any = { ...mockSocket, emit: vi.fn() };
      const intruderDeps: VoiceHandlerDeps = {
        prisma: mockPrisma,
        canAccessChannel: mockCanAccessChannel,
        isAdmin: mockIsAdmin,
      };
      const intruderHandlers: Record<string, Function> = {};
      intruderSocket.on = vi.fn((event: string, handler: Function) => {
        intruderHandlers[event] = handler;
      });

      registerVoiceHandler(mockIo, intruderSocket as any, 'intruder-id', undefined, intruderDeps);

      await intruderHandlers['join_voice'](dmRoomId);

      expect(intruderSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Access denied to this DM call',
      });
    });

    it('should handle dm_call_start and relay dm_call_incoming', async () => {
      await eventHandlers['dm_call_start']({ targetUserId: userB, isVideo: true });

      expect(mockIo.to).toHaveBeenCalledWith(userB);
      expect(emittedToRoom).toContainEqual(
        expect.objectContaining({
          room: userB,
          event: 'dm_call_incoming',
          data: expect.objectContaining({
            roomId: dmRoomId,
            isVideo: true,
          }),
        })
      );
    });

    it('should relay dm_call_accept, dm_call_reject, and dm_call_end', () => {
      eventHandlers['dm_call_accept']({ callerId: userB, roomId: dmRoomId });
      expect(emittedToRoom).toContainEqual(
        expect.objectContaining({
          room: userB,
          event: 'dm_call_accepted',
          data: { fromUserId: userA, roomId: dmRoomId },
        })
      );

      eventHandlers['dm_call_reject']({ callerId: userB, roomId: dmRoomId });
      expect(emittedToRoom).toContainEqual(
        expect.objectContaining({
          room: userB,
          event: 'dm_call_rejected',
          data: { fromUserId: userA, roomId: dmRoomId },
        })
      );

      eventHandlers['dm_call_end']({ targetUserId: userB, roomId: dmRoomId });
      expect(emittedToRoom).toContainEqual(
        expect.objectContaining({
          room: userB,
          event: 'dm_call_ended',
          data: { fromUserId: userA, roomId: dmRoomId },
        })
      );
    });
  });
});
