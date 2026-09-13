import { prisma } from '../prisma';

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

export async function isAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === 'ADMIN';
}

export async function updateUserProfile(userId: string, displayName: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { displayName },
    select: { id: true, displayName: true, avatarUrl: true },
  });
}
