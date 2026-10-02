import { describe, it, expect, vi } from 'vitest';
import { getUsers } from './user.service';

describe('UserService - getUsers', () => {
  it('returns users and nextCursor as null when results fit within limit', async () => {
    const mockUsers = [
      { id: 'u1', displayName: 'Alice', avatarUrl: null },
      { id: 'u2', displayName: 'Bob', avatarUrl: 'http://avatar.jpg' },
    ];

    const mockPrisma = {
      user: {
        findMany: vi.fn().mockResolvedValue(mockUsers),
      },
    } as any;

    const result = await getUsers('logged-user', 10, undefined, mockPrisma);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { not: 'logged-user' } },
      select: { id: true, displayName: true, avatarUrl: true },
      orderBy: { displayName: 'asc' },
      take: 11,
    });
    expect(result.users).toEqual(mockUsers);
    expect(result.nextCursor).toBeNull();
  });

  it('paginates and sets nextCursor when results exceed limit', async () => {
    const mockUsers = [
      { id: 'u1', displayName: 'Alice', avatarUrl: null },
      { id: 'u2', displayName: 'Bob', avatarUrl: null },
      { id: 'u3', displayName: 'Charlie', avatarUrl: null }, // 3 items for limit of 2
    ];

    const mockPrisma = {
      user: {
        findMany: vi.fn().mockResolvedValue(mockUsers),
      },
    } as any;

    const result = await getUsers(undefined, 2, 'cursor-123', mockPrisma);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: undefined,
      select: { id: true, displayName: true, avatarUrl: true },
      orderBy: { displayName: 'asc' },
      take: 3,
      skip: 1,
      cursor: { id: 'cursor-123' },
    });
    expect(result.users).toHaveLength(2);
    expect(result.users[1].id).toBe('u2');
    expect(result.nextCursor).toBe('u2');
  });
});
