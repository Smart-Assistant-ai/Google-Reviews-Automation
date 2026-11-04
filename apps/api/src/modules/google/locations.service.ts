import type { GoogleStatus } from '@replypilot/shared';
import { recordAudit } from '../../lib/audit';
import { HttpError, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import type { GbpContext, GbpLocation, GbpProvider } from '../../providers/gbp';
import { accessibleLocationIds, type MemberContext } from '../workspaces/access';
import { findConnection, getContext, markNeedsReconnect, usesFakeData } from './connection.service';
import { syncLocation } from './sync.service';

// Google can let someone sign in while refusing to read their profile, and quota stays at
// zero until it approves us. Those leave the account connected, with the reason shown.
export function readBlockedMessage(err: unknown): string | null {
  const { statusCode, message } = err as { statusCode?: number; message?: string };
  if (statusCode === 429) return 'Google has not approved API access for this project yet, so we cannot read reviews.';
  if (statusCode === 403) return `Google blocked reading this profile: ${message}`;
  if (statusCode === 401) return 'Google needs you to sign in again.';
  return null;
}

const NO_PROFILE = 'No Business Profile found on this Google account.';

async function readAllLocations(provider: GbpProvider, ctx: GbpContext) {
  const found: { accountName: string; location: GbpLocation }[] = [];
  let accountToken: string | undefined;
  do {
    const accounts = await provider.listAccounts(ctx, accountToken);
    for (const account of accounts.accounts ?? []) {
      let locationToken: string | undefined;
      do {
        const page = await provider.listLocations(ctx, account.name, locationToken);
        for (const location of page.locations ?? []) found.push({ accountName: account.name, location });
        locationToken = page.nextPageToken;
      } while (locationToken);
    }
    accountToken = accounts.nextPageToken;
  } while (accountToken);
  return found;
}

// Brings our rows in line with what this Google account can reach right now.
export async function scanConnection(connectionId: string): Promise<{ activated: string[] }> {
  const { provider, ctx, connection } = await getContext(connectionId);
  const { workspaceId } = connection;

  let found: Awaited<ReturnType<typeof readAllLocations>>;
  try {
    found = await readAllLocations(provider, ctx);
  } catch (err) {
    const blocked = readBlockedMessage(err);
    if (!blocked) throw err;
    if ((err as { statusCode?: number }).statusCode === 401) await markNeedsReconnect(connectionId);
    await prisma.googleConnection.update({ where: { id: connectionId }, data: { apiError: blocked } });
    return { activated: [] };
  }
  await prisma.googleConnection.update({
    where: { id: connectionId },
    data: { apiError: found.length === 0 ? NO_PROFILE : null },
  });

  const seenIds: string[] = [];
  for (const { accountName, location } of found) {
    const details = { title: location.title, address: location.storefrontAddress?.addressLines?.join(', ') ?? null };
    const existing = await prisma.location.findUnique({
      where: { workspaceId_googleLocationName: { workspaceId, googleLocationName: location.name } },
    });
    let row = existing;
    if (!row) {
      row = await prisma.location.create({
        data: { workspaceId, connectionId, googleAccountName: accountName, googleLocationName: location.name, status: 'available', ...details },
      });
    } else if (row.connectionId === connectionId || row.status === 'access_lost') {
      // Its own connection, or one that can take over a location that lost access. Either way it's back.
      row = await prisma.location.update({
        where: { id: row.id },
        data: {
          ...details,
          connectionId,
          googleAccountName: accountName,
          ...(row.status === 'access_lost' ? { status: 'active', accessLostNotifiedAt: null, lastSyncError: null } : {}),
        },
      });
    }
    seenIds.push(row.id);
    await prisma.connectionLocation.upsert({
      where: { connectionId_locationId: { connectionId, locationId: row.id } },
      create: { connectionId, locationId: row.id, googleAccountName: accountName },
      update: { googleAccountName: accountName },
    });
  }

  await prisma.connectionLocation.deleteMany({ where: { connectionId, locationId: { notIn: seenIds } } });

  const missing = await prisma.location.findMany({ where: { connectionId, id: { notIn: seenIds } } });
  for (const location of missing) {
    const other = await prisma.connectionLocation.findFirst({ where: { locationId: location.id, connectionId: { not: connectionId } } });
    if (other) {
      await prisma.location.update({
        where: { id: location.id },
        data: { connectionId: other.connectionId, googleAccountName: other.googleAccountName },
      });
    } else if (location.status === 'available') {
      await prisma.location.delete({ where: { id: location.id } });
    } else {
      await prisma.location.update({ where: { id: location.id }, data: { status: 'access_lost' } });
    }
  }

  // Only one location and nothing managed yet: there's no choice to make, so attach it.
  const managed = await prisma.location.count({ where: { workspaceId, status: { in: ['active', 'access_lost'] } } });
  const available = await prisma.location.findMany({ where: { workspaceId, status: 'available' }, select: { id: true } });
  if (managed === 0 && available.length === 1) {
    await prisma.location.update({ where: { id: available[0]!.id }, data: { status: 'active' } });
    return { activated: [available[0]!.id] };
  }
  return { activated: [] };
}

export async function googleStatus(member: MemberContext): Promise<GoogleStatus> {
  const seesEverything = member.role !== 'member';
  const allowed = seesEverything ? null : await accessibleLocationIds(member);

  const locations = await prisma.location.findMany({
    where: { workspaceId: member.workspaceId, ...(allowed ? { id: { in: allowed } } : {}) },
    include: { connection: true, reachableBy: { include: { connection: true } } },
    orderBy: { title: 'asc' },
  });

  const connections = seesEverything
    ? await prisma.googleConnection.findMany({
        where: { workspaceId: member.workspaceId },
        include: { _count: { select: { servedLocations: true } } },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  return {
    connections: connections.map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      email: connection.googleEmail,
      status: connection.status,
      sample: connection.dataSource === 'sample',
      apiError: connection.apiError,
      locationCount: connection._count.servedLocations,
    })),
    locations: locations.map((location) => ({
      id: location.id,
      title: location.title,
      address: location.address,
      status: location.status,
      sample: usesFakeData(location.connection),
      connectionId: location.connectionId,
      connectionEmail: seesEverything ? location.connection.googleEmail : null,
      alternativeConnections: seesEverything
        ? location.reachableBy
            .filter((reach) => reach.connectionId !== location.connectionId)
            .map((reach) => ({ id: reach.connectionId, email: reach.connection.googleEmail }))
        : [],
      lastSyncedAt: location.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: location.lastSyncError,
    })),
  };
}

// Waits for a few so the first screen has data. The job runner loads the rest soon after.
const SYNC_NOW_LIMIT = 3;

export async function syncFirst(locationIds: string[]): Promise<void> {
  for (const id of locationIds.slice(0, SYNC_NOW_LIMIT)) await syncLocation(id);
}

export async function selectLocations(member: MemberContext, locationIds: string[], ip?: string): Promise<void> {
  const rows = await prisma.location.findMany({
    where: { id: { in: locationIds }, workspaceId: member.workspaceId },
    select: { id: true, status: true, title: true },
  });
  if (rows.length !== new Set(locationIds).size) {
    throw new HttpError(400, 'One of those locations is not in this workspace', 'invalid_locations');
  }
  const newlyActive = rows.filter((row) => row.status === 'available');
  await prisma.location.updateMany({ where: { id: { in: newlyActive.map((row) => row.id) } }, data: { status: 'active' } });
  await recordAudit({
    action: 'location.activated',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    meta: { locations: newlyActive.map((row) => row.title) },
    ip,
  });
  await syncFirst(newlyActive.map((row) => row.id));
}

async function findLocation(workspaceId: string, locationId: string) {
  const location = await prisma.location.findFirst({ where: { id: locationId, workspaceId } });
  if (!location) throw notFound('Location not found');
  return location;
}

export async function deactivateLocation(member: MemberContext, locationId: string, ip?: string): Promise<void> {
  const location = await findLocation(member.workspaceId, locationId);
  await prisma.location.update({ where: { id: location.id }, data: { status: 'available' } });
  await recordAudit({
    action: 'location.deactivated',
    workspaceId: member.workspaceId,
    locationId,
    actorUserId: member.userId,
    meta: { title: location.title },
    ip,
  });
}

export async function switchConnection(member: MemberContext, locationId: string, connectionId: string, ip?: string): Promise<void> {
  const location = await findLocation(member.workspaceId, locationId);
  const reach = await prisma.connectionLocation.findUnique({ where: { connectionId_locationId: { connectionId, locationId } } });
  if (!reach) throw new HttpError(400, 'That Google account cannot reach this location', 'connection_cannot_reach');
  await prisma.location.update({
    where: { id: location.id },
    data: {
      connectionId,
      googleAccountName: reach.googleAccountName,
      ...(location.status === 'access_lost' ? { status: 'active', accessLostNotifiedAt: null, lastSyncError: null } : {}),
    },
  });
  await recordAudit({
    action: 'location.connection_changed',
    workspaceId: member.workspaceId,
    locationId,
    actorUserId: member.userId,
    meta: { title: location.title },
    ip,
  });
}

export async function disconnectPreview(member: MemberContext, connectionId: string) {
  await findConnection(member.workspaceId, connectionId);
  const served = await prisma.location.findMany({
    where: { connectionId },
    include: {
      reachableBy: { where: { connectionId: { not: connectionId } }, include: { connection: true }, take: 1 },
    },
    orderBy: { title: 'asc' },
  });
  const managed = served.filter((location) => location.status !== 'available');
  return {
    removes: managed.filter((l) => l.reachableBy.length === 0).map((l) => ({ id: l.id, title: l.title })),
    moves: managed
      .filter((l) => l.reachableBy.length > 0)
      .map((l) => ({ id: l.id, title: l.title, toEmail: l.reachableBy[0]!.connection.googleEmail })),
  };
}
