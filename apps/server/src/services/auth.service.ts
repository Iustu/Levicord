import { prisma } from '../prisma';
import { redis } from '../lib/redis';

function configuredAdminEmails() {
  return new Set((process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export async function processGoogleUser(userInfo: GoogleUserInfo) {
  if (!userInfo.email) {
    throw new Error('Failed to get user email from Google');
  }

  const user = await prisma.user.upsert({
    where: { googleId: userInfo.id },
    update: {
      email: userInfo.email,
      displayName: userInfo.name,
      avatarUrl: userInfo.picture,
      ...(configuredAdminEmails().has(userInfo.email.toLowerCase()) ? { role: 'ADMIN' as const } : {}),
    },
    create: {
      googleId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name,
      avatarUrl: userInfo.picture,
      role: configuredAdminEmails().has(userInfo.email.toLowerCase()) ? 'ADMIN' : 'USER',
    }
  });

  return user;
}

const ADMIN_CACHE_TTL = 60; // seconds

export async function isAdmin(userId: string) {
  const cacheKey = `admin:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const result = user?.role === 'ADMIN';
  await redis.set(cacheKey, result ? '1' : '0', 'EX', ADMIN_CACHE_TTL);
  return result;
}

export async function updateUserProfile(userId: string, displayName: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { displayName },
    select: { id: true, displayName: true, avatarUrl: true },
  });
}
