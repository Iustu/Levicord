import { prisma } from '../prisma';

export async function getUsers(excludeUserId?: string) {
  return prisma.user.findMany({
    where: excludeUserId ? {
      id: { not: excludeUserId }
    } : undefined,
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
    orderBy: { displayName: 'asc' },
  });
}
