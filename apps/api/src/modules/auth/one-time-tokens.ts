import type { OneTimeTokenPurpose } from '@prisma/client';
import { hashToken, randomToken } from '../../lib/crypto';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

const TTL_MS: Record<OneTimeTokenPurpose, number> = {
  verify_email: 48 * 3_600_000,
  reset_password: 3_600_000,
};

// Issuing a new link cancels older ones of the same kind.
export async function issueToken(userId: string, purpose: OneTimeTokenPurpose): Promise<string> {
  const token = randomToken();
  await prisma.$transaction([
    prisma.oneTimeToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.oneTimeToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TTL_MS[purpose]),
      },
    }),
  ]);
  return token;
}

// One atomic update decides who gets it, so a link can't be used twice even at the same moment.
export async function consumeToken(token: string, purpose: OneTimeTokenPurpose): Promise<string> {
  const tokenHash = hashToken(token);
  const claimed = await prisma.oneTimeToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0)
    throw new HttpError(400, 'This link has expired or was already used', 'invalid_token');
  const row = await prisma.oneTimeToken.findUniqueOrThrow({ where: { tokenHash } });
  return row.userId;
}
