import { recordAudit } from '../../lib/audit';
import { decrypt, encrypt } from '../../lib/crypto';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { env } from '../../config';
import { getProvider, type GoogleTokens } from '../../providers/gbp';
import type { MemberContext } from '../workspaces/access';
import { onWorkspaceDeleted } from '../workspaces/lifecycle';
import { findConnection, usesFakeData } from './connection.service';
import { scanConnection, syncFirst } from './locations.service';

export function startUrl(state: string): { url: string; provider: 'mock' | 'live' } {
  const provider = getProvider();
  return { url: provider.getAuthUrl(state), provider: provider.kind };
}

// The same Google account reconnecting updates its row. A different one becomes a new connection.
async function saveConnection(
  workspaceId: string,
  userId: string,
  tokens: GoogleTokens,
): Promise<string> {
  const values = {
    googleEmail: tokens.email,
    accessToken: encrypt(tokens.accessToken),
    expiresAt: tokens.expiresAt,
    status: 'healthy' as const,
    reconnectNotifiedAt: null,
    provider: getProvider().kind,
    // Google only sends a refresh token on first consent, so keep the old one if this has none.
    ...(tokens.refreshToken ? { refreshToken: encrypt(tokens.refreshToken) } : {}),
  };
  const connection = await prisma.googleConnection.upsert({
    where: { workspaceId_googleUserId: { workspaceId, googleUserId: tokens.googleUserId } },
    create: { workspaceId, googleUserId: tokens.googleUserId, createdById: userId, ...values },
    update: values,
  });
  return connection.id;
}

export async function completeConnect(
  workspaceId: string,
  userId: string,
  code: string,
  ip?: string,
): Promise<string> {
  const tokens = await getProvider().exchangeCode(code);
  if (!tokens.email || !tokens.googleUserId) {
    throw new HttpError(
      400,
      'Could not confirm which Google account you signed in with',
      'google_identity_missing',
    );
  }
  const connectionId = await saveConnection(workspaceId, userId, tokens);
  await recordAudit({
    action: 'google.connected',
    workspaceId,
    actorUserId: userId,
    targetType: 'connection',
    targetId: connectionId,
    meta: { email: tokens.email },
    ip,
  });
  const { activated } = await scanConnection(connectionId);
  await syncFirst(activated);
  return connectionId;
}

// Revokes at Google first, then moves any location another connection can reach,
// so only what truly depends on this account gets deleted.
async function removeConnection(connectionId: string): Promise<void> {
  const connection = await prisma.googleConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  if (!usesFakeData(connection)) {
    const token = decrypt(connection.refreshToken) ?? decrypt(connection.accessToken);
    if (token) await getProvider(connection.provider).revoke(token);
  }
  const served = await prisma.location.findMany({
    where: { connectionId },
    include: { reachableBy: { where: { connectionId: { not: connectionId } }, take: 1 } },
  });
  await prisma.$transaction(async (tx) => {
    for (const location of served) {
      const other = location.reachableBy[0];
      if (other) {
        await tx.location.update({
          where: { id: location.id },
          data: { connectionId: other.connectionId, googleAccountName: other.googleAccountName },
        });
      }
    }
    // Remaining locations, and their reviews and replies, go with the connection.
    await tx.googleConnection.delete({ where: { id: connectionId } });
  });
}

export async function disconnect(
  member: MemberContext,
  connectionId: string,
  ip?: string,
): Promise<void> {
  const connection = await findConnection(member.workspaceId, connectionId);
  await removeConnection(connectionId);
  await recordAudit({
    action: 'google.disconnected',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    meta: { email: connection.googleEmail },
    ip,
  });
}

onWorkspaceDeleted(async (workspaceId) => {
  const connections = await prisma.googleConnection.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  for (const connection of connections) await removeConnection(connection.id);
});

export async function rescan(member: MemberContext, connectionId: string): Promise<void> {
  await findConnection(member.workspaceId, connectionId);
  const { activated } = await scanConnection(connectionId);
  await syncFirst(activated);
}

export async function useSampleData(
  member: MemberContext,
  connectionId: string,
  ip?: string,
): Promise<void> {
  const connection = await findConnection(member.workspaceId, connectionId);
  const locations = await prisma.location.count({ where: { connectionId } });
  // Already on sample data: keep its replies. No location means an earlier setup failed, so run it again.
  if (connection.dataSource === 'sample' && locations > 0) return;
  const realReviews = await prisma.review.count({ where: { location: { connectionId } } });
  if (connection.dataSource !== 'sample' && realReviews > 0) {
    throw new HttpError(
      409,
      'This account already has real reviews, so sample data is not available',
      'has_real_reviews',
    );
  }
  await prisma.location.deleteMany({ where: { connectionId } });
  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: { dataSource: 'sample', apiError: null },
  });
  const { activated } = await scanConnection(connectionId);
  await syncFirst(activated);
  await recordAudit({
    action: 'google.sample_enabled',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    ip,
  });
}

export async function stopSampleData(
  member: MemberContext,
  connectionId: string,
  ip?: string,
): Promise<void> {
  const connection = await findConnection(member.workspaceId, connectionId);
  if (connection.dataSource !== 'sample')
    throw new HttpError(409, 'This account is not using sample data', 'not_sample');
  await prisma.location.deleteMany({ where: { connectionId } });
  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: { dataSource: 'google' },
  });
  await recordAudit({
    action: 'google.sample_disabled',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    ip,
  });
  const { activated } = await scanConnection(connectionId);
  await syncFirst(activated);
}

export const callbackUrl = () => `${env.APP_URL}/onboarding`;
