import { prisma } from '../prisma';

export async function getUsers(excludeUserId?: string, limit = 100, cursor?: string) {
  const users = await prisma.user.findMany({
    where: excludeUserId ? { id: { not: excludeUserId } } : undefined,
    select: { id: true, displayName: true, avatarUrl: true },
    orderBy: { displayName: 'asc' },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = users.length > limit;
  const page = hasMore ? users.slice(0, limit) : users;
  return { users: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
