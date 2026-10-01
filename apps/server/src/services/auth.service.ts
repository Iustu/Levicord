import { prisma as defaultPrisma } from '../prisma';
import { redis as defaultRedis } from '../lib/redis';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

import { isRootSuperAdmin } from './permission.service';

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

  const isRoot = isRootSuperAdmin(userInfo.email);
  const isEnvAdmin = configuredAdminEmails().has(userInfo.email.toLowerCase());

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
        ...(isRoot
          ? { role: 'SUPERADMIN' as const }
          : isEnvAdmin && existingUser.role === 'USER'
          ? { role: 'ADMIN' as const }
          : {}),
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
      role: isRoot ? 'SUPERADMIN' : isEnvAdmin ? 'ADMIN' : 'USER',
    },
  });

  return user;
}

// (BSRS Cap.5 Least Privilege) Short TTL so privilege revocations take effect
// quickly. 60s was too long — a revoked admin retains access for a full minute.
// 10s balances DB load with near-immediate revocation.
const ADMIN_CACHE_TTL = 10; // seconds

export async function isAdmin(userId: string, prisma: PrismaClient = defaultPrisma, redis: Redis = defaultRedis) {
  const cacheKey = `admin:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });
  const result = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN' || isRootSuperAdmin(user?.email);
  await redis.set(cacheKey, result ? '1' : '0', 'EX', ADMIN_CACHE_TTL);
  return result;
}

export async function isSuperAdmin(userId: string, prisma: PrismaClient = defaultPrisma, redis: Redis = defaultRedis) {
  const cacheKey = `superadmin:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === '1';

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, email: true },
  });
  const result = user?.role === 'SUPERADMIN' || isRootSuperAdmin(user?.email);
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
