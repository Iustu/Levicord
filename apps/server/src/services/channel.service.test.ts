import { describe, it, expect, vi } from 'vitest';
import { canAccessChannel, getChannels, createMessage } from './channel.service';
import type { PrismaClient } from '@prisma/client';

describe('Channel Service', () => {
  describe('canAccessChannel', () => {
    it('should always allow ADMIN users regardless of channel privacy', async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn() },
      } as unknown as PrismaClient;

      const allowed = await canAccessChannel('private-ch', 'admin-id', true, mockPrisma);
      expect(allowed).toBe(true);
      expect(mockPrisma.channel.findUnique).not.toHaveBeenCalled();
    });

    it('should allow regular users to access public channels', async () => {
      const mockPrisma = {
        channel: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'public-ch',
            isPrivate: false,
            members: [],
          }),
        },
      } as unknown as PrismaClient;

      const allowed = await canAccessChannel('public-ch', 'user-1', false, mockPrisma);
      expect(allowed).toBe(true);
    });

    it('should allow member users to access private channels', async () => {
      const mockPrisma = {
        channel: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'private-ch',
            isPrivate: true,
            members: [{ id: 'm-1', userId: 'user-1', channelId: 'private-ch' }],
          }),
        },
      } as unknown as PrismaClient;

      const allowed = await canAccessChannel('private-ch', 'user-1', false, mockPrisma);
      expect(allowed).toBe(true);
    });

    it('should reject non-members from private channels', async () => {
      const mockPrisma = {
        channel: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'private-ch',
            isPrivate: true,
            members: [], // User is not in members list
          }),
        },
      } as unknown as PrismaClient;

      const allowed = await canAccessChannel('private-ch', 'intruder-id', false, mockPrisma);
      expect(allowed).toBe(false);
    });

    it('should return false if channel does not exist', async () => {
      const mockPrisma = {
        channel: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const allowed = await canAccessChannel('ghost-ch', 'user-1', false, mockPrisma);
      expect(allowed).toBe(false);
    });
  });

  describe('createMessage', () => {
    it('should sanitize dangerous HTML tags from message content before persisting', async () => {
      let savedData: any = null;
      const mockPrisma = {
        message: {
          create: vi.fn().mockImplementation(({ data }) => {
            savedData = data;
            return Promise.resolve({ id: 'msg-1', ...data, author: {}, attachments: [] });
          }),
        },
      } as unknown as PrismaClient;

      const rawContent = 'Olá! <script>alert("xss")</script><img src=x onerror=alert(1)><b>Negrito seguro</b>';
      await createMessage(rawContent, 'user-1', 'ch-1', undefined, mockPrisma);

      expect(mockPrisma.message.create).toHaveBeenCalled();
      expect(savedData.content).not.toContain('<script>');
      expect(savedData.content).not.toContain('onerror');
      expect(savedData.content).toContain('Negrito seguro');
      expect(savedData.channelId).toBe('ch-1');
      expect(savedData.authorId).toBe('user-1');
    });

    it('should handle null content with attachments', async () => {
      let savedData: any = null;
      const mockPrisma = {
        message: {
          create: vi.fn().mockImplementation(({ data }) => {
            savedData = data;
            return Promise.resolve({ id: 'msg-2', ...data, author: {}, attachments: [] });
          }),
        },
      } as unknown as PrismaClient;

      const attachments = [{
        url: 'https://levicord.uk/uploads/test.png',
        type: 'image' as const,
        fileName: 'test.png',
        fileSize: 1024,
        mimeType: 'image/png',
      }];

      await createMessage(null, 'user-1', 'ch-1', attachments, mockPrisma);

      expect(savedData.content).toBeNull();
      expect(savedData.attachments.create).toEqual(attachments);
    });
  });

  describe('getChannels', () => {
    it('should filter private channels for non-admin users', async () => {
      const mockPrisma = {
        channel: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaClient;

      await getChannels('user-1', false, 100, 0, mockPrisma);

      expect(mockPrisma.channel.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { isPrivate: false },
            { members: { some: { userId: 'user-1' } } },
          ],
        },
        orderBy: { order: 'asc' },
        take: 100,
        skip: 0,
      });
    });

    it('should query all channels without privacy filter for ADMIN users', async () => {
      const mockPrisma = {
        channel: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaClient;

      await getChannels('admin-id', true, 100, 0, mockPrisma);

      expect(mockPrisma.channel.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { order: 'asc' },
        take: 100,
        skip: 0,
      });
    });
  });
});
