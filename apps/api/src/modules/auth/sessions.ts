import type { Session } from '@prisma/client';
import { hashToken, randomToken, safeEqual } from '../../lib/crypto';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { recordAudit } from '../../lib/audit';

const SESSION_DAYS = 30;
const ROTATION_GRACE_MS = 15_000;

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

const expiry = () => new Date(Date.now() + SESSION_DAYS * 86_400_000);
const invalid = () => new HttpError(401, 'Please log in again', 'unauthorized');

export async function createSession(userId: string, meta: SessionMeta): Promise<{ session: Session; refreshToken: string }> {
  const secret = randomToken();
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(secret),
      expiresAt: expiry(),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { session, refreshToken: `${session.id}.${secret}` };
}

function parse(refreshToken: string): { sessionId: string; secret: string } | null {
  const [sessionId, secret] = refreshToken.split('.');
  const isUuid = /^[0-9a-f-]{36}$/i.test(sessionId ?? '');
  return sessionId && secret && isUuid ? { sessionId, secret } : null;
}

// Each refresh swaps the token. Seeing an already-swapped token later means someone copied it,
// so the whole session ends. A few seconds of grace covers two tabs refreshing together.
export async function rotateSession(
  refreshToken: string,
): Promise<{ session: Session; refreshToken: string | null }> {
  const parts = parse(refreshToken);
  if (!parts) throw invalid();
  const session = await prisma.session.findUnique({ where: { id: parts.sessionId }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw invalid();
  if (session.user.deletedAt || session.user.status !== 'active') throw invalid();

  const presented = hashToken(parts.secret);

  if (session.previousTokenHash && safeEqual(presented, session.previousTokenHash)) {
    const age = Date.now() - (session.rotatedAt?.getTime() ?? 0);
    if (age <= ROTATION_GRACE_MS) return { session, refreshToken: null };
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await recordAudit({ action: 'auth.refresh_reuse', actorUserId: session.userId, targetType: 'session', targetId: session.id });
    throw invalid();
  }
  if (!safeEqual(presented, session.refreshTokenHash)) throw invalid();

  const secret = randomToken();
  const now = new Date();
  const swapped = await prisma.session.updateMany({
    where: { id: session.id, refreshTokenHash: presented, revokedAt: null },
    data: {
      refreshTokenHash: hashToken(secret),
      previousTokenHash: presented,
      rotatedAt: now,
      lastUsedAt: now,
      expiresAt: expiry(),
    },
  });
  // Another request swapped it first, which is the same harmless race as two tabs.
  if (swapped.count === 0) return { session, refreshToken: null };
  return { session, refreshToken: `${session.id}.${secret}` };
}

export async function revokeByToken(refreshToken: string | undefined): Promise<void> {
  const parts = refreshToken ? parse(refreshToken) : null;
  if (!parts) return;
  const session = await prisma.session.findUnique({ where: { id: parts.sessionId } });
  if (!session) return;
  const hash = hashToken(parts.secret);
  const matches =
    safeEqual(hash, session.refreshTokenHash) ||
    (session.previousTokenHash !== null && safeEqual(hash, session.previousTokenHash));
  if (matches) await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
