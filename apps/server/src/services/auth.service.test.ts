import { describe, it, expect, vi } from 'vitest';
import { isAdmin, isSuperAdmin, processGoogleUser, updateUserProfile } from './auth.service';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

describe('Auth Service', () => {
  describe('isAdmin', () => {
    it('should return true when admin status is cached in Redis', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue('1'),
        set: vi.fn(),
      } as unknown as Redis;

      const mockPrisma = {
        user: { findUnique: vi.fn() },
      } as unknown as PrismaClient;

      const result = await isAdmin('user-1', mockPrisma, mockRedis);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith('admin:user-1');
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('should query Prisma and cache the result in Redis when cache misses', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
      } as unknown as Redis;

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN' }),
        },
      } as unknown as PrismaClient;

      const result = await isAdmin('admin-user', mockPrisma, mockRedis);

      expect(result).toBe(true);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-user' },
        select: { role: true, email: true },
      });
      expect(mockRedis.set).toHaveBeenCalledWith('admin:admin-user', '1', 'EX', 10);
    });

    it('should return false for regular USER role and cache "0"', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
      } as unknown as Redis;

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ role: 'USER' }),
        },
      } as unknown as PrismaClient;

      const result = await isAdmin('regular-user', mockPrisma, mockRedis);

      expect(result).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith('admin:regular-user', '0', 'EX', 10);
    });

    it('should return true for SUPERADMIN role and root email in isAdmin', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
      } as unknown as Redis;

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ role: 'SUPERADMIN', email: 'any@test.com' }),
        },
      } as unknown as PrismaClient;

      const result = await isAdmin('super-user', mockPrisma, mockRedis);
      expect(result).toBe(true);
    });
  });

  describe('isSuperAdmin', () => {
    it('should return true if cached in redis', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue('1'),
        set: vi.fn(),
      } as unknown as Redis;
      const mockPrisma = { user: { findUnique: vi.fn() } } as unknown as PrismaClient;

      const result = await isSuperAdmin('super-1', mockPrisma, mockRedis);
      expect(result).toBe(true);
    });

    it('should return true for root email even if role is not SUPERADMIN', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      } as unknown as Redis;
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ role: 'USER', email: 'joaoprf2001@gmail.com' }),
        },
      } as unknown as PrismaClient;

      const result = await isSuperAdmin('root-1', mockPrisma, mockRedis);
      expect(result).toBe(true);
    });
  });

  describe('processGoogleUser', () => {
    it('should create a new user with avatarUrl as null (incógnita)', async () => {
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-id', ...data })),
        },
      } as unknown as PrismaClient;

      const googleInfo = {
        id: 'google-123',
        email: 'novo@teste.com',
        name: 'Novo Usuário',
        picture: 'https://google.com/pic.jpg',
      };

      const user = await processGoogleUser(googleInfo, mockPrisma);

      expect(user.googleId).toBe('google-123');
      expect(user.email).toBe('novo@teste.com');
      expect(user.displayName).toBe('Novo Usuário');
      expect(user.avatarUrl).toBeNull(); // Must remain null until user sets custom avatar
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should update existing user without overwriting saved custom profile', async () => {
      const existing = {
        id: 'existing-id',
        googleId: 'google-existing',
        displayName: 'Meu Nome Personalizado',
        avatarUrl: 'https://levicord.uk/uploads/custom-avatar.png',
        role: 'USER',
      };

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue(existing),
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
        },
      } as unknown as PrismaClient;

      const googleInfo = {
        id: 'google-existing',
        email: 'atualizado@teste.com',
        name: 'Nome do Google que NÃO deve sobrescrever',
        picture: 'https://google.com/outra.jpg',
      };

      const updated = await processGoogleUser(googleInfo, mockPrisma);

      expect(updated.email).toBe('atualizado@teste.com');
      expect(updated.displayName).toBe('Meu Nome Personalizado');
      expect(updated.avatarUrl).toBe('https://levicord.uk/uploads/custom-avatar.png');
    });

    it('should assign SUPERADMIN role when root email signs in for first time', async () => {
      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'root-id', ...data })),
        },
      } as unknown as PrismaClient;

      const rootGoogleInfo = {
        id: 'google-root',
        email: 'joaoprf2001@gmail.com',
        name: 'João Root',
        picture: 'https://google.com/pic.jpg',
      };

      const user = await processGoogleUser(rootGoogleInfo, mockPrisma);
      expect(user.role).toBe('SUPERADMIN');
    });

    it('should upgrade existing user to SUPERADMIN if email matches root email', async () => {
      const existing = {
        id: 'existing-root-id',
        googleId: 'google-root',
        displayName: 'João',
        avatarUrl: null,
        role: 'USER',
      };

      const mockPrisma = {
        user: {
          findUnique: vi.fn().mockResolvedValue(existing),
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
        },
      } as unknown as PrismaClient;

      const rootGoogleInfo = {
        id: 'google-root',
        email: 'joaoprf2001@gmail.com',
        name: 'João Root',
        picture: '',
      };

      const updated = await processGoogleUser(rootGoogleInfo, mockPrisma);
      expect(updated.role).toBe('SUPERADMIN');
    });

    it('should throw an error if google info lacks an email', async () => {
      const mockPrisma = {} as unknown as PrismaClient;
      const invalidGoogleInfo = {
        id: 'google-no-email',
        email: '',
        name: 'No Email',
        picture: '',
      };

      await expect(processGoogleUser(invalidGoogleInfo, mockPrisma)).rejects.toThrow(
        'Failed to get user email from Google'
      );
    });
  });

  describe('updateUserProfile', () => {
    it('should update displayName and avatarUrl', async () => {
      const mockPrisma = {
        user: {
          update: vi.fn().mockResolvedValue({
            id: 'u-1',
            displayName: 'Novo Nome',
            avatarUrl: 'https://example.com/avatar.png',
          }),
        },
      } as unknown as PrismaClient;

      const updated = await updateUserProfile('u-1', {
        displayName: 'Novo Nome',
        avatarUrl: 'https://example.com/avatar.png',
      }, mockPrisma);

      expect(updated.displayName).toBe('Novo Nome');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { displayName: 'Novo Nome', avatarUrl: 'https://example.com/avatar.png' },
        select: { id: true, email: true, displayName: true, avatarUrl: true, role: true },
      });
    });
  });
});
