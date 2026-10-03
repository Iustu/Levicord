import sanitizeHtml from 'sanitize-html';
import { prisma as defaultPrisma } from '../prisma';
import { encrypt, decrypt } from '../lib/crypto';
import type { PrismaClient } from '@prisma/client';

export async function checkCanMessage(
  userId1: string,
  userId2: string,
  prisma: PrismaClient = defaultPrisma
): Promise<boolean> {
  if (!(prisma as any).dmRequest?.findFirst) return true;
  const req = await prisma.dmRequest.findFirst({
    where: {
      OR: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
      status: 'ACCEPTED',
    },
  });
  return Boolean(req);
}

export async function getDmRequestStatus(
  userId1: string,
  userId2: string,
  prisma: PrismaClient = defaultPrisma
) {
  if (!(prisma as any).dmRequest?.findFirst) {
    return { status: 'NONE' as const, request: null, isSender: false, isReceiver: false };
  }

  const req = await prisma.dmRequest.findFirst({
    where: {
      OR: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
    },
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true } },
      receiver: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  if (!req) {
    return { status: 'NONE' as const, request: null, isSender: false, isReceiver: false };
  }

  return {
    status: req.status,
    request: req,
    isSender: req.senderId === userId1,
    isReceiver: req.receiverId === userId1,
  };
}

export async function sendDmRequest(
  senderId: string,
  receiverId: string,
  prisma: PrismaClient = defaultPrisma
) {
  if (senderId === receiverId) {
    throw new Error('Não é possível enviar uma solicitação para si mesmo.');
  }

  if (prisma.user?.findUnique) {
    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({ where: { id: senderId } }),
      prisma.user.findUnique({ where: { id: receiverId } }),
    ]);
    if (!sender || !receiver) {
      throw new Error('Usuário não encontrado.');
    }
  }

  const existing = await prisma.dmRequest.findFirst({
    where: {
      OR: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    },
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true } },
      receiver: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  if (existing) {
    if (existing.status === 'ACCEPTED') {
      return { ...existing, alreadyAccepted: true };
    }
    if (existing.senderId === senderId && existing.status === 'PENDING') {
      return { ...existing, alreadyPending: true };
    }
    // Bilateral consent: If the other user already sent a pending request to me, automatically accept!
    if (existing.senderId === receiverId && existing.status === 'PENDING') {
      const accepted = await prisma.dmRequest.update({
        where: { id: existing.id },
        data: { status: 'ACCEPTED' },
        include: {
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
          receiver: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      return { ...accepted, autoAccepted: true };
    }
    // If previously rejected, allow re-requesting
    const updated = await prisma.dmRequest.update({
      where: { id: existing.id },
      data: { senderId, receiverId, status: 'PENDING' },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
        receiver: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    return updated;
  }

  const created = await prisma.dmRequest.create({
    data: {
      senderId,
      receiverId,
      status: 'PENDING',
    },
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true } },
      receiver: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  return created;
}

export async function acceptDmRequest(
  requestId: string,
  currentUserId: string,
  prisma: PrismaClient = defaultPrisma
) {
  const req = await prisma.dmRequest.findUnique({
    where: { id: requestId },
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true } },
      receiver: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  if (!req) {
    throw new Error('Solicitação não encontrada.');
  }

  if (req.receiverId !== currentUserId) {
    throw new Error('Apenas o destinatário da solicitação pode aceitá-la.');
  }

  return prisma.dmRequest.update({
    where: { id: requestId },
    data: { status: 'ACCEPTED' },
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true } },
      receiver: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });
}

export async function rejectDmRequest(
  requestId: string,
  currentUserId: string,
  prisma: PrismaClient = defaultPrisma
) {
  const req = await prisma.dmRequest.findUnique({
    where: { id: requestId },
  });

  if (!req) {
    throw new Error('Solicitação não encontrada.');
  }

  if (req.receiverId !== currentUserId && req.senderId !== currentUserId) {
    throw new Error('Sem permissão para remover esta solicitação.');
  }

  await prisma.dmRequest.delete({
    where: { id: requestId },
  });

  return { success: true, id: requestId, senderId: req.senderId, receiverId: req.receiverId };
}

export async function getDmContacts(
  userId: string,
  prisma: PrismaClient = defaultPrisma
) {
  if (!(prisma as any).dmRequest?.findMany) return [];

  const requests = await prisma.dmRequest.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    include: {
      sender: { select: { id: true, displayName: true, avatarUrl: true } },
      receiver: { select: { id: true, displayName: true, avatarUrl: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return requests.map((req) => {
    const isSender = req.senderId === userId;
    const otherUser = isSender ? req.receiver : req.sender;
    return {
      id: otherUser.id,
      displayName: otherUser.displayName,
      avatarUrl: otherUser.avatarUrl,
      requestId: req.id,
      request: {
        id: req.id,
        senderId: req.senderId,
        receiverId: req.receiverId,
        status: req.status,
        createdAt: req.createdAt.toISOString(),
      },
      isSender,
      isReceiver: !isSender,
      status: req.status,
    };
  });
}

export async function getDirectMessages(
  userId1: string,
  userId2: string,
  limit = 50,
  cursor?: string,
  prisma: PrismaClient = defaultPrisma
) {
  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 },
      ],
    },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      sender: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      attachments: true
    },
  });

  // Decrypt content transparently at application layer (BSRS Cap. 14 / Zero Trust)
  return messages.map((msg) => ({
    ...msg,
    content: decrypt(msg.content),
  }));
}

export async function createDirectMessage(
  content: string | null,
  senderId: string,
  receiverId: string,
  attachments?: { url: string; type: 'image'|'video'|'file'|'IMAGE'|'VIDEO'|'FILE'; fileName: string; fileSize: number; mimeType: string; isOneTime?: boolean }[],
  prisma: PrismaClient = defaultPrisma
) {
  if ((prisma as any).dmRequest?.findFirst) {
    const canMessage = await checkCanMessage(senderId, receiverId, prisma);
    if (!canMessage) {
      throw new Error('Você só pode enviar mensagens diretas após a solicitação ser aceita.');
    }
  }

  const sanitized = content ? sanitizeHtml(content) : null;
  const encrypted = encrypt(sanitized);

  const formattedAttachments = attachments && attachments.length > 0
    ? attachments.map(a => ({
        url: a.url,
        type: a.type.toUpperCase() as 'IMAGE' | 'VIDEO' | 'FILE',
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        isOneTime: Boolean(a.isOneTime),
      }))
    : undefined;

  const created = await prisma.directMessage.create({
    data: {
      content: encrypted,
      senderId,
      receiverId,
      ...(formattedAttachments ? {
        attachments: {
          create: formattedAttachments,
        }
      } : {})
    },
    include: {
      sender: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      attachments: true
    },
  });

  // Return with decrypted content for immediate socket emission and UI presentation
  return {
    ...created,
    content: sanitized,
  };
}


