import { prisma } from '../prisma';

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
    },
    create: {
      googleId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name,
      avatarUrl: userInfo.picture,
    }
  });

  return user;
}
