import { prisma as defaultPrisma } from '../prisma';
import { redis as defaultRedis } from '../lib/redis';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

function configuredAdminEmails() {
  return new Set((process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export async function processGoogleUser(userInfo: GoogleUserInfo, prisma: PrismaClient = defaultPrisma) {
  if (!userInfo.email) {
    throw new Error('Failed to get user email from Google');
  }

  const existingUser = await prisma.user.findUnique({
    where: { googleId: userInfo.id },
  });

  if (existingUser) {
    // Keep saved displayName and avatarUrl intact!
    // Do NOT overwrite user's chosen name or avatar with Google data.
    const user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        email: userInfo.email,
        ...(configuredAdminEmails().has(userInfo.email.toLowerCase()) ? { role: 'ADMIN' as const } : {}),
      },
    });
    return user;
  }

  // New user: do NOT fetch Google's picture! Remains as incógnita (null) until changed by user.
  const user = await prisma.user.create({
    data: {
      googleId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name || 'Usuário',
      avatarUrl: null, // Incógnita by default
      role: configuredAdminEmails().has(userInfo.email.toLowerCase()) ? 'ADMIN' : 'USER',
    },
  });

  return user;
}

const ADMIN_CACHE_TTL = 60; // seconds

export async function isAdmin(userId: string, prisma: PrismaClient = defaultPrisma, redis: Redis = defaultRedis) {
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

export async function updateUserProfile(
  userId: string,
  data: { displayName?: string; avatarUrl?: string | null },
  prisma: PrismaClient = defaultPrisma,
) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, displayName: true, avatarUrl: true, role: true },
  });
}
