import type { GoogleConnection } from '@prisma/client';
import { decrypt, encrypt } from '../../lib/crypto';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  getProvider,
  GoogleApiError,
  type GbpContext,
  type GbpProvider,
} from '../../providers/gbp';

// Fake data can never reach a real Google profile.
export const usesFakeData = (connection: Pick<GoogleConnection, 'provider' | 'dataSource'>) =>
  connection.provider === 'mock' || connection.dataSource === 'sample';

export async function findConnection(
  workspaceId: string,
  connectionId: string,
): Promise<GoogleConnection> {
  const connection = await prisma.googleConnection.findFirst({
    where: { id: connectionId, workspaceId },
  });
  if (!connection) throw notFound('Connection not found');
  return connection;
}

// Every Google call goes through this, which refreshes the access token when it is about to expire.
export async function getContext(
  connectionId: string,
): Promise<{ provider: GbpProvider; ctx: GbpContext; connection: GoogleConnection }> {
  const connection = await prisma.googleConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  const provider = getProvider(usesFakeData(connection) ? 'mock' : connection.provider);

  const getAccessToken = async (): Promise<string> => {
    const current = await prisma.googleConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    const expiringSoon =
      !current.expiresAt || current.expiresAt.getTime() - Date.now() < 5 * 60_000;
    if (provider.kind === 'live' && expiringSoon) {
      try {
        const refreshed = await provider.refreshAccessToken(decrypt(current.refreshToken) ?? '');
        const updated = await prisma.googleConnection.update({
          where: { id: connectionId },
          data: {
            accessToken: encrypt(refreshed.accessToken),
            ...(refreshed.refreshToken ? { refreshToken: encrypt(refreshed.refreshToken) } : {}),
            expiresAt: refreshed.expiresAt,
            status: 'healthy',
            reconnectNotifiedAt: null,
          },
        });
        return decrypt(updated.accessToken) ?? '';
      } catch (err) {
        // Only a token Google rejected needs a person. An outage clears up, and the next sync retries.
        const failure =
          err instanceof GoogleApiError ? err : new GoogleApiError('Could not reach Google', 503);
        if (failure.statusCode === 401) await markNeedsReconnect(connectionId);
        throw failure;
      }
    }
    return decrypt(current.accessToken) ?? '';
  };

  return { provider, connection, ctx: { connection, getAccessToken } };
}

export async function markNeedsReconnect(connectionId: string): Promise<void> {
  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: { status: 'needs_reconnect' },
  });
}
