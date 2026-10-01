import { describe, it, expect, vi } from 'vitest';
import { createDirectMessage, getDirectMessages } from './dm.service';
import { isEncrypted, encrypt } from '../lib/crypto';
import type { PrismaClient } from '@prisma/client';

describe('Direct Message Service with Encryption', () => {
  describe('createDirectMessage', () => {
    it('should sanitize HTML, encrypt content at rest in DB, and return decrypted content to caller', async () => {
      let savedInDb: any = null;
      const mockPrisma = {
        directMessage: {
          create: vi.fn().mockImplementation(({ data }) => {
            savedInDb = data;
            return Promise.resolve({
              id: 'dm-1',
              ...data,
              sender: { id: 'alice', displayName: 'Alice', avatarUrl: null },
              attachments: [],
            });
          }),
        },
      } as unknown as PrismaClient;

      const rawContent = 'Segredo pessoal <script>alert(1)</script>';
      const result = await createDirectMessage(rawContent, 'alice', 'bob', undefined, mockPrisma);

      // Verify what was stored in the database:
      expect(savedInDb).not.toBeNull();
      expect(isEncrypted(savedInDb.content)).toBe(true);
      expect(savedInDb.content).not.toContain('Segredo pessoal');
      expect(savedInDb.content).not.toContain('<script>');

      // Verify what is returned for immediate UI/socket emission:
      expect(result.content).toBe('Segredo pessoal ');
      expect(result.senderId).toBe('alice');
      expect(result.receiverId).toBe('bob');
    });
  });

  describe('getDirectMessages', () => {
    it('should decrypt messages fetched from database', async () => {
      const encrypted1 = encrypt('Primeira mensagem confidencial');
      const encrypted2 = encrypt('Segunda mensagem confidencial');

      const mockPrisma = {
        directMessage: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'dm-1', content: encrypted1, senderId: 'alice', receiverId: 'bob', createdAt: new Date() },
            { id: 'dm-2', content: encrypted2, senderId: 'bob', receiverId: 'alice', createdAt: new Date() },
          ]),
        },
      } as unknown as PrismaClient;

      const messages = await getDirectMessages('alice', 'bob', 50, undefined, mockPrisma);

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Primeira mensagem confidencial');
      expect(messages[1].content).toBe('Segunda mensagem confidencial');
    });

    it('should handle legacy unencrypted messages gracefully without errors', async () => {
      const mockPrisma = {
        directMessage: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'dm-legacy', content: 'Mensagem antiga sem criptografia', senderId: 'alice', receiverId: 'bob', createdAt: new Date() },
          ]),
        },
      } as unknown as PrismaClient;

      const messages = await getDirectMessages('alice', 'bob', 50, undefined, mockPrisma);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Mensagem antiga sem criptografia');
    });
  });
});
